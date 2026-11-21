import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const serverDir = path.dirname(currentFile);
const rootDir = path.resolve(serverDir, "..");

export const config = {
  dataDir: path.join(rootDir, "data"),
  databaseFile: path.join(rootDir, "data", "messages.sqlite"),
  distDir: path.join(rootDir, "dist"),
  host: process.env.HOST || "0.0.0.0",
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT || 8100),
  rootDir
};
