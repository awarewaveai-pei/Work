// Codex on batch 2 (named): an asynchronous contrast check is applied only to the design it measured, by the newest run.
import { describe, expect, it } from "vitest";
import { guardLane } from "./contrast-run";

type St = { bg: string; words: string; fix?: string };
/** A page: the state, a setState that runs the updater now, and checks the test resolves by hand. */
function page(start: St) {
  const box = { st: start };
  const waits: { input: St; done(v: string): void }[] = [];
  const lane = guardLane<St, string>({ sig: (s) => `${s.bg}|${s.words}`, current: () => box.st, apply: (fn) => { box.st = fn(box.st); } });
  const check = (input: St) => new Promise<string>((done) => waits.push({ input, done }));
  const answer = (i: number) => waits[i].done(`fix for ${waits[i].input.bg}/${waits[i].input.words}`);
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { box, waits, lane, check, answer, settle };
}

describe("applying an asynchronous contrast check", () => {
  it("background changed while measuring: the old result is not applied; the check is redone on the new background", async () => {
    const p = page({ bg: "dark", words: "A" });
    void p.lane.run((prev) => ({ ...prev, words: "B" }), p.check, (built, fix) => ({ ...built, fix: fix ?? "none" }));
    p.box.st = { ...p.box.st, bg: "bright" };              // the user swaps the background during the check
    p.answer(0);
    await p.settle();
    expect(p.box.st.fix).toBeUndefined();                  // the dark-background result was dropped
    expect(p.waits).toHaveLength(2);                       // and measured again
    expect(p.waits[1].input).toEqual({ bg: "bright", words: "B" });
    p.answer(1);
    await p.settle();
    expect(p.box.st).toEqual({ bg: "bright", words: "B", fix: "fix for bright/B" });
  });

  it("A then B, A's check finishing last: the design ends with B", async () => {
    const p = page({ bg: "dark", words: "start" });
    const pick = (w: string) => p.lane.run((prev) => ({ ...prev, words: w }), p.check, (built, fix) => ({ ...built, fix: fix ?? "none" }));
    void pick("A");
    void pick("B");
    p.answer(1);                                           // B first
    await p.settle();
    p.answer(0);                                           // then the older A
    await p.settle();
    expect(p.box.st).toEqual({ bg: "dark", words: "B", fix: "fix for dark/B" });
  });
});
