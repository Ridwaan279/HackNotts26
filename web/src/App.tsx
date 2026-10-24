import { useState } from "react";
import { Mic } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function App() {
  const [held, setHeld] = useState(false);

  return (
    <div className="mx-auto flex h-full max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="py-2 text-center text-lg font-semibold tracking-tight">
        BYTE
      </header>

      <main className="grid flex-1 grid-cols-2 grid-rows-[1fr_auto] gap-3 py-3">
        {/* main character goes here */}
        <Card className="col-span-2 items-center justify-center">
          <CardContent className="text-7xl font-bold select-none">:)</CardContent>
        </Card>
        <Card className="gap-1 px-4 py-4">
          <span className="text-muted-foreground text-xs">Mood</span>
          <span className="font-medium">Happy</span>
        </Card>
        <Card className="gap-1 px-4 py-4">
          <span className="text-muted-foreground text-xs">Memories</span>
          <span className="font-medium">0</span>
        </Card>
      </main>

      {/* TODO: push to talk + elevenlabs voice for replies. mic needs https on the phone */}
      <footer className="flex flex-col items-center gap-2 pt-3">
        <Button
          size="icon"
          aria-label="Hold to talk"
          aria-pressed={held}
          className={cn(
            "size-20 touch-none rounded-full select-none [-webkit-touch-callout:none] [&_svg:not([class*='size-'])]:size-8",
            held && "scale-90 bg-red-500 hover:bg-red-500",
          )}
          onPointerDown={(event) => {
            // keep getting events even if the finger slides off the button
            event.currentTarget.setPointerCapture(event.pointerId);
            setHeld(true);
          }}
          onPointerUp={() => setHeld(false)}
          onPointerCancel={() => setHeld(false)}
          onKeyDown={(event) => {
            if (event.key === " " || event.key === "Enter") setHeld(true);
          }}
          onKeyUp={() => setHeld(false)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <Mic />
        </Button>
        <span className="text-muted-foreground text-sm">
          {held ? "Listening..." : "Hold to talk"}
        </span>
      </footer>
    </div>
  );
}
