import type { Phase, ToolTrace, TurnResult } from "../shared/protocol.js";
import { recall } from "./agent.js";
import type { Config } from "./config.js";
import type { MemoryTools } from "./mcp/client.js";

export type Turn = (
  message: string,
  onPhase: (phase: Phase) => void,
) => Promise<TurnResult>;
type HermesConfig = NonNullable<Config["hermes"]>;

// hermes layers this on top of its own system prompt, the reply gets read out loud
const persona = `You are BYTE, a tiny friendly wrist pet. Your reply is spoken by a voice, so keep it to one or two short sentences with no markdown, lists or emoji.
When the user tells you something about themselves, save it with mcp_byte_save_memory so it shows up in the BYTE app.`;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// server sent events: blocks split by a blank line, ":" lines are keepalives
async function* readEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let name = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length) yield { name, data: data.join("\n") };
    }
  }
}

// the progress payload isnt documented, so take whatever looks like a tool name
function toolStep(data: string): ToolTrace {
  let detail: unknown = data;
  try {
    detail = JSON.parse(data);
  } catch {}
  const fields =
    typeof detail === "object" && detail !== null
      ? (detail as Record<string, unknown>)
      : {};
  const name = [fields.tool, fields.name, fields.tool_name].find(
    (value) => typeof value === "string",
  );
  return {
    name: (name as string | undefined) ?? "tool",
    arguments: {},
    status: "ok",
    result: detail,
    durationMs: 0,
  };
}

export function createHermesTurn(
  hermes: HermesConfig,
  tools: MemoryTools,
): Turn {
  return async (message, onPhase) => {
    const started = performance.now();
    onPhase("thinking");
    const messages = [
      { role: "system", content: `${persona}\n\n${await recall(tools)}` },
      { role: "user", content: message },
    ];
    let response: Response;
    try {
      response = await fetch(`${hermes.url}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${hermes.key}`,
          // same session every turn so follow ups like "and tomorrow?" make sense
          "X-Hermes-Session-Id": hermes.session,
        },
        signal: AbortSignal.timeout(hermes.timeoutMs),
        body: JSON.stringify({ model: "hermes-agent", stream: true, messages }),
      });
    } catch (error) {
      throw new Error(
        `Cannot reach Hermes at ${hermes.url}: ${errorText(error)}. Check hermes gateway is running.`,
      );
    }
    if (!response.ok || !response.body) {
      throw new Error(
        `Hermes HTTP ${response.status}: ${(await response.text()).slice(0, 300)}. Check HERMES_KEY matches API_SERVER_KEY.`,
      );
    }

    const trace: ToolTrace[] = [];
    let reply = "";
    let warning: string | undefined;
    for await (const event of readEvents(response.body)) {
      if (event.name === "hermes.tool.progress") {
        onPhase("acting");
        trace.push(toolStep(event.data));
        continue;
      }
      if (event.data === "[DONE]") break;
      const chunk = JSON.parse(event.data) as {
        choices?: {
          delta?: { content?: string | null };
          finish_reason?: string | null;
        }[];
      };
      const choice = chunk.choices?.[0];
      if (choice?.delta?.content) {
        if (trace.length && !reply) onPhase("thinking");
        reply += choice.delta.content;
      }
      if (choice?.finish_reason === "length")
        warning = "Hermes ran out of steps before it finished.";
    }

    const totalMs = Math.round(performance.now() - started);
    return {
      reply: reply.trim() || "Hermes didnt send a reply.",
      trace,
      ...(warning ? { warning } : {}),
      timing: { modelMs: totalMs, totalMs },
    };
  };
}

export async function checkHermes(
  hermes: HermesConfig,
): Promise<string | undefined> {
  try {
    const response = await fetch(`${hermes.url}/models`, {
      headers: { Authorization: `Bearer ${hermes.key}` },
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 401)
      return "Hermes rejected HERMES_KEY, it has to match API_SERVER_KEY.";
    return response.ok ? undefined : `Hermes returned HTTP ${response.status}.`;
  } catch {
    return `Cannot reach Hermes at ${hermes.url}. Start it with hermes gateway.`;
  }
}
