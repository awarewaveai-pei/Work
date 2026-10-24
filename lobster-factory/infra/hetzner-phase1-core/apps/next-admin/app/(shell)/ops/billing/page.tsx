// /ops/billing — read-only (ADR 017 step 4): per billing account its contracts, grants, wallet balance, last ledger
// entries and last payment events. One call to 0120 billing_overview through lib/entitlements/tables.ts; nothing here
// writes. Payments are recorded through POST /api/webhooks/payments/<provider>.
import { billingOverview, type BillingAccount } from "@/lib/entitlements/tables";
import { unusedCustomerCredits } from "@/lib/entitlements/billing-summary";

export const dynamic = "force-dynamic";
export const metadata = { title: "帳務 · Ops" };

const th: React.CSSProperties = { textAlign: "left", padding: "6px 10px", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", borderBottom: "1px solid var(--card-border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "6px 10px", fontSize: 13, color: "var(--text-primary)", borderBottom: "1px solid var(--card-border)", verticalAlign: "top" };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };
const h3: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", margin: "14px 0 6px" };
const badge = (bg: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: bg, color: "var(--btn-primary-text)" });

const CONTRACT: Record<string, string> = { trial: "試用", active: "有效", past_due: "逾期", canceled: "已取消" };
const GRANT: Record<string, string> = { active: "可用", suspended: "暫停（拒付審查中）", ended: "已到期，今晚標記" };
const ENTRY: Record<string, string> = { grant: "加點", debit: "扣點", refund: "退點", adjustment: "調整" };
const PAYMENT: Record<string, string> = {
  subscription_paid: "訂閱付款", subscription_canceled: "取消訂閱", credit_pack: "點數包", refund: "退款",
  chargeback: "拒付", chargeback_cleared: "拒付審查完成",
};

const when = (iso: string | null) => iso
  ? new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
  : "—";

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (!rows.length) return <div style={muted}>沒有</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{head.map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={td}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Account({ a }: { a: BillingAccount }) {
  return (
    <section style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>{a.name}</h2>
        <span style={muted}>{a.slug}</span>
        {a.kind === "internal" ? <span style={badge("var(--accent)")}>自用</span> : null}
        {a.hold ? <span style={badge("var(--red)")}>錢包凍結：{a.hold.reason}，{when(a.hold.since)} 起</span> : null}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
        點數餘額 <b style={{ color: "var(--text-primary)" }}>{a.balance.toLocaleString("zh-TW")}</b>
        {a.all_features ? <> · 全部功能都開（{a.all_features.source === "comp" ? "贈送" : "合約"}）{a.all_features.note ? `：${a.all_features.note}` : ""}</> : null}
      </div>

      <h3 style={h3}>合約</h3>
      <Table head={["產品", "方案", "狀態", "開始", "本期到", "付款來源"]} rows={a.contracts.map((c) => [
        c.product_key, c.plan_key, CONTRACT[c.status] ?? c.status, when(c.started_at), when(c.current_period_end), <span key="r" style={muted}>{c.source_ref ?? "—"}</span>,
      ])} />

      <h3 style={h3}>權利（每列＝同一來源的一組功能）</h3>
      <Table head={["產品", "來源", "狀態", "功能數", "可用到"]} rows={a.grants.map((g) => [
        g.product_key, <span key="s">{g.source === "comp" ? "贈送" : "合約"} <span style={muted}>{g.source_ref ?? ""}</span></span>,
        GRANT[g.state] ?? g.state, g.features, g.ends_at ? when(g.ends_at) : "不到期",
      ])} />
      {a.expired_grants ? <div style={{ ...muted, marginTop: 4 }}>另有 {a.expired_grants} 列已結束（保留作紀錄）。</div> : null}

      <h3 style={h3}>點數帳本（最近 20 筆）</h3>
      <Table head={["時間", "種類", "點數", "原因"]} rows={a.ledger.map((l) => [
        when(l.at), ENTRY[l.entry_type] ?? l.entry_type, l.units > 0 ? `+${l.units}` : String(l.units),
        <span key="r" style={muted}>{[l.reference_type, l.reference_id].filter(Boolean).join(" · ") || "—"}</span>,
      ])} />

      <h3 style={h3}>付款紀錄（最近 10 筆）</h3>
      <Table head={["收到", "來源", "編號", "事件", "結果"]} rows={a.payments.map((p) => [
        when(p.at), p.provider === "local" ? "人工登記" : p.provider, <span key="e" style={muted}>{p.event_id}</span>, PAYMENT[p.kind] ?? p.kind,
        <span key="r" style={muted}>{p.result ? JSON.stringify(Object.fromEntries(Object.entries(p.result).filter(([k]) => !["ok", "event", "kind"].includes(k)))) : "處理中"}</span>,
      ])} />
    </section>
  );
}

export default async function BillingPage() {
  let accounts: BillingAccount[] = [];
  let failure: string | null = null;
  try {
    accounts = await billingOverview();
  } catch (error) {
    failure = String(error instanceof Error ? error.message : error);
  }
  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px" }}>帳務</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, maxWidth: 900 }}>
          每個付費帳戶一張卡：合約、能用的功能、點數餘額、最近的帳本和付款。這頁只看不改。例：客戶轉帳買了 500 點，登記後這裡的餘額多 500，付款紀錄多一列「點數包」。
        </p>
      </div>
      {!failure && accounts.length ? (() => {
        const unused = unusedCustomerCredits(accounts);
        return (
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "var(--text-secondary)" }}>
            客戶未用點數合計 <b style={{ color: "var(--text-primary)", fontSize: 15 }}>{unused.units.toLocaleString("zh-TW")}</b> 點（{unused.accounts} 個帳戶）
            <div style={{ ...muted, marginTop: 2 }}>給會計：這是還沒用掉的點數，記在合約負債（預收）；用掉才轉營收。自用帳戶不算。</div>
          </div>
        );
      })() : null}
      {failure ? (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--red)", borderRadius: 12, padding: 16, fontSize: 13, color: "var(--text-primary)" }}>
          讀不到帳務資料：{failure}
        </div>
      ) : accounts.length ? accounts.map((a) => <Account key={a.organization_id} a={a} />) : <div style={muted}>還沒有任何帳戶有合約、權利或點數。</div>}
    </div>
  );
}
