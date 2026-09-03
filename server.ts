import "dotenv/config";
import express from "express";
import cors from "cors";

import path from "path";
import fs from "fs";

const app = express();

app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads folder exists and serve static uploads
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use("/uploads", express.static(uploadDir));

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Route Handlers
const loginRouter = require("./routes/login");
const userRouter = require("./routes/user");
const addressRouter = require("./routes/address");
const categoryRouter = require("./routes/category");
const subcategoryRouter = require("./routes/subcategory");
const sizeRouter = require("./routes/size");
const colorRouter = require("./routes/color");
const productRouter = require("./routes/product");
const productVariantRouter = require("./routes/productVariant");
const productImageRouter = require("./routes/productImage");
const uploadRouter = require("./routes/upload");
const cartRouter = require("./routes/cart");
const cartItemRouter = require("./routes/cartItem");
const orderRouter = require("./routes/order");
const paymentRouter = require("./routes/payment");
const orderHistoryRouter = require("./routes/orderHistory");
const shopSettingsRouter = require("./routes/shopSettings");
const shopIntegrationRouter = require("./routes/shopIntegration");
const dashboardRouter = require("./routes/dashboard");

// Mount all routes under /api prefix
app.use("/api", loginRouter);
app.use("/api", userRouter);
app.use("/api", addressRouter);
app.use("/api", categoryRouter);
app.use("/api", subcategoryRouter);
app.use("/api", sizeRouter);
app.use("/api", colorRouter);
app.use("/api", productRouter);
app.use("/api", productVariantRouter);
app.use("/api", productImageRouter);
app.use("/api", uploadRouter);
app.use("/api", cartRouter);
app.use("/api", cartItemRouter);
app.use("/api", orderRouter);
app.use("/api", paymentRouter);
app.use("/api", orderHistoryRouter);
app.use("/api", shopSettingsRouter);
app.use("/api", shopIntegrationRouter);
app.use("/api", dashboardRouter);

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({ message: `Cannot ${req.method} ${req.originalUrl}` });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({ message: "Internal server error" });
});

import { seedMasterData } from "./seed_master_data";

const port = process.env.PORT || 3000;

app.listen(port, async () => {
  console.log(`Server is running at http://localhost:${port}`);
  try {
    await seedMasterData();
  } catch (seedErr) {
    console.error("Master data seeding error:", seedErr);
  }
});
