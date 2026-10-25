// /ops/billing — read-only (ADR 017 step 4): totals over every billing account and the accounts that need a person,
// one page at a time (0127 billing_attention through lib/entitlements/tables.ts). An account's detail is the 帳務 tab
// on /ops/clients/<slug>; finding any client is the client list's search. Nothing here writes.
import Link from "next/link";
import { billingAttention, type AttentionReason, type BillingAttention } from "@/lib/entitlements/tables";
import { when } from "../clients/[slug]/BillingTab";

export const dynamic = "force-dynamic";
export const metadata = { title: "帳務 · Ops" };

const PAGE = 50;
const LAST_PAGE = 1_000_000;   // keeps the offset inside int4; far past any real page
const REASON: Record<AttentionReason, { label: string; why: string }> = {
  frozen: { label: "錢包凍結", why: "拒付審查中，不能扣點也不能加點" },
  overdrawn: { label: "透支", why: "餘額是負的" },
  past_due: { label: "合約逾期", why: "付款失敗或拒付" },
  suspended: { label: "功能暫停", why: "拒付審查中" },
};

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "12px 16px" };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", borderBottom: "1px solid var(--card-border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "var(--text-primary)", borderBottom: "1px solid var(--card-border)" };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };
const tag: React.CSSProperties = { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "var(--badge-red-bg)", color: "var(--badge-red-text)", marginRight: 6, whiteSpace: "nowrap" };

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div style={{ ...card, minWidth: 150 }}>
      <div style={muted}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>{value.toLocaleString("zh-TW")}</div>
      {note ? <div style={muted}>{note}</div> : null}
    </div>
  );
}

export default async function BillingPage({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
  const sp = searchParams ? await searchParams : {};
  const page = Math.min(LAST_PAGE, Math.max(1, Math.floor(Number(sp.page)) || 1));
  let data: BillingAttention | null = null;
  let failure: string | null = null;
  try {
    data = await billingAttention(PAGE, (page - 1) * PAGE);
  } catch (error) {
    failure = String(error instanceof Error ? error.message : error);
  }
  const pages = data ? Math.max(1, Math.ceil(data.totals.attention / PAGE)) : 1;
  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px" }}>帳務</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, maxWidth: 900 }}>
          上面是全部帳戶的合計，下面只列需要有人處理的帳戶。要看某個客戶的合約、點數和付款：到<Link href="/ops/clients" style={{ color: "var(--accent-text)" }}>客戶</Link>搜尋名字，開「帳務」分頁。這頁只看不改。
        </p>
      </div>

      {failure ? (
        <div style={{ ...card, border: "1px solid var(--red)", fontSize: 13, color: "var(--text-primary)" }}>讀不到帳務資料：{failure}</div>
      ) : data ? (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
            <Stat label="客戶未用點數" value={data.totals.unused_units} note={`${data.totals.unused_accounts.toLocaleString("zh-TW")} 個帳戶`} />
            {(Object.keys(REASON) as AttentionReason[]).map((r) => <Stat key={r} label={REASON[r].label} value={data.totals[r]} note={REASON[r].why} />)}
          </div>
          <div style={{ ...muted, marginBottom: 20 }}>給會計：未用點數記在合約負債（預收），用掉才轉營收。自用帳戶不算，透支的帳戶不會抵掉別人的餘額。</div>

          <h2 style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 8px" }}>
            需要處理 <span style={muted}>{data.totals.attention.toLocaleString("zh-TW")} 個帳戶</span>
          </h2>
          {data.rows.length ? (
            <div style={{ ...card, padding: 0, overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={th}>帳戶</th><th style={th}>狀況</th><th style={th}>點數餘額</th><th style={th}>凍結起</th></tr></thead>
                <tbody>{data.rows.map((a) => (
                  <tr key={a.organization_id}>
                    <td style={td}>
                      <Link href={`/ops/clients/${encodeURIComponent(a.slug)}?tab=${encodeURIComponent("帳務")}`} style={{ color: "var(--accent-text)", fontWeight: 700 }}>{a.name}</Link>
                      <span style={{ ...muted, marginLeft: 8 }}>{a.slug}{a.kind === "internal" ? " · 自用" : ""}</span>
                    </td>
                    <td style={td}>{a.reasons.map((r) => <span key={r} style={tag}>{REASON[r]?.label ?? r}</span>)}</td>
                    <td style={td}>{a.balance.toLocaleString("zh-TW")}</td>
                    <td style={td}>{when(a.frozen_since)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div style={muted}>{page > 1 ? "這一頁沒有帳戶。" : "沒有需要處理的帳戶。"}</div>}

          {pages > 1 ? (
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, fontSize: 13 }}>
              {page > 1 ? <Link href={`/ops/billing?page=${page - 1}`} style={{ color: "var(--accent-text)" }}>上一頁</Link> : null}
              <span style={muted}>第 {page} / {pages} 頁</span>
              {page < pages ? <Link href={`/ops/billing?page=${page + 1}`} style={{ color: "var(--accent-text)" }}>下一頁</Link> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
