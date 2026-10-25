import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../server/app.ts";
import { readConfig } from "../server/config.ts";

test("talk/release reach the phone and repeated ready acknowledgements get revisions", async () => {
  const { app } = createApp({ config: readConfig({ HERMES_KEY: "test" }) });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const controller = new AbortController();
  try {
    const missing = await fetch(base + "/api/talk", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pressed: true }),
    });
    assert.equal(missing.status, 503);
    const events = await fetch(base + "/api/events", { signal: controller.signal });
    const reader = events.body!.getReader();
    for (const pressed of [true, false]) {
      const response = await fetch(base + "/api/talk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pressed }),
      });
      assert.equal(response.status, 200);
      const chunk = await reader.read();
      const text = new TextDecoder().decode(chunk.value);
      assert(text.includes("event: talk"));
      assert(text.includes(`"pressed":${pressed}`));
    }
    const revisions: number[] = [];
    for (let i = 0; i < 2; i++) {
      const response = await fetch(base + "/api/phase", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "listening" }),
      });
      revisions.push((await response.json()).phaseRevision);
    }
    assert.equal(revisions[1], revisions[0] + 1);
    await reader.cancel();
  } finally {
    controller.abort();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
