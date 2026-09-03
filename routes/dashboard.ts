import express from "express";
import prisma from "../prisma";
import { authenticate } from "../authenticate";
import { requireAdmin } from "../authorize";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// 1. GET /dashboard/summary (Admin KPI stats)
router.get("/dashboard/summary", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const [
      totalOrders,
      pendingOrders,
      paidOrders,
      lowStockCount,
      totalCustomers,
      totalProducts,
    ] = await Promise.all([
      prisma.orders.count({ where: { IsMarkToDelete: false } }),
      prisma.orders.count({
        where: {
          IsMarkToDelete: false,
          OrderStatus: { Name: { contains: "Pending" } },
        },
      }),
      prisma.orders.findMany({
        where: {
          IsMarkToDelete: false,
          IsPaid: true,
        },
        select: { TotalAmount: true },
      }),
      prisma.productVariants.count({
        where: {
          IsMarkToDelete: false,
          StockQuantity: { lte: 5 },
        },
      }),
      prisma.users.count({
        where: {
          IsMarkToDelete: false,
          Roles: { Name: { contains: "Customer" } },
        },
      }),
      prisma.products.count({ where: { IsMarkToDelete: false } }),
    ]);

    const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.TotalAmount), 0);

    res.json({
      data: {
        totalOrders,
        pendingOrders,
        totalRevenue,
        lowStockCount,
        totalCustomers,
        totalProducts,
      },
      message: "Dashboard summary retrieved successfully",
    });
  } catch (error) {
    console.error("Dashboard Summary Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. GET /dashboard/sales-report?from=&to= (Sales & revenue by date)
router.get("/dashboard/sales-report", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const fromDate = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = req.query.to ? new Date(req.query.to as string) : new Date();

    const orders = await prisma.orders.findMany({
      where: {
        IsMarkToDelete: false,
        CreatedDate: {
          gte: fromDate,
          lte: toDate,
        },
      },
      select: {
        Id: true,
        TotalAmount: true,
        IsPaid: true,
        CreatedDate: true,
      },
      orderBy: { CreatedDate: "asc" },
    });

    // Group by Date (YYYY-MM-DD)
    const salesByDate: Record<string, { date: string; ordersCount: number; revenue: number }> = {};

    for (const ord of orders) {
      const dateKey = ord.CreatedDate ? ord.CreatedDate.toISOString().slice(0, 10) : "Unknown";
      if (!salesByDate[dateKey]) {
        salesByDate[dateKey] = { date: dateKey, ordersCount: 0, revenue: 0 };
      }
      salesByDate[dateKey].ordersCount += 1;
      if (ord.IsPaid) {
        salesByDate[dateKey].revenue += Number(ord.TotalAmount);
      }
    }

    res.json({
      data: {
        fromDate,
        toDate,
        totalOrders: orders.length,
        timeline: Object.values(salesByDate),
      },
      message: "Sales report generated successfully",
    });
  } catch (error) {
    console.error("Sales Report Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 3. GET /dashboard/top-products (Best-selling products by order frequency)
router.get("/dashboard/top-products", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));

    const orderItems = await prisma.orderItems.findMany({
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
    });

    const productSalesMap = new Map<number, { productId: number; name: string; totalQuantitySold: number; totalSalesAmount: number; image: string | null }>();

    for (const item of orderItems) {
      const prod = item.ProductVariants?.Products;
      if (!prod) continue;

      const existing = productSalesMap.get(prod.Id);
      const qty = item.Quantity;
      const amount = Number(item.LineTotal);

      if (existing) {
        existing.totalQuantitySold += qty;
        existing.totalSalesAmount += amount;
      } else {
        productSalesMap.set(prod.Id, {
          productId: prod.Id,
          name: prod.Name,
          totalQuantitySold: qty,
          totalSalesAmount: amount,
          image: prod.ProductImages[0]?.ImageUrl || null,
        });
      }
    }

    const sortedProducts = Array.from(productSalesMap.values())
      .sort((a, b) => b.totalQuantitySold - a.totalQuantitySold)
      .slice(0, limit);

    res.json({
      data: sortedProducts,
      message: "Top products retrieved successfully",
    });
  } catch (error) {
    console.error("Top Products Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 4. GET /dashboard/low-stock (Variants with stock below threshold)
router.get("/dashboard/low-stock", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const threshold = parseInt(req.query.threshold as string) || 5;

    const lowStockVariants = await prisma.productVariants.findMany({
      where: {
        IsMarkToDelete: false,
        StockQuantity: { lte: threshold },
      },
      include: {
        Products: {
          select: {
            Id: true,
            Name: true,
            SKU: true,
            Price: true,
            DiscountPrice: true,
          },
        },
        Sizes: { select: { Id: true, Name: true } },
        Colors: { select: { Id: true, Name: true } },
      },
      orderBy: { StockQuantity: "asc" },
    });

    const formatted = lowStockVariants.map((v) => ({
      variantId: v.Id,
      productId: v.ProductId,
      productName: v.Products.Name,
      sku: v.Products.SKU,
      size: v.Sizes?.Name,
      color: v.Colors?.Name,
      stockQuantity: v.StockQuantity,
      price: v.Products.DiscountPrice ?? v.Products.Price,
    }));

    res.json({
      data: {
        threshold,
        count: formatted.length,
        items: formatted,
      },
      message: "Low stock variants retrieved successfully",
    });
  } catch (error) {
    console.error("Low Stock Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
