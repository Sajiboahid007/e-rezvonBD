import express from "express";
import prisma from "../prisma";
import { authenticate } from "../authenticate";
import { requireAdmin } from "../authorize";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// 1. GET /shop-settings/get (Public branding & configuration)
router.get("/shop-settings/get", async (req, res) => {
  try {
    let settings = await prisma.shopSettings.findFirst({
      where: { IsMarkToDelete: false },
      orderBy: { Id: "asc" },
    });

    if (!settings) {
      // Default settings seed
      settings = await prisma.shopSettings.create({
        data: {
          ShopName: "Rezvon Men's Wear Bangladesh",
          Tagline: "Elevate Your Style",
          Description: "Premium Bangladeshi Men's Fashion & Lifestyle Destination",
          Currency: "BDT",
          FreeDeliveryThreshold: 2000,
          IsMaintenanceMode: false,
          IsMarkToDelete: false,
          CreatedBy: 1,
        },
      });
    }

    res.json({
      data: settings,
      message: "Shop settings retrieved successfully",
    });
  } catch (error) {
    console.error("Shop Settings Get Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. PUT /shop-settings/update (Admin only)
router.put("/shop-settings/update", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const existing = await prisma.shopSettings.findFirst({
      where: { IsMarkToDelete: false },
      orderBy: { Id: "asc" },
    });

    const {
      ShopName,
      Tagline,
      Description,
      LogoUrl,
      FaviconUrl,
      BannerUrl,
      Email,
      Phone,
      WhatsAppNumber,
      Address,
      FacebookUrl,
      InstagramUrl,
      YoutubeUrl,
      TikTokUrl,
      MetaTitle,
      MetaDescription,
      MetaKeywords,
      Currency,
      FreeDeliveryThreshold,
      IsMaintenanceMode,
    } = req.body;

    const dataToSave: any = {
      ...(ShopName ? { ShopName: ShopName.trim() } : {}),
      ...(Tagline !== undefined ? { Tagline: Tagline ? Tagline.trim() : null } : {}),
      ...(Description !== undefined ? { Description: Description ? Description.trim() : null } : {}),
      ...(LogoUrl !== undefined ? { LogoUrl: LogoUrl ? LogoUrl.trim() : null } : {}),
      ...(FaviconUrl !== undefined ? { FaviconUrl: FaviconUrl ? FaviconUrl.trim() : null } : {}),
      ...(BannerUrl !== undefined ? { BannerUrl: BannerUrl ? BannerUrl.trim() : null } : {}),
      ...(Email !== undefined ? { Email: Email ? Email.trim() : null } : {}),
      ...(Phone !== undefined ? { Phone: Phone ? Phone.trim() : null } : {}),
      ...(WhatsAppNumber !== undefined ? { WhatsAppNumber: WhatsAppNumber ? WhatsAppNumber.trim() : null } : {}),
      ...(Address !== undefined ? { Address: Address ? Address.trim() : null } : {}),
      ...(FacebookUrl !== undefined ? { FacebookUrl: FacebookUrl ? FacebookUrl.trim() : null } : {}),
      ...(InstagramUrl !== undefined ? { InstagramUrl: InstagramUrl ? InstagramUrl.trim() : null } : {}),
      ...(YoutubeUrl !== undefined ? { YoutubeUrl: YoutubeUrl ? YoutubeUrl.trim() : null } : {}),
      ...(TikTokUrl !== undefined ? { TikTokUrl: TikTokUrl ? TikTokUrl.trim() : null } : {}),
      ...(MetaTitle !== undefined ? { MetaTitle: MetaTitle ? MetaTitle.trim() : null } : {}),
      ...(MetaDescription !== undefined ? { MetaDescription: MetaDescription ? MetaDescription.trim() : null } : {}),
      ...(MetaKeywords !== undefined ? { MetaKeywords: MetaKeywords ? MetaKeywords.trim() : null } : {}),
      ...(Currency ? { Currency: Currency.trim() } : {}),
      ...(FreeDeliveryThreshold !== undefined ? { FreeDeliveryThreshold: FreeDeliveryThreshold !== null ? parseFloat(FreeDeliveryThreshold) : null } : {}),
      ...(IsMaintenanceMode !== undefined ? { IsMaintenanceMode: Boolean(IsMaintenanceMode) } : {}),
      UpdatedDate: new Date(),
      UpdatedBy: req.userId ? Number(req.userId) : 1,
    };

    let updated;
    if (existing) {
      updated = await prisma.shopSettings.update({
        where: { Id: existing.Id },
        data: dataToSave,
      });
    } else {
      updated = await prisma.shopSettings.create({
        data: {
          ShopName: ShopName ? ShopName.trim() : "Rezvon Men's Wear",
          ...dataToSave,
          CreatedBy: req.userId ? Number(req.userId) : 1,
          IsMarkToDelete: false,
        },
      });
    }

    res.json({
      data: updated,
      message: "Shop settings updated successfully",
    });
  } catch (error) {
    console.error("Shop Settings Update Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
