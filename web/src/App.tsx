import { useEffect, useRef, useState } from "react";
import { Mic, Watch } from "lucide-react";

import type {
  Memory,
  TalkEvent,
  TurnResult,
  VolumeEvent,
} from "../../shared/protocol";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createVoiceSession, type VoiceSession } from "@/lib/voice-input";
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
  const recognition = useRef<VoiceSession | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const playing = useRef<AudioBufferSourceNode | null>(null);
  const gain = useRef<GainNode | null>(null);
  // set by the volume slider on the wrist
  const volume = useRef(1);
  const [wrist, setWrist] = useState(false);
  const armed = useRef(false);
  const events = useRef<EventSource | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  // the wrist events come in outside react, so they need the newest start / stop
  const handlers = useRef({ startListening, stopListening });
  handlers.current = { startListening, stopListening };

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

  useEffect(() => {
    const onVisible = () => {
      if (!armed.current) return;
      if (document.visibilityState === "visible") {
        connectWrist();
        void keepAwake();
      } else {
        if (recognition.current) cancelListening();
        events.current?.close();
        events.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      events.current?.close();
      const session = recognition.current;
      recognition.current = null;
      holding.current = false;
      session?.cancel();
    };
  }, []);

  async function keepAwake() {
    try {
      wakeLock.current = await navigator.wakeLock.request("screen");
    } catch {
    }
  }

  function connectWrist() {
    if (events.current) return;
    const source = new EventSource("/api/events");
    source.addEventListener("talk", (event) => {
      const { pressed } = JSON.parse(event.data) as TalkEvent;
      if (pressed) handlers.current.startListening();
      else handlers.current.stopListening();
    });
    source.addEventListener("volume", (event) => {
      const { level } = JSON.parse(event.data) as VolumeEvent;
      volume.current = level / 100;
      if (gain.current) gain.current.gain.value = volume.current;
    });
    events.current = source;
  }

  async function toggleWrist() {
    if (armed.current) {
      if (recognition.current) cancelListening();
      armed.current = false;
      events.current?.close();
      events.current = null;
      void wakeLock.current?.release();
      wakeLock.current = null;
      setWrist(false);
      return;
    }
    setError("");
    audio.current ??= new AudioContext();
    void audio.current.resume();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setError("Mic blocked. Open the app over https and allow the mic.");
      return;
    }
    armed.current = true;
    connectWrist();
    setWrist(true);
    await keepAwake();
  }

  function cancelListening() {
    const session = recognition.current;
    recognition.current = null;
    holding.current = false;
    session?.cancel();
    setStatus("idle");
    tellWrist("idle");
  }

  function startListening() {
    if (holding.current || recognition.current || status === "thinking") return;
    setError("");
    playing.current?.stop();
    audio.current ??= new AudioContext();
    void audio.current.resume();

    const session = createVoiceSession(navigator.language, {
      onStart() {
        tellWrist("listening");
      },
      onText(text) {
        setHeard(text);
      },
      onError(message) {
        setError(message);
      },
      onFinish(text) {
        if (recognition.current !== session) return;
        recognition.current = null;
        holding.current = false;
        void respond(text);
      },
    });
    if (!session) {
      setError("This browser can't do speech recognition. Try Chrome on Android.");
      tellWrist("idle");
      return;
    }
    recognition.current = session;
    holding.current = true;
    setHeard("");
    setStatus("listening");
    session.start();
  }

  function stopListening() {
    holding.current = false;
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
    if (!gain.current) {
      gain.current = context.createGain();
      gain.current.connect(context.destination);
    }
    gain.current.gain.value = volume.current;
    source.connect(gain.current);
    playing.current = source;
    setStatus("speaking");
    tellWrist("speaking");
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
    playing.current = null;
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
        <Button
          variant={wrist ? "secondary" : "outline"}
          size="sm"
          aria-pressed={wrist}
          onClick={() => void toggleWrist()}
        >
          <Watch />
          {wrist ? "Wrist mic on" : "Use wrist mic"}
        </Button>
      </footer>
    </div>
  );
}
