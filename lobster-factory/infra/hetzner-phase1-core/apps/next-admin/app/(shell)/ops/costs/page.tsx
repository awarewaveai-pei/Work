// /ops/costs — AI & 工具成本
// Server component: loads ai_call_logs ONCE and derives every money figure from those rows through
// lib/ai/spend-report.ts, so 月報, 真實花費 and 流水帳 cannot disagree. UI lives in CostsTabs.

import Link from "next/link";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { INFRA_MONTHLY, TWD_RATE } from "@/lib/ai/cost-model";
import { loadOrgNames, loadSpendRows } from "@/lib/ai/spend-loader";
import {
  groupLedger, monthlyReports, rowsSince, summarizeSpend, taipeiMonthStartIso,
  type SpendRow,
} from "@/lib/ai/spend-report";
import { CostsTabs, type CostsData } from "./CostsTabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI & 工具成本 · Ops" };

/** 真實花費 and 流水帳 share this window; 月報 covers the current Taipei month plus the 11 before it. */
const WINDOW_DAYS = 30;
const REPORT_MONTHS = 12;
/** 流水帳 lists at most this many groups; its total still covers every row in the window. */
const LEDGER_GROUPS_SHOWN = 300;

async function loadCosts(): Promise<CostsData> {
  const now = new Date();
  const windowSince = new Date(now.getTime() - WINDOW_DAYS * 86400 * 1000).toISOString();
  const empty = summarizeSpend([]);
  const base: CostsData = {
    windowDays: WINDOW_DAYS, window: empty, ledger: [], ledgerGroupCount: 0, months: [], orgNames: {},
  };
  const supabase = getSupabaseWriteClient();
  if (!supabase) return { ...base, note: "Supabase service-role 未設定 — 無法讀取真實花費。" };

  const reportSince = taipeiMonthStartIso(now, REPORT_MONTHS - 1);
  const since = reportSince < windowSince ? reportSince : windowSince;
  const load = await loadSpendRows(supabase, since);
  const orgNames = await loadOrgNames(supabase, load.rows);

  const windowRows = rowsSince(load.rows, windowSince);
  const groups = groupLedger(windowRows);
  // The ledger is shipped to the client for expansion; metadata is not shown, so leave it server-side.
  const ledger = groups.slice(0, LEDGER_GROUPS_SHOWN).map((g) => ({
    ...g, rows: g.rows.map((r): SpendRow => ({ ...r, metadata: null })),
  }));

  const notes: string[] = [];
  if (load.error) notes.push(`ai_call_logs 讀取失敗：${load.error}（下列數字只含已讀到的 ${load.rows.length} 筆）`);
  if (load.truncated) notes.push(`資料超過讀取上限，只讀到前 ${load.rows.length} 筆 — 總額偏低。`);

  return {
    note: notes.length ? notes.join(" ") : undefined,
    windowDays: WINDOW_DAYS,
    window: summarizeSpend(windowRows),
    ledger,
    ledgerGroupCount: groups.length,
    months: monthlyReports(rowsSince(load.rows, reportSince)),
    orgNames,
  };
}

export default async function CostsPage() {
  const data = await loadCosts();
  const monthlyInfraUsd = INFRA_MONTHLY.reduce((s, i) => s + i.usdPerMonth, 0);

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px" }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
            AI &amp; 工具成本
          </h1>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
            匯率 USD→NT$ = {TWD_RATE} · SSOT: cost-model.ts
          </span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          月報 · 真實花費（近 {WINDOW_DAYS} 天）· 流水帳 · 單價費率表 · 月費試算 · AI 模型比較
          <Link href="/ops/clients" style={{ color: "var(--accent)", marginLeft: 12 }}>→ Clients</Link>
          <Link href="/tools/image-gen" style={{ color: "var(--accent)", marginLeft: 12 }}>→ Image Gen</Link>
        </p>
      </div>

      <CostsTabs data={data} monthlyInfraUsd={monthlyInfraUsd} />
    </div>
  );
}
