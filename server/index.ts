import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { createElevenLabsSpeech } from "./elevenlabs.js";
import { connectMemoryTools } from "./mcp/client.js";
import { createOllamaChat } from "./ollama.js";

const config = readConfig();
const tools = await connectMemoryTools(config.dbPath);
const speak = createElevenLabsSpeech(config);
const { app } = createApp({
  config,
  tools,
  chat: createOllamaChat(config),
  speak,
});
const scheme = config.tls ? "https" : "http";
const onListening = () => {
  console.log(`BYTE API + built app: ${scheme}://${config.host}:${config.port}`);
  console.log(`Model: ${config.model} at ${config.ollamaUrl}`);
  console.log(`Voice: ${speak ? `ElevenLabs ${config.elevenLabs.voiceId}` : "off"}`);
  console.log(`SQLite (owned by MCP): ${config.dbPath}`);
};
const server = config.tls
  ? createServer(
      {
        cert: readFileSync(config.tls.cert),
        key: readFileSync(config.tls.key),
      },
      app,
    ).listen(config.port, config.host, onListening)
  : app.listen(config.port, config.host, onListening);
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
