"use client";
// 點數與合約 view. A member (authorized person) gets only balance and end date: the sections below are not rendered for
// them at all (not hidden), so the response's role, not CSS, decides what the page contains (ADR 021 D5, assumption A4).
import { useCallback, useEffect, useState } from "react";
import { PRODUCTS } from "@/lib/portal/products";

type Account = {
  ok: true;
  role: "manager" | "member";
  balance: number;
  frozen: boolean;
  next_period_end: string | null;
  contracts?: { product_key: string; plan_key: string; status: string; current_period_end: string | null }[];
  grants?: { product_key: string; source: string; state: string; features: number; ends_at: string | null }[];
  ledger?: { at: string; units: number; entry_type: string }[];
};
type Tab = "points" | "contracts" | "ledger";

const TABS: { key: Tab; label: string }[] = [{ key: "points", label: "點數" }, { key: "contracts", label: "合約" }, { key: "ledger", label: "紀錄" }];
const CONTRACT: Record<string, string> = { trial: "試用", active: "有效", past_due: "逾期", canceled: "已取消" };
const ENTRY: Record<string, string> = { grant: "加點", debit: "扣點", refund: "退點", adjustment: "調整" };
const productName = (key: string) => PRODUCTS.find((p) => p.key === key)?.name ?? key;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }) : "—");
const when = (iso: string) => new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const nt = (n: number) => `NT$${n.toLocaleString("zh-TW")}`;

const th: React.CSSProperties = { textAlign: "left", padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "6px 10px", fontSize: 12.5, color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)" };

export function WalletView({ topUpUrl }: { topUpUrl: string }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("points");

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/portal/api/account", { cache: "no-store" });
      const body = (await res.json()) as Account | { ok: false };
      if (!res.ok || !body.ok) throw new Error("account");
      setAccount(body);
    } catch {
      setAccount(null);
      setFailed(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const manager = account?.role === "manager";
  const shown = manager ? tab : "points";

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 16px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>點數與合約</h1>
      {failed && (
        <div role="alert">
          <p style={{ fontSize: 13.5, color: "var(--badge-red-text)", marginBottom: 12 }}>讀取失敗，請重新整理再試一次。</p>
          <button type="button" className="btn-primary" onClick={() => void load()}>重新整理</button>
        </div>
      )}
      {!failed && !account && <p style={{ fontSize: 13.5, color: "var(--text-muted)" }}>讀取中…</p>}
      {account && (
        <>
          {manager && (
            <div role="tablist" aria-label="點數與合約" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {TABS.map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "btn-primary" : "btn-secondary"} onClick={() => setTab(t.key)}>{t.label}</button>
              ))}
            </div>
          )}
          {account.frozen && (
            <p style={{ fontSize: 13.5, color: "var(--badge-red-text)", marginBottom: 12 }}>你的帳戶有一筆付款正在確認，確認完成前暫時不能使用點數。</p>
          )}
          {shown === "points" && (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>點數餘額</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{account.balance.toLocaleString("zh-TW")}</div>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 12px" }}>1 點＝NT$1，約 {nt(account.balance)}。每次依實際用量扣點。</p>
              <p style={{ fontSize: 12.5, marginBottom: manager ? 12 : 0 }}>本期到：{day(account.next_period_end)}</p>
              {manager && <a href={topUpUrl} className="btn-primary">儲值（回 aware-wave.com）</a>}
            </div>
          )}
          {manager && shown === "contracts" && (
            <div className="card" style={{ padding: 20, overflowX: "auto" }}>
              {account.contracts?.length ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>產品</th><th style={th}>狀態</th><th style={th}>本期到</th></tr></thead>
                  <tbody>
                    {account.contracts.map((c) => (
                      <tr key={`${c.product_key}:${c.plan_key}`}><td style={td}>{productName(c.product_key)}</td><td style={td}>{CONTRACT[c.status] ?? c.status}</td><td style={td}>{day(c.current_period_end)}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p style={{ fontSize: 13.5, color: "var(--text-muted)" }}>目前沒有合約。</p>}
            </div>
          )}
          {manager && shown === "ledger" && (
            <div className="card" style={{ padding: 20, overflowX: "auto" }}>
              {account.ledger?.length ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>時間</th><th style={th}>種類</th><th style={th}>點數</th></tr></thead>
                  <tbody>
                    {account.ledger.map((l, i) => (
                      <tr key={i}><td style={td}>{when(l.at)}</td><td style={td}>{ENTRY[l.entry_type] ?? l.entry_type}</td><td style={td}>{l.units > 0 ? `+${l.units}` : l.units}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p style={{ fontSize: 13.5, color: "var(--text-muted)" }}>最近沒有使用紀錄。</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
