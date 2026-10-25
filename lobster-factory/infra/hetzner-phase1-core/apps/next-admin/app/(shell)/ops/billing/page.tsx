// /ops/billing — the ledger of every billing account, read-only (ADR 017 step 4; 0130 billing_ledger through
// lib/entitlements/tables.ts): totals, then one page of accounts (filter, search, 50 a page), each row readable without
// opening it; ?account=<id> opens that account's detail (0127 billing_account) on this page. Nothing here writes.
import Link from "next/link";
import { billingAccount, billingLedger, LEDGER_FILTERS, type AttentionReason, type BillingAccount, type BillingLedger, type LedgerFilter } from "@/lib/entitlements/tables";
import { BillingTab, CONTRACT, PAYMENT } from "../clients/[slug]/BillingTab";

export const dynamic = "force-dynamic";
export const metadata = { title: "帳務 · Ops" };

const PAGE = 50;
const LAST_PAGE = 1_000_000;   // keeps the offset inside int4; far past any real page
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILTER: Record<LedgerFilter, string> = { all: "全部", attention: "需要處理", balance: "有餘額", contract: "有合約", internal: "自用" };
const REASON: Record<AttentionReason, string> = { frozen: "錢包凍結", overdrawn: "透支", past_due: "合約逾期", suspended: "功能暫停" };

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "12px 16px" };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", borderBottom: "1px solid var(--card-border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "var(--text-primary)", borderBottom: "1px solid var(--card-border)", verticalAlign: "top" };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };
const tag: React.CSSProperties = { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "var(--badge-red-bg)", color: "var(--badge-red-text)", marginRight: 6, whiteSpace: "nowrap" };
const link: React.CSSProperties = { color: "var(--accent-text)" };

const n = (v: number) => v.toLocaleString("zh-TW");
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }) : "—";

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div style={{ ...card, minWidth: 150 }}>
      <div style={muted}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>{n(value)}</div>
      {note ? <div style={muted}>{note}</div> : null}
    </div>
  );
}

type Params = { f?: string; q?: string; page?: string; account?: string };
type RawParams = Partial<Record<keyof Params, string | string[]>>;

export default async function BillingPage({ searchParams }: { searchParams?: Promise<RawParams> }) {
  const raw = searchParams ? await searchParams : {};
  // A repeated key (?q=a&q=b) arrives as an array: the first one counts.
  const sp: Params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const filter: LedgerFilter = (LEDGER_FILTERS as readonly string[]).includes(sp.f ?? "") ? sp.f as LedgerFilter : "all";
  const query = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.min(LAST_PAGE, Math.max(1, Math.floor(Number(sp.page)) || 1));
  const href = (over: Partial<Params>) => {
    const p = new URLSearchParams();
    const v = { f: filter === "all" ? undefined : filter, q: query || undefined, page: page > 1 ? String(page) : undefined, ...over };
    for (const [k, x] of Object.entries(v)) if (x) p.set(k, x);
    const qs = p.toString();
    return `/ops/billing${qs ? `?${qs}` : ""}`;
  };

  let data: BillingLedger | null = null;
  let failure: string | null = null;
  let detail: { account: BillingAccount | null; error: string | null } | null = null;
  try {
    data = await billingLedger({ filter, query, limit: PAGE, offset: (page - 1) * PAGE });
  } catch (error) {
    failure = String(error instanceof Error ? error.message : error);
  }
  if (sp.account) {
    detail = UUID.test(sp.account)
      ? await billingAccount(sp.account).then((account) => ({ account, error: null }), (e: unknown) => ({ account: null, error: e instanceof Error ? e.message : String(e) }))
      : { account: null, error: null };
  }
  const pages = data ? Math.max(1, Math.ceil(data.matching / PAGE)) : 1;

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px" }}>帳務</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, maxWidth: 900 }}>
          全部帳戶的總帳。可用名稱、代號、成員 email、訂單或付款編號搜尋；點帳戶名稱，明細在這頁打開。這頁只看不改。
        </p>
      </div>

      {failure || !data ? (
        <div style={{ ...card, border: "1px solid var(--red)", fontSize: 13, color: "var(--text-primary)" }}>讀不到帳務資料：{failure}</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
            <Stat label="帳戶" value={data.totals.accounts} />
            <Stat label="客戶未用點數" value={data.totals.unused_units} note={`${n(data.totals.unused_accounts)} 個帳戶`} />
            <Stat label="近 30 天加點" value={data.totals.granted_30d} />
            <Stat label="近 30 天扣點" value={data.totals.spent_30d} />
            <Stat label="需要處理" value={data.totals.attention}
              note={(Object.keys(REASON) as AttentionReason[]).map((r) => `${REASON[r]} ${n(data.totals[r])}`).join(" · ")} />
          </div>
          <div style={{ ...muted, marginBottom: 20 }}>給會計：未用點數記在合約負債（預收），用掉才轉營收。自用帳戶不算，透支的帳戶不會抵掉別人的餘額。</div>

          {detail ? (
            <div style={{ ...card, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>{detail.account?.name ?? "帳戶明細"}</h2>
                <span style={{ fontSize: 13 }}>
                  {detail.account ? <Link href={`/ops/clients/${encodeURIComponent(detail.account.slug)}`} style={{ ...link, marginRight: 16 }}>客戶頁</Link> : null}
                  <Link href={href({ account: undefined })} style={link}>關閉</Link>
                </span>
              </div>
              <BillingTab data={detail} slug={detail.account?.slug ?? ""} />
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            {LEDGER_FILTERS.map((f) => (
              <Link key={f} href={href({ f: f === "all" ? undefined : f, page: undefined, account: undefined })} aria-current={f === filter ? "page" : undefined}
                style={{ fontSize: 13, padding: "6px 12px", borderRadius: 999, textDecoration: "none", border: "1px solid var(--card-border)",
                  background: f === filter ? "var(--accent)" : "var(--card-bg)", color: f === filter ? "var(--btn-primary-text)" : "var(--text-primary)" }}>
                {FILTER[f]}{f === "all" ? ` ${n(data.totals.accounts)}` : f === "attention" ? ` ${n(data.totals.attention)}` : ""}
              </Link>
            ))}
            <form method="get" action="/ops/billing" style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
              {filter !== "all" ? <input type="hidden" name="f" value={filter} /> : null}
              <input name="q" defaultValue={query} placeholder="名稱、代號、email、訂單或付款編號" aria-label="搜尋帳戶"
                style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--card-border)", background: "var(--form-input-bg)", color: "var(--text-primary)", minWidth: 280 }} />
              <button type="submit" className="btn-primary" style={{ fontSize: 13, padding: "6px 12px", borderRadius: 8 }}>搜尋</button>
            </form>
          </div>

          <div style={{ ...muted, marginBottom: 6 }}>
            {FILTER[filter]}{query ? `、符合「${query}」` : ""}：{n(data.matching)} 個帳戶
            {query ? <> · <Link href={href({ q: undefined, page: undefined })} style={link}>清除搜尋</Link></> : null}
          </div>
          {data.rows.length ? (
            <div style={{ ...card, padding: 0, overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>{["帳戶", "點數餘額", "近 30 天", "合約", "本期到", "最後付款", "狀況"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{data.rows.map((a) => (
                  <tr key={a.organization_id} style={a.organization_id === sp.account ? { background: "var(--accent-light)" } : undefined}>
                    <td style={td}>
                      <Link href={href({ account: a.organization_id })} style={{ ...link, fontWeight: 700 }}>{a.name}</Link>
                      <div style={muted}>{a.slug}{a.kind === "internal" ? " · 自用" : ""}</div>
                    </td>
                    <td style={{ ...td, fontWeight: 700 }}>{n(a.balance)}</td>
                    <td style={td}><span style={muted}>+{n(a.granted_30d)} / −{n(a.spent_30d)}</span></td>
                    <td style={td}>
                      {a.contracts.length ? a.contracts.slice(0, 2).map((c, i) => (
                        <div key={i}>{c.product_key} · {c.plan_key} <span style={muted}>{CONTRACT[c.status] ?? c.status}</span></div>
                      )) : <span style={muted}>—</span>}
                      {a.contracts.length > 2 ? <div style={muted}>另 {a.contracts.length - 2} 個</div> : null}
                    </td>
                    <td style={td}>{day(a.next_period_end)}</td>
                    <td style={td}>{a.last_payment ? <>{day(a.last_payment.at)} <span style={muted}>{PAYMENT[a.last_payment.kind] ?? a.last_payment.kind}</span></> : <span style={muted}>—</span>}</td>
                    <td style={td}>{a.reasons.length ? a.reasons.map((r) => <span key={r} style={tag}>{REASON[r] ?? r}</span>) : <span style={muted}>正常</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : page > pages ? (
            <div style={muted}>這一頁沒有帳戶。<Link href={href({ page: pages > 1 ? String(pages) : undefined })} style={link}>到最後一頁</Link></div>
          ) : <div style={muted}>沒有符合的帳戶。</div>}

          {pages > 1 && page <= pages ? (
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, fontSize: 13 }}>
              {page > 1 ? <Link href={href({ page: String(page - 1), account: undefined })} style={link}>上一頁</Link> : null}
              <span style={muted}>第 {n(page)} / {n(pages)} 頁</span>
              {page < pages ? <Link href={href({ page: String(page + 1), account: undefined })} style={link}>下一頁</Link> : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
