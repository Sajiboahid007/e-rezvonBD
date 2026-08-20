import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./interface";
const jwt = require("jsonwebtoken");
const GRPConfig = require("./GRPConfig");

// Authentication Middleware
export const authenticate = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Authorization token required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, GRPConfig.GRPConfig.JwtSecret) as {
      userId: number;
      userEmail: string;
      role: string;
    };
    req.userId = decoded.userId;
    req.userEmail = decoded.userEmail;
    req.role = decoded.role;

    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Optional Authentication Middleware (extracts user if token present, but doesn't reject guest)
export const optionalAuthenticate = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, GRPConfig.GRPConfig.JwtSecret) as {
      userId: number;
      userEmail: string;
      role: string;
    };
    req.userId = decoded.userId;
    req.userEmail = decoded.userEmail;
    req.role = decoded.role;
  } catch {
    // Continue as guest if token is invalid or expired
  }

  next();
};

module.exports = {
  authenticate,
  optionalAuthenticate,
};
