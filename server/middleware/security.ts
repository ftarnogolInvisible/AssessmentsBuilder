import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

export function configureHelmet() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:", "http://localhost:*"],
        fontSrc: ["'self'", "data:"],
      },
    },
    // Disable CSP in development for Vite HMR
    ...(process.env.NODE_ENV === "development" && {
      contentSecurityPolicy: false,
    }),
  });
}

export function configureCORS() {
  return cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  });
}

// In development, disable rate limiting
const isDevelopment = process.env.NODE_ENV === "development" || process.env.NODE_ENV === undefined;

export const publicRateLimit = isDevelopment
  ? (req: any, res: any, next: any) => next() // No-op in development
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: "Too many requests from this IP, please try again later.",
    });

export const adminRateLimit = isDevelopment
  ? (req: any, res: any, next: any) => next() // No-op in development
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 200, // Limit each IP to 200 requests per windowMs
      message: "Too many admin requests from this IP, please try again later.",
    });

