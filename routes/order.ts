import express from "express";
import prisma from "../prisma";
import { authenticate, optionalAuthenticate } from "../authenticate";
import { requireAdmin } from "../authorize";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// Helper to generate unique order number
const generateOrderNumber = (): string => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `ORD-${dateStr}-${randomStr}`;
};

// 1. POST /order/create (ACID Checkout with Stock Validation, Snapshotting, and History)
router.post("/order/create", optionalAuthenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      ShippingAddressId,
      PaymentMethodId,
      IsInsideDhaka,
      DeliveryCharge,
      Discount,
      CourierName,
      Items, // Array of { ProductVariantId, Quantity } for direct checkout
      IsFromCart,
      PaymentDetails, // Optional: { TransactionId, SenderNumber, Amount }
    } = req.body;

    if (!ShippingAddressId || !PaymentMethodId) {
      res.status(400).json({
        message: "ShippingAddressId and PaymentMethodId are required",
      });
      return;
    }

    const shippingAddressId = parseInt(String(ShippingAddressId));
    const paymentMethodId = parseInt(String(PaymentMethodId));
    const targetUserId = req.userId || null;

    // Verify Shipping Address exists
    const address = await prisma.address.findFirst({
      where: { Id: shippingAddressId, IsMarkToDelete: false },
    });

    if (!address) {
      res.status(400).json({ message: "Shipping address not found" });
      return;
    }

    // Determine order items either from Cart or direct Items payload
    let orderItemsInput: Array<{ ProductVariantId: number; Quantity: number }> = [];

    if (IsFromCart && targetUserId) {
      const cart = await prisma.cart.findFirst({
        where: { UserId: targetUserId, IsMarkToDelete: false },
        include: {
          CartItems: {
            where: { IsMarkToDelete: false },
          },
        },
      });

      if (!cart || cart.CartItems.length === 0) {
        res.status(400).json({ message: "Your cart is empty" });
        return;
      }

      orderItemsInput = cart.CartItems.map((ci) => ({
        ProductVariantId: ci.ProductVariantId,
        Quantity: ci.Quantity,
      }));
    } else if (Array.isArray(Items) && Items.length > 0) {
      orderItemsInput = Items.map((item: any) => ({
        ProductVariantId: parseInt(String(item.ProductVariantId)),
        Quantity: Math.max(1, parseInt(String(item.Quantity)) || 1),
      }));
    } else {
      res.status(400).json({ message: "No items specified for this order" });
      return;
    }

    // Run checkout inside an atomic Prisma transaction
    const createdOrder = await prisma.$transaction(async (tx) => {
      // Step 1: Re-fetch and lock/verify all product variants
      const variantIds = orderItemsInput.map((i) => i.ProductVariantId);
      const variants = await tx.productVariants.findMany({
        where: {
          Id: { in: variantIds },
          IsMarkToDelete: false,
        },
        include: {
          Products: true,
          Sizes: true,
          Colors: true,
        },
      });

      if (variants.length !== variantIds.length) {
        throw new Error("One or more selected product variants were not found");
      }

      const variantMap = new Map(variants.map((v) => [v.Id, v]));

      let subTotal = 0;
      const orderItemsToCreate: any[] = [];

      for (const item of orderItemsInput) {
        const variant = variantMap.get(item.ProductVariantId);
        if (!variant) {
          throw new Error(`Variant #${item.ProductVariantId} not found`);
        }

        if (variant.StockQuantity < item.Quantity) {
          throw new Error(
            `Insufficient stock for "${variant.Products.Name}" (${variant.Sizes?.Name || ""}). Available: ${variant.StockQuantity}, Requested: ${item.Quantity}`
          );
        }

        const unitPrice = Number(variant.Products.DiscountPrice ?? variant.Products.Price);
        const lineTotal = unitPrice * item.Quantity;
        subTotal += lineTotal;

        orderItemsToCreate.push({
          ProductVariantId: variant.Id,
          ProductName: variant.Products.Name,
          SizeName: variant.Sizes?.Name || "Standard",
          ColorName: variant.Colors?.Name || null,
          Quantity: item.Quantity,
          UnitPrice: unitPrice,
          LineTotal: lineTotal,
          IsMarkToDelete: false,
          CreatedBy: targetUserId ? targetUserId.toString() : "GUEST",
        });
      }

      const deliveryChargeAmount = DeliveryCharge !== undefined ? parseFloat(String(DeliveryCharge)) : (IsInsideDhaka ? 70 : 130);
      const discountAmount = Discount !== undefined ? parseFloat(String(Discount)) : 0;
      const totalAmount = Math.max(0, subTotal + deliveryChargeAmount - discountAmount);

      // Step 2: Ensure OrderStatus exists (default Pending)
      let pendingStatus = await tx.orderStatus.findFirst({
        where: { IsMarkToDelete: false },
        orderBy: { Id: "asc" },
      });

      if (!pendingStatus) {
        pendingStatus = await tx.orderStatus.create({
          data: {
            Name: "Pending",
            IsMarkToDelete: false,
            CreatedBy: "SYSTEM",
          },
        });
      }

      const orderStatusId = pendingStatus.Id;

      // Ensure valid PaymentMethod exists
      let validPaymentMethod = await tx.paymentMethods.findFirst({
        where: { Id: paymentMethodId, IsMarkToDelete: false },
      });

      if (!validPaymentMethod) {
        validPaymentMethod = await tx.paymentMethods.findFirst({
          where: { IsMarkToDelete: false },
          orderBy: { Id: "asc" },
        });
      }

      if (!validPaymentMethod) {
        validPaymentMethod = await tx.paymentMethods.create({
          data: {
            Name: "Cash on Delivery",
            IsMarkToDelete: false,
            CreatedBy: "SYSTEM",
          },
        });
      }

      const finalPaymentMethodId = validPaymentMethod.Id;

      // Step 3: Create Orders row
      const orderNumber = generateOrderNumber();
      const newOrder = await tx.orders.create({
        data: {
          UserId: targetUserId,
          OrderNumber: orderNumber,
          ShippingAddressId: shippingAddressId,
          OrderStatusId: orderStatusId,
          PaymentMethodId: finalPaymentMethodId,
          SubTotal: subTotal,
          DeliveryCharge: deliveryChargeAmount,
          Discount: discountAmount,
          TotalAmount: totalAmount,
          IsInsideDhaka: IsInsideDhaka !== undefined ? Boolean(IsInsideDhaka) : true,
          IsPaid: false,
          CourierName: CourierName ? String(CourierName).trim() : null,
          IsMarkToDelete: false,
          CreatedBy: targetUserId ? targetUserId.toString() : "GUEST",
        },
      });

      // Step 4: Create OrderItems rows & Step 5: Decrement Stock
      for (const itemData of orderItemsToCreate) {
        await tx.orderItems.create({
          data: {
            ...itemData,
            OrderId: newOrder.Id,
          },
        });

        // Decrement variant stock
        await tx.productVariants.update({
          where: { Id: itemData.ProductVariantId },
          data: {
            StockQuantity: {
              decrement: itemData.Quantity,
            },
          },
        });
      }

      // Step 6: Insert initial OrderHistory record
      await tx.orderHistory.create({
        data: {
          OrderId: newOrder.Id,
          OrderStatusId: orderStatusId,
          Remarks: "Order placed successfully. Awaiting confirmation.",
          IsMarkToDelete: false,
          CreatedBy: targetUserId ? targetUserId.toString() : "SYSTEM",
        },
      });

      // Step 7: Clear cart if order originated from Cart
      if (IsFromCart && targetUserId) {
        const userCart = await tx.cart.findFirst({
          where: { UserId: targetUserId, IsMarkToDelete: false },
        });
        if (userCart) {
          await tx.cartItems.updateMany({
            where: { CartId: userCart.Id, IsMarkToDelete: false },
            data: { IsMarkToDelete: true },
          });
        }
      }

      // Step 8: If payment details provided, record payment attempt
      if (PaymentDetails && PaymentDetails.TransactionId) {
        await tx.payments.create({
          data: {
            OrderId: newOrder.Id,
            PaymentMethodId: paymentMethodId,
            Amount: PaymentDetails.Amount ? parseFloat(String(PaymentDetails.Amount)) : totalAmount,
            TransactionId: String(PaymentDetails.TransactionId).trim(),
            SenderNumber: PaymentDetails.SenderNumber ? String(PaymentDetails.SenderNumber).trim() : null,
            IsSuccessful: false,
            IsMarkToDelete: false,
            CreatedBy: targetUserId ? targetUserId.toString() : "GUEST",
          },
        });
      }

      return newOrder;
    });

    // Fetch full order for response
    const fullOrder = await prisma.orders.findFirst({
      where: { Id: createdOrder.Id },
      include: {
        OrderItems: { where: { IsMarkToDelete: false } },
        Address: true,
        OrderStatus: true,
        PaymentMethods: true,
        Payments: { where: { IsMarkToDelete: false } },
      },
    });

    res.status(201).json({
      data: fullOrder,
      message: "Order placed successfully",
    });
  } catch (error: any) {
    console.error("Order Create Error:", error);
    res.status(400).json({ message: error.message || "Failed to process order" });
  }
});

// 2. GET /order/get/:userId (My Orders)
router.get("/order/get/:userId", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = parseInt(String(req.params.userId));
    if (isNaN(userId)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    const isAdmin = req.role?.toLowerCase() === "admin" || req.role?.toLowerCase() === "superadmin";
    if (!isAdmin && req.userId !== userId) {
      res.status(403).json({ message: "Access forbidden: You can only view your own orders" });
      return;
    }

    const orders = await prisma.orders.findMany({
      where: {
        UserId: userId,
        IsMarkToDelete: false,
      },
      orderBy: { Id: "desc" },
      include: {
        OrderStatus: true,
        PaymentMethods: true,
        OrderItems: { where: { IsMarkToDelete: false } },
        Address: true,
        Payments: { where: { IsMarkToDelete: false } },
      },
    });

    res.json({
      data: orders,
      message: "Orders retrieved successfully",
    });
  } catch (error) {
    console.error("User Orders Get Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 3. GET /order/get-by-id/:id (Single order full details)
router.get("/order/get-by-id/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid order ID" });
      return;
    }

    const order = await prisma.orders.findFirst({
      where: {
        Id: id,
        IsMarkToDelete: false,
      },
      include: {
        OrderStatus: true,
        PaymentMethods: true,
        Address: true,
        OrderItems: {
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
                  },
                },
              },
            },
          },
        },
        Payments: { where: { IsMarkToDelete: false } },
        OrderHistory: {
          where: { IsMarkToDelete: false },
          include: { OrderStatus: true },
          orderBy: { Id: "asc" },
        },
      },
    });

    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return;
    }

    const isAdmin = req.role?.toLowerCase() === "admin" || req.role?.toLowerCase() === "superadmin";
    if (!isAdmin && order.UserId && order.UserId !== req.userId) {
      res.status(403).json({ message: "Access forbidden" });
      return;
    }

    res.json({
      data: order,
      message: "Order details retrieved successfully",
    });
  } catch (error) {
    console.error("Order Details Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 4. POST /order/track (Public dual-param tracking by orderNumber + phone)
router.post("/order/track", async (req, res) => {
  try {
    const { orderNumber, phone } = req.body;

    if (!orderNumber || !phone) {
      res.status(400).json({
        message: "Both orderNumber and phone are required for tracking",
      });
      return;
    }

    const order = await prisma.orders.findFirst({
      where: {
        OrderNumber: String(orderNumber).trim(),
        IsMarkToDelete: false,
        Address: {
          Phone: String(phone).trim(),
        },
      },
      include: {
        OrderStatus: true,
        PaymentMethods: true,
        Address: {
          select: {
            Name: true,
            Phone: true,
            Street: true,
            Thana: true,
            District: true,
          },
        },
        OrderItems: {
          where: { IsMarkToDelete: false },
          select: {
            Id: true,
            ProductName: true,
            SizeName: true,
            ColorName: true,
            Quantity: true,
            UnitPrice: true,
            LineTotal: true,
          },
        },
        OrderHistory: {
          where: { IsMarkToDelete: false },
          include: { OrderStatus: true },
          orderBy: { CreatedDate: "asc" },
        },
      },
    });

    if (!order) {
      res.status(404).json({
        message: "No order found matching the provided order number and phone number",
      });
      return;
    }

    res.json({
      data: order,
      message: "Order tracking details retrieved successfully",
    });
  } catch (error) {
    console.error("Order Track Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 5. PATCH /order/update-status/:id (Admin only: Update status and insert OrderHistory in transaction)
router.patch("/order/update-status/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid order ID" });
      return;
    }

    const { OrderStatusId, Remarks, TrackingNumber, CourierName } = req.body;

    if (!OrderStatusId) {
      res.status(400).json({ message: "OrderStatusId is required" });
      return;
    }

    const newStatusId = parseInt(String(OrderStatusId));

    const existingOrder = await prisma.orders.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existingOrder) {
      res.status(404).json({ message: "Order not found" });
      return;
    }

    const statusObj = await prisma.orderStatus.findFirst({
      where: { Id: newStatusId, IsMarkToDelete: false },
    });

    if (!statusObj) {
      res.status(400).json({ message: "Invalid OrderStatusId" });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const orderUpdate = await tx.orders.update({
        where: { Id: id },
        data: {
          OrderStatusId: newStatusId,
          ...(TrackingNumber !== undefined ? { TrackingNumber: TrackingNumber ? String(TrackingNumber).trim() : null } : {}),
          ...(CourierName !== undefined ? { CourierName: CourierName ? String(CourierName).trim() : null } : {}),
          UpdatedDate: new Date(),
          UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
        },
      });

      await tx.orderHistory.create({
        data: {
          OrderId: id,
          OrderStatusId: newStatusId,
          Remarks: Remarks ? String(Remarks).trim() : `Status updated to ${statusObj.Name}`,
          IsMarkToDelete: false,
          CreatedBy: req.userId ? req.userId.toString() : "ADMIN",
        },
      });

      return orderUpdate;
    });

    res.json({
      data: updated,
      message: `Order status updated to ${statusObj.Name}`,
    });
  } catch (error) {
    console.error("Order Status Update Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 6. PATCH /order/cancel/:id (Cancel order + restore stock + record history)
router.patch("/order/cancel/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid order ID" });
      return;
    }

    const existingOrder = await prisma.orders.findFirst({
      where: { Id: id, IsMarkToDelete: false },
      include: {
        OrderStatus: true,
        OrderItems: { where: { IsMarkToDelete: false } },
      },
    });

    if (!existingOrder) {
      res.status(404).json({ message: "Order not found" });
      return;
    }

    const isAdmin = req.role?.toLowerCase() === "admin" || req.role?.toLowerCase() === "superadmin";
    if (!isAdmin && existingOrder.UserId !== req.userId) {
      res.status(403).json({ message: "Access forbidden" });
      return;
    }

    // Only allow cancellation if order is in initial stages (Pending/Confirmed)
    const currentStatusName = existingOrder.OrderStatus?.Name?.toLowerCase() || "";
    if (currentStatusName !== "pending" && currentStatusName !== "confirmed" && currentStatusName !== "") {
      res.status(400).json({
        message: `Order cannot be cancelled because it is already ${existingOrder.OrderStatus?.Name}`,
      });
      return;
    }

    // Find cancelled status
    let cancelledStatus = await prisma.orderStatus.findFirst({
      where: {
        IsMarkToDelete: false,
        Name: { contains: "Cancel" },
      },
    });

    const cancelledStatusId = cancelledStatus ? cancelledStatus.Id : 5;

    await prisma.$transaction(async (tx) => {
      // 1. Update order status
      await tx.orders.update({
        where: { Id: id },
        data: {
          OrderStatusId: cancelledStatusId,
          UpdatedDate: new Date(),
          UpdatedBy: req.userId ? req.userId.toString() : "USER",
        },
      });

      // 2. Restore stock for each item
      for (const item of existingOrder.OrderItems) {
        await tx.productVariants.update({
          where: { Id: item.ProductVariantId },
          data: {
            StockQuantity: {
              increment: item.Quantity,
            },
          },
        });
      }

      // 3. Insert history record
      await tx.orderHistory.create({
        data: {
          OrderId: id,
          OrderStatusId: cancelledStatusId,
          Remarks: `Order cancelled by ${isAdmin ? "Admin" : "Customer"}. Stock restored.`,
          IsMarkToDelete: false,
          CreatedBy: req.userId ? req.userId.toString() : "USER",
        },
      });
    });

    res.json({
      data: null,
      message: "Order cancelled successfully and stock restored",
    });
  } catch (error) {
    console.error("Order Cancel Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 7. GET /order/admin/get-all (Admin only: all orders with filters & pagination)
router.get("/order/admin/get-all", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || 1)));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 20))));
    const skip = (page - 1) * limit;

    const statusId = req.query.statusId ? parseInt(String(req.query.statusId)) : undefined;
    const search = String(req.query.search || "").trim();
    const fromDate = req.query.fromDate ? new Date(String(req.query.fromDate)) : undefined;
    const toDate = req.query.toDate ? new Date(String(req.query.toDate)) : undefined;

    const where: any = {
      IsMarkToDelete: false,
    };

    if (statusId) where.OrderStatusId = statusId;
    if (search) {
      where.OR = [
        { OrderNumber: { contains: search } },
        { Address: { Phone: { contains: search } } },
        { Address: { Name: { contains: search } } },
      ];
    }

    if (fromDate || toDate) {
      where.CreatedDate = {};
      if (fromDate) where.CreatedDate.gte = fromDate;
      if (toDate) where.CreatedDate.lte = toDate;
    }

    const [total, orders] = await Promise.all([
      prisma.orders.count({ where }),
      prisma.orders.findMany({
        where,
        skip,
        take: limit,
        orderBy: { Id: "desc" },
        include: {
          OrderStatus: true,
          PaymentMethods: true,
          Address: true,
          OrderItems: { where: { IsMarkToDelete: false } },
          Payments: { where: { IsMarkToDelete: false } },
        },
      }),
    ]);

    res.json({
      data: {
        items: orders,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      message: "Admin orders retrieved successfully",
    });
  } catch (error) {
    console.error("Admin Orders Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
