"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import type { EventRow } from "@/lib/events/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const WINDOWS = [
  { key: "week",    label: "本週機會",     days: 7 },
  { key: "month",   label: "30 天備稿",   days: 30 },
  { key: "quarter", label: "90 天規劃",   days: 90 },
  { key: "year",    label: "全年行事曆",  days: 365 },
] as const;

type WindowKey = typeof WINDOWS[number]["key"];

const CATS = ["全部", "sports", "holiday", "cultural", "mega"] as const;

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [window_, setWindow] = useState<WindowKey>("month");
  const [cat, setCat] = useState<string>("全部");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncLog, setSyncLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const days = WINDOWS.find(w => w.key === window_)?.days ?? 30;
    const now = new Date().toISOString().slice(0, 10);
    const until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

    let q = supabase
      .from("events")
      .select("*")
      .eq("is_active", true)
      .gte("marketing_window_start", now)
      .lte("marketing_window_start", until)
      .order("marketing_window_start", { ascending: true });

    if (cat !== "全部") q = q.eq("category", cat);

    const { data } = await q.limit(200);
    setEvents((data ?? []) as EventRow[]);
    setLoading(false);
  }, [window_, cat]);

  useEffect(() => { void load(); }, [load]);

  async function triggerSync() {
    setSyncing(true);
    setSyncLog(["⏳ Syncing…"]);
    setShowLog(true);
    try {
      const res = await fetch("/api/tools/events/sync", { method: "POST" });
      const json = await res.json() as { log?: string[]; upserted?: number; errors?: string[] };
      setSyncLog(json.log ?? [`Done — ${json.upserted ?? 0} upserted`]);
      void load();
    } catch (err) {
      setSyncLog([`Error: ${String(err)}`]);
    } finally {
      setSyncing(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ padding: 20, maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>🌍 全球活動行事曆</h1>
        <button
          className="btn-secondary"
          style={{ fontSize: 12, marginLeft: "auto" }}
          onClick={triggerSync}
          disabled={syncing}
        >
          {syncing ? "⏳ 同步中…" : "🔄 立即同步"}
        </button>
        {syncLog.length > 0 && (
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowLog(v => !v)}>
            {showLog ? "▲ 隱藏 log" : "▼ 看 log"}
          </button>
        )}
      </div>

      {showLog && (
        <pre style={{
          background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 6,
          padding: 10, fontSize: 11, maxHeight: 200, overflowY: "auto", marginBottom: 12
        }}>
          {syncLog.join("\n")}
        </pre>
      )}

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {WINDOWS.map(w => (
          <button key={w.key} className="btn-secondary"
            style={{ fontWeight: window_ === w.key ? 700 : 400, fontSize: 13 }}
            onClick={() => setWindow(w.key)}>
            {w.label}
          </button>
        ))}
        <div style={{ width: 1, background: "var(--card-border)", margin: "0 4px" }} />
        {CATS.map(c => (
          <button key={c} className="btn-secondary"
            style={{ fontWeight: cat === c ? 700 : 400, fontSize: 13 }}
            onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>

      {/* Event list */}
      {loading ? (
        <p style={{ opacity: 0.5 }}>載入中…</p>
      ) : events.length === 0 ? (
        <p style={{ opacity: 0.5 }}>沒有活動。先點「立即同步」拉資料。</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {events.map(e => {
            const daysUntilWindow = Math.ceil(
              (new Date(e.marketing_window_start).getTime() - Date.now()) / 86400000
            );
            const daysUntilEvent = Math.ceil(
              (new Date(e.event_date).getTime() - Date.now()) / 86400000
            );
            const urgent = daysUntilWindow <= 7;
            return (
              <div key={e.id} style={{
                border: `1px solid ${urgent ? "var(--accent)" : "var(--card-border)"}`,
                borderRadius: 8, padding: "10px 14px",
                background: urgent ? "color-mix(in srgb, var(--accent) 6%, var(--card-bg))" : "var(--card-bg)",
                display: "flex", gap: 12, alignItems: "flex-start",
              }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{e.emoji ?? "📅"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {e.title_zh ?? e.title}
                    {urgent && <span style={{ marginLeft: 8, color: "var(--accent)", fontSize: 12 }}>⚡ 快開窗</span>}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                    {e.title_zh ? e.title : ""}
                    {e.country_codes.join(", ")} · {e.region}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>🗓 {e.event_date}</div>
                  <div style={{ opacity: 0.6, marginTop: 2 }}>
                    活動 {daysUntilEvent > 0 ? `${daysUntilEvent} 天後` : "已過"}
                  </div>
                  <div style={{ marginTop: 4, color: urgent ? "var(--accent)" : "inherit" }}>
                    📣 備稿窗 {daysUntilWindow > 0 ? `${daysUntilWindow} 天後開` : "已開"}
                  </div>
                  <div style={{ opacity: 0.5, marginTop: 2, fontSize: 11 }}>
                    提前 {e.marketing_lead_days} 天
                  </div>
                </div>
                <div>
                  <span style={{
                    fontSize: 11, padding: "2px 7px", borderRadius: 99,
                    background: e.category === "mega" ? "var(--accent)" :
                      e.category === "sports" ? "#0A84FF22" :
                      e.category === "holiday" ? "#34C75922" : "#BF5AF222",
                    color: e.category === "mega" ? "#fff" : "inherit",
                  }}>
                    {e.category}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 11, opacity: 0.4, marginTop: 16 }}>
        資料來源：Calendarific（{today} 同步）· TheSportsDB · 手動大事件
      </p>
    </div>
  );
}
