import express from "express";
import prisma from "../prisma";
import { authenticate } from "../authenticate";
import { requireAdmin } from "../authorize";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// 0. GET /product-image/get-by-product/:productId
router.get("/product-image/get-by-product/:productId", async (req, res) => {
  try {
    const productId = parseInt(String(req.params.productId));
    if (isNaN(productId)) {
      res.status(400).json({ message: "Invalid product ID" });
      return;
    }

    const images = await prisma.productImages.findMany({
      where: { ProductId: productId, IsMarkToDelete: false },
      orderBy: [{ IsPrimary: "desc" }, { Id: "asc" }],
    });

    res.json({
      data: images,
      message: "Product images retrieved successfully",
    });
  } catch (error) {
    console.error("Get Product Images Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 0.1 POST /product-image/upload-multiple/:productId (Admin only)
router.post("/product-image/upload-multiple/:productId", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const productId = parseInt(String(req.params.productId));
    if (isNaN(productId)) {
      res.status(400).json({ message: "Invalid product ID" });
      return;
    }

    const { images, replaceAll } = req.body;
    if (!Array.isArray(images) || images.length === 0) {
      res.status(400).json({ message: "Images array is required" });
      return;
    }

    const product = await prisma.products.findFirst({
      where: { Id: productId, IsMarkToDelete: false },
    });

    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    const formattedImages = images
      .map((img: any, idx: number) => {
        if (typeof img === "string") {
          return {
            ImageUrl: img.trim(),
            IsPrimary: idx === 0,
          };
        }
        return {
          ImageUrl: String(img.ImageUrl || "").trim(),
          IsPrimary: Boolean(img.IsPrimary),
        };
      })
      .filter((img) => img.ImageUrl.length > 0);

    if (formattedImages.length === 0) {
      res.status(400).json({ message: "No valid image URLs provided" });
      return;
    }

    const hasPrimary = formattedImages.some((img) => img.IsPrimary);
    if (!hasPrimary && formattedImages.length > 0) {
      formattedImages[0].IsPrimary = true;
    }

    await prisma.$transaction(async (tx) => {
      if (replaceAll) {
        await tx.productImages.updateMany({
          where: { ProductId: productId, IsMarkToDelete: false },
          data: { IsMarkToDelete: true },
        });
      } else if (hasPrimary) {
        await tx.productImages.updateMany({
          where: { ProductId: productId, IsMarkToDelete: false },
          data: { IsPrimary: false },
        });
      }

      for (const img of formattedImages) {
        await tx.productImages.create({
          data: {
            ProductId: productId,
            ImageUrl: img.ImageUrl,
            IsPrimary: img.IsPrimary,
            IsMarkToDelete: false,
            CreatedBy: req.userId ? req.userId.toString() : "ADMIN",
          },
        });
      }
    });

    const currentImages = await prisma.productImages.findMany({
      where: { ProductId: productId, IsMarkToDelete: false },
      orderBy: [{ IsPrimary: "desc" }, { Id: "asc" }],
    });

    res.status(200).json({
      data: currentImages,
      message: `${formattedImages.length} image(s) saved successfully`,
    });
  } catch (error) {
    console.error("Bulk Image Upload Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 0.2 POST /product-image/sync/:productId (Admin only - replaces all active images for this product)
router.post("/product-image/sync/:productId", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const productId = parseInt(String(req.params.productId));
    if (isNaN(productId)) {
      res.status(400).json({ message: "Invalid product ID" });
      return;
    }

    const images = Array.isArray(req.body.images) ? req.body.images : (Array.isArray(req.body.Images) ? req.body.Images : []);

    const product = await prisma.products.findFirst({
      where: { Id: productId, IsMarkToDelete: false },
    });

    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    const formattedImages = images
      .map((img: any, idx: number) => {
        if (typeof img === "string") {
          return {
            ImageUrl: img.trim(),
            IsPrimary: idx === 0,
          };
        }
        return {
          ImageUrl: String(img.ImageUrl || img.url || "").trim(),
          IsPrimary: Boolean(img.IsPrimary ?? img.isPrimary),
        };
      })
      .filter((img: any) => img.ImageUrl.length > 0);

    const hasPrimary = formattedImages.some((img: any) => img.IsPrimary);
    if (!hasPrimary && formattedImages.length > 0) {
      formattedImages[0].IsPrimary = true;
    }

    await prisma.$transaction(async (tx) => {
      // Mark all existing images for this product as deleted
      await tx.productImages.updateMany({
        where: { ProductId: productId, IsMarkToDelete: false },
        data: { IsMarkToDelete: true },
      });

      // Insert current list
      for (const img of formattedImages) {
        await tx.productImages.create({
          data: {
            ProductId: productId,
            ImageUrl: img.ImageUrl,
            IsPrimary: img.IsPrimary,
            IsMarkToDelete: false,
            CreatedBy: req.userId ? req.userId.toString() : "ADMIN",
          },
        });
      }
    });

    const currentImages = await prisma.productImages.findMany({
      where: { ProductId: productId, IsMarkToDelete: false },
      orderBy: [{ IsPrimary: "desc" }, { Id: "asc" }],
    });

    res.status(200).json({
      data: currentImages,
      message: "Product images synced successfully",
    });
  } catch (error) {
    console.error("Sync Product Images Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 1. POST /product-image/upload/:productId (Admin only)
router.post("/product-image/upload/:productId", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const productId = parseInt(String(req.params.productId));
    if (isNaN(productId)) {
      res.status(400).json({ message: "Invalid product ID" });
      return;
    }

    const { ImageUrl, IsPrimary } = req.body;
    if (!ImageUrl) {
      res.status(400).json({ message: "ImageUrl is required" });
      return;
    }

    const product = await prisma.products.findFirst({
      where: { Id: productId, IsMarkToDelete: false },
    });

    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    const shouldBePrimary = Boolean(IsPrimary);

    // If marked primary, unset other primary images for this product
    const result = await prisma.$transaction(async (tx) => {
      if (shouldBePrimary) {
        await tx.productImages.updateMany({
          where: { ProductId: productId, IsMarkToDelete: false },
          data: { IsPrimary: false },
        });
      }

      return await tx.productImages.create({
        data: {
          ProductId: productId,
          ImageUrl: String(ImageUrl).trim(),
          IsPrimary: shouldBePrimary,
          IsMarkToDelete: false,
          CreatedBy: req.userId ? req.userId.toString() : "ADMIN",
        },
      });
    });

    res.status(201).json({
      data: result,
      message: "Product image uploaded successfully",
    });
  } catch (error) {
    console.error("Image Upload Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. PATCH /product-image/set-primary/:id (Admin only)
router.patch("/product-image/set-primary/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid image ID" });
      return;
    }

    const image = await prisma.productImages.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!image) {
      res.status(404).json({ message: "Product image not found" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // Unset all images for this product
      await tx.productImages.updateMany({
        where: { ProductId: image.ProductId, IsMarkToDelete: false },
        data: { IsPrimary: false },
      });

      // Set target image as primary
      await tx.productImages.update({
        where: { Id: id },
        data: {
          IsPrimary: true,
          UpdatedDate: new Date(),
          UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
        },
      });
    });

    const updated = await prisma.productImages.findFirst({ where: { Id: id } });

    res.json({
      data: updated,
      message: "Primary image updated successfully",
    });
  } catch (error) {
    console.error("Set Primary Image Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 3. DELETE /product-image/delete/:id (Soft delete, Admin only)
router.delete("/product-image/delete/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid image ID" });
      return;
    }

    const image = await prisma.productImages.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!image) {
      res.status(404).json({ message: "Product image not found" });
      return;
    }

    await prisma.productImages.update({
      where: { Id: id },
      data: {
        IsMarkToDelete: true,
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.json({
      data: null,
      message: "Product image deleted successfully",
    });
  } catch (error) {
    console.error("Delete Image Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
