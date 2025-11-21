import type { Express } from "express";
import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";

export async function setupVite(app: Express, httpServer: any) {
  try {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      root: path.resolve(process.cwd(), "client"),
      appType: "spa",
      configFile: path.resolve(process.cwd(), "vite.config.ts"),
    });

    // Use Vite's connect instance as middleware
    app.use(vite.middlewares);
    
    // SPA fallback - serve index.html for all non-API routes
    // This must be after all API routes
    app.get("*", async (req, res, next) => {
      // Skip API routes
      if (req.path.startsWith("/api")) {
        return next();
      }
      
      try {
        const html = await vite.transformIndexHtml(req.originalUrl, fs.readFileSync(
          path.resolve(process.cwd(), "client/index.html"),
          "utf-8"
        ));
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e: any) {
        console.error("Vite transform error:", e);
        next(e);
      }
    });
  } catch (error) {
    console.error("Failed to setup Vite:", error);
    throw error;
  }
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(process.cwd(), "dist/client");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    app.get("*", (_req, res) => {
      res.status(404).send("Build not found. Run 'npm run build' first.");
    });
  }
}

export function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

