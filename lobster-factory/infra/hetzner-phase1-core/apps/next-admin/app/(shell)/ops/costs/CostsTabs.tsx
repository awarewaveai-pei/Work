"use client";

import { useState } from "react";
import { featureUnitCostUsd, usdToNtd } from "@/lib/ai/cost-calculator";
import { TEXT_FEATURES, IMAGE_RATES, TOOL_RATES, VIDEO_MOTION_RATES, INFRA_MONTHLY, TWD_RATE } from "@/lib/ai/cost-model";
import {
  spendKind, DAY_SPIKE_RATIO, ROUTE_SPIKE_RATIO,
  type LedgerGroup, type LiveSpend, type MonthReport, type SpendAnomaly, type SpendKind, type SpendSummary,
} from "@/lib/ai/spend-report";
import { CostEstimator } from "./CostEstimator";
import AiModelsClient from "@/app/(shell)/tools/ai-models/AiModelsClient";

// ── Types ──────────────────────────────────────────────────────────────────────

/** Everything money-related is derived server-side from one ai_call_logs row set (lib/ai/spend-report.ts). */
export interface CostsData {
  note?: string;
  windowDays: number;
  /** 流水帳 window totals (same 30 Taipei days as live.daily, so the two sums match). */
  window: SpendSummary;
  /** 真實花費 — live monitoring: pace, trend, anomalies. */
  live: LiveSpend;
  /** 流水帳 — newest groups first, capped for size; `ledgerGroupCount` is the uncapped count. */
  ledger: LedgerGroup[];
  ledgerGroupCount: number;
  /** 月報 — Asia/Taipei calendar months, newest first. */
  months: MonthReport[];
  orgNames: Record<string, string>;
}

interface Props {
  data: CostsData;
  monthlyInfraUsd: number;
}

type Tab = "spend" | "rates" | "estimator" | "models" | "ledger" | "monthly";

// ── Formatters ─────────────────────────────────────────────────────────────────

const NT = (usd: number) => {
  const n = usdToNtd(usd);
  return `NT$${n.toLocaleString("zh-TW", { maximumFractionDigits: n < 1 ? 4 : 0 })}`;
};
const USD = (usd: number) =>
  `$${usd.toLocaleString("en-US", { maximumFractionDigits: usd < 0.1 ? 4 : 2 })}`;

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  label, usd, sub, accent,
}: { label: string; usd: number; sub: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? "var(--accent)" : "var(--card-bg)",
      color: accent ? "var(--btn-primary-text)" : "var(--text-primary)",
      border: accent ? "none" : "1px solid var(--border-subtle)",
      borderRadius: 12, padding: "18px 20px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", opacity: accent ? 0.8 : 0.55 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{NT(usd)}</div>
      <div style={{ fontSize: 12, opacity: accent ? 0.85 : 0.6 }}>{USD(usd)} · {sub}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase",
      color: "var(--text-muted)", marginBottom: 12, paddingBottom: 8,
      borderBottom: "1px solid var(--border-subtle)",
    }}>{children}</div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--card-bg)", border: "1px solid var(--border-subtle)",
      borderRadius: 12, overflow: "hidden", ...style,
    }}>
      {children}
    </div>
  );
}

function CardHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{
      padding: "10px 16px", fontSize: 12.5, fontWeight: 700,
      color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)",
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <span>{title}</span>
      {right && <span style={{ fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>{right}</span>}
    </div>
  );
}

function Table({ head, rows, alignRight }: {
  head: string[];
  rows: (string | React.ReactNode)[][];
  alignRight?: number[];
}) {
  const ar = alignRight ?? head.map((_, i) => i > 0 ? i : -1).filter((i) => i >= 0);
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} style={{
              padding: "7px 14px", fontWeight: 600, fontSize: 11,
              color: "var(--text-muted)", textAlign: ar.includes(i) ? "right" : "left",
              background: "var(--bg-subtle)", borderBottom: "1px solid var(--border-subtle)",
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} style={{ borderTop: "1px solid var(--border-subtle)" }}>
            {r.map((cell, ci) => (
              <td key={ci} style={{
                padding: "8px 14px",
                textAlign: ar.includes(ci) ? "right" : "left",
                color: ci === 0 ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: ci === r.length - 1 ? 600 : 400,
              }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: "24px 16px", fontSize: 12.5, color: "var(--text-muted)", textAlign: "center" }}>
      {text}
    </div>
  );
}

// ── Spend tab ──────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<SpendKind, string> = { text: "文字", image: "圖片", video: "影片" };

function kindUsd(s: SpendSummary, k: SpendKind) {
  return s.byKind.find((b) => b.key === k) ?? { key: k, count: 0, usd: 0 };
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--build-risk-medium-bg)", border: "1px solid var(--yellow)",
      color: "var(--build-risk-medium-text)", padding: "10px 14px", borderRadius: 8, fontSize: 12.5,
    }}>
      ⚠️ {children}
    </div>
  );
}

/** Rows whose figure is not trustworthy — said out loud, never silently folded into a clean total. */
function QualityNotes({ s }: { s: SpendSummary }) {
  if (s.fallbackPricedCount === 0 && s.zeroCostCount === 0) return null;
  return (
    <Warn>
      {s.fallbackPricedCount > 0 && <>{s.fallbackPricedCount} 筆模型不在費率表，用預設費率估價（{NT(s.fallbackPricedUsd)}，可能不準）。</>}
      {s.zeroCostCount > 0 && <> {s.zeroCostCount} 筆記為 $0（沒有對應單價），實際花費可能沒算進來。</>}
    </Warn>
  );
}

function anomalyText(a: SpendAnomaly): string {
  switch (a.type) {
    case "day_spike":
      return `${a.day.slice(5)} 單日花費 ${NT(a.usd)}，是前 14 天中位數 ${NT(a.baselineUsd)} 的 ${DAY_SPIKE_RATIO} 倍以上。`;
    case "route_spike":
      return `今天 ${routeLabel(a.route)}（${KIND_LABEL[a.kind]}）已花 ${NT(a.usd)}，前 7 天平均每天 ${NT(a.baselineUsd)}（${ROUTE_SPIKE_RATIO} 倍以上）。`;
    case "fallback_priced":
      return `近 30 天 ${a.count} 筆模型不在費率表，用預設費率估價（${NT(a.usd)}，可能不準）。`;
    case "zero_cost":
      return `近 30 天 ${a.count} 筆記為 $0（沒有對應單價），實際花費可能沒算進來。`;
  }
}

function change(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? "新" : "—";
  const p = ((cur - prev) / prev) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(0)}%`;
}

function DailyChart({ live }: { live: LiveSpend }) {
  const max = Math.max(...live.daily.map((d) => d.usd), 0.0001);
  const spikeDays = new Set(live.anomalies.flatMap((a) => (a.type === "day_spike" ? [a.day] : [])));
  return (
    <div style={{ padding: "14px 16px 10px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}>
        {live.daily.map((d) => (
          <div
            key={d.day}
            title={`${d.day}：${NT(d.usd)}（${USD(d.usd)}，${d.count} 筆）`}
            style={{
              flex: 1, minWidth: 0, height: `${Math.max((d.usd / max) * 100, d.usd > 0 ? 2 : 0)}%`,
              background: spikeDays.has(d.day) ? "var(--red)" : "var(--accent)",
              borderRadius: "3px 3px 0 0", opacity: d.usd > 0 ? 1 : 0.2,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-muted)", marginTop: 6 }}>
        <span>{live.daily[0]?.day.slice(5)}</span>
        <span>最高 {NT(max)} / 天</span>
        <span>今天 {live.daily[live.daily.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  );
}

function SpendTab({ live, note }: { live: LiveSpend; note?: string }) {
  const vsPrev = live.prevMonth ? change(live.projectedMonthUsd, live.prevMonth.usd) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {note && <Warn>{note}</Warn>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <StatCard label="今天" usd={live.today.usd} sub={`${live.today.count.toLocaleString()} 筆`} />
        <StatCard label="近 7 天" usd={live.last7.usd} sub={`${live.last7.count.toLocaleString()} 筆`} />
        <StatCard label={`${live.month} 至今`} usd={live.monthToDate.usd} sub={`${live.monthToDate.count.toLocaleString()} 筆`} />
        <StatCard
          label="照目前速度，月底約"
          usd={live.projectedMonthUsd}
          sub={live.prevMonth ? `估算 · ${live.prevMonth.month} 整月 ${USD(live.prevMonth.usd)}（${vsPrev}）` : "估算 · 無上月資料可比"}
          accent
        />
      </div>

      <Card>
        <CardHead title="需要注意" right={live.anomalies.length === 0 ? "無" : `${live.anomalies.length} 項`} />
        {live.anomalies.length === 0
          ? <EmptyState text="近 7 天沒有花費暴增，近 30 天沒有估價可疑的記錄。" />
          : <div style={{ display: "flex", flexDirection: "column" }}>
              {live.anomalies.map((a, i) => (
                <div key={i} style={{ padding: "9px 16px", fontSize: 12.5, borderTop: i ? "1px solid var(--border-subtle)" : "none", color: "var(--text-primary)" }}>
                  <span style={{ color: a.type.endsWith("spike") ? "var(--red)" : "var(--yellow)", fontWeight: 700, marginRight: 8 }}>●</span>
                  {anomalyText(a)}
                </div>
              ))}
            </div>
        }
      </Card>

      <Card>
        <CardHead title="每日花費 — 近 30 天（台灣時間）" right={`合計 ${NT(live.last30.usd)} · ${live.last30.count.toLocaleString()} 筆 = 流水帳合計`} />
        <DailyChart live={live} />
      </Card>

      <Card>
        <CardHead title="近 7 天最花錢的功能 — 和再前 7 天比" />
        {live.topRoutes7.length === 0
          ? <EmptyState text="近 7 天尚無記錄。" />
          : <Table
              head={["功能", "類型", "次數", "近 7 天 NT$", "再前 7 天 NT$", "變化"]}
              rows={live.topRoutes7.map((r) => [
                routeLabel(r.route), KIND_LABEL[r.kind], r.count.toLocaleString(), NT(r.usd), NT(r.prevUsd), change(r.usd, r.prevUsd),
              ])}
            />
        }
      </Card>

      <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7, margin: 0 }}>
        這頁看「現在花多快、有沒有異常」；某個月的總帳、依廠商／客戶分項看「月報」，每一筆看「流水帳」。三頁同一份資料（<code>ai_call_logs</code>）。
        月底推估 = 本月至今 ÷ 本月已過的比例，只是速度估算。暴增判準：單日 ≥ 前 14 天中位數 {DAY_SPIKE_RATIO} 倍且 ≥ US$0.5；單一功能今天 ≥ 前 7 天日均 {ROUTE_SPIKE_RATIO} 倍且 ≥ US$0.2。
        金額是用量 × 公開單價，不是廠商帳單。匯率 USD→NT$ = {TWD_RATE}。
      </p>
    </div>
  );
}

// ── Rates tab ──────────────────────────────────────────────────────────────────

function RatesTab({ monthlyInfraUsd }: { monthlyInfraUsd: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <CardHead title="文字功能 — 每次呼叫" />
          <Table
            head={["功能", "模型", "NT$", "USD"]}
            rows={TEXT_FEATURES.map((f) => {
              const u = featureUnitCostUsd(f);
              return [f.label, f.model.replace("claude-", "").replace("-20251001", ""), NT(u), USD(u)];
            })}
          />
        </Card>
        <Card>
          <CardHead title="圖片生成 — 每張" />
          <Table
            head={["模型", "廠商", "NT$", "USD"]}
            rows={Object.entries(IMAGE_RATES).map(([, r]) => [r.label, r.vendor, NT(r.usd), USD(r.usd)])}
          />
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <CardHead title="編修工具 — 每次" />
          <Table
            head={["工具", "廠商", "NT$", "USD"]}
            rows={Object.values(TOOL_RATES).map((t) => [
              t.label + (t.estimate ? " ※" : ""),
              t.vendor,
              NT(t.usd),
              USD(t.usd),
            ])}
          />
        </Card>
        <Card>
          <CardHead title="基建月費 baseline" right={NT(monthlyInfraUsd) + " / 月"} />
          <Table
            head={["項目", "月費 NT$"]}
            rows={INFRA_MONTHLY.map((i) => [
              <span key={i.key}>
                {i.label}
                {i.estimate && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: "var(--build-risk-medium-text)", background: "var(--build-risk-medium-bg)", padding: "1px 5px", borderRadius: 4 }}>估算</span>}
                {i.note && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1 }}>{i.note}</div>}
              </span>,
              NT(i.usdPerMonth),
            ])}
          />
        </Card>
      </div>

      <Card>
        <CardHead title="AI 影片動態 — 每個場景" />
        <Table
          head={["模型", "廠商", "秒數", "NT$", "USD"]}
          rows={Object.values(VIDEO_MOTION_RATES).map((r) => [
            r.label, r.vendor, `${r.defaultDurationSec}s`,
            NT(r.usdPerSec * r.defaultDurationSec), USD(r.usdPerSec * r.defaultDurationSec),
          ])}
        />
      </Card>

      <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7, margin: 0 }}>
        ※ 基建月費目前為估算值（<code>INFRA_MONTHLY</code>）；查 Hetzner / Cloudflare console 後改為實際帳單數字並把 <code>estimate</code> 設 false。
        編修工具標 ※ 者為典型單次推估。AI 影片動態每支影片最多套 3 個場景（見 /tools/video）。所有費率 SSOT：<code>lib/ai/cost-model.ts</code>。
      </p>
    </div>
  );
}

// ── Models tab ─────────────────────────────────────────────────────────────────

function QuickPick({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div style={{
      border: "1px solid var(--border-subtle)", borderRadius: 10,
      background: "var(--card-bg)", padding: "12px 14px",
    }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.45 }}>{detail}</div>
    </div>
  );
}

function ModelsTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <SectionTitle>快速選型</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <QuickPick label="文字主力"     value="Claude Sonnet / GPT-5.4"  detail="品質穩、成本可控，適合每日產線。" />
          <QuickPick label="深度推理"     value="GPT-5.5 / Claude Opus 4.8" detail="複雜任務與長上下文，少量高價場景。" />
          <QuickPick label="圖片主力"     value="FLUX / Ideogram / Nano Banana" detail="Tarot/Studio/Mockup 共用；依成本選。" />
          <QuickPick label="Coding Agent" value="Codex / Claude Code"       detail="真正改 repo、跑測試、修 PR 時優先。" />
        </div>
      </div>

      <div>
        <SectionTitle>模型能力比較 — 文字 · 圖片 · Coding</SectionTitle>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
          價格以 API 公開價為主。成本標籤：$ = 最便宜，$$$$ = 最貴。速度標籤：最快 → 慢。勾選模型後可並排比較。
        </p>
        <AiModelsClient />
      </div>
    </div>
  );
}

// ── Ledger tab ─────────────────────────────────────────────────────────────────

const TOOL_LABEL: Record<string, string> = {
  content: "SEO Content",
  studio:  "Studio",
  tarot:   "Tarot",
  video:   "Video",
  mockup:  "Mockup",
};

const ROUTE_LABEL: Record<string, string> = {
  "content/article-generate": "文章生成",
  "content/fetchRealSources": "Serper 搜尋",
  "content/image":            "內文圖片",
  "content/hero-image":       "首圖",
  "content/title":            "標題建議",
  "content/keywords":         "關鍵字",
  "content/outline":          "大綱",
  "content/hook-brief":       "Hook Brief",
  "content/seo-fix":          "SEO 修正",
  "content/syndicate":        "社群改寫",
  "content/humanize":         "人性化改寫",
  "content/market-analysis":  "市場分析",
};

function routeLabel(route: string) {
  return ROUTE_LABEL[route] ?? route;
}

function LedgerTab({ groups, groupCount, s, windowDays }: { groups: LedgerGroup[]; groupCount: number; s: SpendSummary; windowDays: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (groups.length === 0) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
        近 {windowDays} 天尚無花費記錄。
      </div>
    );
  }

  const toggle = (id: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
      近 {windowDays} 天合計 <b style={{ color: "var(--text-primary)" }}>{NT(s.totalUsd)}</b>（{USD(s.totalUsd)}，{s.count.toLocaleString()} 筆）= 真實花費「每日花費」圖合計。
      同一篇文章／同一批圖片的多筆呼叫合成一組；其他呼叫標「單筆」。
      {groupCount > groups.length && <> 列出最近 {groups.length} 組（共 {groupCount.toLocaleString()} 組），合計仍含全部。</>}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid var(--border-subtle)", borderRadius: 10, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 90px 28px", gap: 0, padding: "7px 14px", background: "var(--bg-subtle)", borderBottom: "1px solid var(--border-subtle)", fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
        <span>工具 / 時間</span>
        <span style={{ textAlign: "right" }}>NT$</span>
        <span style={{ textAlign: "right" }}>USD</span>
        <span style={{ textAlign: "right" }}>明細數</span>
        <span />
      </div>

      {groups.map((job) => {
        const jobId = job.key;
        const open = expanded.has(jobId);
        const tool = job.tool;
        const date = new Date(job.startedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
        return (
          <div key={jobId} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {/* Job row */}
            <div
              onClick={() => toggle(jobId)}
              style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 90px 28px", gap: 0, padding: "10px 14px", cursor: "pointer", background: open ? "var(--bg-subtle)" : "var(--card-bg)", alignItems: "center" }}
            >
              <div>
                <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: "var(--accent)", color: "var(--btn-primary-text)", marginRight: 8 }}>
                  {TOOL_LABEL[tool] ?? tool}
                </span>
                {!job.isJob && <span style={{ fontSize: 12, color: "var(--text-secondary)", marginRight: 8 }}>單筆 · {routeLabel(job.rows[0].route)}</span>}
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{date}</span>
              </div>
              <span style={{ textAlign: "right", fontWeight: 700, fontSize: 13 }}>{NT(job.totalUsd)}</span>
              <span style={{ textAlign: "right", fontSize: 12, color: "var(--text-secondary)" }}>{USD(job.totalUsd)}</span>
              <span style={{ textAlign: "right", fontSize: 12, color: "var(--text-muted)" }}>{job.rows.length} 項</span>
              <span style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)" }}>{open ? "▲" : "▼"}</span>
            </div>

            {/* Detail rows */}
            {open && job.rows.map((r) => {
              const rowUsd = Number(r.cost_usd) || 0;
              return (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 90px 28px", gap: 0, padding: "6px 14px 6px 28px", background: "var(--bg-subtle)", borderTop: "1px solid var(--border-subtle)", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{routeLabel(r.route)}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>{r.model} · {KIND_LABEL[spendKind(r)]}</span>
                </div>
                <span style={{ textAlign: "right", fontSize: 12 }}>{NT(rowUsd)}</span>
                <span style={{ textAlign: "right", fontSize: 11, color: "var(--text-secondary)" }}>{USD(rowUsd)}</span>
                <span />
                <span />
              </div>
            );
            })}
          </div>
        );
      })}
    </div>
    </div>
  );
}

// ── Monthly report tab ─────────────────────────────────────────────────────────

function pct(part: number, whole: number) {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";
}

function BreakdownCard({ title, buckets, total, label }: {
  title: string; buckets: { key: string; count: number; usd: number }[]; total: number; label?: (k: string) => string;
}) {
  return (
    <Card>
      <CardHead title={title} />
      {buckets.length === 0
        ? <EmptyState text="本月無記錄。" />
        : <Table
            head={["項目", "筆數", "占比", "NT$", "USD"]}
            rows={buckets.map((b) => [label ? label(b.key) : b.key, b.count.toLocaleString(), pct(b.usd, total), NT(b.usd), USD(b.usd)])}
          />
      }
    </Card>
  );
}

/** One CSV per month for the bookkeeper: every breakdown, USD and NT$, with the basis stated. */
function monthCsv(m: MonthReport, orgName: (id: string) => string): string {
  const s = m.summary;
  const lines = [["section", "item", "count", "usd", "ntd"].join(",")];
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const push = (section: string, b: { key: string; count: number; usd: number }[], label = (k: string) => k) => {
    for (const x of b) lines.push([section, q(label(x.key)), x.count, x.usd.toFixed(6), usdToNtd(x.usd).toFixed(2)].join(","));
  };
  lines.push(["total", q(`${m.month} AI 用量（用量×公開單價，非廠商帳單）`), s.count, s.totalUsd.toFixed(6), usdToNtd(s.totalUsd).toFixed(2)].join(","));
  push("kind", s.byKind, (k) => KIND_LABEL[k as SpendKind] ?? k);
  push("vendor", s.byVendor);
  push("model", s.byModel);
  push("feature", s.byTool, (k) => TOOL_LABEL[k] ?? k);
  push("client", s.byOrg, orgName);
  for (const i of INFRA_MONTHLY) {
    lines.push(["infra_current", q(`${i.label}${i.estimate ? "（估算）" : "（帳單）"}`), 1, i.usdPerMonth.toFixed(2), usdToNtd(i.usdPerMonth).toFixed(2)].join(","));
  }
  return "﻿" + lines.join("\n");
}

function MonthlyTab({ months, orgNames, monthlyInfraUsd, note }: {
  months: MonthReport[]; orgNames: Record<string, string>; monthlyInfraUsd: number; note?: string;
}) {
  const [picked, setPicked] = useState(months[0]?.month ?? "");
  const m = months.find((x) => x.month === picked) ?? months[0];
  const orgName = (id: string) => (id ? orgNames[id] ?? id.slice(0, 8) : "內部（未指定客戶）");
  const infraEstimated = INFRA_MONTHLY.filter((i) => i.estimate).reduce((s, i) => s + i.usdPerMonth, 0);

  if (!m) {
    return <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>近 12 個月尚無花費記錄。</div>;
  }
  const s = m.summary;

  const download = () => {
    const blob = new Blob([monthCsv(m, orgName)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `aware-wave-costs-${m.month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {note && <Warn>{note}</Warn>}

      {/* Month picker — visible buttons, newest first */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {months.map((x) => (
          <button
            key={x.month}
            onClick={() => setPicked(x.month)}
            style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 12.5, cursor: "pointer",
              border: `1px solid ${x.month === m.month ? "var(--accent)" : "var(--border-subtle)"}`,
              background: x.month === m.month ? "var(--accent)" : "var(--card-bg)",
              color: x.month === m.month ? "var(--btn-primary-text)" : "var(--text-secondary)",
              fontWeight: x.month === m.month ? 700 : 500,
            }}
          >
            {x.month}
          </button>
        ))}
        <button
          onClick={download}
          style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", border: "1px solid var(--border-subtle)", background: "var(--card-bg)", color: "var(--text-primary)" }}
        >
          Download CSV
        </button>
      </div>

      <QualityNotes s={s} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <StatCard label={`${m.month} AI 用量`} usd={s.totalUsd} sub={`${s.count.toLocaleString()} 筆 · 用量×公開單價`} accent />
        <StatCard label="固定月費（現行設定）" usd={monthlyInfraUsd} sub={infraEstimated > 0 ? `含估算 ${USD(infraEstimated)}` : "全部為帳單金額"} />
        <StatCard label="AI + 固定月費" usd={s.totalUsd + monthlyInfraUsd} sub="固定月費套用現行設定" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <BreakdownCard title="依廠商" buckets={s.byVendor} total={s.totalUsd} />
        <BreakdownCard title="依類型" buckets={s.byKind} total={s.totalUsd} label={(k) => KIND_LABEL[k as SpendKind] ?? k} />
        <BreakdownCard title="依功能" buckets={s.byTool} total={s.totalUsd} label={(k) => TOOL_LABEL[k] ?? k} />
        <BreakdownCard title="依客戶" buckets={s.byOrg} total={s.totalUsd} label={orgName} />
      </div>
      <BreakdownCard title="依模型" buckets={s.byModel} total={s.totalUsd} label={(k) => IMAGE_RATES[k]?.label ?? k} />

      <Card>
        <CardHead title="各月比較（Asia/Taipei 月份）" />
        <Table
          head={["月份", "筆數", "文字", "圖片", "影片", "AI 合計 NT$", "AI 合計 USD"]}
          rows={months.map((x) => [
            x.month,
            x.summary.count.toLocaleString(),
            NT(kindUsd(x.summary, "text").usd),
            NT(kindUsd(x.summary, "image").usd),
            NT(kindUsd(x.summary, "video").usd),
            NT(x.summary.totalUsd),
            USD(x.summary.totalUsd),
          ])}
        />
      </Card>

      <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7, margin: 0 }}>
        金額依據：<b>AI 用量</b> = <code>ai_call_logs</code> 每筆呼叫 × <code>cost-model.ts</code> 公開單價（呼叫當下算好存檔），<b>不是廠商帳單</b>；
        與「真實花費」「流水帳」同一份資料。<b>固定月費</b> = <code>INFRA_MONTHLY</code> 現行設定，每月都用同一組數字（過去月份的主機費可能不同），標「估算」者未對過帳單。
        沒有記錄的花費（例如直接在廠商後台用掉的額度、訂閱費）不在此表。月份以台灣時間切。匯率 USD→NT$ = {TWD_RATE}。
      </p>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function CostsTabs({ data, monthlyInfraUsd }: Props) {
  const [tab, setTab] = useState<Tab>("monthly");

  // Financial order: the period report first, then actual spend, then its line items; reference
  // prices, forecasting and model choice come after the numbers they explain.
  const tabs: { key: Tab; label: string }[] = [
    { key: "monthly",   label: "① 月報" },
    { key: "spend",     label: "② 真實花費" },
    { key: "ledger",    label: "③ 流水帳" },
    { key: "rates",     label: "④ 費率表" },
    { key: "estimator", label: "⑤ 月費試算" },
    { key: "models",    label: "⑥ AI 模型" },
  ];

  return (
    <div>
      <div style={{
        display: "flex", gap: 0, marginBottom: 24,
        borderBottom: "2px solid var(--border-subtle)",
      }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 20px", border: "none", background: "none",
              cursor: "pointer", fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? "var(--accent)" : "var(--text-secondary)",
              borderBottom: `2px solid ${tab === t.key ? "var(--accent)" : "transparent"}`,
              marginBottom: -2, transition: "color .15s, border-color .15s",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "spend"     && <SpendTab live={data.live} note={data.note} />}
      {tab === "rates"     && <RatesTab monthlyInfraUsd={monthlyInfraUsd} />}
      {tab === "estimator" && <CostEstimator />}
      {tab === "models"    && <ModelsTab />}
      {tab === "ledger"    && <LedgerTab groups={data.ledger} groupCount={data.ledgerGroupCount} s={data.window} windowDays={data.windowDays} />}
      {tab === "monthly"   && <MonthlyTab months={data.months} orgNames={data.orgNames} monthlyInfraUsd={monthlyInfraUsd} note={data.note} />}
    </div>
  );
}
