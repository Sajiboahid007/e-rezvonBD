import express from "express";
import prisma from "../prisma";
import { authenticate } from "../authenticate";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// 1. GET /order-history/get/:orderId
router.get("/order-history/get/:orderId", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const orderId = parseInt(String(req.params.orderId));
    if (isNaN(orderId)) {
      res.status(400).json({ message: "Invalid order ID" });
      return;
    }

    const order = await prisma.orders.findFirst({
      where: { Id: orderId, IsMarkToDelete: false },
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

    const history = await prisma.orderHistory.findMany({
      where: {
        OrderId: orderId,
        IsMarkToDelete: false,
      },
      include: {
        OrderStatus: true,
      },
      orderBy: { CreatedDate: "asc" },
    });

    res.json({
      data: history,
      message: "Order history timeline retrieved successfully",
    });
  } catch (error) {
    console.error("Order History Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
