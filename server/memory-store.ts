// only the mcp child opens the db
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Memory } from "../shared/protocol.js";

export const memoryText = z.string().trim().min(1).max(1000);
const limitSchema = z.number().int().min(1).max(20);

export function createMemoryStore(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  const insert = db.prepare(
    "INSERT INTO memories (text, created_at) VALUES (?, ?)",
  );
  const recent = db.prepare(
    "SELECT id, text, created_at AS createdAt FROM memories ORDER BY id DESC LIMIT ?",
  );
  return {
    save(text: string): Memory {
      const validText = memoryText.parse(text);
      const createdAt = new Date().toISOString();
      const result = insert.run(validText, createdAt);
      return { id: Number(result.lastInsertRowid), text: validText, createdAt };
    },
    list(limit = 10): Memory[] {
      return recent.all(limitSchema.parse(limit)) as unknown as Memory[];
    },
    close() {
      db.close();
    },
  };
}
