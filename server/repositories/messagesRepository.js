import { db } from "../db/sqlite.js";

const insertMessage = db.prepare(
  "INSERT INTO messages (content, created_at) VALUES (?, ?) RETURNING id, content, created_at"
);

export function createMessage(content) {
  return insertMessage.get(content, new Date().toISOString());
}
