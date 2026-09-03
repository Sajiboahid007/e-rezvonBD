import express from "express";
import { authenticate } from "../authenticate";
import { requireAdmin } from "../authorize";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// Mask helper for sensitive secrets
const maskSecret = (secret?: string | null): string => {
  if (!secret) return "";
  if (secret.length <= 6) return "******";
  return `${secret.slice(0, 3)}****${secret.slice(-3)}`;
};

// In-memory store for integrations (can be backed by DB table or config)
interface IntegrationConfig {
  id: number;
  name: string;
  provider: string; // e.g. "bKash", "Nagad", "Steadfast", "Greenweb SMS"
  type: "payment" | "courier" | "sms";
  apiKey: string;
  apiSecret: string;
  isActive: boolean;
  isSandbox: boolean;
  webhookUrl?: string;
  createdDate: Date;
  updatedDate?: Date;
}

let mockIntegrations: IntegrationConfig[] = [
  {
    id: 1,
    name: "bKash Merchant Gateway",
    provider: "bKash",
    type: "payment",
    apiKey: "bkash_app_key_87236",
    apiSecret: "bkash_secret_live_9988112233",
    isActive: true,
    isSandbox: false,
    webhookUrl: "https://api.rezvonbd.com/api/payment/bkash-webhook",
    createdDate: new Date(),
  },
  {
    id: 2,
    name: "Steadfast Courier Delivery API",
    provider: "Steadfast",
    type: "courier",
    apiKey: "stdf_api_key_6654",
    apiSecret: "stdf_secret_998877",
    isActive: true,
    isSandbox: false,
    createdDate: new Date(),
  },
  {
    id: 3,
    name: "SSL Wireless SMS Provider",
    provider: "SSL Wireless",
    type: "sms",
    apiKey: "ssl_sms_key_1122",
    apiSecret: "ssl_sms_pass_9988",
    isActive: true,
    isSandbox: false,
    createdDate: new Date(),
  },
];

// 1. GET /shop-integration/get (Admin only, secrets masked)
router.get("/shop-integration/get", authenticate, requireAdmin, (req: AuthenticatedRequest, res) => {
  const safeList = mockIntegrations.map((item) => ({
    id: item.id,
    name: item.name,
    provider: item.provider,
    type: item.type,
    apiKey: item.apiKey,
    apiSecretMasked: maskSecret(item.apiSecret),
    isActive: item.isActive,
    isSandbox: item.isSandbox,
    webhookUrl: item.webhookUrl,
    createdDate: item.createdDate,
    updatedDate: item.updatedDate,
  }));

  res.json({
    data: safeList,
    message: "Integrations retrieved successfully",
  });
});

// 2. POST /shop-integration/create (Admin only)
router.post("/shop-integration/create", authenticate, requireAdmin, (req: AuthenticatedRequest, res) => {
  const { name, provider, type, apiKey, apiSecret, isSandbox, webhookUrl } = req.body;

  if (!name || !provider || !type || !apiKey || !apiSecret) {
    res.status(400).json({
      message: "name, provider, type, apiKey, and apiSecret are required",
    });
    return;
  }

  const newId = mockIntegrations.length > 0 ? Math.max(...mockIntegrations.map((i) => i.id)) + 1 : 1;
  const newIntegration: IntegrationConfig = {
    id: newId,
    name: String(name).trim(),
    provider: String(provider).trim(),
    type,
    apiKey: String(apiKey).trim(),
    apiSecret: String(apiSecret).trim(),
    isActive: true,
    isSandbox: Boolean(isSandbox),
    webhookUrl: webhookUrl ? String(webhookUrl).trim() : undefined,
    createdDate: new Date(),
  };

  mockIntegrations.push(newIntegration);

  res.status(201).json({
    data: {
      ...newIntegration,
      apiSecret: undefined,
      apiSecretMasked: maskSecret(newIntegration.apiSecret),
    },
    message: "Integration added successfully",
  });
});

// 3. PUT /shop-integration/update/:id (Admin only)
router.put("/shop-integration/update/:id", authenticate, requireAdmin, (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id));
  const index = mockIntegrations.findIndex((i) => i.id === id);

  if (index === -1) {
    res.status(404).json({ message: "Integration not found" });
    return;
  }

  const { name, provider, type, apiKey, apiSecret, isSandbox, webhookUrl } = req.body;
  const existing = mockIntegrations[index];

  mockIntegrations[index] = {
    ...existing,
    ...(name ? { name: String(name).trim() } : {}),
    ...(provider ? { provider: String(provider).trim() } : {}),
    ...(type ? { type } : {}),
    ...(apiKey ? { apiKey: String(apiKey).trim() } : {}),
    ...(apiSecret ? { apiSecret: String(apiSecret).trim() } : {}),
    ...(isSandbox !== undefined ? { isSandbox: Boolean(isSandbox) } : {}),
    ...(webhookUrl !== undefined ? { webhookUrl: webhookUrl ? String(webhookUrl).trim() : undefined } : {}),
    updatedDate: new Date(),
  };

  const updated = mockIntegrations[index];

  res.json({
    data: {
      ...updated,
      apiSecret: undefined,
      apiSecretMasked: maskSecret(updated.apiSecret),
    },
    message: "Integration updated successfully",
  });
});

// 4. PATCH /shop-integration/toggle/:id (Admin only)
router.patch("/shop-integration/toggle/:id", authenticate, requireAdmin, (req: AuthenticatedRequest, res) => {
  const id = parseInt(String(req.params.id));
  const item = mockIntegrations.find((i) => i.id === id);

  if (!item) {
    res.status(404).json({ message: "Integration not found" });
    return;
  }

  item.isActive = !item.isActive;
  item.updatedDate = new Date();

  res.json({
    data: {
      id: item.id,
      name: item.name,
      isActive: item.isActive,
    },
    message: `Integration ${item.isActive ? "enabled" : "disabled"} successfully`,
  });
});

module.exports = router;
