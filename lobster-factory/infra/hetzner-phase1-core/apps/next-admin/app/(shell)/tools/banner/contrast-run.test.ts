// Codex on batch 2 (named): an asynchronous contrast check is applied only to the design it measured, by the newest run,
// and a check that fails applies nothing. The page's own input comparison (sameDrawInputs) is used throughout.
import { describe, expect, it } from "vitest";
import { guardLane, sameDrawInputs } from "./contrast-run";
import { INIT, type State } from "./banner-state";

/** A page: the state, a setState that runs the updater now, and checks the test settles by hand. */
function page(start: State) {
  const box = { st: start };
  const waits: { input: State; done(v: string): void; fail(e: Error): void }[] = [];
  const lane = guardLane<State, string>({ same: sameDrawInputs, current: () => box.st, apply: (fn) => { box.st = fn(box.st); } });
  const check = (input: State) => new Promise<string>((done, fail) => waits.push({ input, done, fail }));
  const answer = (i: number) => waits[i].done(`#${i}`);
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const pick = (headline: string) => lane.run((prev) => ({ ...prev, headline }), check,
    (built, fix) => ({ ...built, trustText: fix }), (prev, err) => ({ ...prev, error: String(err) }));
  return { box, waits, answer, settle, pick };
}
// two different pictures of the same length (a length-only signature took them for one)
const picA = "data:image/png;base64," + "A".repeat(64), picB = "data:image/png;base64," + "B".repeat(64);
const start: State = { ...INIT, bgMode: "upload", bgImage: picA, headline: "start" };

describe("applying an asynchronous contrast check", () => {
  it("the background swapped for another of equal length while measuring: the old result is not applied; redone", async () => {
    expect(picA.length).toBe(picB.length);
    expect(sameDrawInputs({ ...start, bgImage: picA }, { ...start, bgImage: picB })).toBe(false);
    const p = page(start);
    void p.pick("B");
    p.box.st = { ...p.box.st, bgImage: picB };              // the user swaps the background during the check
    p.answer(0);
    await p.settle();
    expect(p.box.st.headline).toBe("start");               // the result measured on picture A was dropped
    expect(p.waits).toHaveLength(2);                       // and measured again on picture B
    expect(p.waits[1].input.bgImage).toBe(picB);
    p.answer(1);
    await p.settle();
    expect(p.box.st).toMatchObject({ headline: "B", bgImage: picB, trustText: "#1" });
  });

  it("A then B, A's check finishing last: the design ends with B", async () => {
    const p = page(start);
    void p.pick("A");
    void p.pick("B");
    p.answer(1);                                           // B first
    await p.settle();
    p.answer(0);                                           // then the older A
    await p.settle();
    expect(p.box.st).toMatchObject({ headline: "B", trustText: "#1" });
  });

  it("the check fails (picture decode / canvas): the design is not applied, the error is shown", async () => {
    const p = page(start);
    void p.pick("B");
    p.waits[0].fail(new Error("image_load_failed"));
    await p.settle();
    expect(p.box.st.headline).toBe("start");
    expect(p.box.st.trustText).toBe(start.trustText);
    expect(p.box.st.error).toContain("image_load_failed");
  });
});
