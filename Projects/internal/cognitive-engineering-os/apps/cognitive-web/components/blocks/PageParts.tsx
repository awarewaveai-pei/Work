"use client";

// The pieces every block page uses the same way (walk 2026-10-11, A8 B2 B3):
// - a refusal is the server's sentence under the button that sent it, never one line at the far end of the page;
// - a button that cannot be pressed says what is missing, beside it;
// - a section a first-time person does not need yet is folded under its name, never hidden without a label;
// - an example of a question opens on 「看例子」, the same on every page.
import React from "react";
import { SYSTEM_MADE } from "../../lib/blocks";

/** The one failed action on a page: which button group sent it (`at`) and the sentence to show there. */
export type Failed = { at: string; text: string } | null;

/** The refusal of the action sent from `at`; nothing when no action failed, or another group's did. */
export function Refused({ failed, at }: { failed: Failed; at: string }) {
  return failed?.at === at ? <p className="error" role="alert">{failed.text}</p> : null;
}

/** The first missing thing of `checks` ([missing?, what to say]), or null when nothing is missing. */
export const firstMissing = (...checks: Array<[boolean, string]>): string | null => checks.find(([lacking]) => lacking)?.[1] ?? null;

/** Why the button beside it cannot be pressed. Only for what the person can fix; a busy page needs no sentence. */
export function Missing({ why }: { why: string | null | undefined | false }) {
  return why ? <p className="hint">{why}</p> : null;
}

/** A folded section: its name stays on the screen, the person opens it. The cells inside keep what was written while it
 *  is closed (the page holds the form), and `filled` says on the closed line how many already have something. */
export function Fold({ title, cells, filled = 0, card = false, open = false, id, children }: {
  title: string; cells?: number; filled?: number; card?: boolean; open?: boolean; id?: string; children: React.ReactNode;
}) {
  const count = cells ? `（${cells} 格${filled ? `，已寫 ${filled} 格` : ""}）` : filled ? `（已寫 ${filled} 項）` : "";
  const fold = <details className="dir" open={open || undefined} id={card ? undefined : id}><summary>{title}{count}</summary>{children}</details>;
  return card ? <div className="card" id={id}>{fold}</div> : fold;
}

/** How many of `values` have something written. */
export const filledCount = (...values: unknown[]): number => values.filter((value) => (typeof value === "string" ? value.trim() !== "" : Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "")).length;

/** The example of a question, behind 「看例子」. */
export function Example({ text }: { text: string }) {
  return <details><summary>看例子</summary><p className="hint">{text}</p></details>;
}

/** The tag on a result the system made by code where an AI answer used to appear: made by the system, not by the AI, and costs nothing. */
export const SystemMade = () => <span className="tags"><span>{SYSTEM_MADE}</span></span>;
