import express from "express";
import prisma from "../prisma";
import { authenticate, optionalAuthenticate } from "../authenticate";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// 1. GET /address/get/:userId
router.get("/address/get/:userId", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = parseInt(String(req.params.userId));
    if (isNaN(userId)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    const isAdmin = req.role?.toLowerCase() === "admin" || req.role?.toLowerCase() === "superadmin";
    if (!isAdmin && req.userId !== userId) {
      res.status(403).json({ message: "Access forbidden: You can only view your own addresses" });
      return;
    }

    const addresses = await prisma.address.findMany({
      where: {
        UserId: userId,
        IsMarkToDelete: false,
      },
      orderBy: { Id: "desc" },
    });

    res.json({
      data: addresses,
      message: "Addresses retrieved successfully",
    });
  } catch (error) {
    console.error("Address Get List Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. POST /address/create (Supports both logged-in user and guest checkout)
router.post("/address/create", optionalAuthenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      UserId,
      Name,
      Phone,
      Email,
      Street,
      Thana,
      District,
      City,
      PostalCode,
    } = req.body;

    if (!Name || !Phone || !Street || !Thana || !District) {
      res.status(400).json({
        message: "Name, Phone, Street, Thana, and District are required",
      });
      return;
    }

    // Determine target userId (authenticated user or explicit body userId for guest/admin)
    const targetUserId = req.userId || (UserId ? parseInt(String(UserId)) : null);

    const address = await prisma.address.create({
      data: {
        UserId: targetUserId,
        Name: Name.trim(),
        Phone: Phone.trim(),
        Email: Email ? Email.trim() : null,
        Street: Street.trim(),
        Thana: Thana.trim(),
        District: District.trim(),
        City: City ? City.trim() : null,
        PostalCode: PostalCode ? PostalCode.trim() : null,
        IsMarkToDelete: false,
        CreatedBy: req.userId ? req.userId.toString() : "GUEST",
      },
    });

    res.status(201).json({
      data: address,
      message: "Address created successfully",
    });
  } catch (error) {
    console.error("Address Create Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 3. PUT /address/update/:id
router.put("/address/update/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid address ID" });
      return;
    }

    const existing = await prisma.address.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Address not found" });
      return;
    }

    const isAdmin = req.role?.toLowerCase() === "admin" || req.role?.toLowerCase() === "superadmin";
    if (!isAdmin && existing.UserId && existing.UserId !== req.userId) {
      res.status(403).json({ message: "Access forbidden: You can only edit your own address" });
      return;
    }

    const {
      Name,
      Phone,
      Email,
      Street,
      Thana,
      District,
      City,
      PostalCode,
    } = req.body;

    const updated = await prisma.address.update({
      where: { Id: id },
      data: {
        ...(Name ? { Name: Name.trim() } : {}),
        ...(Phone ? { Phone: Phone.trim() } : {}),
        ...(Email !== undefined ? { Email: Email ? Email.trim() : null } : {}),
        ...(Street ? { Street: Street.trim() } : {}),
        ...(Thana ? { Thana: Thana.trim() } : {}),
        ...(District ? { District: District.trim() } : {}),
        ...(City !== undefined ? { City: City ? City.trim() : null } : {}),
        ...(PostalCode !== undefined ? { PostalCode: PostalCode ? PostalCode.trim() : null } : {}),
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "USER",
      },
    });

    res.json({
      data: updated,
      message: "Address updated successfully",
    });
  } catch (error) {
    console.error("Address Update Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 4. PATCH /address/set-default/:id
router.patch("/address/set-default/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid address ID" });
      return;
    }

    const existing = await prisma.address.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Address not found" });
      return;
    }

    const isAdmin = req.role?.toLowerCase() === "admin" || req.role?.toLowerCase() === "superadmin";
    if (!isAdmin && existing.UserId && existing.UserId !== req.userId) {
      res.status(403).json({ message: "Access forbidden" });
      return;
    }

    const updated = await prisma.address.update({
      where: { Id: id },
      data: {
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "USER",
      },
    });

    res.json({
      data: updated,
      message: "Address set as primary successfully",
    });
  } catch (error) {
    console.error("Address Set Default Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 5. DELETE /address/delete/:id (Soft delete)
router.delete("/address/delete/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid address ID" });
      return;
    }

    const existing = await prisma.address.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Address not found" });
      return;
    }

    const isAdmin = req.role?.toLowerCase() === "admin" || req.role?.toLowerCase() === "superadmin";
    if (!isAdmin && existing.UserId && existing.UserId !== req.userId) {
      res.status(403).json({ message: "Access forbidden" });
      return;
    }

    await prisma.address.update({
      where: { Id: id },
      data: {
        IsMarkToDelete: true,
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "USER",
      },
    });

    res.json({
      data: null,
      message: "Address deleted successfully",
    });
  } catch (error) {
    console.error("Address Delete Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
