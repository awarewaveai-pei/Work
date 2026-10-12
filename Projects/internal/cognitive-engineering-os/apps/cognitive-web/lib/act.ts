// ACT 行動與觀察 as the page holds it: the task and note shapes (ai_lego/core/domain/kinds/act.py) and the small rules the
// page applies. The lists are copies of the engine's (test_block_act.WebParityTests compares them); what is due is decided
// by the engine only (GET /me/reminders), never here.
import type { Doc } from "./blocks";

export const STATUS = ["未開始", "進行中", "完成", "擱置", "停掉"] as const;
export const LONG_RHYTHM = ["月", "季", "年"] as const;
export const FLIP_WINDOW_MS = 10 * 60 * 1000;   // 「短時間內來回改狀態」: versions of one task this close, changing only the status

export type Task = {
  title: string; prediction: string; due?: string; risk?: string; stop_condition?: string; escalate_condition?: string; owner?: string; irreversible?: boolean;
  hold?: string; status?: string; long_rhythm?: string; from_next_step?: string; whose_wish?: string;
};
export type Num = { name: string; value: number; unit?: string };
export type Note = { task: string; happened?: string; thoughts?: string; adjustment?: string; blocker?: string; numbers?: Num[] };
export type Split = { options: Array<{ step: string; why_small?: string; reversible: boolean; undo?: string }> };
export type Flag = { irreversible?: string[]; affects_others?: string[] };
export type Reminder = { block: string; kind: string; since: string; text: string; weekly?: boolean; scope: "case" | "person"; project_id?: string; project_name?: string; path: string };

/** A task card started from the judgment's one sentence: the sentence is kept as it was, and the title starts as it. */
export const taskFromNextStep = (nextStep: string): Pick<Task, "title" | "from_next_step"> => ({ title: nextStep.trim().slice(0, 300), from_next_step: nextStep.trim() });

/** 不能反悔的行動，這個案子有護欄 wait_or_review 時：標了不能反悔，卻還沒選先等一下或請人覆核。 */
export const holdAsked = (guardrails: string[], task: Pick<Task, "irreversible" | "hold">): boolean => guardrails.includes("wait_or_review") && task.irreversible === true && !task.hold;

/** The rhythm the person is on, in words (the engine's rule: weekly for the first month after they began, then 月／季／年). */
export const rhythmLine = (longRhythm: string | undefined): string => `從你按「進行中」那天算，前 4 週每週記一次，之後每${longRhythm && (LONG_RHYTHM as readonly string[]).includes(longRhythm) ? longRhythm : "月"}記一次。`;

const withoutStatus = (task: Task): string => JSON.stringify(Object.entries(task).filter(([key]) => key !== "status").sort(([left], [right]) => left.localeCompare(right)));
const sameButStatus = (a: Task, b: Task): boolean => withoutStatus(a) === withoutStatus(b);

/** The history of one task with rapid status flips folded: a run of versions each within FLIP_WINDOW_MS of the one before,
 *  where only the status changed, shows as its last one; the earlier ones of the run are kept in ``earlier`` for the
 *  person to expand (每一次系統照樣記著). */
export function collapseFlips(versions: Array<Doc<Task>>, windowMs = FLIP_WINDOW_MS): Array<{ shown: Doc<Task>; earlier: Array<Doc<Task>> }> {
  const runs: Array<Array<Doc<Task>>> = [];
  for (const version of versions) {
    const run = runs.at(-1);
    const previous = run?.at(-1);
    if (run && previous && Date.parse(version.at) - Date.parse(previous.at) <= windowMs && sameButStatus(previous.content, version.content)) run.push(version);
    else runs.push([version]);
  }
  return runs.map((run) => ({ shown: run[run.length - 1], earlier: run.slice(0, -1) }));
}

export type Series = { name: string; unit: string; points: Array<{ on: string; value: number }>; trend: boolean };

/** The numbers recorded in a task's notes, one series per name in one unit (100 元 and 1 萬元 are never one line: a change across units would be
 *  a made-up number). A number recorded twice or more is a trend (同一個數字記到兩筆，系統就畫成趨勢); one recorded once stays a single point.
 *  Notes in the order they were written. */
export function seriesOf(notes: Array<Doc<Note>>): Series[] {
  const found = new Map<string, Series>();
  for (const note of [...notes].sort((a, b) => a.at.localeCompare(b.at))) {
    for (const item of note.content.numbers ?? []) {
      const name = item.name.trim();
      if (!name || typeof item.value !== "number" || !Number.isFinite(item.value)) continue;
      const unit = item.unit ?? "";
      const key = JSON.stringify([name, unit]);
      const series = found.get(key) ?? { name, unit, points: [], trend: false };
      series.points.push({ on: note.at.slice(0, 10), value: item.value });
      series.trend = series.points.length >= 2;
      found.set(key, series);
    }
  }
  return [...found.values()];
}

/** The points of a trend line inside a ``width`` x ``height`` box with ``pad`` around it, as an SVG `points` string. */
export function sparkPoints(values: number[], width = 240, height = 60, pad = 6): string {
  if (values.length < 2) return "";
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  return values.map((value, index) => `${(pad + (index * (width - 2 * pad)) / (values.length - 1)).toFixed(1)},${(height - pad - ((value - low) * (height - 2 * pad)) / span).toFixed(1)}`).join(" ");
}

/** Numbers parsed from the two cells of a new observation row; a row with no name or no number is left out. */
export function parseNumber(name: string, value: string, unit: string): Num | null {
  const trimmed = value.trim();
  const parsed = trimmed === "" ? NaN : Number(trimmed);
  return name.trim() && Number.isFinite(parsed) ? { name: name.trim(), value: parsed, ...(unit.trim() ? { unit: unit.trim() } : {}) } : null;
}

// ACT.flag and ACT.trend were AI turns until 2026-10-12; they are plain code now (docs/platform/AI_TO_CODE_AUDIT.md §1). Nothing here
// judges: it lists what the person marked and what they recorded, in the order they wrote it.

/** What the person marked on one task about undoing it, in their words: 不能反悔 (and the wait or review they chose), 能反悔, or not marked yet. */
export function undoMark(task: Task): string {
  if (task.irreversible === true) return `不能反悔${task.hold ? `；你選了「${task.hold}」` : ""}`;
  return task.irreversible === false ? "能反悔" : "你還沒勾能不能反悔";
}

/** Every task with its own mark, and who is affected (the intake's ``affected``): the lines under 「哪裡不能反悔、會影響到誰」. */
export function flagLines(tasks: Array<Doc<Task>>, affected: string[]): { tasks: Array<{ title: string; mark: string; irreversible: boolean }>; affected: string[] } {
  return { tasks: tasks.map((task) => ({ title: task.content.title, mark: undoMark(task.content), irreversible: task.content.irreversible === true })), affected };
}

export type Moved = { task: string; name: string; unit: string; first: number; last: number; change: number; from: string; to: string; count: number };
export type Once = { task: string; name: string; unit: string; value: number; on: string };

/** The number a difference of two recorded numbers is: no float tail (0.1 + 0.2 stays 0.3). */
const diff = (last: number, first: number): number => Number((last - first).toPrecision(12));

/** The recorded numbers of every task: each number recorded twice or more from its first value to its last, the change and the two days;
 *  a number recorded once is listed as recorded once. Per task, so two tasks that record 「價格」 stay two lines. */
export function trendLines(tasks: Array<Doc<Task>>, notes: Array<Doc<Note>>): { moved: Moved[]; once: Once[] } {
  const moved: Moved[] = [];
  const once: Once[] = [];
  for (const task of tasks) {
    for (const series of seriesOf(notes.filter((note) => note.content.task === task.doc_id))) {
      const first = series.points[0];
      const last = series.points[series.points.length - 1];
      if (series.trend) moved.push({ task: task.content.title, name: series.name, unit: series.unit, first: first.value, last: last.value, change: diff(last.value, first.value), from: first.on, to: last.on, count: series.points.length });
      else once.push({ task: task.content.title, name: series.name, unit: series.unit, value: first.value, on: first.on });
    }
  }
  return { moved, once };
}

/** One moved number in one sentence. */
export function movedSentence(line: Moved): string {
  const how = line.change === 0 ? "一樣" : `${line.change > 0 ? "多了" : "少了"} ${Math.abs(line.change)}${line.unit}`;
  return `「${line.task}」的「${line.name}」：從 ${line.first}${line.unit} 到 ${line.last}${line.unit}，${how}；${line.from === line.to ? `${line.from} 記了 ${line.count} 次` : `${line.from} 到 ${line.to} 記了 ${line.count} 次`}。`;
}

/** One number recorded once, in one sentence. */
export const onceSentence = (line: Once): string => `「${line.task}」的「${line.name}」：只記了一次（${line.value}${line.unit}，${line.on}），還看不出趨勢。`;
