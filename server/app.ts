import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express, { type ErrorRequestHandler } from "express";
import { z } from "zod";
import type { Health, PetState, Phase } from "../shared/protocol.js";
import { runTurn } from "./agent.js";
import type { Config } from "./config.js";
import type { Speak } from "./elevenlabs.js";
import type { MemoryTools } from "./mcp/client.js";
import { checkOllama, type ModelChat } from "./ollama.js";

export function createApp({
  tools,
  chat,
  config,
  speak,
}: {
  tools: MemoryTools;
  chat: ModelChat;
  config: Config;
  speak?: Speak;
}) {
  const app = express();
  const state: PetState = {
    phase: "idle",
    lastReply: "Ready when you are.",
  };
  let busy = false;
  let phoneTimeout: NodeJS.Timeout | undefined;
  const setPhase = (phase: Phase) => {
    clearTimeout(phoneTimeout);
    state.phase = phase;
  };
  app.disable("x-powered-by");
  app.use(express.json({ limit: "8kb" }));
  // TODO: push this over a websocket so the wrist isnt polling
  app.get("/api/state", (_req, res) => {
    res.json(state);
  });
  // listening and speaking happen on the phone, so it tells us for the wrist
  app.post("/api/phase", (req, res) => {
    const parsed = z
      .object({ phase: z.enum(["idle", "listening", "speaking"]) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Phase has to be idle, listening or speaking." });
      return;
    }
    if (busy) {
      res.status(409).json({ error: "BYTE is in the middle of a turn." });
      return;
    }
    setPhase(parsed.data.phase);
    // if the phone dies mid sentence the wrist shouldnt be stuck listening
    if (parsed.data.phase !== "idle")
      phoneTimeout = setTimeout(() => setPhase("idle"), 60000).unref();
    res.json(state);
  });
  app.get("/api/health", async (_req, res) => {
    const error = await checkOllama(config);
    const health: Health = {
      ok: !error,
      model: config.model,
      ollamaUrl: config.ollamaUrl,
      tools: tools.definitions.map((tool) => tool.name),
      ...(error ? { error } : {}),
    };
    res.status(error ? 503 : 200).json(health);
  });
  app.get("/api/memories", async (_req, res) => {
    try {
      res.json(await tools.callTool("list_memories", { limit: 20 }));
    } catch (error) {
      res
        .status(502)
        .json({
          error: error instanceof Error ? error.message : String(error),
        });
    }
  });
  app.post("/api/chat", async (req, res) => {
    const parsed = z
      .object({ message: z.string().trim().min(1).max(2000) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Send a message containing 1 to 2000 characters." });
      return;
    }
    if (busy) {
      res
        .status(409)
        .json({
          error: "BYTE is finishing another request. Try again in a moment.",
        });
      return;
    }
    busy = true;
    try {
      const result = await runTurn(parsed.data.message, tools, chat, setPhase);
      state.lastReply = result.reply;
      setPhase(
        result.trace.some((item) => item.status === "error") ? "error" : "idle",
      );
      res.json(result);
    } catch (error) {
      state.lastReply = error instanceof Error ? error.message : String(error);
      setPhase("error");
      res.status(502).json({ error: state.lastReply });
    } finally {
      busy = false;
    }
  });
  app.post("/api/speak", async (req, res) => {
    const parsed = z
      .object({ text: z.string().trim().min(1).max(2000) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Send text containing 1 to 2000 characters." });
      return;
    }
    if (!speak) {
      res
        .status(503)
        .json({ error: "Voice is off. Set ELEVENLABS_API_KEY in .env." });
      return;
    }
    try {
      const audio = await speak(parsed.data.text);
      res.type("audio/mpeg").send(Buffer.from(audio));
    } catch (error) {
      res
        .status(502)
        .json({
          error: error instanceof Error ? error.message : String(error),
        });
    }
  });
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Unknown API route." });
  });
  const webRoot = resolve("web/dist");
  if (existsSync(resolve(webRoot, "index.html")))
    app.use(express.static(webRoot));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const status =
      typeof error.status === "number" &&
      error.status >= 400 &&
      error.status < 500
        ? error.status
        : 500;
    res
      .status(status)
      .json({
        error:
          status < 500
            ? "Invalid JSON or request body too large."
            : "Unexpected server error.",
      });
  };
  app.use(errors);
  return { app };
}
