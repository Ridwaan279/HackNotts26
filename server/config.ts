import { resolve } from "node:path";
import { z } from "zod";

const settings = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  OLLAMA_BASE_URL: z.url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().min(1).default("qwen3:1.7b"),
  OLLAMA_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(600000)
    .default(120000),
  OLLAMA_NUM_CTX: z.coerce.number().int().min(1024).max(32768).default(4096),
  OLLAMA_NUM_PREDICT: z.coerce.number().int().min(64).max(4096).default(256),
  DB_PATH: z.string().min(1).default("./data/pet.sqlite"),
  // empty in .env means voice is off
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().min(1).default("JBFqnCBsd6RMkjVDRZzb"),
  ELEVENLABS_MODEL_ID: z.string().min(1).default("eleven_flash_v2_5"),
  // mkcert files, phone wont give the mic without https
  TLS_CERT: z.string().optional(),
  TLS_KEY: z.string().optional(),
});

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const value = settings.parse(env);
  const url = new URL(value.OLLAMA_BASE_URL);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Ollama must use an HTTP(S) URL.");
  if (!value.TLS_CERT !== !value.TLS_KEY)
    throw new Error("Set both TLS_CERT and TLS_KEY, or neither.");
  return {
    host: value.HOST,
    port: value.PORT,
    ollamaUrl: value.OLLAMA_BASE_URL.replace(/\/$/, ""),
    model: value.OLLAMA_MODEL,
    timeoutMs: value.OLLAMA_TIMEOUT_MS,
    numCtx: value.OLLAMA_NUM_CTX,
    numPredict: value.OLLAMA_NUM_PREDICT,
    dbPath: resolve(value.DB_PATH),
    elevenLabs: {
      apiKey: value.ELEVENLABS_API_KEY || undefined,
      voiceId: value.ELEVENLABS_VOICE_ID,
      modelId: value.ELEVENLABS_MODEL_ID,
    },
    tls:
      value.TLS_CERT && value.TLS_KEY
        ? { cert: resolve(value.TLS_CERT), key: resolve(value.TLS_KEY) }
        : undefined,
  };
}
export type Config = ReturnType<typeof readConfig>;
