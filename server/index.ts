import * as dotenv from "dotenv";
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// Load environment variables from .env file
dotenv.config();

const app = express();

// Trust proxy
app.set('trust proxy', true);

// Body parsing middleware
const limit = process.env.MAX_BODY_MB ? `${process.env.MAX_BODY_MB}mb` : '50mb';
app.use(express.json({ limit }));
app.use(express.urlencoded({ extended: false, limit }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 200) {
        logLine = logLine.slice(0, 199) + "…";
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    const httpServer = createServer(app);
    
    // Register API routes first
    await registerRoutes(app);

    // Setup Vite in development, serve static in production
    if (app.get("env") === "development") {
      log("🔧 Setting up Vite dev server...");
      await setupVite(app, httpServer);
      log("✅ Vite dev server ready");
    } else {
      serveStatic(app);
    }

    // Error handler must be last
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
      console.error("Error:", err);
    });

    const port = parseInt(process.env.PORT || '5000', 10);
    httpServer.listen(port, "0.0.0.0", () => {
      log(`🚀 Server running on port ${port}`);
      log(`📱 Frontend: http://localhost:${port}`);
      log(`🔍 API: http://localhost:${port}/api/health`);
    }).on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        log(`❌ Port ${port} is already in use.`);
        log(`💡 Try: npm run kill-port`);
        log(`💡 Or change PORT in .env file`);
        process.exit(1);
      } else {
        throw err;
      }
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();

