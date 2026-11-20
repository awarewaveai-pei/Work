"use client";

// The transitions module's picker for the main system's React pages (card R2/R4): the offered transitions in their button
// rows (無, then 淡化／擦除／推移／形狀／特效), no dropdown, no search. The list, the labels and the groups are
// public/editor-shared/transitions.js; this only draws them (the workbench's pages use Transitions.buttons).
import type { CSSProperties } from "react";
import Transitions from "@/public/editor-shared/transitions.js";

type Entry = { id: string; label: string; note: string; group: string | null };

export default function TransitionButtons({ label, value, onPick, disabled = false, look }: {
  label: string; value: string; onPick: (id: string) => void; disabled?: boolean; look: (on: boolean) => CSSProperties;
}) {
  const list = Transitions.LIST as Entry[], on = Transitions.name(value);
  const rows: Array<[string | null, Entry[]]> = [[null, list.filter((t) => !t.group)],
    ...(Transitions.GROUPS as string[]).map((g): [string, Entry[]] => [g, list.filter((t) => t.group === g)])];
  return (
    <div role="group" aria-label={label}>
      {rows.filter(([, row]) => row.length).map(([g, row]) => (
        <div key={g ?? "none"}>
          {g && <span style={{ color: "var(--text-muted)", fontSize: 12, display: "block", margin: "4px 0 2px" }}>{g}</span>}
          <div role={g ? "group" : undefined} aria-label={g ?? undefined} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {row.map((t) => (
              <button key={t.id} type="button" style={look(on === t.id)} disabled={disabled} aria-pressed={on === t.id}
                onClick={() => { if (on !== t.id) onPick(t.id); }}>
                {t.label}{t.note ? ` ${t.note}` : ""}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
