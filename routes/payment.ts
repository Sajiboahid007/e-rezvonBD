import express from "express";
import prisma from "../prisma";
import { authenticate, optionalAuthenticate } from "../authenticate";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// 1. POST /payment/create (Record payment attempt)
router.post("/payment/create", optionalAuthenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { OrderId, PaymentMethodId, Amount, TransactionId, SenderNumber } = req.body;

    if (!OrderId || !PaymentMethodId || !Amount || !TransactionId) {
      res.status(400).json({
        message: "OrderId, PaymentMethodId, Amount, and TransactionId are required",
      });
      return;
    }

    const orderId = parseInt(String(OrderId));
    const paymentMethodId = parseInt(String(PaymentMethodId));
    const amount = parseFloat(String(Amount));

    const order = await prisma.orders.findFirst({
      where: { Id: orderId, IsMarkToDelete: false },
    });

    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return;
    }

    const payment = await prisma.payments.create({
      data: {
        OrderId: orderId,
        PaymentMethodId: paymentMethodId,
        Amount: amount,
        TransactionId: String(TransactionId).trim(),
        SenderNumber: SenderNumber ? String(SenderNumber).trim() : null,
        IsSuccessful: false,
        IsMarkToDelete: false,
        CreatedBy: req.userId ? req.userId.toString() : "GUEST",
      },
      include: {
        PaymentMethods: true,
      },
    });

    res.status(201).json({
      data: payment,
      message: "Payment attempt recorded successfully",
    });
  } catch (error) {
    console.error("Payment Create Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. POST /payment/verify (Verify transaction ID & update order IsPaid)
router.post("/payment/verify", optionalAuthenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { paymentId, TransactionId, OrderId } = req.body;

    if (!paymentId && (!TransactionId || !OrderId)) {
      res.status(400).json({
        message: "Either paymentId or both TransactionId and OrderId are required",
      });
      return;
    }

    const where: any = { IsMarkToDelete: false };
    if (paymentId) {
      where.Id = parseInt(String(paymentId));
    } else {
      where.TransactionId = String(TransactionId).trim();
      where.OrderId = parseInt(String(OrderId));
    }

    const payment = await prisma.payments.findFirst({
      where,
      include: { Orders: true },
    });

    if (!payment) {
      res.status(404).json({ message: "Payment record not found" });
      return;
    }

    // In a live production system, call bKash / Nagad / SSLCommerz gateway API here.
    const isVerified = Boolean(payment.TransactionId && payment.TransactionId.length >= 6);

    if (!isVerified) {
      res.status(400).json({ message: "Payment verification failed. Invalid transaction details." });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payments.update({
        where: { Id: payment.Id },
        data: {
          IsSuccessful: true,
          UpdatedDate: new Date(),
          UpdatedBy: req.userId ? req.userId.toString() : "VERIFY_GATEWAY",
        },
      });

      await tx.orders.update({
        where: { Id: payment.OrderId },
        data: {
          IsPaid: true,
          UpdatedDate: new Date(),
          UpdatedBy: req.userId ? req.userId.toString() : "PAYMENT_VERIFIED",
        },
      });

      return updatedPayment;
    });

    res.json({
      data: result,
      message: "Payment verified successfully and order marked as paid",
    });
  } catch (error) {
    console.error("Payment Verify Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 3. GET /payment/get/:orderId
router.get("/payment/get/:orderId", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const orderId = parseInt(String(req.params.orderId));
    if (isNaN(orderId)) {
      res.status(400).json({ message: "Invalid order ID" });
      return;
    }

    const payments = await prisma.payments.findMany({
      where: {
        OrderId: orderId,
        IsMarkToDelete: false,
      },
      include: {
        PaymentMethods: true,
      },
      orderBy: { Id: "desc" },
    });

    res.json({
      data: payments,
      message: "Payments retrieved successfully",
    });
  } catch (error) {
    console.error("Payment Get Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
