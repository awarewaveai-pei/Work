// One account's contracts, grants, wallet, last ledger entries and last payment events (ADR 017 step 4; 0127
// billing_account): the 帳務 tab on the client hub and the account panel on /ops/billing. Read-only; both pages fetch it
// server-side, the hub only when the staff member may use ops/billing (hub-tab-tools.ts). Payments are recorded
// through POST /api/webhooks/payments/<provider>.
import type { ReactNode } from "react";
import type { BillingAccount } from "@/lib/entitlements/tables";
import { Card, NoData, Tag } from "./hub-ui";

export type BillingTabData = { account: BillingAccount | null; error: string | null };

const th: React.CSSProperties = { textAlign: "left", padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "6px 10px", fontSize: 12, color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)", verticalAlign: "top" };
const muted: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)" };

export const CONTRACT: Record<string, string> = { trial: "試用", active: "有效", past_due: "逾期", canceled: "已取消" };
const GRANT: Record<string, string> = { active: "可用", suspended: "暫停（拒付審查中）", ended: "已到期，今晚標記" };
const ENTRY: Record<string, string> = { grant: "加點", debit: "扣點", refund: "退點", adjustment: "調整" };
export const PAYMENT: Record<string, string> = {
  subscription_paid: "訂閱付款", subscription_canceled: "取消訂閱", credit_pack: "點數包", refund: "退款",
  chargeback: "拒付", chargeback_cleared: "拒付審查完成",
};

const when = (iso: string | null) => iso
  ? new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
  : "—";

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return <NoData>沒有</NoData>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{head.map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={td}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function BillingTab({ data, slug }: { data: BillingTabData; slug: string }) {
  if (data.error) return <Card title="帳務"><NoData>讀不到帳務資料：{data.error}</NoData></Card>;
  const a = data.account;
  if (!a) return <Card title="帳務"><NoData>找不到這個客戶的帳戶。</NoData></Card>;
  return (
    <div>
      <Card title="錢包" badge={a.slug !== slug ? `帳務記在上層帳戶 ${a.name}` : undefined}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, color: "var(--text-secondary)" }}>
          點數餘額 <b style={{ color: "var(--text-primary)", fontSize: 15 }}>{a.balance.toLocaleString("zh-TW")}</b>
          {a.kind === "internal" ? <Tag tone="accent">自用</Tag> : null}
          {a.hold ? <Tag tone="red">錢包凍結：{a.hold.reason}，{when(a.hold.since)} 起</Tag> : null}
          {a.all_features ? <span>全部功能都開（{a.all_features.source === "comp" ? "贈送" : "合約"}）{a.all_features.note ? `：${a.all_features.note}` : ""}</span> : null}
        </div>
      </Card>

      <Card title="合約">
        <Table head={["產品", "方案", "狀態", "開始", "本期到", "付款來源"]} rows={a.contracts.map((c) => [
          c.product_key, c.plan_key, CONTRACT[c.status] ?? c.status, when(c.started_at), when(c.current_period_end), <span key="r" style={muted}>{c.source_ref ?? "—"}</span>,
        ])} />
      </Card>

      <Card title="權利" badge="每列＝同一來源的一組功能">
        <Table head={["產品", "來源", "狀態", "功能數", "可用到"]} rows={a.grants.map((g) => [
          g.product_key, <span key="s">{g.source === "comp" ? "贈送" : "合約"} <span style={muted}>{g.source_ref ?? ""}</span></span>,
          GRANT[g.state] ?? g.state, g.features, g.ends_at ? when(g.ends_at) : "不到期",
        ])} />
        {a.expired_grants ? <div style={{ ...muted, marginTop: 6 }}>另有 {a.expired_grants} 列已結束（保留作紀錄）。</div> : null}
      </Card>

      <Card title="點數帳本" badge="最近 20 筆">
        <Table head={["時間", "種類", "點數", "原因"]} rows={a.ledger.map((l) => [
          when(l.at), ENTRY[l.entry_type] ?? l.entry_type, l.units > 0 ? `+${l.units}` : String(l.units),
          <span key="r" style={muted}>{[l.reference_type, l.reference_id].filter(Boolean).join(" · ") || "—"}</span>,
        ])} />
      </Card>

      <Card title="付款紀錄" badge="最近 10 筆">
        <Table head={["收到", "來源", "編號", "事件", "結果"]} rows={a.payments.map((p) => [
          when(p.at), p.provider === "local" ? "人工登記" : p.provider, <span key="e" style={muted}>{p.event_id}</span>, PAYMENT[p.kind] ?? p.kind,
          <span key="r" style={muted}>{p.result ? JSON.stringify(Object.fromEntries(Object.entries(p.result).filter(([k]) => !["ok", "event", "kind"].includes(k)))) : "處理中"}</span>,
        ])} />
      </Card>
    </div>
  );
}
