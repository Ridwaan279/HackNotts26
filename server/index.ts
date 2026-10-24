import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { connectMemoryTools } from "./mcp/client.js";
import { createOllamaChat } from "./ollama.js";

const config = readConfig();
const tools = await connectMemoryTools(config.dbPath);
const { app } = createApp({ config, tools, chat: createOllamaChat(config) });
const server = app.listen(config.port, config.host, () => {
  console.log(`BYTE API + built app: http://${config.host}:${config.port}`);
  console.log(`Model: ${config.model} at ${config.ollamaUrl}`);
  console.log(`SQLite (owned by MCP): ${config.dbPath}`);
});
server.on("error", async (error) => {
  console.error(error.message);
  await tools.close();
  process.exitCode = 1;
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
  await tools.close();
}
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
