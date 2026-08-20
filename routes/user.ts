import express from "express";
import bcrypt from "bcrypt";
import prisma from "../prisma";
import { authenticate } from "../authenticate";
import { requireAdmin } from "../authorize";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

const safeUserSelect = {
  Id: true,
  Name: true,
  Email: true,
  Phone: true,
  RoleId: true,
  IsActive: true,
  IsMarkToDelete: true,
  CreatedDate: true,
  UpdatedDate: true,
  CreatedBy: true,
  UpdatedBy: true,
  Roles: {
    select: {
      Id: true,
      Name: true,
    },
  },
};

// 1. GET /user/get (Admin only, paginated, searchable, role filter)
router.get("/user/get", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || 1)));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 20))));
    const skip = (page - 1) * limit;
    const search = String(req.query.search || "").trim();
    const roleFilter = String(req.query.role || "").trim();

    const where: any = {
      IsMarkToDelete: false,
    };

    if (search) {
      where.OR = [
        { Name: { contains: search } },
        { Email: { contains: search } },
        { Phone: { contains: search } },
      ];
    }

    if (roleFilter) {
      where.Roles = {
        Name: { contains: roleFilter },
      };
    }

    const [total, users] = await Promise.all([
      prisma.users.count({ where }),
      prisma.users.findMany({
        where,
        skip,
        take: limit,
        orderBy: { Id: "desc" },
        select: {
          ...safeUserSelect,
          Address: {
            where: { IsMarkToDelete: false },
          },
          _count: {
            select: { Orders: true },
          },
        },
      }),
    ]);

    res.json({
      data: {
        items: users,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      message: "Users retrieved successfully",
    });
  } catch (error) {
    console.error("User List Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. GET /user/get/:id (Admin or self)
router.get("/user/get/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    // Allow if admin or requesting own profile
    const isAdmin = req.role?.toLowerCase() === "admin" || req.role?.toLowerCase() === "superadmin";
    if (!isAdmin && req.userId !== id) {
      res.status(403).json({ message: "Access forbidden: You can only view your own profile" });
      return;
    }

    const user = await prisma.users.findFirst({
      where: {
        Id: id,
        IsMarkToDelete: false,
      },
      select: {
        ...safeUserSelect,
        Address: {
          where: { IsMarkToDelete: false },
        },
        _count: {
          select: { Orders: true },
        },
      },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({
      data: user,
      message: "User retrieved successfully",
    });
  } catch (error) {
    console.error("User Get Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 3. POST /user/create (Admin create)
router.post("/user/create", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { Name, Email, Phone, Password, RoleId, IsActive } = req.body;

    if (!Name || !Phone || !Password) {
      res.status(400).json({ message: "Name, Phone, and Password are required" });
      return;
    }

    const existing = await prisma.users.findFirst({
      where: {
        IsMarkToDelete: false,
        OR: [
          { Phone: Phone.trim() },
          ...(Email ? [{ Email: Email.trim() }] : []),
        ],
      },
    });

    if (existing) {
      res.status(400).json({ message: "User with this phone or email already exists" });
      return;
    }

    const hashedPassword = await bcrypt.hash(Password, 10);
    const user = await prisma.users.create({
      data: {
        Name: Name.trim(),
        Email: Email ? Email.trim() : null,
        Phone: Phone.trim(),
        Password: hashedPassword,
        RoleId: RoleId ? parseInt(String(RoleId)) : 2,
        IsActive: IsActive !== undefined ? Boolean(IsActive) : true,
        IsMarkToDelete: false,
        CreatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
      select: safeUserSelect,
    });

    res.status(201).json({
      data: user,
      message: "User created successfully",
    });
  } catch (error) {
    console.error("User Create Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 4. PUT /user/update/:id
router.put("/user/update/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    const isAdmin = req.role?.toLowerCase() === "admin" || req.role?.toLowerCase() === "superadmin";
    if (!isAdmin && req.userId !== id) {
      res.status(403).json({ message: "Access forbidden: You can only update your own profile" });
      return;
    }

    const { Name, Email, Phone, RoleId, Password } = req.body;

    const existing = await prisma.users.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const updateData: any = {
      UpdatedDate: new Date(),
      UpdatedBy: req.userId ? req.userId.toString() : "USER",
    };

    if (Name) updateData.Name = Name.trim();
    if (Email !== undefined) updateData.Email = Email ? Email.trim() : null;
    if (Phone) updateData.Phone = Phone.trim();
    if (Password) updateData.Password = await bcrypt.hash(Password, 10);
    if (isAdmin && RoleId) updateData.RoleId = parseInt(String(RoleId));

    const updatedUser = await prisma.users.update({
      where: { Id: id },
      data: updateData,
      select: safeUserSelect,
    });

    res.json({
      data: updatedUser,
      message: "User updated successfully",
    });
  } catch (error) {
    console.error("User Update Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 5. PATCH /user/toggle-active/:id (Admin only)
router.patch("/user/toggle-active/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    const existing = await prisma.users.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const newActiveState = !(existing.IsActive ?? true);

    const updated = await prisma.users.update({
      where: { Id: id },
      data: {
        IsActive: newActiveState,
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
      select: safeUserSelect,
    });

    res.json({
      data: updated,
      message: `User ${newActiveState ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    console.error("User Toggle Active Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 6. DELETE /user/delete/:id (Soft delete, Admin only)
router.delete("/user/delete/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    const existing = await prisma.users.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    await prisma.users.update({
      where: { Id: id },
      data: {
        IsMarkToDelete: true,
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.json({
      data: null,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("User Delete Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
