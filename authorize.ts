import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./interface";

// Admin authorization middleware
export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.userId) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const userRole = req.role?.toLowerCase();
  if (userRole !== "admin" && userRole !== "superadmin") {
    res.status(403).json({ message: "Access forbidden: Admin privilege required" });
    return;
  }

  next();
};

module.exports = {
  requireAdmin,
};
