import express from "express";
import { JSON_BODY_LIMIT } from "./config/uploadLimits.js";
import { messagesRoutes } from "./routes/messagesRoutes.js";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use("/api", messagesRoutes);

  return app;
}
