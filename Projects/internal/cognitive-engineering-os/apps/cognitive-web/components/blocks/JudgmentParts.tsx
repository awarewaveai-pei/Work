"use client";

// The small parts DECIDE, ACT and LEARN pages share: visible choice buttons (never a dropdown), a labelled cell, the author
// tag every AI text carries, and a read of another block's documents that is empty -- not an error -- while that block is
// not built yet.
import React from "react";
import { ApiError } from "../../lib/api";
import { AUTHOR, docs, type Author, type Doc } from "../../lib/blocks";

export function Chips<T extends string>({ options, value, onPick, label }: { options: readonly T[]; value: T | "" | undefined; onPick: (value: T) => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => <button key={option} type="button" className={`chip${value === option ? " on" : ""}`} aria-pressed={value === option} onClick={() => onPick(option)}>{option}</button>)}
    </div>
  );
}

/** One labelled cell: the label names it, the hint says what goes in it, the control comes after. */
export function Cell({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </div>
  );
}

export const AuthorTag = ({ author }: { author: Author }) => <span className="tags"><span>{AUTHOR[author]}</span></span>;

/** One item per line; blank lines dropped. */
export const linesOf = (text: string): string[] => text.split("\n").map((line) => line.trim()).filter(Boolean);

/** Another block's documents for this case. A block not built yet answers 404 (DOC_KIND_UNKNOWN): that is "nothing", every other failure still shows. */
export function optionalDocs<C = Record<string, any>>(projectId: string | null, kind: string): Promise<Array<Doc<C>>> {
  return docs.list<C>(projectId, kind).catch((reason) => {
    if (reason instanceof ApiError && reason.status === 404) return [];
    throw reason;
  });
}
