import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Phase, ToolTrace, TurnResult } from "../shared/protocol.js";
import type { Config } from "./config.js";

type HermesConfig = Config["hermes"];

// same session every turn so follow ups like "and tomorrow?" make sense
const session = "byte";
// hermes can take a few tool steps on the small model
const timeoutMs = 300000;

// hermes layers this on top of its own system prompt, the reply gets read out loud
const persona = `You are Iki, a tiny friendly pet/digital assistant. Your reply is spoken by a voice, so keep it to one or two short sentences with no markdown, lists or emoji.
When the user tells you something about themselves, save it with your memory tool and when you need to do a task, pick the correct tool.
You only get this one reply and nothing happens after it, so never say "one moment" or that you will do something later. Use your tools now, then give the answer.`;

// small models still say "one moment" and stop, hermes never follows up on its own
const stalled =
  /\b(one|a) (moment|sec|second)\b|\bhold on\b|\b(let me|i'?ll|i will) (check|look|get|grab|pull|find|see)\b/i;
const nudge = "Go ahead and do it now, then tell me the answer.";

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

export function createHermesTurn(hermes: HermesConfig) {
  return async (
    message: string,
    onPhase: (phase: Phase) => void,
  ): Promise<TurnResult> => {
    const started = performance.now();
    onPhase("thinking");
    const trace: ToolTrace[] = [];
    let { reply, warning } = await ask(hermes, message, trace, onPhase);
    if (stalled.test(reply)) {
      // the session keeps the history, so only the nudge needs sending
      ({ reply, warning } = await ask(hermes, nudge, trace, onPhase));
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

async function ask(
  hermes: HermesConfig,
  message: string,
  trace: ToolTrace[],
  onPhase: (phase: Phase) => void,
) {
  const messages = [
    { role: "system", content: persona },
    { role: "user", content: message },
  ];
  let response: Response;
  try {
    response = await fetch(`${hermes.url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hermes.key}`,
        "X-Hermes-Session-Id": session,
      },
      signal: AbortSignal.timeout(timeoutMs),
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
  return { reply, warning };
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

// hermes keeps its memory in two files, entries split by a section sign
export async function readMemories() {
  const dir = join(homedir(), ".hermes", "memories");
  const files = await Promise.all(
    ["USER.md", "MEMORY.md"].map((name) =>
      readFile(join(dir, name), "utf8").catch(() => ""),
    ),
  );
  return files
    .flatMap((text) => text.split("\u00a7"))
    .map((entry) => entry.trim())
    .filter(Boolean);
}
