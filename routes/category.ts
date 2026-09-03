import express from "express";
import prisma from "../prisma";
import { authenticate } from "../authenticate";
import { requireAdmin } from "../authorize";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// 1. GET /category/get
router.get("/category/get", async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { IsMarkToDelete: false },
      include: {
        SubCategory: {
          where: { IsMarkToDelete: false },
        },
      },
      orderBy: { Id: "asc" },
    });

    res.json({
      data: categories,
      message: "Categories retrieved successfully",
    });
  } catch (error) {
    console.error("Category Get Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. GET /category/get/:id
router.get("/category/get/:id", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid category ID" });
      return;
    }

    const category = await prisma.category.findFirst({
      where: {
        Id: id,
        IsMarkToDelete: false,
      },
      include: {
        SubCategory: {
          where: { IsMarkToDelete: false },
        },
      },
    });

    if (!category) {
      res.status(404).json({ message: "Category not found" });
      return;
    }

    res.json({
      data: category,
      message: "Category retrieved successfully",
    });
  } catch (error) {
    console.error("Category Get Single Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 3. POST /category/create (Admin only)
router.post("/category/create", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { Name, Description, ImageUrl } = req.body;

    if (!Name) {
      res.status(400).json({ message: "Category name is required" });
      return;
    }

    const category = await prisma.category.create({
      data: {
        Name: Name.trim(),
        Description: Description ? Description.trim() : null,
        ImageUrl: ImageUrl ? ImageUrl.trim() : null,
        IsMarkToDelete: false,
        CreatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.status(201).json({
      data: category,
      message: "Category created successfully",
    });
  } catch (error) {
    console.error("Category Create Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 4. PUT /category/update/:id (Admin only)
router.put("/category/update/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid category ID" });
      return;
    }

    const existing = await prisma.category.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Category not found" });
      return;
    }

    const { Name, Description, ImageUrl } = req.body;

    const updated = await prisma.category.update({
      where: { Id: id },
      data: {
        ...(Name ? { Name: Name.trim() } : {}),
        ...(Description !== undefined ? { Description: Description ? Description.trim() : null } : {}),
        ...(ImageUrl !== undefined ? { ImageUrl: ImageUrl ? ImageUrl.trim() : null } : {}),
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.json({
      data: updated,
      message: "Category updated successfully",
    });
  } catch (error) {
    console.error("Category Update Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 5. DELETE /category/delete/:id (Soft delete, Admin only)
router.delete("/category/delete/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid category ID" });
      return;
    }

    const existing = await prisma.category.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Category not found" });
      return;
    }

    await prisma.category.update({
      where: { Id: id },
      data: {
        IsMarkToDelete: true,
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.json({
      data: null,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Category Delete Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
