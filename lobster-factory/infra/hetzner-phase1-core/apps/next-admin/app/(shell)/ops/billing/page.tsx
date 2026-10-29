// /ops/billing — the ledger of every billing account, read-only (ADR 017 step 4; 0130 billing_ledger through
// lib/entitlements/tables.ts): a left sidebar lists one page of accounts (filter, search, 50 a page) the way /ops/clients
// lists clients; the right pane shows the totals and, with ?account=<id>, that account's detail (0127 billing_account).
// The sidebar is server-rendered links and a GET form, not ClientPanelNav: its search also matches member email and
// payment references, which only billing_ledger knows. Each account shows who sold it; ?seller=<uuid> keeps one seller's
// accounts, and the monthly table per seller is the wholesale report (0141, ADR 017 #12 D4). Nothing here writes.
import Link from "next/link";
import {
  billingAccount, billingLedger, billingSellerMonth, LEDGER_FILTERS, taipeiMonthStart,
  type AttentionReason, type BillingAccount, type BillingLedger, type LedgerFilter, type SellerMonth,
} from "@/lib/entitlements/tables";
import { BillingTab } from "../clients/[slug]/BillingTab";

export const dynamic = "force-dynamic";
export const metadata = { title: "帳務 · Ops" };

const PAGE = 50;
const LAST_PAGE = 1_000_000;   // keeps the offset inside int4; far past any real page
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILTER: Record<LedgerFilter, string> = { all: "全部", attention: "需要處理", balance: "有餘額", contract: "有合約", internal: "自用" };
const REASON: Record<AttentionReason, string> = { frozen: "錢包凍結", overdrawn: "透支", past_due: "合約逾期", suspended: "功能暫停" };

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "12px 16px" };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };
const tag: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "var(--badge-red-bg)", color: "var(--badge-red-text)", marginRight: 4, whiteSpace: "nowrap" };
const link: React.CSSProperties = { color: "var(--accent-text)" };
const nav: React.CSSProperties = { display: "flex", flexDirection: "column", width: 280, flexShrink: 0, background: "var(--bg-card)", borderRight: "1px solid var(--card-border)", height: "100%", overflow: "hidden" };

const n = (v: number) => v.toLocaleString("zh-TW");
const day = (iso: string) => new Date(iso).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div style={{ ...card, minWidth: 150 }}>
      <div style={muted}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>{n(value)}</div>
      {note ? <div style={muted}>{note}</div> : null}
    </div>
  );
}

type Params = { f?: string; q?: string; page?: string; account?: string; seller?: string };
type RawParams = Partial<Record<keyof Params, string | string[]>>;

export default async function BillingPage({ searchParams }: { searchParams?: Promise<RawParams> }) {
  const raw = searchParams ? await searchParams : {};
  // A repeated key (?q=a&q=b) arrives as an array: the first one counts.
  const sp: Params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const filter: LedgerFilter = (LEDGER_FILTERS as readonly string[]).includes(sp.f ?? "") ? sp.f as LedgerFilter : "all";
  const query = (sp.q ?? "").trim().slice(0, 80);
  const seller = sp.seller && UUID.test(sp.seller) ? sp.seller.toLowerCase() : undefined;
  const page = Math.min(LAST_PAGE, Math.max(1, Math.floor(Number(sp.page)) || 1));
  const selected = sp.account && UUID.test(sp.account) ? sp.account.toLowerCase() : undefined;   // rows carry lower-case ids
  // The open account stays open while the sidebar is filtered, searched or paged; only 關閉 drops it.
  const href = (over: Partial<Params>) => {
    const p = new URLSearchParams();
    const v = { f: filter === "all" || seller ? undefined : filter, seller, q: query || undefined, page: page > 1 ? String(page) : undefined, account: selected, ...over };
    for (const [k, x] of Object.entries(v)) if (x) p.set(k, x);
    const qs = p.toString();
    return `/ops/billing${qs ? `?${qs}` : ""}`;
  };

  let data: BillingLedger | null = null;
  let failure: string | null = null;
  let month: SellerMonth | null = null;
  let monthFailure: string | null = null;
  let detail: { account: BillingAccount | null; error: string | null } | null = null;
  try {
    data = await billingLedger({ filter, seller, query, limit: PAGE, offset: (page - 1) * PAGE });
  } catch (error) {
    failure = String(error instanceof Error ? error.message : error);
  }
  try {
    month = await billingSellerMonth(taipeiMonthStart());
  } catch (error) {
    monthFailure = String(error instanceof Error ? error.message : error);
  }
  if (sp.account) {
    detail = selected
      ? await billingAccount(selected).then((account) => ({ account, error: null }), (e: unknown) => ({ account: null, error: e instanceof Error ? e.message : String(e) }))
      : { account: null, error: null };
  }
  const pages = data ? Math.max(1, Math.ceil(data.matching / PAGE)) : 1;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg-canvas)" }}>
      <nav aria-label="客戶帳戶" style={nav}>
        <div style={{ padding: "12px 12px 8px", borderBottom: "1px solid var(--card-border)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 8 }}>客戶</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {LEDGER_FILTERS.map((f) => (
              <Link key={f} href={href({ f: f === "all" ? undefined : f, seller: undefined, page: undefined })} aria-current={f === filter && !seller ? "page" : undefined}
                style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, textDecoration: "none", border: "1px solid var(--card-border)",
                  background: f === filter && !seller ? "var(--accent)" : "var(--card-bg)", color: f === filter && !seller ? "var(--btn-primary-text)" : "var(--text-primary)" }}>
                {FILTER[f]}{data && f === "all" ? ` ${n(data.totals.accounts)}` : data && f === "attention" ? ` ${n(data.totals.attention)}` : ""}
              </Link>
            ))}
          </div>
          {month && month.rows.length > 1 ? (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
              <span style={{ ...muted, fontSize: 11 }}>賣家</span>
              {month.rows.map((s) => (
                <Link key={s.seller_id} href={href({ seller: s.seller_id === seller ? undefined : s.seller_id, f: undefined, page: undefined })}
                  aria-current={s.seller_id === seller ? "page" : undefined}
                  style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, textDecoration: "none", border: "1px solid var(--card-border)",
                    background: s.seller_id === seller ? "var(--accent)" : "var(--card-bg)", color: s.seller_id === seller ? "var(--btn-primary-text)" : "var(--text-primary)" }}>
                  {s.seller}
                </Link>
              ))}
            </div>
          ) : null}
          <form method="get" action="/ops/billing" style={{ display: "flex", gap: 4 }}>
            {filter !== "all" && !seller ? <input type="hidden" name="f" value={filter} /> : null}
            {seller ? <input type="hidden" name="seller" value={seller} /> : null}
            {selected ? <input type="hidden" name="account" value={selected} /> : null}
            <input name="q" defaultValue={query} placeholder="名稱、代號、email、訂單或付款編號" aria-label="搜尋帳戶"
              style={{ flex: 1, minWidth: 0, fontSize: 12, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--card-border)", background: "var(--form-input-bg)", color: "var(--text-primary)" }} />
            <button type="submit" className="btn-primary" style={{ fontSize: 12, padding: "6px 10px", borderRadius: 6 }}>搜尋</button>
          </form>
          {data ? (
            <div style={{ ...muted, fontSize: 11, marginTop: 6 }}>
              {seller ? `賣家：${month?.rows.find((s) => s.seller_id === seller)?.seller ?? seller}` : FILTER[filter]}{query ? `、符合「${query}」` : ""}：{n(data.matching)} 個帳戶
              {query ? <> · <Link href={href({ q: undefined, page: undefined })} style={link}>清除搜尋</Link></> : null}
            </div>
          ) : null}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
          {!data ? <div style={{ ...muted, padding: "12px 8px" }}>讀不到帳戶清單</div>
            : data.rows.length ? data.rows.map((a) => {
              const active = a.organization_id === selected;
              return (
                <Link key={a.organization_id} href={href({ account: a.organization_id })} aria-current={active ? "true" : undefined}
                  style={{ display: "block", padding: "7px 8px", borderRadius: 6, marginBottom: 1, textDecoration: "none", background: active ? "var(--accent-light)" : "transparent" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12,
                      color: active ? "var(--accent-text)" : "var(--text-primary)", fontWeight: active ? 700 : 400 }}>{a.name}</span>
                    <span title="點數餘額" style={{ fontSize: 12, fontWeight: 700, color: a.balance < 0 ? "var(--badge-red-text)" : "var(--text-primary)" }}>{n(a.balance)}</span>
                  </div>
                  <div style={{ ...muted, fontSize: 11, display: "flex", gap: 8 }}>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.slug}{a.kind === "internal" ? " · 自用" : ""} · 賣家：{a.sold_by ?? "—"}</span>
                    {/* the account's own 30-day totals live only here: the detail reads just its last 20 ledger rows */}
                    <span title="近 30 天加點 / 扣點" style={{ whiteSpace: "nowrap" }}>+{n(a.granted_30d)} / −{n(a.spent_30d)}</span>
                  </div>
                  {a.next_period_end || a.reasons.length ? (
                    <div style={{ marginTop: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2 }}>
                      {a.next_period_end ? <span style={{ ...muted, fontSize: 11, marginRight: 6 }}>本期到 {day(a.next_period_end)}</span> : null}
                      {a.reasons.map((r) => <span key={r} style={tag}>{REASON[r] ?? r}</span>)}
                    </div>
                  ) : null}
                </Link>
              );
            }) : page > pages ? (
              <div style={{ ...muted, padding: "12px 8px" }}>這一頁沒有帳戶。<Link href={href({ page: pages > 1 ? String(pages) : undefined })} style={link}>到最後一頁</Link></div>
            ) : <div style={{ ...muted, padding: "12px 8px" }}>沒有符合的帳戶。</div>}
        </div>

        {pages > 1 && page <= pages ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderTop: "1px solid var(--card-border)", fontSize: 12 }}>
            {page > 1 ? <Link href={href({ page: String(page - 1) })} style={link}>上一頁</Link> : <span />}
            <span style={muted}>第 {n(page)} / {n(pages)} 頁</span>
            {page < pages ? <Link href={href({ page: String(page + 1) })} style={link}>下一頁</Link> : <span />}
          </div>
        ) : null}
      </nav>

      <div style={{ flex: 1, overflowY: "auto", minWidth: 0, padding: "28px 32px" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px" }}>帳務</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, maxWidth: 900 }}>
            全部帳戶的總帳。左邊可用名稱、代號、成員 email、訂單或付款編號搜尋；點帳戶，明細在右邊打開。這頁只看不改。
          </p>
        </div>

        {failure || !data ? (
          <div style={{ ...card, border: "1px solid var(--red)", fontSize: 13, color: "var(--text-primary)", marginBottom: 20 }}>讀不到帳務資料：{failure}</div>
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
          </>
        )}

        <div style={{ ...card, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px" }}>本月各賣家合計{month ? `（${month.month}）` : ""}</h2>
          <div style={{ ...muted, marginBottom: 8 }}>
            月結用：每個賣家這個月（台北時間）收到的訂閱付款筆數與賣出的點數包。批發款在控制面外開發票，這裡不收款；退款沒有扣掉。
            月份看的是我們收到付款通知的時間，不是買家付款的時間：網站送不到時會重試最多約 3.5 天，所以月底最後幾天的付款可能算進下個月，開發票前請對一下網站的訂單日期。
          </div>
          {monthFailure || !month ? <div style={{ fontSize: 13, color: "var(--text-primary)" }}>讀不到賣家月合計：{monthFailure}</div> : (
            <table style={{ borderCollapse: "collapse", fontSize: 13, color: "var(--text-primary)" }}>
              <thead>
                <tr style={{ ...muted, textAlign: "left" }}>
                  <th style={{ padding: "4px 16px 4px 0" }}>賣家</th><th style={{ padding: "4px 16px" }}>訂閱付款筆數</th>
                  <th style={{ padding: "4px 16px" }}>點數包訂單</th><th style={{ padding: "4px 0 4px 16px" }}>點數合計</th>
                </tr>
              </thead>
              <tbody>
                {month.rows.map((s) => (
                  <tr key={s.seller_id}>
                    <td style={{ padding: "4px 16px 4px 0" }}><Link href={href({ seller: s.seller_id, f: undefined, page: undefined })} style={link}>{s.seller}</Link></td>
                    <td style={{ padding: "4px 16px" }}>{n(s.subscription_payments)}</td>
                    <td style={{ padding: "4px 16px" }}>{n(s.credit_pack_orders)}</td>
                    <td style={{ padding: "4px 0 4px 16px" }}>{n(s.credit_pack_units)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {detail ? (
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>{detail.account?.name ?? "帳戶明細"}</h2>
              <span style={{ fontSize: 13 }}>
                {detail.account ? <Link href={`/ops/clients/${encodeURIComponent(detail.account.slug)}?tab=${encodeURIComponent("帳務")}`} style={{ ...link, marginRight: 16 }}>客戶頁</Link> : null}
                <Link href={href({ account: undefined })} style={link}>關閉</Link>
              </span>
            </div>
            <BillingTab data={detail} slug={detail.account?.slug ?? ""} />
          </div>
        ) : (
          <div style={{ ...card, ...muted, fontSize: 13 }}>點左邊的帳戶，明細會在這裡打開。</div>
        )}
      </div>
    </div>
  );
}
