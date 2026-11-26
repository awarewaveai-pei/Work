// The one table that decides the step cards' order and numbers; hints name a step through stepRef, never a number.
export type StepKey = "start" | "style" | "size" | "canvas" | "ai" | "template" | "text" | "marketing" | "export";

const STEPS: readonly { key: StepKey; title: string; staffOnly?: true }[] = [
  { key: "start", title: "開始", staffOnly: true },
  { key: "style", title: "風格" },
  { key: "size", title: "尺寸" },
  { key: "canvas", title: "畫面" },
  { key: "ai", title: "AI 文案與設計", staffOnly: true },
  { key: "template", title: "版型模板" },
  { key: "text", title: "文字" },
  { key: "marketing", title: "行銷元素" },
  { key: "export", title: "匯出" },
];

export interface StepSlot { key: StepKey; title: string; no: string }

/** The steps shown, numbered in order (a design door has no staff-only steps). */
export function stepsFor(staff: boolean): StepSlot[] {
  return STEPS.filter((x) => staff || !x.staffOnly).map((x, i) => ({ key: x.key, title: x.title, no: String(i + 1) }));
}

/** A step as a hint names it: 「4 畫面」. */
export function stepRef(key: StepKey, staff: boolean): string {
  const slot = stepsFor(staff).find((x) => x.key === key);
  return slot ? `「${slot.no} ${slot.title}」` : `「${STEPS.find((x) => x.key === key)?.title}」`;
}
