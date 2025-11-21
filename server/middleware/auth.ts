import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

// Log environment on module load
console.log("[AUTH] NODE_ENV:", process.env.NODE_ENV);
console.log("[AUTH] DEV_CLIENT_ID:", process.env.DEV_CLIENT_ID || "dev-client-id (default)");

export interface AuthUser {
  id: string;
  email: string;
  clientId: string;
  role: string;
}

export function generateToken(payload: AuthUser): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function authenticateToken(req: Request & { user?: AuthUser }, res: Response, next: NextFunction) {
  // In development, always allow bypassing auth with a dev clientId
  const isDevelopment = process.env.NODE_ENV === "development" || process.env.NODE_ENV === undefined;
  
  if (isDevelopment) {
    // Always use mock user in development, regardless of token
    req.user = {
      id: "dev-user",
      email: "dev@example.com",
      clientId: process.env.DEV_CLIENT_ID || "dev-client-id",
      role: "owner",
    };
    return next();
  }

  // Production: require valid token
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

