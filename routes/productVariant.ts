import express from "express";
import prisma from "../prisma";
import { authenticate } from "../authenticate";
import { requireAdmin } from "../authorize";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// 1. POST /product-variant/create (Admin only)
router.post("/product-variant/create", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { ProductId, SizeId, ColorId, StockQuantity } = req.body;

    if (!ProductId || !SizeId) {
      res.status(400).json({ message: "ProductId and SizeId are required" });
      return;
    }

    const prodId = parseInt(String(ProductId));
    const szId = parseInt(String(SizeId));
    const colId = ColorId ? parseInt(String(ColorId)) : null;
    const stock = StockQuantity !== undefined ? parseInt(String(StockQuantity)) : 0;

    // Check product and size exist
    const [product, size, color] = await Promise.all([
      prisma.products.findFirst({ where: { Id: prodId, IsMarkToDelete: false } }),
      prisma.sizes.findFirst({ where: { Id: szId, IsMarkToDelete: false } }),
      colId ? prisma.colors.findFirst({ where: { Id: colId, IsMarkToDelete: false } }) : Promise.resolve(null),
    ]);

    if (!product) {
      res.status(400).json({ message: "Product not found" });
      return;
    }
    if (!size) {
      res.status(400).json({ message: "Size not found" });
      return;
    }
    if (colId && !color) {
      res.status(400).json({ message: "Color not found" });
      return;
    }

    // Check duplicate variant
    const existing = await prisma.productVariants.findFirst({
      where: {
        ProductId: prodId,
        SizeId: szId,
        ColorId: colId,
        IsMarkToDelete: false,
      },
    });

    if (existing) {
      res.status(400).json({ message: "This variant combination already exists for this product" });
      return;
    }

    const variant = await prisma.productVariants.create({
      data: {
        ProductId: prodId,
        SizeId: szId,
        ColorId: colId,
        StockQuantity: stock,
        IsMarkToDelete: false,
        CreatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
      include: {
        Sizes: true,
        Colors: true,
      },
    });

    res.status(201).json({
      data: variant,
      message: "Product variant created successfully",
    });
  } catch (error) {
    console.error("Variant Create Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. PUT /product-variant/update/:id (Admin only)
router.put("/product-variant/update/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid variant ID" });
      return;
    }

    const existing = await prisma.productVariants.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Variant not found" });
      return;
    }

    const { SizeId, ColorId, StockQuantity } = req.body;

    const updated = await prisma.productVariants.update({
      where: { Id: id },
      data: {
        ...(SizeId ? { SizeId: parseInt(String(SizeId)) } : {}),
        ...(ColorId !== undefined ? { ColorId: ColorId ? parseInt(String(ColorId)) : null } : {}),
        ...(StockQuantity !== undefined ? { StockQuantity: parseInt(String(StockQuantity)) } : {}),
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
      include: {
        Sizes: true,
        Colors: true,
      },
    });

    res.json({
      data: updated,
      message: "Product variant updated successfully",
    });
  } catch (error) {
    console.error("Variant Update Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 3. PATCH /product-variant/update-stock/:id (Increment/decrement or set stock)
router.patch("/product-variant/update-stock/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid variant ID" });
      return;
    }

    const existing = await prisma.productVariants.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Variant not found" });
      return;
    }

    const { delta, StockQuantity } = req.body;

    let newStock = existing.StockQuantity;
    if (StockQuantity !== undefined) {
      newStock = parseInt(String(StockQuantity));
    } else if (delta !== undefined) {
      newStock = existing.StockQuantity + parseInt(String(delta));
    }

    if (newStock < 0) {
      res.status(400).json({ message: "Stock quantity cannot be negative" });
      return;
    }

    const updated = await prisma.productVariants.update({
      where: { Id: id },
      data: {
        StockQuantity: newStock,
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.json({
      data: updated,
      message: "Stock updated successfully",
    });
  } catch (error) {
    console.error("Variant Stock Update Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 4. DELETE /product-variant/delete/:id (Soft delete, Admin only)
router.delete("/product-variant/delete/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid variant ID" });
      return;
    }

    const existing = await prisma.productVariants.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Variant not found" });
      return;
    }

    await prisma.productVariants.update({
      where: { Id: id },
      data: {
        IsMarkToDelete: true,
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.json({
      data: null,
      message: "Product variant deleted successfully",
    });
  } catch (error) {
    console.error("Variant Delete Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
