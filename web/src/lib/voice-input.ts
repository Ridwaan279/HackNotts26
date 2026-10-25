import { createRecognition, type Recognition } from "./speech";

export interface VoiceSession {
  start(): void;
  stop(): void;
  cancel(): void;
}

interface Callbacks {
  onStart(): void;
  onText(text: string): void;
  onFinish(text: string): void;
  onError(message: string): void;
}

export function createVoiceSession(
  language: string,
  callbacks: Callbacks,
  makeRecognition: () => Recognition | undefined = createRecognition,
): VoiceSession | undefined {
  const rec = makeRecognition();
  if (!rec) return;

  let started = false;
  let finished = false;
  let cancelled = false;
  let stopRequested = false;
  let latest = "";
  let stopTimer: ReturnType<typeof setTimeout> | undefined;

  function finish(text: string) {
    if (finished) return;
    finished = true;
    clearTimeout(stopTimer);
    callbacks.onFinish(text);
  }

  function abort() {
    try {
      rec!.abort();
    } catch {
      // Some browsers throw if recognition has already ended.
    }
  }

  function stop() {
    if (finished || stopRequested) return;
    stopRequested = true;
    stopTimer = setTimeout(() => {
      finish(latest);
      abort();
    }, 2000);
    if (started) {
      try {
        rec!.stop();
      } catch {
        finish(latest);
        abort();
      }
    }
  }

  rec.lang = language;
  rec.continuous = true;
  rec.interimResults = true;
  rec.onstart = () => {
    if (finished) {
      abort();
      return;
    }
    started = true;
    if (stopRequested) {
      try {
        rec.stop();
      } catch {
        finish(latest);
        abort();
      }
    } else {
      callbacks.onStart();
    }
  };
  rec.onresult = (event) => {
    if (finished) return;
    const parts: string[] = [];
    for (let i = 0; i < event.results.length; i++) {
      parts.push(event.results[i][0].transcript.trim());
    }
    latest = parts.join(" ").trim();
    callbacks.onText(latest);
  };
  rec.onerror = (event) => {
    if (finished) return;
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      callbacks.onError("Mic blocked. Open the app over HTTPS and allow the mic.");
    } else if (event.error !== "no-speech" && event.error !== "aborted") {
      callbacks.onError(`Speech recognition failed: ${event.error}`);
    }
    finish("");
    abort();
  };
  rec.onend = () => {
    if (cancelled) finish("");
    else finish(latest);
  };

  return {
    start() {
      if (finished) return;
      try {
        rec.start();
      } catch (error) {
        callbacks.onError(error instanceof Error ? error.message : String(error));
        finish("");
      }
    },
    stop,
    cancel() {
      cancelled = true;
      finish("");
      abort();
    },
  };
}
