// My Designs went 500 intermittently on 2026-11-09 (`[designs] list failed: count failed: <html>`): facet counting sends
// one request per catalog key, so the burst grew with the model list, and the Supabase gateway starts answering 429 with an
// HTML page at ~80 concurrent (measured on the host that day: 60 fine, 80 → 18×429). The fix is a gate shared by every
// count, so the burst is a constant no matter how many models, products, themes or brands exist.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { COUNT_CONCURRENCY, gated } from "../designs-list";

const SRC = fs.readFileSync(path.resolve(__dirname, "..", "designs-list.ts"), "utf8");
/** The body of a top-level `async function <name>(` … up to the next line that starts a new top-level declaration. */
function body(name: string): string {
  const start = SRC.indexOf(`async function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const after = SRC.indexOf("\nasync function ", start + 1);
  return SRC.slice(start, after < 0 ? undefined : after);
}

describe("facet counting never bursts past the gateway's limit", () => {
  it("runs at most COUNT_CONCURRENCY at a time and still finishes every task", async () => {
    expect(COUNT_CONCURRENCY).toBeLessThanOrEqual(10);
    let live = 0;
    let peak = 0;
    const task = async (i: number) =>
      gated(async () => {
        live++;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 2));
        live--;
        return i;
      });
    const out = await Promise.all(Array.from({ length: 50 }, (_, i) => task(i)));
    expect(out).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(peak).toBeLessThanOrEqual(COUNT_CONCURRENCY);
    expect(peak).toBe(COUNT_CONCURRENCY); // it does use the whole allowance, it is not a queue of one
  });

  it("a failing task releases its slot, so the next ones are not stuck behind it", async () => {
    const fail = Array.from({ length: COUNT_CONCURRENCY }, () =>
      gated(async () => { throw new Error("boom"); }).catch((e: Error) => e.message));
    expect(await Promise.all(fail)).toEqual(Array.from({ length: COUNT_CONCURRENCY }, () => "boom"));
    expect(await gated(async () => "after")).toBe("after");
  });

  it("every per-key count goes through the gate; the one page query does not", () => {
    expect(body("countWhere")).toContain("gated(");
    expect(body("distinctValues")).toContain("gated(");
    // listDesigns runs ONE query for the page itself; gating it would only add latency.
    expect(body("listDesigns")).not.toContain("gated(");
  });
});
