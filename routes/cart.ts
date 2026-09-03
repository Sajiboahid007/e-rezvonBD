import express from "express";
import prisma from "../prisma";
import { authenticate } from "../authenticate";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// 1. GET /cart/get/:userId
router.get("/cart/get/:userId", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = parseInt(String(req.params.userId));
    if (isNaN(userId)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    const isAdmin = req.role?.toLowerCase() === "admin" || req.role?.toLowerCase() === "superadmin";
    if (!isAdmin && req.userId !== userId) {
      res.status(403).json({ message: "Access forbidden: You can only access your own cart" });
      return;
    }

    let cart = await prisma.cart.findFirst({
      where: {
        UserId: userId,
        IsMarkToDelete: false,
      },
      include: {
        CartItems: {
          where: { IsMarkToDelete: false },
          include: {
            ProductVariants: {
              include: {
                Products: {
                  include: {
                    ProductImages: {
                      where: { IsMarkToDelete: false },
                      orderBy: [{ IsPrimary: "desc" }, { Id: "asc" }],
                    },
                    Category: { select: { Id: true, Name: true } },
                  },
                },
                Sizes: true,
                Colors: true,
              },
            },
          },
        },
      },
    });

    if (!cart) {
      // Create empty cart if it doesn't exist yet
      cart = await prisma.cart.create({
        data: {
          UserId: userId,
          IsMarkToDelete: false,
          CreatedBy: req.userId ? req.userId.toString() : "USER",
        },
        include: {
          CartItems: {
            where: { IsMarkToDelete: false },
            include: {
              ProductVariants: {
                include: {
                  Products: {
                    include: {
                      ProductImages: true,
                      Category: true,
                    },
                  },
                  Sizes: true,
                  Colors: true,
                },
              },
            },
          },
        },
      });
    }

    const items = cart.CartItems.map((item) => {
      const variant = item.ProductVariants;
      const product = variant.Products;
      const currentPrice = Number(product.DiscountPrice ?? product.Price);
      const lineTotal = Number(item.UnitPrice) * item.Quantity;
      const isStockAvailable = variant.StockQuantity >= item.Quantity;

      return {
        id: item.Id,
        productVariantId: item.ProductVariantId,
        productId: product.Id,
        productName: product.Name,
        sku: product.SKU,
        size: variant.Sizes?.Name,
        color: variant.Colors?.Name,
        quantity: item.Quantity,
        unitPrice: Number(item.UnitPrice),
        currentPrice,
        lineTotal,
        stockAvailable: variant.StockQuantity,
        isStockAvailable,
        primaryImage: product.ProductImages[0]?.ImageUrl || null,
      };
    });

    const subTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    res.json({
      data: {
        cartId: cart.Id,
        userId: cart.UserId,
        items,
        totalItems,
        subTotal,
      },
      message: "Cart retrieved successfully",
    });
  } catch (error) {
    console.error("Cart Get Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. DELETE /cart/clear/:userId
router.delete("/cart/clear/:userId", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = parseInt(String(req.params.userId));
    if (isNaN(userId)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    const isAdmin = req.role?.toLowerCase() === "admin" || req.role?.toLowerCase() === "superadmin";
    if (!isAdmin && req.userId !== userId) {
      res.status(403).json({ message: "Access forbidden" });
      return;
    }

    const cart = await prisma.cart.findFirst({
      where: { UserId: userId, IsMarkToDelete: false },
    });

    if (cart) {
      await prisma.cartItems.updateMany({
        where: { CartId: cart.Id, IsMarkToDelete: false },
        data: {
          IsMarkToDelete: true,
          UpdatedDate: new Date(),
          UpdatedBy: req.userId ? req.userId.toString() : "USER",
        },
      });
    }

    res.json({
      data: null,
      message: "Cart cleared successfully",
    });
  } catch (error) {
    console.error("Cart Clear Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
