import { resolve } from "node:path";
import { z } from "zod";

const settings = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // hermes api server, the key is API_SERVER_KEY in ~/.hermes/.env
  HERMES_URL: z.url().default("http://127.0.0.1:8642/v1"),
  HERMES_KEY: z.string().optional(),
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
  if (!value.HERMES_KEY)
    throw new Error("Set HERMES_KEY to the API_SERVER_KEY in ~/.hermes/.env.");
  if (!value.TLS_CERT !== !value.TLS_KEY)
    throw new Error("Set both TLS_CERT and TLS_KEY, or neither.");
  return {
    host: value.HOST,
    port: value.PORT,
    hermes: { url: value.HERMES_URL.replace(/\/$/, ""), key: value.HERMES_KEY },
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
