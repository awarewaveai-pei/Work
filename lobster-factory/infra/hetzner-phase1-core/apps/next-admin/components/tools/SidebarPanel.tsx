"use client";

/**
 * SidebarPanel — a collapsible tool section for the right-hand scrollable sidebar (the
 * vector-trace-demo.html layout the user prefers over floating panels). Drop-in replacement
 * for DraggablePanel: it accepts the same props but ignores the positioning ones (id/
 * defaultPos/width) and just renders a full-width collapsible block. The parent sidebar
 * owns the fixed width + `overflow:auto` scroll, so panels stack tidily with no overlap.
 */
import { useState } from "react";

type Props = {
  id?: string;
  title: string;
  defaultPos?: { x: number; y: number };
  width?: number;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
};

export default function SidebarPanel({ title, defaultCollapsed = false, children }: Props) {
  const [open, setOpen] = useState(!defaultCollapsed);
  return (
    <div className="build-panel" style={{ padding: 0, width: "100%" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          textAlign: "left",
          background: "none",
          border: "none",
          borderBottom: open ? "1px solid var(--card-border)" : "none",
          padding: "8px 10px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
        title={open ? "收合" : "展開"}
      >
        <span style={{ opacity: 0.6 }}>{open ? "▾" : "▸"}</span>
        {title}
      </button>
      {open ? <div style={{ padding: 10 }}>{children}</div> : null}
    </div>
  );
}
