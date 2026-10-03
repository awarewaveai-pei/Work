import { describe, expect, it } from "vitest";
import type { Doc } from "./blocks";
import { FLIP_WINDOW_MS, collapseFlips, holdAsked, parseNumber, rhythmLine, seriesOf, sparkPoints, taskFromNextStep, type Note, type Task } from "./act";

const version = (n: number, at: string, content: Partial<Task>): Doc<Task> => ({ doc_id: "T1", kind: "act.task", version: n, content: { title: "談一次", prediction: "他讓步一半", ...content }, author: "user", block: "ACT", at });
const note = (at: string, numbers: Note["numbers"]): Doc<Note> => ({ doc_id: `N-${at}`, kind: "act.note", version: 1, content: { task: "T1", numbers }, author: "user", block: "ACT", at });

describe("the history of a task", () => {
  it("folds a run of quick status flips into its last version and keeps the earlier ones to expand", () => {
    const versions = [version(1, "2026-10-03T08:00:00Z", {}), version(2, "2026-10-03T08:01:00Z", { status: "進行中" }), version(3, "2026-10-03T08:02:00Z", { status: "完成" }), version(4, "2026-10-03T08:03:00Z", { status: "進行中" })];
    const folded = collapseFlips(versions);
    expect(folded).toHaveLength(1);
    expect(folded[0].shown.version).toBe(4);
    expect(folded[0].earlier.map((item) => item.version)).toEqual([1, 2, 3]);   // every one is kept
  });

  it("a change to anything but the status, or a pause longer than the window, starts a new line", () => {
    const slow = new Date(Date.parse("2026-10-03T08:02:00Z") + FLIP_WINDOW_MS + 1000).toISOString();
    const versions = [version(1, "2026-10-03T08:00:00Z", { status: "進行中" }), version(2, "2026-10-03T08:01:00Z", { status: "完成", due: "2026-10-20" }), version(3, "2026-10-03T08:02:00Z", { status: "進行中", due: "2026-10-20" }), version(4, slow, { status: "完成", due: "2026-10-20" })];
    expect(collapseFlips(versions).map((run) => run.shown.version)).toEqual([1, 3, 4]);
    expect(collapseFlips(versions)[1].earlier.map((item) => item.version)).toEqual([2]);
    expect(collapseFlips([])).toEqual([]);
  });
});

describe("the numbers in the notes", () => {
  it("draws a trend only for a number recorded twice or more; one recorded once stays a single point", () => {
    const found = seriesOf([note("2026-10-15T08:00:00Z", [{ name: "價格", value: 80, unit: "萬" }]), note("2026-10-08T08:00:00Z", [{ name: "價格", value: 90, unit: "萬" }, { name: "訂單", value: 3 }])]);
    const price = found.find((series) => series.name === "價格")!;
    expect(price.trend).toBe(true);
    expect(price.points).toEqual([{ on: "2026-10-08", value: 90 }, { on: "2026-10-15", value: 80 }]);   // oldest first, whatever order they were passed in
    expect(price.unit).toBe("萬");
    expect(found.find((series) => series.name === "訂單")).toMatchObject({ trend: false, points: [{ on: "2026-10-08", value: 3 }] });
  });

  it("leaves out a number with no name or no finite value", () => {
    expect(seriesOf([note("2026-10-08T08:00:00Z", [{ name: " ", value: 1 }, { name: "x", value: Number.NaN }])])).toEqual([]);
    expect(parseNumber("價格", "90", "萬")).toEqual({ name: "價格", value: 90, unit: "萬" });
    expect(parseNumber("價格", "", "")).toBeNull();
    expect(parseNumber("", "5", "")).toBeNull();
    expect(parseNumber("價格", "abc", "")).toBeNull();
    expect(parseNumber("價格", "0", "")).toEqual({ name: "價格", value: 0 });
  });

  it("puts the first point at the left, the lowest value at the bottom, and draws nothing for one point", () => {
    expect(sparkPoints([5])).toBe("");
    expect(sparkPoints([10, 20], 100, 50, 5)).toBe("5.0,45.0 95.0,5.0");
    expect(sparkPoints([7, 7], 100, 50, 5)).toBe("5.0,45.0 95.0,45.0");   // a flat line is flat, not a division by zero
  });
});

describe("the task card", () => {
  it("starts from the judgment's one sentence and keeps it as written", () => {
    expect(taskFromNextStep("  這週先跟他談一次條件 ")).toEqual({ title: "這週先跟他談一次條件", from_next_step: "這週先跟他談一次條件" });
    expect(taskFromNextStep("字".repeat(400)).title).toHaveLength(300);
  });

  it("asks to wait or have someone review only under the guardrail, for an action marked irreversible, until you answer", () => {
    expect(holdAsked(["wait_or_review"], { irreversible: true })).toBe(true);
    expect(holdAsked(["wait_or_review"], { irreversible: true, hold: "先等一下" })).toBe(false);
    expect(holdAsked(["wait_or_review"], { irreversible: false })).toBe(false);
    expect(holdAsked([], { irreversible: true })).toBe(false);
  });

  it("says the rhythm: weekly for the first month, then the month, quarter or year the person chose (month by default)", () => {
    expect(rhythmLine(undefined)).toBe("從你按「進行中」那天算，前 4 週每週記一次，之後每月記一次。");
    expect(rhythmLine("季")).toBe("從你按「進行中」那天算，前 4 週每週記一次，之後每季記一次。");
    expect(rhythmLine("年")).toBe("從你按「進行中」那天算，前 4 週每週記一次，之後每年記一次。");
    expect(rhythmLine("週")).toBe("從你按「進行中」那天算，前 4 週每週記一次，之後每月記一次。");
  });
});
