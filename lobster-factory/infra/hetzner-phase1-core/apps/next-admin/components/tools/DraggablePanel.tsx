"use client";

/**
 * DraggablePanel — a floating, draggable, collapsible tool panel (Photoshop-style).
 *
 * Composable layout block: wrap any tool UI in it and the user can drag it by its header to
 * reposition, collapse it, and the position persists per `id` to localStorage. This is how the
 * editor's panels become "rearrangeable" (使用者可自己拉工具位置). Render these inside a
 * `position: relative` container; each panel is `position: absolute` within it.
 *
 * Pointer-events based drag (mouse + touch). Position clamped into the viewport so a panel can't
 * be stranded off-screen. Double-click the header to reset to the default position.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Pos = { x: number; y: number };

type Props = {
  id: string; // localStorage key suffix — stable per panel
  title: string;
  defaultPos: Pos;
  width?: number;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
};

// v2: reset everyone's saved positions to the new tidy stacked defaults (old layout overlapped).
const LS_PREFIX = "canvas-panel-pos-v2:";

/** Clamp into the visible viewport (keep at least 40px reachable so the header stays grabbable). */
function clampPos(p: Pos): Pos {
  const maxX = typeof window !== "undefined" ? Math.max(0, window.innerWidth - 40) : 4000;
  const maxY = typeof window !== "undefined" ? Math.max(0, window.innerHeight - 40) : 4000;
  return { x: Math.min(Math.max(0, p.x), maxX), y: Math.min(Math.max(0, p.y), maxY) };
}

function loadPos(id: string, fallback: Pos): Pos {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + id);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Pos;
    if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return clampPos(p);
  } catch {
    /* ignore corrupt value */
  }
  return fallback;
}

export default function DraggablePanel({ id, title, defaultPos, width = 260, defaultCollapsed = false, children }: Props) {
  const [pos, setPos] = useState<Pos>(defaultPos);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const posRef = useRef<Pos>(defaultPos);
  posRef.current = pos;

  // hydrate persisted position on mount (client only — avoids SSR mismatch)
  useEffect(() => {
    setPos(loadPos(id, defaultPos));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const persist = useCallback(
    (p: Pos) => {
      try {
        window.localStorage.setItem(LS_PREFIX + id, JSON.stringify(p));
      } catch {
        /* private mode / quota — position just won't persist */
      }
    },
    [id]
  );

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return; // collapse btn etc.
    dragRef.current = { dx: e.clientX - posRef.current.x, dy: e.clientY - posRef.current.y };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos(clampPos({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy }));
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* capture may already be gone on cancel */
      }
      persist(posRef.current);
    },
    [persist]
  );

  const resetPos = useCallback(() => {
    setPos(defaultPos);
    persist(defaultPos);
  }, [defaultPos, persist]);

  return (
    <div
      className="build-panel"
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width,
        padding: 0, // override .build-panel's 24px so the header spans the edge
        zIndex: dragging ? 50 : 10,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => {
          dragRef.current = null;
          setDragging(false);
        }}
        onDoubleClick={resetPos}
        title="拖曳移動，雙擊還原位置"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "move",
          padding: "6px 8px",
          borderBottom: collapsed ? "none" : "1px solid var(--card-border)",
          fontSize: 12,
          fontWeight: 600,
          userSelect: "none",
          touchAction: "none",
        }}
      >
        <span>⠿ {title}</span>
        <button
          data-no-drag="1"
          onClick={() => setCollapsed((c) => !c)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: 0 }}
          title={collapsed ? "展開" : "收合"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
      </div>
      {!collapsed ? <div style={{ padding: 10 }}>{children}</div> : null}
    </div>
  );
}
