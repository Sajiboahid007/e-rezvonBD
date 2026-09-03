import express from "express";
import prisma from "../prisma";
import { authenticate } from "../authenticate";
import { requireAdmin } from "../authorize";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// 1. GET /size/get
router.get("/size/get", async (req, res) => {
  try {
    const sizes = await prisma.sizes.findMany({
      where: { IsMarkToDelete: false },
      orderBy: { Id: "asc" },
    });

    res.json({
      data: sizes,
      message: "Sizes retrieved successfully",
    });
  } catch (error) {
    console.error("Sizes Get Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. POST /size/create (Admin only)
router.post("/size/create", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { Name } = req.body;

    if (!Name) {
      res.status(400).json({ message: "Size name is required" });
      return;
    }

    const size = await prisma.sizes.create({
      data: {
        Name: Name.trim(),
        IsMarkToDelete: false,
        CreatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.status(201).json({
      data: size,
      message: "Size created successfully",
    });
  } catch (error) {
    console.error("Size Create Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 3. PUT /size/update/:id (Admin only)
router.put("/size/update/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid size ID" });
      return;
    }

    const existing = await prisma.sizes.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Size not found" });
      return;
    }

    const { Name } = req.body;

    const updated = await prisma.sizes.update({
      where: { Id: id },
      data: {
        ...(Name ? { Name: Name.trim() } : {}),
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.json({
      data: updated,
      message: "Size updated successfully",
    });
  } catch (error) {
    console.error("Size Update Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 4. DELETE /size/delete/:id (Soft delete, Admin only)
router.delete("/size/delete/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid size ID" });
      return;
    }

    const existing = await prisma.sizes.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Size not found" });
      return;
    }

    await prisma.sizes.update({
      where: { Id: id },
      data: {
        IsMarkToDelete: true,
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.json({
      data: null,
      message: "Size deleted successfully",
    });
  } catch (error) {
    console.error("Size Delete Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
