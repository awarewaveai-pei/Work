"use client";

/**
 * DraggablePanel — a floating, draggable, collapsible tool panel (Photoshop-style).
 *
 * Composable layout block: wrap any tool UI in it and the user can drag it by its header to
 * reposition, collapse it, and the position persists per `id` to localStorage. This is how the
 * editor's panels become "rearrangeable" (使用者可自己拉工具位置). Render these inside a
 * `position: relative` container; each panel is `position: absolute` within it.
 *
 * Pointer-events based drag (works mouse + touch). Position is clamped to >= 0 so a panel can't
 * be dragged fully off the top/left. Double-click the header to reset to the default position.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Pos = { x: number; y: number };

type Props = {
  id: string; // localStorage key suffix — stable per panel
  title: string;
  defaultPos: Pos;
  width?: number;
  children: React.ReactNode;
};

const LS_PREFIX = "canvas-panel-pos:";

function loadPos(id: string, fallback: Pos): Pos {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + id);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Pos;
    if (typeof p.x === "number" && typeof p.y === "number") return { x: Math.max(0, p.x), y: Math.max(0, p.y) };
  } catch {
    /* ignore corrupt value */
  }
  return fallback;
}

export default function DraggablePanel({ id, title, defaultPos, width = 260, children }: Props) {
  const [pos, setPos] = useState<Pos>(defaultPos);
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

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

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // ignore clicks on the collapse button
      if ((e.target as HTMLElement).dataset.noDrag) return;
      dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({ x: Math.max(0, e.clientX - dragRef.current.dx), y: Math.max(0, e.clientY - dragRef.current.dy) });
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current) {
        dragRef.current = null;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        setPos((p) => {
          persist(p);
          return p;
        });
      }
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
        zIndex: dragRef.current ? 50 : 10,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
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
