"use client";

import { useState } from "react";
import { featureUnitCostUsd, usdToNtd } from "@/lib/ai/cost-calculator";
import { TEXT_FEATURES, IMAGE_RATES, TOOL_RATES, VIDEO_MOTION_RATES, INFRA_MONTHLY, TWD_RATE } from "@/lib/ai/cost-model";
import { CostEstimator } from "./CostEstimator";
import AiModelsClient from "@/app/(shell)/tools/ai-models/AiModelsClient";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RealSpend {
  note?: string;
  textByRoute: { route: string; calls: number; usd: number; inTok: number; outTok: number }[];
  textUsd: number;
  textCalls: number;
  imageByModel: { model: string; count: number; usd: number }[];
  imageUsd: number;
  imageCount: number;
}

export interface LedgerRow {
  id: string;
  created_at: string;
  route: string;
  model: string;
  vendor: string | null;
  cost_usd: number;
  kind: string | null;
  tool: string | null;
  job_id: string;
}

interface Props {
  real: RealSpend;
  monthlyInfraUsd: number;
  ledger: LedgerRow[];
}

type Tab = "spend" | "rates" | "estimator" | "models" | "ledger";

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

function SpendTab({ real }: { real: RealSpend }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {real.note && (
        <div style={{
          background: "var(--build-risk-medium-bg)", border: "1px solid var(--yellow)",
          color: "var(--build-risk-medium-text)", padding: "10px 14px", borderRadius: 8, fontSize: 12.5,
        }}>
          ⚠️ {real.note}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <StatCard label="文字 AI 實扣" usd={real.textUsd} sub={`${real.textCalls.toLocaleString()} 次呼叫 (精準 token)`} />
        <StatCard label="圖片 (量×費率)" usd={real.imageUsd} sub={`${real.imageCount.toLocaleString()} 張`} />
        <StatCard label="合計 (不含基建)" usd={real.textUsd + real.imageUsd} sub="文字實扣 + 圖片估算" accent />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <CardHead title="文字 AI 實扣 — 依 route" />
          {real.textByRoute.length === 0
            ? <EmptyState text="尚無記錄。產生內容後此處顯示精準 token 花費。" />
            : <Table
                head={["Route", "次數", "tokens in/out", "花費 NT$"]}
                rows={real.textByRoute.map((r) => [
                  <span key="r" style={{ fontFamily: "monospace", fontSize: 11 }}>{r.route}</span>,
                  r.calls.toLocaleString(),
                  `${(r.inTok / 1000).toFixed(0)}k / ${(r.outTok / 1000).toFixed(0)}k`,
                  NT(r.usd),
                ])}
              />
          }
        </Card>
        <Card>
          <CardHead title="圖片生成量 — 依模型" />
          {real.imageByModel.length === 0
            ? <EmptyState text="近 30 天無圖片生成記錄。" />
            : <Table
                head={["模型", "張數", "費用 NT$"]}
                rows={real.imageByModel.map((r) => [
                  IMAGE_RATES[r.model]?.label ?? r.model,
                  r.count.toLocaleString(),
                  NT(r.usd),
                ])}
              />
          }
        </Card>
      </div>

      <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7, margin: 0 }}>
        資料來源：文字 = <code>ai_call_logs</code>（migration 0043，精準 token × 費率）；圖片量 = <code>ai_image_jobs</code>（status=completed）。匯率 USD→NT$ = {TWD_RATE}。
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

function LedgerTab({ rows }: { rows: LedgerRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (rows.length === 0) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
        尚無帶 job_id 的記錄。產生文章後此處顯示每篇費用明細。
        <div style={{ marginTop: 8, fontSize: 12 }}>（需 migration 0046 + 重新部署）</div>
      </div>
    );
  }

  // Group by job_id
  const jobMap = new Map<string, { rows: LedgerRow[]; totalUsd: number; tool: string | null; createdAt: string }>();
  for (const r of rows) {
    const entry = jobMap.get(r.job_id) ?? { rows: [], totalUsd: 0, tool: r.tool, createdAt: r.created_at };
    entry.rows.push(r);
    entry.totalUsd += Number(r.cost_usd) || 0;
    if (r.created_at < entry.createdAt) entry.createdAt = r.created_at; // earliest = job start
    jobMap.set(r.job_id, entry);
  }

  const jobs = [...jobMap.entries()]
    .sort(([, a], [, b]) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 200);

  const toggle = (id: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid var(--border-subtle)", borderRadius: 10, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 90px 28px", gap: 0, padding: "7px 14px", background: "var(--bg-subtle)", borderBottom: "1px solid var(--border-subtle)", fontSize: 11, fontWeight: 600, color: "var(--text-muted)" }}>
        <span>工具 / 時間</span>
        <span style={{ textAlign: "right" }}>NT$</span>
        <span style={{ textAlign: "right" }}>USD</span>
        <span style={{ textAlign: "right" }}>明細數</span>
        <span />
      </div>

      {jobs.map(([jobId, job]) => {
        const open = expanded.has(jobId);
        const tool = job.tool ?? "?";
        const date = new Date(job.createdAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
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
                  <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>{r.model} · {r.kind ?? "text"}</span>
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
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function CostsTabs({ real, monthlyInfraUsd, ledger }: Props) {
  const [tab, setTab] = useState<Tab>("spend");

  const tabs: { key: Tab; label: string }[] = [
    { key: "spend",     label: "① 真實花費" },
    { key: "rates",     label: "② 費率表" },
    { key: "estimator", label: "③ 月費試算" },
    { key: "models",    label: "④ AI 模型" },
    { key: "ledger",    label: "⑤ 流水帳" },
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

      {tab === "spend"     && <SpendTab real={real} />}
      {tab === "rates"     && <RatesTab monthlyInfraUsd={monthlyInfraUsd} />}
      {tab === "estimator" && <CostEstimator />}
      {tab === "models"    && <ModelsTab />}
      {tab === "ledger"    && <LedgerTab rows={ledger} />}
    </div>
  );
}
