export interface Memory {
  id: number;
  text: string;
  createdAt: string;
}
export type Phase = "idle" | "thinking" | "acting" | "error";
export interface PetState {
  phase: Phase;
  lastReply: string;
}
export interface ToolTrace {
  name: string;
  arguments: Record<string, unknown>;
  status: "ok" | "error";
  result: unknown;
  durationMs: number;
  reused?: boolean;
}
export interface TurnResult {
  reply: string;
  trace: ToolTrace[];
  timing: { modelMs: number; totalMs: number };
  warning?: string;
}
export interface Health {
  ok: boolean;
  model: string;
  ollamaUrl: string;
  tools: string[];
  error?: string;
}
