import type { CodexImageUsage } from "@/lib/ai/codex-usage";
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

/** Codex 免費生圖 — pictures drawn on the operator's laptop with her ChatGPT plan, and how much of the plan is used. */
export function CodexQuotaCard({ usage }: { usage: CodexImageUsage }) {
  const n = (v: number | null) => (v === null ? "讀取失敗" : `${v} 張`);
  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, marginBottom: 20, padding: "12px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
          Codex 免費生圖
          <span style={{ fontWeight: 500, color: "var(--text-muted)", marginLeft: 8 }}>用 ChatGPT Plus 的 Codex 額度畫，不另外付錢</span>
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>近 24 小時 {n(usage.last24h)} · 近 7 天 {n(usage.last7d)}</span>
      </div>
      <CodexLaptopButton variant="page" />
      {usage.latest ? (
        <>
          <Bar label="5 小時額度" pct={usage.latest.pct5h} resets={usage.latest.resets5h} />
          <Bar label="每週額度" pct={usage.latest.pctWeek} resets={usage.latest.resetsWeek} />
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 8 }}>
            讀數來自最近一張圖（{new Date(usage.latest.at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })}），額度也算到你自己用 Codex 寫程式的部分。
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>還沒有用 Codex 畫過圖。</div>
      )}
      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 6 }}>
        實測（2026-11-15，Plus）：1 張用掉 5 小時額度的 5–12%、每週額度約 1%，所以 5 小時內約 8–20 張。額度用完時筆電上的程式會停下，不會改扣儲值點數。
      </div>
    </div>
  );
}
