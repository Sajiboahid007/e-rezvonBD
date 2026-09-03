import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer disk storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate clean, collision-free filename
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    const sanitizedBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .substring(0, 30);
    cb(null, `${sanitizedBase}-${uniqueSuffix}${ext}`);
  },
});

// File filter to allow only image mime types
const fileFilter = (
  req: express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
    "image/bmp",
    "image/avif",
  ];

  if (allowedMimeTypes.includes(file.mimetype) || file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (JPG, PNG, WEBP, GIF, SVG, AVIF) are allowed"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB maximum
  },
});

// 1. POST /upload (Accepts single or multiple files under any field name)
router.post(
  "/upload",
  (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File size exceeds 15MB limit per file" });
        }
        return res.status(400).json({ message: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ message: err.message || "Failed to upload file" });
      }
      next();
    });
  },
  (req, res) => {
    const rawFiles = req.files as Express.Multer.File[] | undefined;
    const files = Array.isArray(rawFiles) ? rawFiles : [];

    if (files.length === 0) {
      return res.status(400).json({ message: "No file provided for upload" });
    }

    const host = req.get("host") || "localhost:3000";
    const protocol = req.protocol || "http";

    const uploadedList = files.map((f) => {
      const relativeUrl = `/uploads/${f.filename}`;
      const fullUrl = `${protocol}://${host}${relativeUrl}`;
      return {
        filename: f.filename,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        url: relativeUrl,
        fullUrl: fullUrl,
      };
    });

    const first = uploadedList[0];

    return res.status(200).json({
      data: uploadedList.length > 1 ? uploadedList : first,
      items: uploadedList,
      filename: first.filename,
      url: first.url,
      fullUrl: first.fullUrl,
      message: `${uploadedList.length} image(s) uploaded successfully`,
    });
  }
);

// 2. POST /upload/multiple (Accepts multiple files up to 20 images)
router.post(
  "/upload/multiple",
  (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || "Failed to upload files" });
      }
      next();
    });
  },
  (req, res) => {
    const rawFiles = req.files as Express.Multer.File[] | undefined;
    const files = Array.isArray(rawFiles) ? rawFiles : [];

    if (files.length === 0) {
      return res.status(400).json({ message: "No files provided for upload" });
    }

    const host = req.get("host") || "localhost:3000";
    const protocol = req.protocol || "http";

    const uploadedList = files.map((file) => {
      const relativeUrl = `/uploads/${file.filename}`;
      const fullUrl = `${protocol}://${host}${relativeUrl}`;
      return {
        filename: file.filename,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url: relativeUrl,
        fullUrl: fullUrl,
      };
    });

    return res.status(200).json({
      data: uploadedList,
      message: `${uploadedList.length} image(s) uploaded successfully`,
    });
  }
);

module.exports = router;
