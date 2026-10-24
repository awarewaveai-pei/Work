"use client";
// The holiday calendar, shared by the staff page (/tools/events) and the content door. Reading is a platform API
// (/api/tools/events/upcoming); refreshing the cache writes it and stays staff-only, so only the staff page passes
// `sync` and a door page's imports name no /api/tools/events/sync (step-8 card §2 S1).

import { useCallback, useEffect, useMemo, useState } from "react";
import { EVENT_ALL_COUNTRIES_FILTER, EVENT_COUNTRY_FILTER_GROUPS } from "@/lib/events/countries";

const WINDOWS = [
  { key: "30", label: "30 天", days: 30 },
  { key: "90", label: "90 天", days: 90 },
  { key: "180", label: "6 個月", days: 180 },
  { key: "365", label: "全年", days: 365 },
] as const;

const FILTERS = [
  { value: "all", label: "全部" },
  { value: "sports", label: "運動" },
  { value: "national", label: "國家節慶" },
  { value: "cultural", label: "文化節慶" },
  { value: "commercial", label: "商業檔期" },
  { value: "family", label: "親情節日" },
  { value: "mega", label: "大型事件" },
  { value: "holiday", label: "假日" },
] as const;

type SortMode = "opportunity" | "date";

interface EventView {
  id: string;
  title: string;
  title_zh: string | null;
  event_date: string;
  event_end_date: string | null;
  category: string;
  subcategory: string | null;
  emoji: string | null;
  marketing_window_start: string;
  marketing_lead_days: number;
  country_codes: string[] | null;
  region: string | null;
  facets?: string[];
  opportunity_score?: number;
}

interface EventsResponse {
  events: EventView[];
  meta?: {
    total?: number;
    last_synced_at?: string | null;
  };
}

function countryLabel(event: EventView): string {
  const countries = [...new Set(event.country_codes ?? [])].filter(Boolean).sort();
  if (countries.length === 0) return "";
  return countries.length > 5 ? `${countries.slice(0, 5).join(", ")} +${countries.length - 5}` : countries.join(", ");
}

function daysUntil(isoDate: string): number {
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86400000);
}

export interface EventsSyncResult { log?: string[]; upserted?: number; skippedFresh?: boolean; errors?: string[] }

export default function EventsCalendar({ sync }: { sync?: () => Promise<EventsSyncResult> }) {
  const [events, setEvents] = useState<EventView[]>([]);
  const [windowDays, setWindowDays] = useState<number>(365);
  const [filter, setFilter] = useState<string>("all");
  const [country, setCountry] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("opportunity");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncLog, setSyncLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const url = new URL("/api/tools/events/upcoming", window.location.origin);
    url.searchParams.set("days", String(windowDays));
    url.searchParams.set("limit", "200");
    url.searchParams.set("sort", sort);
    if (filter !== "all") url.searchParams.set("category", filter);
    if (country !== "all") url.searchParams.set("country", country);

    const res = await fetch(url.toString());
    if (res.ok) {
      const json = (await res.json()) as EventsResponse;
      setEvents(json.events ?? []);
      setTotal(json.meta?.total ?? json.events?.length ?? 0);
      setLastSyncedAt(json.meta?.last_synced_at ?? null);
    }
    setLoading(false);
  }, [country, filter, sort, windowDays]);

  useEffect(() => { void load(); }, [load]);

  async function triggerSync() {
    if (!sync) return;
    setSyncing(true);
    setSyncLog(["⏳ 檢查本月快取…"]);
    setShowLog(true);
    try {
      const json = await sync();
      setSyncLog(json.log ?? [`Done — ${json.upserted ?? 0} upserted`]);
      void load();
    } catch (err) {
      setSyncLog([`Error: ${String(err)}`]);
    } finally {
      setSyncing(false);
    }
  }

  const grouped = useMemo(() => {
    const groups = new Map<string, EventView[]>();
    for (const event of events) {
      const group = sort === "date" ? event.event_date.slice(0, 7) : "推薦排序";
      groups.set(group, [...(groups.get(group) ?? []), event]);
    }
    return [...groups.entries()];
  }, [events, sort]);

  return (
    <div style={{ padding: 20, maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>🌍 全球活動行事曆</h1>
        {sync && <button className="btn-secondary" style={{ fontSize: 12, marginLeft: "auto" }} onClick={triggerSync} disabled={syncing}>
          {syncing ? "⏳ 檢查中…" : "🔄 本月更新"}
        </button>}
        {syncLog.length > 0 && (
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowLog(v => !v)}>
            {showLog ? "▲ 隱藏 log" : "▼ 看 log"}
          </button>
        )}
      </div>

      {showLog && (
        <pre style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 6, padding: 10, fontSize: 11, maxHeight: 220, overflowY: "auto", marginBottom: 12 }}>
          {syncLog.join("\n")}
        </pre>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 12 }}>
        <select className="btn-secondary" value={windowDays} onChange={e => setWindowDays(Number(e.target.value))}>
          {WINDOWS.map(w => <option key={w.key} value={w.days}>{w.label}</option>)}
        </select>
        <select className="btn-secondary" value={filter} onChange={e => setFilter(e.target.value)}>
          {FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <select className="btn-secondary" value={country} onChange={e => setCountry(e.target.value)}>
          <option value={EVENT_ALL_COUNTRIES_FILTER.value}>{EVENT_ALL_COUNTRIES_FILTER.label}</option>
          {EVENT_COUNTRY_FILTER_GROUPS.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </optgroup>
          ))}
        </select>
        <select className="btn-secondary" value={sort} onChange={e => setSort(e.target.value as SortMode)}>
          <option value="opportunity">依商品機會</option>
          <option value="date">依時間</option>
        </select>
      </div>

      <p style={{ fontSize: 12, opacity: 0.55, marginTop: 0, marginBottom: 12 }}>
        顯示 {events.length} / {total} 筆；快取每月更新一次{lastSyncedAt ? `，最後同步 ${lastSyncedAt.slice(0, 10)}` : ""}。
      </p>

      {loading ? (
        <p style={{ opacity: 0.5 }}>載入中…</p>
      ) : events.length === 0 ? (
        <p style={{ opacity: 0.5 }}>此篩選暫無活動。</p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {grouped.map(([group, rows]) => (
            <section key={group}>
              <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.65, marginBottom: 6 }}>{group}</div>
              <div style={{ display: "grid", gap: 8 }}>
                {rows.map(event => {
                  const countries = countryLabel(event);
                  const days = daysUntil(event.event_date);
                  return (
                    <div key={event.id} style={{ border: "1px solid var(--card-border)", borderRadius: 8, padding: "10px 14px", background: "var(--card-bg)", display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, overflowWrap: "anywhere" }}>
                          {event.emoji ?? "📅"} {event.title_zh ?? event.title}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                          {(event.facets ?? [event.category]).join(", ")}{countries ? ` · ${countries}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, fontSize: 12 }}>
                        <div style={{ fontWeight: 700 }}>🗓 {event.event_date}</div>
                        <div style={{ opacity: 0.6, marginTop: 2 }}>{days >= 0 ? `${days} 天後` : "進行中"}</div>
                        <div style={{ marginTop: 4 }}>分數 {event.opportunity_score ?? 0}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
