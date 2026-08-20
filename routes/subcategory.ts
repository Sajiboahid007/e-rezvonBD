import express from "express";
import prisma from "../prisma";
import { authenticate } from "../authenticate";
import { requireAdmin } from "../authorize";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// 1. GET /subcategory/get?categoryId=
router.get("/subcategory/get", async (req, res) => {
  try {
    const categoryId = req.query.categoryId ? parseInt(String(req.query.categoryId)) : undefined;

    const subcategories = await prisma.subCategory.findMany({
      where: {
        IsMarkToDelete: false,
        ...(categoryId ? { CategoryId: categoryId } : {}),
      },
      include: {
        Category: {
          select: {
            Id: true,
            Name: true,
          },
        },
      },
      orderBy: { Id: "asc" },
    });

    res.json({
      data: subcategories,
      message: "Subcategories retrieved successfully",
    });
  } catch (error) {
    console.error("SubCategory Get Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. POST /subcategory/create (Admin only)
router.post("/subcategory/create", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { CategoryId, Name, Description, ImageUrl } = req.body;

    if (!CategoryId || !Name) {
      res.status(400).json({ message: "CategoryId and Name are required" });
      return;
    }

    const categoryExists = await prisma.category.findFirst({
      where: { Id: parseInt(String(CategoryId)), IsMarkToDelete: false },
    });

    if (!categoryExists) {
      res.status(400).json({ message: "Category does not exist" });
      return;
    }

    const subcategory = await prisma.subCategory.create({
      data: {
        CategoryId: parseInt(String(CategoryId)),
        Name: Name.trim(),
        Description: Description ? Description.trim() : null,
        ImageUrl: ImageUrl ? ImageUrl.trim() : null,
        IsMarkToDelete: false,
        CreatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.status(201).json({
      data: subcategory,
      message: "Subcategory created successfully",
    });
  } catch (error) {
    console.error("SubCategory Create Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 3. PUT /subcategory/update/:id (Admin only)
router.put("/subcategory/update/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid subcategory ID" });
      return;
    }

    const existing = await prisma.subCategory.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Subcategory not found" });
      return;
    }

    const { CategoryId, Name, Description, ImageUrl } = req.body;

    if (CategoryId) {
      const categoryExists = await prisma.category.findFirst({
        where: { Id: parseInt(String(CategoryId)), IsMarkToDelete: false },
      });
      if (!categoryExists) {
        res.status(400).json({ message: "Specified Category does not exist" });
        return;
      }
    }

    const updated = await prisma.subCategory.update({
      where: { Id: id },
      data: {
        ...(CategoryId ? { CategoryId: parseInt(String(CategoryId)) } : {}),
        ...(Name ? { Name: Name.trim() } : {}),
        ...(Description !== undefined ? { Description: Description ? Description.trim() : null } : {}),
        ...(ImageUrl !== undefined ? { ImageUrl: ImageUrl ? ImageUrl.trim() : null } : {}),
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.json({
      data: updated,
      message: "Subcategory updated successfully",
    });
  } catch (error) {
    console.error("SubCategory Update Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 4. DELETE /subcategory/delete/:id (Soft delete, Admin only)
router.delete("/subcategory/delete/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid subcategory ID" });
      return;
    }

    const existing = await prisma.subCategory.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Subcategory not found" });
      return;
    }

    await prisma.subCategory.update({
      where: { Id: id },
      data: {
        IsMarkToDelete: true,
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.json({
      data: null,
      message: "Subcategory deleted successfully",
    });
  } catch (error) {
    console.error("SubCategory Delete Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
