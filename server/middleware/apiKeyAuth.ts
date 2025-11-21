import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { ApiKey } from "../../shared/schema";

export interface ApiKeyRequest extends Request {
  apiKey?: ApiKey;
}

/**
 * Middleware to authenticate requests using API keys
 * Expects API key in Authorization header: "Bearer ak_..." or "ApiKey ak_..."
 */
export function authenticateApiKey(req: ApiKeyRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  
  if (!authHeader) {
    return res.status(401).json({ error: "API key required" });
  }

  // Support both "Bearer" and "ApiKey" prefixes
  const parts = authHeader.split(" ");
  if (parts.length !== 2) {
    return res.status(401).json({ error: "Invalid authorization header format" });
  }

  const [prefix, key] = parts;
  if (prefix !== "Bearer" && prefix !== "ApiKey") {
    return res.status(401).json({ error: "Invalid authorization header format" });
  }

  // Validate API key
  storage.validateApiKey(key)
    .then((apiKey) => {
      if (!apiKey) {
        return res.status(401).json({ error: "Invalid or expired API key" });
      }

      req.apiKey = apiKey;
      next();
    })
    .catch((error) => {
      console.error("[API Key Auth] Error validating API key:", error);
      res.status(500).json({ error: "Internal server error" });
    });
}

/**
 * Middleware to check if API key has required permissions
 */
export function requirePermission(permission: string) {
  return (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      return res.status(401).json({ error: "API key required" });
    }

    const permissions = req.apiKey.permissions || [];
    
    // Check for exact permission or wildcard
    if (!permissions.includes(permission) && !permissions.includes("*")) {
      return res.status(403).json({ 
        error: "Insufficient permissions",
        required: permission,
        granted: permissions
      });
    }

    next();
  };
}

