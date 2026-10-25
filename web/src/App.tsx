import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";

import type { Memory, TurnResult } from "../../shared/protocol";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createRecognition, type Recognition } from "@/lib/speech";
import { cn } from "@/lib/utils";

type Status = "idle" | "listening" | "thinking" | "speaking";

const labels: Record<Status, string> = {
  idle: "Hold to talk",
  listening: "Listening...",
  thinking: "Thinking...",
  speaking: "Speaking...",
};

async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return response;
}

// lets the pi show it on the wrist, not a big deal if one gets lost
function tellWrist(phase: "idle" | "listening" | "speaking") {
  post("/api/phase", { phase }).catch(() => {});
}

export function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [memories, setMemories] = useState<number | null>(null);
  const holding = useRef(false);
  const recognition = useRef<Recognition | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const playing = useRef<AudioBufferSourceNode | null>(null);

  // the api only returns the newest 20, so 20 means 20+
  async function loadMemories() {
    const response = await fetch("/api/memories");
    if (!response.ok) return;
    const data = (await response.json()) as { memories: Memory[] };
    setMemories(data.memories.length);
  }

  useEffect(() => {
    void loadMemories();
  }, []);

  function startListening() {
    if (holding.current || status === "thinking") return;
    holding.current = true;
    setError("");
    playing.current?.stop();
    // ios wont play the reply later unless audio gets unlocked on a tap
    audio.current ??= new AudioContext();
    void audio.current.resume();

    const rec = createRecognition();
    if (!rec) {
      holding.current = false;
      setError("This browser can't do speech recognition.");
      return;
    }
    let latest = "";
    rec.lang = navigator.language;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      // chrome android gives every partial as its own result ("what", "what can", ...)
      // so a part that repeats whats already there replaces it instead of adding on
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        const part = event.results[i][0].transcript.trim();
        const lower = part.toLowerCase();
        const sofar = text.toLowerCase();
        if (lower.startsWith(sofar)) text = part;
        else if (!sofar.startsWith(lower)) text = `${text} ${part}`;
      }
      latest = text;
      setHeard(latest);
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed")
        setError("Mic blocked. Open the app over https and allow the mic.");
      else if (event.error !== "no-speech" && event.error !== "aborted")
        setError(`Speech recognition failed: ${event.error}`);
    };
    rec.onend = () => {
      recognition.current = null;
      void respond(latest);
    };
    recognition.current = rec;
    setHeard("");
    setStatus("listening");
    tellWrist("listening");
    rec.start();
  }

  function stopListening() {
    if (!holding.current) return;
    holding.current = false;
    // onend does the sending once the last words come in
    recognition.current?.stop();
  }

  async function respond(text: string) {
    if (!text) {
      setStatus("idle");
      tellWrist("idle");
      return;
    }
    setStatus("thinking");
    try {
      const turn = (await (
        await post("/api/chat", { message: text })
      ).json()) as TurnResult;
      setReply(turn.reply);
      void loadMemories();
      await speak(turn.reply);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      // if the mic got pressed again mid reply leave it on listening
      setStatus((current) => (current === "listening" ? current : "idle"));
    }
  }

  async function speak(text: string) {
    const context = audio.current;
    if (!context) return;
    const response = await post("/api/speak", { text });
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    playing.current = source;
    setStatus("speaking");
    tellWrist("speaking");
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
    playing.current = null;
    // cut off by the mic, the wrist is already on listening
    if (!holding.current) tellWrist("idle");
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="py-2 text-center text-lg font-semibold tracking-tight">
        BYTE
      </header>

      <main className="grid flex-1 grid-cols-2 grid-rows-[1fr_auto] gap-3 py-3">
        {/* TODO: actual character instead of :) */}
        <Card className="col-span-2 items-center justify-center">
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <span className="text-7xl font-bold select-none">:)</span>
            {heard && (
              <p className="text-muted-foreground text-sm">{heard}</p>
            )}
            {reply && <p className="font-medium">{reply}</p>}
          </CardContent>
        </Card>
        <Card className="gap-1 px-4 py-4">
          <span className="text-muted-foreground text-xs">Mood</span>
          <span className="font-medium">Happy</span>
        </Card>
        <Card className="gap-1 px-4 py-4">
          <span className="text-muted-foreground text-xs">Memories</span>
          <span className="font-medium">
            {memories === null ? "-" : memories >= 20 ? "20+" : memories}
          </span>
        </Card>
      </main>

      <footer className="flex flex-col items-center gap-2 pt-3">
        {error && (
          <p className="text-destructive text-center text-sm" role="alert">
            {error}
          </p>
        )}
        <Button
          size="icon"
          aria-label="Hold to talk"
          aria-pressed={status === "listening"}
          disabled={status === "thinking"}
          className={cn(
            "size-20 touch-none rounded-full select-none [-webkit-touch-callout:none] [&_svg:not([class*='size-'])]:size-8",
            status === "listening" && "scale-90 bg-red-500 hover:bg-red-500",
          )}
          onPointerDown={(event) => {
            // still get the release if the finger slides off
            event.currentTarget.setPointerCapture(event.pointerId);
            startListening();
          }}
          onPointerUp={stopListening}
          onPointerCancel={stopListening}
          onKeyDown={(event) => {
            if (event.key === " " || event.key === "Enter") startListening();
          }}
          onKeyUp={stopListening}
          onContextMenu={(event) => event.preventDefault()}
        >
          <Mic />
        </Button>
        <span className="text-muted-foreground text-sm">{labels[status]}</span>
      </footer>
    </div>
  );
}
