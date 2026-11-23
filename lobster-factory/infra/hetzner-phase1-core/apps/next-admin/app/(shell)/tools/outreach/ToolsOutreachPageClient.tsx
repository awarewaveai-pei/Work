'use client';
import { useCallback, useEffect, useState } from "react";
import { useActiveOrg, withOrg } from "@/lib/outreach/use-active-org";
import { statsToCsv, type StatsRow } from "@/lib/outreach/stats";

// Cold Outreach 成效 (SPEC §5.9, card C7.2): one table per service × version × angle, reply and positive rate, CSV.
// No open rate: it is not measured. The date range is three visible buttons (最近 7／30 天、全部), no dropdown.
const RANGES = [{ days: 7, label: "最近 7 天" }, { days: 30, label: "最近 30 天" }, { days: 0, label: "全部" }] as const;
const API = "/api/outreach/stats";
const day = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(d);
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);
const COLS: Array<{ key: keyof StatsRow; label: string }> = [
  { key: "generated", label: "產生" }, { key: "drafted", label: "草稿" }, { key: "sent", label: "寄出" }, { key: "bounced", label: "退信" },
  { key: "replied", label: "回覆" }, { key: "positive", label: "正向回覆" }, { key: "meeting_booked", label: "約到會議" },
  { key: "customer", label: "成交" }, { key: "lost", label: "失去" },
];

export default function OutreachStatsPage() {
  const org = useActiveOrg();
  const [days, setDays] = useState<number>(30);
  const [rows, setRows] = useState<StatsRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = withOrg(API, org);
      const from = days ? `${base.includes("?") ? "&" : "?"}from=${day(new Date(Date.now() - (days - 1) * 86_400_000))}` : "";
      const r = await fetch(`${base}${from}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "載入失敗");
      setRows(j.rows as StatsRow[]); setTruncated(!!j.truncated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [org, days]);

  useEffect(() => { void load(); }, [load]);

  function download() {
    const url = URL.createObjectURL(new Blob([statsToCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `outreach-stats-${day(new Date())}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const cellStyle = { padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap" } as const;
  const textCell = { ...cellStyle, textAlign: "left" } as const;

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">成效</span>
        <span className="topbar-env">哪個服務、哪一版、哪個切角有人回</span>
      </div>
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <p className="card-sub">依「服務 × 版本 × 切角」統計你這段期間產生的信。回覆率＝回覆 ÷ 寄出；正向回覆率＝（有興趣、問價格、要更多資料、要看案例）÷ 寄出。沒有開信率：我們不追蹤開信。</p>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {RANGES.map((r) => (
            <button key={r.days} type="button" className={days === r.days ? "btn-primary" : "btn-secondary"} aria-pressed={days === r.days}
              disabled={loading} onClick={() => setDays(r.days)}>{r.label}</button>
          ))}
          <button type="button" className="btn-secondary" disabled={loading || rows.length === 0} onClick={download}>下載 CSV</button>
        </span>
        {error && <div className="card-badge badge-red" role="alert">{error}</div>}
        {truncated && <div className="card-badge badge-yellow">資料超過 10,000 封，只統計最早的 10,000 封；請縮短期間。</div>}
        {loading && rows.length === 0 ? <div className="card-sub">載入中…</div> : rows.length === 0 ? (
          <div className="card"><p className="card-sub">這段期間還沒有產生任何信。</p></div>
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={textCell}>服務</th><th style={textCell}>版本</th><th style={textCell}>切角</th>
                  {COLS.map((c) => <th key={c.key} style={cellStyle}>{c.label}</th>)}
                  <th style={cellStyle}>回覆率</th><th style={cellStyle}>正向回覆率</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.service_profile_id}|${r.variant_label}|${r.angle}`}>
                    <td style={textCell}>{r.service_name}</td><td style={textCell}>{r.variant_label}</td><td style={textCell}>{r.angle}</td>
                    {COLS.map((c) => <td key={c.key} style={cellStyle}>{r[c.key] as number}</td>)}
                    <td style={cellStyle}>{pct(r.reply_rate)}</td><td style={cellStyle}>{pct(r.positive_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
