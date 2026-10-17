"use client";
// 貼文排程's six tabs (ADR 016 §5 decision 3; mock: .subbar #tabs). Week / month is the calendar tab's own .seg (Toolbar).
import type { ReactNode } from "react";
import { PLAN_TABS, tabOf, type View } from "./routes";

export default function PlanTabs({ view, onView, right }: { view: View; onView: (v: View) => void; right?: ReactNode }) {
  const on = tabOf(view);
  return (
    <div className="sm-subbar">
      <nav className="sm-tabs" aria-label="貼文排程">
        {PLAN_TABS.map((t) => (
          <button type="button" key={t.key} data-view={t.key} className={on === t.key ? "sm-on" : ""} aria-current={on === t.key ? "page" : undefined}
            onClick={() => onView(t.key)}>{t.label}</button>
        ))}
      </nav>
      {right}
    </div>
  );
}
