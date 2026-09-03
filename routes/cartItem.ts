import express from "express";
import prisma from "../prisma";
import { authenticate } from "../authenticate";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// 1. POST /cart-item/add (Add or increment variant in cart)
router.post("/cart-item/add", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { ProductVariantId, Quantity } = req.body;

    if (!ProductVariantId) {
      res.status(400).json({ message: "ProductVariantId is required" });
      return;
    }

    const variantId = parseInt(String(ProductVariantId));
    const quantityToAdd = Math.max(1, parseInt(String(Quantity)) || 1);

    // Fetch variant with product to check stock & calculate unit price
    const variant = await prisma.productVariants.findFirst({
      where: { Id: variantId, IsMarkToDelete: false },
      include: {
        Products: true,
      },
    });

    if (!variant || variant.Products.IsMarkToDelete) {
      res.status(404).json({ message: "Product variant not found" });
      return;
    }

    // Get or create active cart for user
    let cart = await prisma.cart.findFirst({
      where: { UserId: userId, IsMarkToDelete: false },
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: {
          UserId: userId,
          IsMarkToDelete: false,
          CreatedBy: userId.toString(),
        },
      });
    }

    // Check if variant is already in cart
    const existingItem = await prisma.cartItems.findFirst({
      where: {
        CartId: cart.Id,
        ProductVariantId: variantId,
        IsMarkToDelete: false,
      },
    });

    const targetQuantity = (existingItem ? existingItem.Quantity : 0) + quantityToAdd;

    if (variant.StockQuantity < targetQuantity) {
      res.status(400).json({
        message: `Requested quantity exceeds available stock. Only ${variant.StockQuantity} available.`,
      });
      return;
    }

    // Server-side authoritative price
    const unitPrice = variant.Products.DiscountPrice ?? variant.Products.Price;

    let resultItem;
    if (existingItem) {
      resultItem = await prisma.cartItems.update({
        where: { Id: existingItem.Id },
        data: {
          Quantity: targetQuantity,
          UnitPrice: unitPrice,
          UpdatedDate: new Date(),
          UpdatedBy: userId.toString(),
        },
      });
    } else {
      resultItem = await prisma.cartItems.create({
        data: {
          CartId: cart.Id,
          ProductVariantId: variantId,
          Quantity: targetQuantity,
          UnitPrice: unitPrice,
          IsMarkToDelete: false,
          CreatedBy: userId.toString(),
        },
      });
    }

    res.status(200).json({
      data: resultItem,
      message: "Item added to cart successfully",
    });
  } catch (error) {
    console.error("Cart Item Add Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. PUT /cart-item/update-quantity/:id
router.put("/cart-item/update-quantity/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid cart item ID" });
      return;
    }

    const { Quantity } = req.body;
    const newQuantity = parseInt(String(Quantity));

    if (isNaN(newQuantity) || newQuantity < 1) {
      res.status(400).json({ message: "Quantity must be at least 1" });
      return;
    }

    const item = await prisma.cartItems.findFirst({
      where: { Id: id, IsMarkToDelete: false },
      include: {
        Cart: true,
        ProductVariants: true,
      },
    });

    if (!item) {
      res.status(404).json({ message: "Cart item not found" });
      return;
    }

    const isAdmin = req.role?.toLowerCase() === "admin" || req.role?.toLowerCase() === "superadmin";
    if (!isAdmin && item.Cart.UserId !== req.userId) {
      res.status(403).json({ message: "Access forbidden" });
      return;
    }

    if (item.ProductVariants.StockQuantity < newQuantity) {
      res.status(400).json({
        message: `Requested quantity exceeds available stock (${item.ProductVariants.StockQuantity} available)`,
      });
      return;
    }

    const updated = await prisma.cartItems.update({
      where: { Id: id },
      data: {
        Quantity: newQuantity,
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "USER",
      },
    });

    res.json({
      data: updated,
      message: "Cart item quantity updated successfully",
    });
  } catch (error) {
    console.error("Update Cart Quantity Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 3. DELETE /cart-item/remove/:id (Soft delete)
router.delete("/cart-item/remove/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid cart item ID" });
      return;
    }

    const item = await prisma.cartItems.findFirst({
      where: { Id: id, IsMarkToDelete: false },
      include: {
        Cart: true,
      },
    });

    if (!item) {
      res.status(404).json({ message: "Cart item not found" });
      return;
    }

    const isAdmin = req.role?.toLowerCase() === "admin" || req.role?.toLowerCase() === "superadmin";
    if (!isAdmin && item.Cart.UserId !== req.userId) {
      res.status(403).json({ message: "Access forbidden" });
      return;
    }

    await prisma.cartItems.update({
      where: { Id: id },
      data: {
        IsMarkToDelete: true,
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "USER",
      },
    });

    res.json({
      data: null,
      message: "Item removed from cart successfully",
    });
  } catch (error) {
    console.error("Remove Cart Item Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
