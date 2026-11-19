// /ops/costs — AI & 工具成本
// Server component: loads ai_call_logs ONCE and derives every money figure from those rows through
// lib/ai/spend-report.ts, so 月報, 真實花費 and 流水帳 cannot disagree. UI lives in CostsTabs.

import Link from "next/link";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { FREE_QUOTAS, INFRA_MONTHLY, TWD_RATE } from "@/lib/ai/cost-model";
import { loadFreeQuotaUsage } from "@/lib/ai/free-quota";
import { FreeQuotaCard } from "./FreeQuotaCard";
import { CodexQuotaCard } from "./CodexQuotaCard";
import { loadCodexImageUsage } from "@/lib/ai/codex-usage";
import { loadOrgNames, loadSpendRows } from "@/lib/ai/spend-loader";
import { loadFxDaily, loadFxRates } from "@/lib/ai/fx-loader";
import { buildFxTable } from "@/lib/ai/fx-rates";
import { loadVendorInvoices } from "@/lib/ai/vendor-invoices-loader";
import {
  groupLedger, liveSpend, monthlyReports, rowsSince, summarizeSpend, taipeiDayStartIso, taipeiMonth, taipeiMonthStartIso,
  type SpendRow,
} from "@/lib/ai/spend-report";
import { CostsTabs, type CostsData } from "./CostsTabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI & 工具成本 · Ops" };

/** 流水帳 and the 真實花費 daily chart cover the same 30 Taipei days; 月報 covers the current Taipei month plus the 11 before it. */
const WINDOW_DAYS = 30;
const REPORT_MONTHS = 12;
/** 流水帳 lists at most this many groups; its total still covers every row in the window. */
const LEDGER_GROUPS_SHOWN = 300;

async function loadCosts(): Promise<CostsData> {
  const now = new Date();
  const windowSince = taipeiDayStartIso(now, WINDOW_DAYS - 1);
  // Spike baselines look 14 days further back than the 30 shown.
  const historySince = taipeiDayStartIso(now, WINDOW_DAYS - 1 + 14);
  const empty = summarizeSpend([]);
  const base: CostsData = {
    windowDays: WINDOW_DAYS, window: empty, live: liveSpend([], now), ledger: [], ledgerGroupCount: 0, months: [], orgNames: {}, fxRows: [], invoiceRows: [],
  };
  const supabase = getSupabaseWriteClient();
  if (!supabase) return { ...base, note: "Supabase service-role 未設定 — 無法讀取真實花費。" };

  const reportSince = taipeiMonthStartIso(now, REPORT_MONTHS - 1);
  const since = reportSince < historySince ? reportSince : historySince;
  const load = await loadSpendRows(supabase, since);
  const orgNames = await loadOrgNames(supabase, load.rows);
  // 月報 converts each month at its own accounting rate (lib/ai/fx-rates.ts); read once for every month shown.
  const fxSince = `${taipeiMonth(reportSince)}-01`; // reportSince is a UTC instant: 16:00Z on the day before the 1st
  // Vendor bills (FX2 對帳): the last 13 months, same window as the API's GET.
  const invoiceSince = `${taipeiMonth(taipeiMonthStartIso(now, 12))}-01`;
  const [fxManual, fxDaily, invoices] = await Promise.all([
    loadFxRates(supabase, fxSince), loadFxDaily(supabase, fxSince), loadVendorInvoices(supabase, invoiceSince),
  ]);

  const windowRows = rowsSince(load.rows, windowSince);
  const groups = groupLedger(windowRows);
  // The ledger is shipped to the client for expansion; metadata is not shown, so leave it server-side.
  const ledger = groups.slice(0, LEDGER_GROUPS_SHOWN).map((g) => ({
    ...g, rows: g.rows.map((r): SpendRow => ({ ...r, metadata: null })),
  }));

  const notes: string[] = [];
  if (load.error) notes.push(`ai_call_logs 讀取失敗：${load.error}（下列數字只含已讀到的 ${load.rows.length} 筆）`);
  // A failed read is carried into the table: those months show 不可入帳 instead of a wrong rate (fx-rates.ts rateFor).
  if (fxManual.error) notes.push(`fx_rates 讀取失敗：${fxManual.error}（月報 NT$ 暫以參考價 ${TWD_RATE} 計，不可入帳）`);
  if (fxDaily.error) notes.push(`fx_daily_rates 讀取失敗：${fxDaily.error}（沒有人工匯率的月份不可入帳）`);
  if (invoices.error) notes.push(`vendor_invoices 讀取失敗：${invoices.error}（對帳表暫不可用，不顯示為尚未登錄）`);
  if (load.truncated) notes.push(`資料超過讀取上限，只讀到前 ${load.rows.length} 筆 — 總額偏低。`);

  return {
    note: notes.length ? notes.join(" ") : undefined,
    windowDays: WINDOW_DAYS,
    window: summarizeSpend(windowRows),
    live: liveSpend(load.rows, now),
    ledger,
    ledgerGroupCount: groups.length,
    months: monthlyReports(rowsSince(load.rows, reportSince), buildFxTable(fxManual.rows, fxDaily.rows, { manual: fxManual.error, daily: fxDaily.error })),
    orgNames,
    fxRows: fxManual.rows,
    invoiceRows: invoices.rows,
    invoiceError: invoices.error,
  };
}

export default async function CostsPage() {
  const data = await loadCosts();
  const supabase = getSupabaseWriteClient();
  const quotaUsage = supabase
    ? await loadFreeQuotaUsage(supabase, new Date())
    : FREE_QUOTAS.map((quota) => ({ quota, used: null }));
  const codexUsage = supabase ? await loadCodexImageUsage(supabase, new Date()) : { last24h: null, last7d: null, latest: null };
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
            報價匯率 {TWD_RATE}（cost-model.ts）；會計匯率見月報（央行月平均，可人工覆蓋）
          </span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          月報 · 真實花費（即時監控）· 流水帳（近 {WINDOW_DAYS} 天） · 單價費率表 · 月費試算 · AI 模型比較
          <Link href="/ops/clients" style={{ color: "var(--accent-text)", marginLeft: 12 }}>→ Clients</Link>
          <Link href="/tools/image-gen" style={{ color: "var(--accent-text)", marginLeft: 12 }}>→ Image Gen</Link>
        </p>
      </div>

      <FreeQuotaCard usage={quotaUsage} />
      <CodexQuotaCard usage={codexUsage} />
      <CostsTabs data={data} monthlyInfraUsd={monthlyInfraUsd} />
    </div>
  );
}
