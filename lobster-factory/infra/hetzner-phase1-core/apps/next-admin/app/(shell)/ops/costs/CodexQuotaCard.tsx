import type { SubscriptionUsage, SiteMonthRow } from "@/lib/ai/codex-usage";
import type { subWorkerStatus } from "@/lib/tarot/codex-bridge";
import { CodexLaptopButton } from "../../../CodexLaptopButton";

const twTime = (unixS: number) =>
  new Date(unixS * 1000).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

function Bar({ label, pct, resets }: { label: string; pct: number | null; resets: number | null }) {
  const ratio = pct === null ? 0 : Math.min(pct / 100, 1);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--text-primary)" }}>
        <span style={{ fontWeight: 700 }}>{label}</span>
        <span style={{ fontWeight: 700 }}>
          {pct === null ? "沒有讀數" : `已用 ${pct}%`}
          {resets !== null && <span style={{ fontWeight: 500, color: "var(--text-muted)", marginLeft: 8 }}>{twTime(resets)} 重設</span>}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--border-subtle)", marginTop: 6, overflow: "hidden" }}>
        <div style={{ width: `${Math.round(ratio * 100)}%`, height: "100%", background: ratio >= 1 ? "var(--red)" : ratio >= 0.8 ? "var(--yellow)" : "var(--accent)" }} />
      </div>
    </div>
  );
}

type Workers = ReturnType<typeof subWorkerStatus>;
const LANES: { id: keyof Workers; label: string }[] = [{ id: "owner", label: "本人按（筆電）" }, { id: "schedule", label: "排程（主機）" }];
const TOOL_LABEL = { codex: "Codex", claude: "Claude" } as const;
const card = { background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, marginBottom: 20, padding: "12px 16px" } as const;
const cell = { padding: "6px 8px", fontSize: 12.5, color: "var(--text-primary)", textAlign: "right" } as const;

/** 訂閱用量 — pictures and text made on the ChatGPT / Claude plans (NT$0), how much of the plan is used, whether each lane is online,
 *  and per site this month: articles on 訂閱 vs API (API 花費 in NT$). A null count = the read failed. */
export function CodexQuotaCard({ usage, workers, siteMonth }: { usage: SubscriptionUsage; workers: Workers; siteMonth: SiteMonthRow[] | null }) {
  const n = (v: number | null, unit: string) => (v === null ? "讀不到" : `${v} ${unit}`);
  const line = (label: string, c: { last24h: number | null; last7d: number | null }, unit: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-primary)", marginTop: 6 }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span style={{ fontWeight: 700 }}>近 24 小時 {n(c.last24h, unit)} · 近 7 天 {n(c.last7d, unit)}</span>
    </div>
  );
  return (
    <div style={card}>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
        訂閱用量
        <span style={{ fontWeight: 500, color: "var(--text-muted)", marginLeft: 8 }}>用 ChatGPT／Claude 訂閱的額度做，每次 NT$0</span>
      </span>
      {line("Codex 畫圖", usage.images, "張")}
      {line("Codex 寫文字", usage.textCodex, "篇")}
      {line("Claude 寫文字", usage.textClaude, "篇")}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 10, fontSize: 12.5, color: "var(--text-primary)" }}>
        {LANES.map(({ id, label }) => {
          const w = workers[id];
          return (
            <div key={id}>
              <span style={{ fontWeight: 700 }}>{label}：</span>{w.online ? "在線" : "離線"}
              {w.online && <span style={{ color: "var(--text-muted)" }}>（{w.tools.length ? w.tools.map((t) => TOOL_LABEL[t]).join("、") : "沒有可用的工具"}）</span>}
              {(Object.entries(w.quotaBlockedUntil) as [keyof typeof TOOL_LABEL, number][]).map(([t, until]) => (
                <span key={t} style={{ color: "var(--red)", marginLeft: 8 }}>{TOOL_LABEL[t]} 額度用完，{twTime(until / 1000)} 恢復</span>
              ))}
            </div>
          );
        })}
      </div>
      <CodexLaptopButton variant="page" />
      {usage.latest ? (
        <>
          <Bar label="Codex 5 小時額度" pct={usage.latest.pct5h} resets={usage.latest.resets5h} />
          <Bar label="Codex 每週額度" pct={usage.latest.pctWeek} resets={usage.latest.resetsWeek} />
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 8 }}>
            讀數來自最近一次 Codex 工作（{new Date(usage.latest.at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })}），額度也算到你自己用 Codex 寫程式的部分。Claude 不回報額度百分比。
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>還沒有 Codex 額度讀數（沒做過 Codex 的工作，或讀取失敗）。</div>
      )}
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginTop: 14 }}>每站本月文章：訂閱／API</div>
      {siteMonth === null ? (
        <div style={{ fontSize: 12, color: "var(--red)", marginTop: 6 }}>讀不到</div>
      ) : siteMonth.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>本月還沒有文章。</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
          <thead>
            <tr style={{ fontSize: 12, color: "var(--text-muted)" }}>
              <th style={{ ...cell, textAlign: "left", fontWeight: 600 }}>網站</th>
              <th style={{ ...cell, fontWeight: 600 }}>訂閱（篇）</th>
              <th style={{ ...cell, fontWeight: 600 }}>API（篇）</th>
              <th style={{ ...cell, fontWeight: 600 }}>API 花費</th>
            </tr>
          </thead>
          <tbody>
            {siteMonth.map((r) => (
              <tr key={r.siteId ?? "none"} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td style={{ ...cell, textAlign: "left", fontWeight: 600 }}>{r.name}</td>
                <td style={cell}>{r.sub}</td>
                <td style={cell}>{r.api}</td>
                <td style={cell}>NT${Math.round(r.apiTwd).toLocaleString("zh-TW")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
