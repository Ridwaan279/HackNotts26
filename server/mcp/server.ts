// stdout is the mcp pipe, log to stderr not console.log
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readConfig } from "../config.js";
import { createMemoryStore, memoryText } from "../memory-store.js";

const store = createMemoryStore(readConfig().dbPath);
const server = new McpServer({ name: "wrist-pet-memory", version: "0.1.0" });
const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});

server.registerTool(
  "save_memory",
  {
    description:
      "Save a fact about the user so you remember it later, like their name, likes or plans. Return the saved memory.",
    inputSchema: {
      text: memoryText.describe("The fact to remember, as a short sentence."),
    },
  },
  async ({ text }) => json({ memory: store.save(text) }),
);

server.registerTool(
  "list_memories",
  {
    description:
      "Read what you remember about the user, newest first. Use for any question about the user or what you remember.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(10)
        .describe("How many recent memories to read."),
    },
  },
  async ({ limit }) => json({ memories: store.list(limit) }),
);

// TODO: one more tool that actually does something on the wrist, 2-3 tools max so the small model doesnt get confused

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await server.close();
  store.close();
}
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
await server.connect(new StdioServerTransport());
