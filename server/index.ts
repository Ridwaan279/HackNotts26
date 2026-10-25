import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { createElevenLabsSpeech } from "./elevenlabs.js";

const config = readConfig();
const speak = createElevenLabsSpeech(config);
const { app } = createApp({ config, speak });
const scheme = config.tls ? "https" : "http";
const onListening = () => {
  console.log(`Iki API + built app: ${scheme}://${config.host}:${config.port}`);
  console.log(`Brain: Hermes Agent at ${config.hermes.url}`);
  console.log(`Voice: ${speak ? `ElevenLabs ${config.elevenLabs.voiceId}` : "off"}`);
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
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
process.on("SIGINT", () => server.close());
process.on("SIGTERM", () => server.close());
