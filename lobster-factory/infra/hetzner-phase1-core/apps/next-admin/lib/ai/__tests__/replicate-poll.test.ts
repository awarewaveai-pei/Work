// A status read that fails in passing (502, dropped connection) must not end a run Replicate is still doing and billing
// (2026-11-15: two FLUX 2 Max runs charged, nothing delivered). Exercised through runReplicate, a real poll loop.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Grant } from "@/lib/entitlements/can";

vi.mock("@/lib/ai/gateway", () => ({ providerUrl: (_g: unknown, _p: string, path: string) => `https://api.replicate.com${path}` }));

import { runReplicate } from "@/lib/studio/replicate-run";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const run = () => runReplicate({} as Grant, { version: "v", input: {}, failCode: "x_failed" });

let polls: Array<() => Response>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("REPLICATE_API_TOKEN", "t");
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (init?.method === "POST") return json({ id: "p1", status: "processing" });
    return (polls.shift() ?? (() => json({ id: "p1", status: "processing" })))();
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Replicate status reads", () => {
  it("a 502 and a dropped connection are read again; the finished run is delivered", async () => {
    polls = [
      () => new Response("<title>replicate.com | 502: Bad gateway</title>", { status: 502 }),
      () => { throw new TypeError("fetch failed"); },
      () => json({ id: "p1", status: "succeeded", output: "data:image/png;base64,AA==" }),
    ];
    const p = run();
    await vi.advanceTimersByTimeAsync(7_000);
    expect(await p).toEqual({ ok: true, image: "data:image/png;base64,AA==" });
  });

  it("a definite refusal (404) still ends the run", async () => {
    polls = [() => new Response("not found", { status: 404 })];
    const p = run();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await p).toEqual({ ok: false, error: "replicate_poll_404" });
  });

  it("reads failing until the deadline end as a timeout, not a loop", async () => {
    polls = Array.from({ length: 40 }, () => () => new Response("bad gateway", { status: 502 }));
    const p = run();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await p).toEqual({ ok: false, error: "generation_timeout" });
  });
});
