import express from "express";
import path from "node:path";
import { config } from "./config.js";

export async function mountFrontend(app) {
  if (config.isProduction) {
    app.use(express.static(config.distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(config.distDir, "index.html"));
    });
    return;
  }

  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root: config.rootDir,
    server: {
      hmr: false,
      middlewareMode: true
    },
    appType: "spa"
  });

  app.use(vite.middlewares);
}
