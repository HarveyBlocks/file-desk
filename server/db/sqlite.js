import { existsSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";

if (!existsSync(config.dataDir)) {
  mkdirSync(config.dataDir, { recursive: true });
}

export const db = new DatabaseSync(config.databaseFile);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);
