"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Opens the laptop's registered handler (scripts/codex-image-worker-install.ps1), which starts the worker. */
export const CODEX_START_URL = "awarewave-codex://start";
const IDLE_POLL_MS = 30_000;
const AFTER_START_POLL_MS = 3_000;
const AFTER_START_WINDOW_MS = 60_000;

type State = "unknown" | "online" | "offline" | "starting";

/** Codex 免費生圖: is the owner's laptop worker up, and a link that starts it. Rendered for the owner only. */
export function CodexLaptopButton({ variant = "sidebar" }: { variant?: "sidebar" | "page" }) {
  const [state, setState] = useState<State>("unknown");
  const startedAt = useRef(0);

  const lastCheck = useRef(0);

  const check = useCallback(async () => {
    lastCheck.current = Date.now();
    try {
      const r = await fetch("/api/tools/codex-laptop", { cache: "no-store" });
      const j = (await r.json()) as { ok?: boolean; online?: boolean };
      if (!j.ok) return;
      const starting = Date.now() - startedAt.current < AFTER_START_WINDOW_MS;
      setState(j.online ? "online" : starting ? "starting" : "offline");
    } catch { /* network blip: keep the last state */ }
  }, []);

  useEffect(() => {
    void check();
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      // Fast polling only right after a start click; otherwise every 30 s.
      if (now - startedAt.current < AFTER_START_WINDOW_MS || now - lastCheck.current >= IDLE_POLL_MS) void check();
    }, AFTER_START_POLL_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [check]);

  const page = variant === "page";
  const text = page ? "var(--text-primary)" : "var(--sidebar-text)";
  const label = state === "online" ? "在線" : state === "starting" ? "啟動中…" : state === "offline" ? "離線" : "…";
  const dot = state === "online" ? "var(--green)" : state === "starting" ? "var(--yellow)" : "var(--text-muted)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: page ? 12.5 : 11.5, color: text,
      padding: page ? "10px 0 0" : "10px 20px", borderTop: page ? "none" : "1px solid var(--sidebar-border)" }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: dot, flex: "none" }} />
      <span>Codex 筆電：{label}</span>
      {(state === "offline" || state === "starting") && (
        <a
          href={CODEX_START_URL}
          onClick={() => { startedAt.current = Date.now(); setState("starting"); }}
          style={{ marginLeft: "auto", border: `1px solid ${page ? "var(--card-border)" : "var(--sidebar-border)"}`, borderRadius: 6,
            padding: "3px 8px", color: text, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          啟動筆電
        </a>
      )}
    </div>
  );
}
