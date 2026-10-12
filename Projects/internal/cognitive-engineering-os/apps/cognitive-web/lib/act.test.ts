import { describe, expect, it } from "vitest";
import type { Doc } from "./blocks";
import { FLIP_WINDOW_MS, collapseFlips, flagLines, holdAsked, movedSentence, onceSentence, parseNumber, rhythmLine, seriesOf, sparkPoints, taskFromNextStep, trendLines, undoMark, type Note, type Task } from "./act";

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

const task = (id: string, title: string, content: Partial<Task> = {}): Doc<Task> => ({ doc_id: id, kind: "act.task", version: 1, content: { title, prediction: "他讓步一半", ...content }, author: "user", block: "ACT", at: "2026-10-01T08:00:00Z" });
const noteOf = (taskId: string, at: string, numbers: Note["numbers"]): Doc<Note> => ({ doc_id: `N-${taskId}-${at}`, kind: "act.note", version: 1, content: { task: taskId, numbers }, author: "user", block: "ACT", at });

describe("ACT.trend as code: the recorded numbers, first to last", () => {
  it("lists a number recorded twice or more from its first value to its last with the change and the two days, and a number recorded once as recorded once", () => {
    const found = trendLines([task("T1", "跟他談一次條件")], [
      noteOf("T1", "2026-10-15T08:00:00Z", [{ name: "價格", value: 80, unit: "萬" }]),
      noteOf("T1", "2026-10-08T08:00:00Z", [{ name: "價格", value: 90, unit: "萬" }, { name: "訂單", value: 3 }]),
      noteOf("T1", "2026-10-12T08:00:00Z", [{ name: "價格", value: 85, unit: "萬" }]),
    ]);
    expect(found.moved).toEqual([{ task: "跟他談一次條件", name: "價格", unit: "萬", first: 90, last: 80, change: -10, from: "2026-10-08", to: "2026-10-15", count: 3 }]);
    expect(found.once).toEqual([{ task: "跟他談一次條件", name: "訂單", unit: "", value: 3, on: "2026-10-08" }]);
    expect(movedSentence(found.moved[0])).toBe("「跟他談一次條件」的「價格」：從 90萬 到 80萬，少了 10萬；2026-10-08 到 2026-10-15 記了 3 次。");
    expect(onceSentence(found.once[0])).toBe("「跟他談一次條件」的「訂單」：只記了一次（3，2026-10-08），還看不出趨勢。");
  });

  it("never joins a number recorded in two units: 100 元 and then 1 萬元 are two numbers recorded once, not a change of 99 萬元", () => {
    const found = trendLines([task("T1", "甲")], [noteOf("T1", "2026-10-01T08:00:00Z", [{ name: "收入", value: 100, unit: "元" }]), noteOf("T1", "2026-10-08T08:00:00Z", [{ name: "收入", value: 1, unit: "萬元" }])]);
    expect(found.moved).toEqual([]);
    expect(found.once.map(onceSentence)).toEqual(["「甲」的「收入」：只記了一次（100元，2026-10-01），還看不出趨勢。", "「甲」的「收入」：只記了一次（1萬元，2026-10-08），還看不出趨勢。"]);
    const same = trendLines([task("T1", "甲")], [noteOf("T1", "2026-10-01T08:00:00Z", [{ name: "收入", value: 100, unit: "元" }]), noteOf("T1", "2026-10-08T08:00:00Z", [{ name: "收入", value: 150, unit: "元" }])]);
    expect(same.moved.map(movedSentence)).toEqual(["「甲」的「收入」：從 100元 到 150元，多了 50元；2026-10-01 到 2026-10-08 記了 2 次。"]);
  });

  it("keeps two tasks that record the same name apart, adds no float tail and says a number that did not move did not move", () => {
    const found = trendLines([task("T1", "甲"), task("T2", "乙")], [
      noteOf("T1", "2026-10-01T08:00:00Z", [{ name: "比率", value: 0.1 }]), noteOf("T1", "2026-10-02T08:00:00Z", [{ name: "比率", value: 0.3 }]),
      noteOf("T2", "2026-10-01T08:00:00Z", [{ name: "比率", value: 5 }]), noteOf("T2", "2026-10-01T09:00:00Z", [{ name: "比率", value: 5 }]),
    ]);
    expect(found.moved.map((line) => [line.task, line.change])).toEqual([["甲", 0.2], ["乙", 0]]);
    expect(movedSentence(found.moved[1])).toBe("「乙」的「比率」：從 5 到 5，一樣；2026-10-01 記了 2 次。");
    expect(trendLines([task("T1", "甲")], [])).toEqual({ moved: [], once: [] });
  });
});

describe("ACT.flag as code: the person's own marks and who is affected", () => {
  it("says what the person ticked on each task, in their words, and never decides for them", () => {
    expect(undoMark({ title: "a", prediction: "p", irreversible: true, hold: "請人覆核" })).toBe("不能反悔；你選了「請人覆核」");
    expect(undoMark({ title: "a", prediction: "p", irreversible: true })).toBe("不能反悔");
    expect(undoMark({ title: "a", prediction: "p", irreversible: false })).toBe("能反悔");
    expect(undoMark({ title: "a", prediction: "p" })).toBe("你還沒勾能不能反悔");
    const found = flagLines([task("T1", "簽約", { irreversible: true, hold: "先等一下" }), task("T2", "約時間", { irreversible: false }), task("T3", "寫信")], ["合夥人", "員工"]);
    expect(found.tasks).toEqual([
      { title: "簽約", mark: "不能反悔；你選了「先等一下」", irreversible: true }, { title: "約時間", mark: "能反悔", irreversible: false }, { title: "寫信", mark: "你還沒勾能不能反悔", irreversible: false },
    ]);
    expect(found.affected).toEqual(["合夥人", "員工"]);
  });
});
