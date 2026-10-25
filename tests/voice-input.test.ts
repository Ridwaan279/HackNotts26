import assert from "node:assert/strict";
import test from "node:test";
import type { Recognition } from "../web/src/lib/speech.ts";
import { createVoiceSession } from "../web/src/lib/voice-input.ts";

function fixture(autoStart = true) {
  const finished: string[] = [];
  const errors: string[] = [];
  let ready = 0;
  let stops = 0;
  let aborts = 0;
  const rec: Recognition = {
    lang: "", continuous: false, interimResults: false,
    onstart: null, onend: null, onerror: null, onresult: null,
    start() { if (autoStart) rec.onstart?.(); },
    stop() { stops++; },
    abort() { aborts++; rec.onend?.(); },
  };
  const session = createVoiceSession("en-GB", {
    onStart() { ready++; },
    onText() {},
    onFinish(text) { finished.push(text); },
    onError(message) { errors.push(message); },
  }, () => rec)!;
  function result(text: string) {
    rec.onresult?.({
      resultIndex: 0,
      results: [[{ transcript: text }]] as unknown as SpeechRecognitionResultList,
    });
  }
  return { session, rec, result, finished, errors,
    get ready() { return ready; }, get stops() { return stops; },
    get aborts() { return aborts; } };
}

test("a hold records and release submits its transcript exactly once", () => {
  const f = fixture();
  f.session.start();
  assert.equal(f.ready, 1);
  f.result("Flap your ears");
  f.session.stop();
  assert.equal(f.stops, 1);
  f.rec.onend?.();
  f.rec.onend?.();
  assert.deepEqual(f.finished, ["Flap your ears"]);
});

test("release before microphone start waits for start before stopping", () => {
  const f = fixture(false);
  f.session.start();
  f.session.stop();
  assert.equal(f.stops, 0);
  f.rec.onstart?.();
  assert.equal(f.stops, 1);
  assert.equal(f.ready, 0);
  f.rec.onend?.();
  assert.deepEqual(f.finished, [""]);
});

test("unexpected browser end finishes the session without requiring release", () => {
  const f = fixture();
  f.session.start();
  f.result("Hello BYTE");
  f.rec.onend?.();
  f.session.stop();
  assert.deepEqual(f.finished, ["Hello BYTE"]);
});

test("permission failure clears the session and does not submit old text", () => {
  const f = fixture();
  f.session.start();
  f.result("interim text");
  f.rec.onerror?.({ error: "not-allowed" });
  assert.equal(f.errors.length, 1);
  assert.deepEqual(f.finished, [""]);
});

test("synchronous start failure finishes cleanly", () => {
  const f = fixture();
  f.rec.start = () => { throw new Error("recognition unavailable"); };
  f.session.start();
  assert.deepEqual(f.errors, ["recognition unavailable"]);
  assert.deepEqual(f.finished, [""]);
});

test("cancelling discards the transcript", () => {
  const f = fixture();
  f.session.start();
  f.result("do not submit this");
  f.session.cancel();
  assert.deepEqual(f.finished, [""]);
  assert.equal(f.aborts, 1);
});

test("release recovers if the browser never emits its end event", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture();
  f.session.start();
  f.result("hello");
  f.session.stop();
  t.mock.timers.tick(2000);
  assert.deepEqual(f.finished, ["hello"]);
  assert.equal(f.aborts, 1);
});
