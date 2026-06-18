// /ops/costs — AI & 工具成本
// Server component: loads real spend from Supabase, delegates all UI to CostsTabs (client).

import Link from "next/link";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { imageCostUsd } from "@/lib/ai/cost-calculator";
import { IMAGE_RATES, INFRA_MONTHLY, TWD_RATE } from "@/lib/ai/cost-model";
import { CostsTabs, type RealSpend } from "./CostsTabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI & 工具成本 · Ops" };

interface CallRow { route: string; model: string; vendor: string | null; cost_usd: number; input_tokens: number; output_tokens: number }
interface JobRow { model_name: string; provider: string | null }

async function loadRealSpend(): Promise<RealSpend> {
  const empty: RealSpend = { available: false, textByRoute: [], textUsd: 0, textCalls: 0, imageByModel: [], imageUsd: 0, imageCount: 0 };
  const supabase = getSupabaseWriteClient();
  if (!supabase) return { ...empty, note: "Supabase service-role 未設定 — 無法讀取真實花費。" };

  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString();

  const { data: calls, error: callErr } = await supabase
    .from("ai_call_logs")
    .select("route,model,vendor,cost_usd,input_tokens,output_tokens")
    .gte("created_at", since)
    .limit(100000);

  const { data: jobs } = await supabase
    .from("ai_image_jobs")
    .select("model_name,provider")
    .eq("status", "completed")
    .gte("created_at", since)
    .limit(100000);

  const textMap = new Map<string, { calls: number; usd: number; inTok: number; outTok: number }>();
  for (const c of (calls ?? []) as CallRow[]) {
    const e = textMap.get(c.route) ?? { calls: 0, usd: 0, inTok: 0, outTok: 0 };
    e.calls += 1; e.usd += Number(c.cost_usd) || 0;
    e.inTok += c.input_tokens || 0; e.outTok += c.output_tokens || 0;
    textMap.set(c.route, e);
  }
  const textByRoute = [...textMap.entries()].map(([route, v]) => ({ route, ...v })).sort((a, b) => b.usd - a.usd);

  const imgMap = new Map<string, number>();
  for (const j of (jobs ?? []) as JobRow[]) {
    const m = j.model_name || "unknown";
    imgMap.set(m, (imgMap.get(m) ?? 0) + 1);
  }
  const imageByModel = [...imgMap.entries()]
    .map(([model, count]) => ({ model, count, usd: imageCostUsd(model) * count }))
    .sort((a, b) => b.usd - a.usd);

  return {
    available: !callErr || imageByModel.length > 0,
    note: callErr ? "ai_call_logs 表尚未套用 (migration 0043) 或尚無文字呼叫記錄；圖片量來自既有 ai_image_jobs。" : undefined,
    textByRoute,
    textUsd: textByRoute.reduce((s, r) => s + r.usd, 0),
    textCalls: textByRoute.reduce((s, r) => s + r.calls, 0),
    imageByModel,
    imageUsd: imageByModel.reduce((s, r) => s + r.usd, 0),
    imageCount: imageByModel.reduce((s, r) => s + r.count, 0),
  };
}

export default async function CostsPage() {
  const real = await loadRealSpend();
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
          真實花費（近 30 天）· 單價費率表 · 月費試算 · AI 模型比較
          <Link href="/ops/clients" style={{ color: "var(--accent)", marginLeft: 12 }}>→ Clients</Link>
          <Link href="/tools/image-gen" style={{ color: "var(--accent)", marginLeft: 12 }}>→ Image Gen</Link>
        </p>
      </div>

      <CostsTabs real={real} monthlyInfraUsd={monthlyInfraUsd} />
    </div>
  );
}
