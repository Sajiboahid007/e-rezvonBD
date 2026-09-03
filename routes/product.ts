import express from "express";
import prisma from "../prisma";
import { authenticate } from "../authenticate";
import { requireAdmin } from "../authorize";
import type { AuthenticatedRequest } from "../interface";

const router = express.Router();

// 1. GET /product/get (Paginated, filtered, sorted)
router.get("/product/get", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || 1)));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 20))));
    const skip = (page - 1) * limit;

    const categoryId = req.query.categoryId ? parseInt(String(req.query.categoryId)) : undefined;
    const subCategoryId = req.query.subCategoryId ? parseInt(String(req.query.subCategoryId)) : undefined;
    const minPrice = req.query.minPrice ? parseFloat(String(req.query.minPrice)) : undefined;
    const maxPrice = req.query.maxPrice ? parseFloat(String(req.query.maxPrice)) : undefined;
    const sizeId = req.query.sizeId ? parseInt(String(req.query.sizeId)) : undefined;
    const colorId = req.query.colorId ? parseInt(String(req.query.colorId)) : undefined;
    const sort = String(req.query.sort || "newest").toLowerCase();
    const search = String(req.query.search || "").trim();

    const where: any = {
      IsMarkToDelete: false,
    };

    if (categoryId) where.CategoryId = categoryId;
    if (subCategoryId) where.SubCategoryId = subCategoryId;

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.Price = {};
      if (minPrice !== undefined) where.Price.gte = minPrice;
      if (maxPrice !== undefined) where.Price.lte = maxPrice;
    }

    if (sizeId || colorId) {
      where.ProductVariants = {
        some: {
          IsMarkToDelete: false,
          ...(sizeId ? { SizeId: sizeId } : {}),
          ...(colorId ? { ColorId: colorId } : {}),
        },
      };
    }

    if (search) {
      where.OR = [
        { Name: { contains: search } },
        { Brand: { contains: search } },
        { SKU: { contains: search } },
      ];
    }

    let orderBy: any = { Id: "desc" };
    if (sort === "price_asc") {
      orderBy = { Price: "asc" };
    } else if (sort === "price_desc") {
      orderBy = { Price: "desc" };
    } else if (sort === "newest") {
      orderBy = { Id: "desc" };
    }

    const [total, products] = await Promise.all([
      prisma.products.count({ where }),
      prisma.products.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          Category: { select: { Id: true, Name: true } },
          SubCategory: { select: { Id: true, Name: true } },
          ProductImages: {
            where: { IsMarkToDelete: false },
            orderBy: [{ IsPrimary: "desc" }, { Id: "asc" }],
          },
          ProductVariants: {
            where: { IsMarkToDelete: false },
            include: {
              Sizes: { select: { Id: true, Name: true } },
              Colors: { select: { Id: true, Name: true } },
            },
          },
        },
      }),
    ]);

    const formattedProducts = products.map((prod) => {
      const finalPrice = prod.DiscountPrice ?? prod.Price;
      const totalStock = prod.ProductVariants.reduce((sum, v) => sum + (v.StockQuantity || 0), 0);
      const uniqueImages = (prod.ProductImages || []).filter(
        (img, idx, arr) => arr.findIndex((t) => t.ImageUrl === img.ImageUrl) === idx
      );
      return {
        ...prod,
        ProductImages: uniqueImages,
        finalPrice,
        totalStock,
      };
    });

    res.json({
      data: {
        items: formattedProducts,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      message: "Products retrieved successfully",
    });
  } catch (error) {
    console.error("Product List Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 2. GET /product/search?q=
router.get("/product/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) {
      res.json({
        data: [],
        message: "Query is empty",
      });
      return;
    }

    const products = await prisma.products.findMany({
      where: {
        IsMarkToDelete: false,
        OR: [
          { Name: { contains: q } },
          { Brand: { contains: q } },
          { SKU: { contains: q } },
          { Description: { contains: q } },
        ],
      },
      take: 30,
      include: {
        Category: { select: { Id: true, Name: true } },
        SubCategory: { select: { Id: true, Name: true } },
        ProductImages: {
          where: { IsMarkToDelete: false },
          orderBy: [{ IsPrimary: "desc" }, { Id: "asc" }],
        },
        ProductVariants: {
          where: { IsMarkToDelete: false },
          include: {
            Sizes: { select: { Id: true, Name: true } },
            Colors: { select: { Id: true, Name: true } },
          },
        },
      },
    });

    const formattedProducts = products.map((prod) => {
      const uniqueImages = (prod.ProductImages || []).filter(
        (img, idx, arr) => arr.findIndex((t) => t.ImageUrl === img.ImageUrl) === idx
      );
      return {
        ...prod,
        ProductImages: uniqueImages,
        finalPrice: prod.DiscountPrice ?? prod.Price,
      };
    });

    res.json({
      data: formattedProducts,
      message: "Search results retrieved successfully",
    });
  } catch (error) {
    console.error("Product Search Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 3. GET /product/featured
router.get("/product/featured", async (req, res) => {
  try {
    const limit = Math.min(30, Math.max(1, parseInt(String(req.query.limit || 10))));

    const products = await prisma.products.findMany({
      where: {
        IsMarkToDelete: false,
      },
      take: limit,
      orderBy: { Id: "desc" },
      include: {
        Category: { select: { Id: true, Name: true } },
        SubCategory: { select: { Id: true, Name: true } },
        ProductImages: {
          where: { IsMarkToDelete: false },
          orderBy: [{ IsPrimary: "desc" }, { Id: "asc" }],
        },
        ProductVariants: {
          where: { IsMarkToDelete: false },
          include: {
            Sizes: { select: { Id: true, Name: true } },
            Colors: { select: { Id: true, Name: true } },
          },
        },
      },
    });

    const formattedProducts = products.map((prod) => {
      const uniqueImages = (prod.ProductImages || []).filter(
        (img, idx, arr) => arr.findIndex((t) => t.ImageUrl === img.ImageUrl) === idx
      );
      return {
        ...prod,
        ProductImages: uniqueImages,
        finalPrice: prod.DiscountPrice ?? prod.Price,
        totalStock: prod.ProductVariants.reduce((sum, v) => sum + (v.StockQuantity || 0), 0),
      };
    });

    res.json({
      data: formattedProducts,
      message: "Featured products retrieved successfully",
    });
  } catch (error) {
    console.error("Featured Product Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 4. GET /product/get/:id
router.get("/product/get/:id", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid product ID" });
      return;
    }

    const product = await prisma.products.findFirst({
      where: {
        Id: id,
        IsMarkToDelete: false,
      },
      include: {
        Category: true,
        SubCategory: true,
        ProductImages: {
          where: { IsMarkToDelete: false },
          orderBy: [{ IsPrimary: "desc" }, { Id: "asc" }],
        },
        ProductVariants: {
          where: { IsMarkToDelete: false },
          include: {
            Sizes: true,
            Colors: true,
          },
        },
      },
    });

    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    const finalPrice = product.DiscountPrice ?? product.Price;
    const totalStock = product.ProductVariants.reduce((sum, v) => sum + (v.StockQuantity || 0), 0);
    const uniqueImages = (product.ProductImages || []).filter(
      (img, idx, arr) => arr.findIndex((t) => t.ImageUrl === img.ImageUrl) === idx
    );

    res.json({
      data: {
        ...product,
        ProductImages: uniqueImages,
        finalPrice,
        totalStock,
      },
      message: "Product retrieved successfully",
    });
  } catch (error) {
    console.error("Product Get Single Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 5. POST /product/create (Admin only)
router.post("/product/create", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      Name,
      Description,
      CategoryId,
      SubCategoryId,
      Brand,
      Fabric,
      Price,
      DiscountPrice,
      SKU,
    } = req.body;

    if (!Name || !CategoryId || !SubCategoryId || Price === undefined || !SKU) {
      res.status(400).json({
        message: "Name, CategoryId, SubCategoryId, Price, and SKU are required",
      });
      return;
    }

    const [cat, subCat, existingSku] = await Promise.all([
      prisma.category.findFirst({ where: { Id: parseInt(String(CategoryId)), IsMarkToDelete: false } }),
      prisma.subCategory.findFirst({ where: { Id: parseInt(String(SubCategoryId)), IsMarkToDelete: false } }),
      prisma.products.findFirst({ where: { SKU: String(SKU).trim(), IsMarkToDelete: false } }),
    ]);

    if (!cat) {
      res.status(400).json({ message: "Category does not exist" });
      return;
    }
    if (!subCat) {
      res.status(400).json({ message: "SubCategory does not exist" });
      return;
    }
    if (existingSku) {
      res.status(400).json({ message: "Product with this SKU already exists" });
      return;
    }

    const product = await prisma.products.create({
      data: {
        Name: String(Name).trim(),
        Description: Description ? String(Description).trim() : null,
        CategoryId: parseInt(String(CategoryId)),
        SubCategoryId: parseInt(String(SubCategoryId)),
        Brand: Brand ? String(Brand).trim() : null,
        Fabric: Fabric ? String(Fabric).trim() : null,
        Price: parseFloat(String(Price)),
        DiscountPrice: DiscountPrice !== undefined && DiscountPrice !== null && DiscountPrice !== "" ? parseFloat(String(DiscountPrice)) : null,
        SKU: String(SKU).trim(),
        IsMarkToDelete: false,
        CreatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    // Handle multiple product images if provided in request body
    const rawImages = req.body.Images || req.body.images || (req.body.ImageUrl || req.body.imageUrl ? [req.body.ImageUrl || req.body.imageUrl] : []);
    if (Array.isArray(rawImages) && rawImages.length > 0) {
      let hasExplicitPrimary = rawImages.some((img: any) => typeof img === "object" && Boolean(img?.IsPrimary));
      for (let i = 0; i < rawImages.length; i++) {
        const item = rawImages[i];
        const url = typeof item === "string" ? item.trim() : String(item?.ImageUrl || "").trim();
        const isPrimary = typeof item === "string" ? (i === 0) : (hasExplicitPrimary ? Boolean(item?.IsPrimary) : i === 0);
        if (url) {
          await prisma.productImages.create({
            data: {
              ProductId: product.Id,
              ImageUrl: url,
              IsPrimary: isPrimary,
              IsMarkToDelete: false,
              CreatedBy: req.userId ? req.userId.toString() : "ADMIN",
            },
          });
        }
      }
    }

    const createdProduct = await prisma.products.findFirst({
      where: { Id: product.Id },
      include: {
        Category: { select: { Id: true, Name: true } },
        SubCategory: { select: { Id: true, Name: true } },
        ProductImages: {
          where: { IsMarkToDelete: false },
          orderBy: [{ IsPrimary: "desc" }, { Id: "asc" }],
        },
        ProductVariants: {
          where: { IsMarkToDelete: false },
        },
      },
    });

    res.status(201).json({
      data: createdProduct || product,
      message: "Product created successfully",
    });
  } catch (error) {
    console.error("Product Create Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 6. PUT /product/update/:id (Admin only)
router.put("/product/update/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid product ID" });
      return;
    }

    const existing = await prisma.products.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    const {
      Name,
      Description,
      CategoryId,
      SubCategoryId,
      Brand,
      Fabric,
      Price,
      DiscountPrice,
      SKU,
    } = req.body;

    if (SKU && String(SKU).trim() !== existing.SKU) {
      const duplicateSku = await prisma.products.findFirst({
        where: { SKU: String(SKU).trim(), IsMarkToDelete: false, Id: { not: id } },
      });
      if (duplicateSku) {
        res.status(400).json({ message: "SKU is already in use by another product" });
        return;
      }
    }

    const updated = await prisma.products.update({
      where: { Id: id },
      data: {
        ...(Name ? { Name: String(Name).trim() } : {}),
        ...(Description !== undefined ? { Description: Description ? String(Description).trim() : null } : {}),
        ...(CategoryId ? { CategoryId: parseInt(String(CategoryId)) } : {}),
        ...(SubCategoryId ? { SubCategoryId: parseInt(String(SubCategoryId)) } : {}),
        ...(Brand !== undefined ? { Brand: Brand ? String(Brand).trim() : null } : {}),
        ...(Fabric !== undefined ? { Fabric: Fabric ? String(Fabric).trim() : null } : {}),
        ...(Price !== undefined ? { Price: parseFloat(String(Price)) } : {}),
        ...(DiscountPrice !== undefined ? { DiscountPrice: DiscountPrice !== null && DiscountPrice !== "" ? parseFloat(String(DiscountPrice)) : null } : {}),
        ...(SKU ? { SKU: String(SKU).trim() } : {}),
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    // Sync multiple product images if Images/images array is provided
    const rawImages = req.body.Images !== undefined ? req.body.Images : req.body.images;
    if (Array.isArray(rawImages)) {
      await prisma.productImages.updateMany({
        where: { ProductId: id, IsMarkToDelete: false },
        data: { IsMarkToDelete: true },
      });

      let hasExplicitPrimary = rawImages.some((img: any) => typeof img === "object" && Boolean(img?.IsPrimary));
      for (let i = 0; i < rawImages.length; i++) {
        const item = rawImages[i];
        const url = typeof item === "string" ? item.trim() : String(item?.ImageUrl || "").trim();
        const isPrimary = typeof item === "string" ? (i === 0) : (hasExplicitPrimary ? Boolean(item?.IsPrimary) : i === 0);
        if (url) {
          await prisma.productImages.create({
            data: {
              ProductId: id,
              ImageUrl: url,
              IsPrimary: isPrimary,
              IsMarkToDelete: false,
              CreatedBy: req.userId ? req.userId.toString() : "ADMIN",
            },
          });
        }
      }
    }

    const fullUpdatedProduct = await prisma.products.findFirst({
      where: { Id: id },
      include: {
        Category: { select: { Id: true, Name: true } },
        SubCategory: { select: { Id: true, Name: true } },
        ProductImages: {
          where: { IsMarkToDelete: false },
          orderBy: [{ IsPrimary: "desc" }, { Id: "asc" }],
        },
        ProductVariants: {
          where: { IsMarkToDelete: false },
        },
      },
    });

    res.json({
      data: fullUpdatedProduct || updated,
      message: "Product updated successfully",
    });
  } catch (error) {
    console.error("Product Update Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 7. DELETE /product/delete/:id (Soft delete, Admin only)
router.delete("/product/delete/:id", authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid product ID" });
      return;
    }

    const existing = await prisma.products.findFirst({
      where: { Id: id, IsMarkToDelete: false },
    });

    if (!existing) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    await prisma.products.update({
      where: { Id: id },
      data: {
        IsMarkToDelete: true,
        UpdatedDate: new Date(),
        UpdatedBy: req.userId ? req.userId.toString() : "ADMIN",
      },
    });

    res.json({
      data: null,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Product Delete Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
