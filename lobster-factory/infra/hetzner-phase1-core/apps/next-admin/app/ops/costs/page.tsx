// /ops/costs — AI & 工具成本會計
// Server component. Three layers (operator asked for 都要):
//   §A 真實花費 — exact text spend from ai_call_logs (migration 0043) + image volume×rate from
//                 ai_image_jobs, last 30 days. RLS deny-anon → read via service-role client.
//   §B 靜態費率表 — per-action unit cost from the cost-model SSOT (lib/ai/cost-model.ts).
//   §C 月費試算 — <CostEstimator/> client island (sliders).
//
// Sibling to /ops/clients in the ops management layer (cost accounting belongs here, not /tools).

import Link from "next/link";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { featureUnitCostUsd, imageCostUsd, usdToNtd } from "@/lib/ai/cost-calculator";
import { TEXT_FEATURES, IMAGE_RATES, TOOL_RATES, INFRA_MONTHLY, TWD_RATE } from "@/lib/ai/cost-model";
import { CostEstimator } from "./CostEstimator";

export const dynamic = "force-dynamic";

// Round on the NTD magnitude (not USD) — most per-call NTD costs are < NT$1 and would otherwise
// collapse to "NT$1"/"NT$0", hiding real sub-dollar spend.
const NT = (usd: number) => { const n = usdToNtd(usd); return `NT$${n.toLocaleString("zh-TW", { maximumFractionDigits: n < 1 ? 4 : 0 })}`; };
const USD = (usd: number) => `$${usd.toLocaleString("en-US", { maximumFractionDigits: usd < 0.1 ? 4 : 2 })}`;

interface CallRow { route: string; model: string; vendor: string | null; cost_usd: number; input_tokens: number; output_tokens: number }
interface JobRow { model_name: string; provider: string | null }

interface RealSpend {
  available: boolean;
  note?: string;
  textByRoute: { route: string; calls: number; usd: number; inTok: number; outTok: number }[];
  textUsd: number;
  textCalls: number;
  imageByModel: { model: string; count: number; usd: number }[];
  imageUsd: number;
  imageCount: number;
}

async function loadRealSpend(): Promise<RealSpend> {
  const empty: RealSpend = { available: false, textByRoute: [], textUsd: 0, textCalls: 0, imageByModel: [], imageUsd: 0, imageCount: 0 };
  const supabase = getSupabaseWriteClient();
  if (!supabase) return { ...empty, note: "Supabase service-role 未設定 — 無法讀取真實花費。" };

  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString();

  // Text spend — exact, from ai_call_logs (migration 0043). Table may not exist yet on this DB.
  const { data: calls, error: callErr } = await supabase
    .from("ai_call_logs")
    .select("route,model,vendor,cost_usd,input_tokens,output_tokens")
    .gte("created_at", since)
    .limit(100000);

  // Image volume — from ai_image_jobs (counts only; cost computed from the rate table). Only
  // status='completed' bills as a real image — failed/cancelled/queued/running produced no image
  // and must not be costed (else the dominant cost line is systematically overstated).
  const { data: jobs } = await supabase
    .from("ai_image_jobs")
    .select("model_name,provider")
    .eq("status", "completed")
    .gte("created_at", since)
    .limit(100000);

  const textMap = new Map<string, { calls: number; usd: number; inTok: number; outTok: number }>();
  for (const c of (calls ?? []) as CallRow[]) {
    const e = textMap.get(c.route) ?? { calls: 0, usd: 0, inTok: 0, outTok: 0 };
    e.calls += 1;
    e.usd += Number(c.cost_usd) || 0;
    e.inTok += c.input_tokens || 0;
    e.outTok += c.output_tokens || 0;
    textMap.set(c.route, e);
  }
  const textByRoute = [...textMap.entries()].map(([route, v]) => ({ route, ...v })).sort((a, b) => b.usd - a.usd);
  const textUsd = textByRoute.reduce((s, r) => s + r.usd, 0);
  const textCalls = textByRoute.reduce((s, r) => s + r.calls, 0);

  const imgMap = new Map<string, number>();
  for (const j of (jobs ?? []) as JobRow[]) {
    const m = j.model_name || "unknown";
    imgMap.set(m, (imgMap.get(m) ?? 0) + 1);
  }
  const imageByModel = [...imgMap.entries()]
    .map(([model, count]) => ({ model, count, usd: imageCostUsd(model) * count }))
    .sort((a, b) => b.usd - a.usd);
  const imageUsd = imageByModel.reduce((s, r) => s + r.usd, 0);
  const imageCount = imageByModel.reduce((s, r) => s + r.count, 0);

  // ai_call_logs missing (migration not applied) surfaces as a Postgres error; ai_image_jobs is
  // pre-existing so image data can show even when text logs are absent.
  const textAvailable = !callErr;
  return {
    available: textAvailable || imageByModel.length > 0,
    note: callErr ? "ai_call_logs 表尚未套用 (migration 0043) 或尚無文字呼叫記錄；圖片量來自既有 ai_image_jobs。" : undefined,
    textByRoute,
    textUsd,
    textCalls,
    imageByModel,
    imageUsd,
    imageCount,
  };
}

export default async function CostsPage() {
  const real = await loadRealSpend();
  const monthlyInfraUsd = INFRA_MONTHLY.reduce((s, i) => s + i.usdPerMonth, 0);

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>AI &amp; 工具成本</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          真實花費（近 30 天）、單價費率表、月費試算。匯率 USD→NT$ = {TWD_RATE}（單一來源 cost-model.ts）。
          <Link href="/tools/ai-models" style={{ color: "var(--accent)", marginLeft: 10 }}>→ 模型能力比較</Link>
        </p>
      </div>

      {/* §A 真實花費 */}
      <Section title="① 真實花費 — 近 30 天">
        {real.note && (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", padding: "10px 14px", borderRadius: 8, fontSize: 12.5, marginBottom: 14 }}>
            ⚠️ {real.note}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
          <BigStat label="文字 AI 實扣" usd={real.textUsd} sub={`${real.textCalls.toLocaleString()} 次呼叫（精準 token）`} />
          <BigStat label="圖片 (量×費率)" usd={real.imageUsd} sub={`${real.imageCount.toLocaleString()} 張`} />
          <BigStat label="合計 (不含基建)" usd={real.textUsd + real.imageUsd} sub="文字實扣 + 圖片估算" highlight />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <RealTextTable rows={real.textByRoute} />
          <RealImageTable rows={real.imageByModel} />
        </div>
      </Section>

      {/* §B 靜態費率表 */}
      <Section title="② 單價費率表 (per-action)">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Text per-call unit cost */}
          <RateTable
            title="文字功能（每次呼叫，依典型 token）"
            head={["功能", "模型", "單價 NT$", "單價 USD"]}
            rows={TEXT_FEATURES.map((f) => {
              const u = featureUnitCostUsd(f);
              return [f.label, f.model.replace("claude-", "").replace("-20251001", ""), NT(u), USD(u)];
            })}
          />
          {/* Image per-image */}
          <RateTable
            title="圖片（每張）"
            head={["模型", "廠商", "每張 NT$", "每張 USD"]}
            rows={Object.entries(IMAGE_RATES).map(([, r]) => [r.label, r.vendor, NT(r.usd), USD(r.usd)])}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          {/* Tools */}
          <RateTable
            title="編修工具（每次）"
            head={["工具", "廠商", "每次 NT$", "每次 USD"]}
            rows={Object.values(TOOL_RATES).map((t) => [t.label + (t.estimate ? " ※估算" : ""), t.vendor, NT(t.usd), USD(t.usd)])}
          />
          {/* Infra */}
          <div style={{ background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between" }}>
              <span>基建月費 baseline</span>
              <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{NT(monthlyInfraUsd)} / 月</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <tbody>
                {INFRA_MONTHLY.map((i) => (
                  <tr key={i.key} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "8px 16px", color: "var(--text-primary)" }}>
                      {i.label}
                      {i.estimate && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#92400e", background: "#fef3c7", padding: "1px 5px", borderRadius: 4 }}>估算</span>}
                      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>{i.note}</div>
                    </td>
                    <td style={{ padding: "8px 16px", textAlign: "right", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{NT(i.usdPerMonth)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12, lineHeight: 1.7 }}>
          ※ 基建月費 repo 無記錄，目前為估算值（cost-model.ts <code>INFRA_MONTHLY</code>）；查 Hetzner / Cloudflare console 後改為實際帳單數字並把 <code>estimate</code> 設 false。
          編修工具為 Replicate 依運算秒計費，標 ※估算 者為典型單次推估。
        </p>
      </Section>

      {/* §C 月費試算 */}
      <Section title="③ 月費試算 (滑桿)">
        <CostEstimator />
      </Section>

      <div style={{ marginTop: 28, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
        <strong>資料來源：</strong>文字＝<code>ai_call_logs</code>（每次回應的精準 token × 費率，migration 0043）；圖片量＝<code>ai_image_jobs</code>。
        單價 SSOT＝<code>lib/ai/cost-model.ts</code>。報表 CLI：<code>scripts/report-app-costs.ps1</code>。
        <Link href="/ops/clients" style={{ color: "var(--accent)", marginLeft: 8 }}>→ Clients</Link>
      </div>
    </div>
  );
}

// ── helpers (server-safe) ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>{title}</h2>
      {children}
    </section>
  );
}

function BigStat({ label, usd, sub, highlight }: { label: string; usd: number; sub: string; highlight?: boolean }) {
  return (
    <div style={{ background: highlight ? "var(--accent)" : "#fff", color: highlight ? "#fff" : "var(--text-primary)", border: highlight ? "none" : "1px solid var(--border-subtle)", borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 12, opacity: highlight ? 0.85 : 0.7, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800 }}>{NT(usd)}</div>
      <div style={{ fontSize: 12, opacity: highlight ? 0.9 : 0.65, marginTop: 2 }}>{USD(usd)} · {sub}</div>
    </div>
  );
}

function RealTextTable({ rows }: { rows: { route: string; calls: number; usd: number; inTok: number; outTok: number }[] }) {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)" }}>文字 AI 實扣（依 route）</div>
      {rows.length === 0 ? (
        <div style={{ padding: "20px 16px", fontSize: 12.5, color: "var(--text-muted)" }}>尚無記錄。產生內容後此處顯示精準 token 花費。</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
            <th style={{ padding: "8px 16px", fontWeight: 600 }}>Route</th>
            <th style={{ padding: "8px 16px", fontWeight: 600, textAlign: "right" }}>次數</th>
            <th style={{ padding: "8px 16px", fontWeight: 600, textAlign: "right" }}>tokens (in/out)</th>
            <th style={{ padding: "8px 16px", fontWeight: 600, textAlign: "right" }}>花費 NT$</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.route} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td style={{ padding: "8px 16px", color: "var(--text-primary)", fontFamily: "monospace", fontSize: 11 }}>{r.route}</td>
                <td style={{ padding: "8px 16px", textAlign: "right", color: "var(--text-secondary)" }}>{r.calls.toLocaleString()}</td>
                <td style={{ padding: "8px 16px", textAlign: "right", color: "var(--text-secondary)", fontSize: 11 }}>{(r.inTok / 1000).toFixed(0)}k/{(r.outTok / 1000).toFixed(0)}k</td>
                <td style={{ padding: "8px 16px", textAlign: "right", fontWeight: 600 }}>{NT(r.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RealImageTable({ rows }: { rows: { model: string; count: number; usd: number }[] }) {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)" }}>圖片生成量（依模型，量×費率）</div>
      {rows.length === 0 ? (
        <div style={{ padding: "20px 16px", fontSize: 12.5, color: "var(--text-muted)" }}>近 30 天無圖片生成記錄。</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
            <th style={{ padding: "8px 16px", fontWeight: 600 }}>模型</th>
            <th style={{ padding: "8px 16px", fontWeight: 600, textAlign: "right" }}>張數</th>
            <th style={{ padding: "8px 16px", fontWeight: 600, textAlign: "right" }}>費用 NT$</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.model} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td style={{ padding: "8px 16px", color: "var(--text-primary)" }}>{IMAGE_RATES[r.model]?.label ?? r.model}</td>
                <td style={{ padding: "8px 16px", textAlign: "right", color: "var(--text-secondary)" }}>{r.count.toLocaleString()}</td>
                <td style={{ padding: "8px 16px", textAlign: "right", fontWeight: 600 }}>{NT(r.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RateTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)" }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
          {head.map((h, i) => <th key={h} style={{ padding: "8px 16px", fontWeight: 600, textAlign: i === 0 ? "left" : "right" }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              {r.map((cell, ci) => (
                <td key={ci} style={{ padding: "8px 16px", textAlign: ci === 0 ? "left" : "right", color: ci === 0 ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: ci === r.length - 2 ? 600 : 400 }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
