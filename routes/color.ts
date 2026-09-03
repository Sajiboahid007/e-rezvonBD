import express from "express";
import prisma from "../prisma";
import { authenticate } from "../authenticate";
import { requireAdmin } from "../authorize";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// 1. GET /color/get
router.get("/color/get", async (req, res) => {
  try {
    const colors = await prisma.colors.findMany({
      where: { IsMarkToDelete: false },
      orderBy: { Id: "asc" },
    });

    res.json({
      data: colors,
      message: "Colors retrieved successfully",
    });
  } catch (error) {
    console.error("Colors Get Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. POST /color/create (Admin only)
router.post("/color/create", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { Name } = req.body;

    if (!Name) {
      res.status(400).json({ message: "Color name is required" });
      return;
    }

    const color = await prisma.colors.create({
      data: {
        Name: Name.trim(),
        IsMarkToDelete: false,
        CreatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.status(201).json({
      data: color,
      message: "Color created successfully",
    });
  } catch (error) {
    console.error("Color Create Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 3. PUT /color/update/:id (Admin only)
router.put("/color/update/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid color ID" });
      return;
    }

    const existing = await prisma.colors.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Color not found" });
      return;
    }

    const { Name } = req.body;

    const updated = await prisma.colors.update({
      where: { Id: id },
      data: {
        ...(Name ? { Name: Name.trim() } : {}),
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.json({
      data: updated,
      message: "Color updated successfully",
    });
  } catch (error) {
    console.error("Color Update Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 4. DELETE /color/delete/:id (Soft delete, Admin only)
router.delete("/color/delete/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid color ID" });
      return;
    }

    const existing = await prisma.colors.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Color not found" });
      return;
    }

    await prisma.colors.update({
      where: { Id: id },
      data: {
        IsMarkToDelete: true,
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.json({
      data: null,
      message: "Color deleted successfully",
    });
  } catch (error) {
    console.error("Color Delete Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
