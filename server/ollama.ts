import { z } from "zod";
import type { Config } from "./config.js";
import type { ToolDefinition } from "./mcp/client.js";

const messageSchema = z.object({
  role: z.literal("assistant"),
  content: z.string().default(""),
  tool_calls: z
    .array(
      z.object({
        function: z.object({
          name: z.string().min(1),
          arguments: z.record(z.string(), z.unknown()),
        }),
      }),
    )
    .max(3)
    .optional(),
});
type ModelMessage =z.infer<typeof messageSchema>;
export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_name?: string;
  tool_calls?: ModelMessage["tool_calls"];
};
export interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: ToolDefinition["inputSchema"];
  };
}
export type ModelChat = (request: {
  messages: ChatMessage[];
  tools?: OllamaTool[];
}) => Promise<ModelMessage>;

export function createOllamaChat(config: Config): ModelChat {
  return async ({ messages, tools }) => {
    let response: Response;
    try {
      response = await fetch(`${config.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(config.timeoutMs),
        body: JSON.stringify({
          model: config.model,
          messages,
          ...(tools ? { tools } : {}),
          stream: false,
          think: false,
          keep_alive: "10m",
          options: {
            temperature: 0,
            num_ctx: config.numCtx,
            num_predict: config.numPredict,
          },
        }),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Cannot complete the Ollama request at ${config.ollamaUrl}: ${reason}. Check Ollama is running; increase OLLAMA_TIMEOUT_MS if the Pi is slow.`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `Ollama HTTP ${response.status}: ${(await response.text()).slice(0, 500)}. Check ollama pull ${config.model}.`,
      );
    }
    return messageSchema.parse(
      ((await response.json()) as { message: unknown }).message,
    );
  };
}

export async function checkOllama(config: Config): Promise<string | undefined> {
  try {
    const response = await fetch(`${config.ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return `Ollama returned HTTP ${response.status}.`;
    const data = (await response.json()) as { models?: { name: string }[] };
    const requested = config.model.includes(":")
      ? config.model
      : `${config.model}:latest`;
    return data.models?.some((item) => item.name === requested)
      ? undefined
      : `Model missing. Run: ollama pull ${config.model}`;
  } catch {
    return `Cannot reach Ollama at ${config.ollamaUrl}. Start Ollama first.`;
  }
}
