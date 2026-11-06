import type { QuotaUsage } from "@/lib/ai/free-quota";

/** 免費額度 — how much of each free quota is used in its current window. A failed read says so; it is never shown as 0. */
export function FreeQuotaCard({ usage }: { usage: QuotaUsage[] }) {
  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)" }}>
        免費額度
        <span style={{ fontWeight: 500, color: "var(--text-muted)", marginLeft: 10 }}>只算經過這個系統的呼叫；額度用完時，供應商會拒絕或開始收費。</span>
      </div>
      {usage.map(({ quota, used }) => {
        const ratio = used === null ? 0 : Math.min(used / quota.limit, 1);
        const full = used !== null && used >= quota.limit;
        return (
          <div key={quota.id} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                {quota.label}
                <span style={{ fontWeight: 500, color: "var(--text-muted)", marginLeft: 8 }}>每{quota.period === "day" ? "天" : "月"} {quota.limit.toLocaleString()} 次</span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: used === null ? "var(--red)" : "var(--text-primary)" }}>
                {used === null ? "讀取失敗" : `已用 ${used.toLocaleString()} ／ ${quota.limit.toLocaleString()}`}
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--border-subtle)", margin: "8px 0", overflow: "hidden" }}>
              <div style={{ width: `${Math.round(ratio * 100)}%`, height: "100%", background: full ? "var(--red)" : ratio >= 0.8 ? "var(--yellow)" : "var(--accent)" }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {quota.usedFor}{quota.resetNote}。
            </div>
          </div>
        );
      })}
    </div>
  );
}
