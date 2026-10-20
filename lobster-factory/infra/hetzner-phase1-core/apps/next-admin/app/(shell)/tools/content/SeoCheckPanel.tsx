"use client";

import { useState } from "react";
import type { RankMathReport, RankMathCheck } from "@/lib/seo/rankmath-checker";
import { usePaidFeatures } from "@/lib/entitlements/use-paid-features";

interface FixResponse {
  ok: boolean;
  markdown?: string;
  seoTitle?: string;
  metaDescription?: string;
  error?: string;
  _cost?: { usd: number; model: string; vendor: string };
}

interface Props {
  report: RankMathReport | null;
  loading: boolean;
  articleMarkdown?: string;
  focusKeyword?: string;
  seoTitle?: string;
  metaDescription?: string;
  slug?: string;
  onFixApply?: (md: string, meta?: { seoTitle: string; metaDesc: string }) => void;
  onCost?: (cost: { usd: number; model: string; vendor: string }) => void;
  /**
   * Custom fix path (e.g. product copy, which is structured 6 fields — not a Markdown article that
   * /api/content/seo-fix can rewrite). When provided, it REPLACES the built-in markdown-fix fetch:
   * the panel calls onFix(failedChecks) and the caller regenerates the copy. Receives only the
   * applicable failed checks (N/A excluded). Returns ok / error, plus an optional `message` (e.g. a
   * "80 → 90 ↑" score delta, or a "kept the higher-scoring version" note) the panel surfaces verbatim
   * once the regenerate settles — product re-gen is non-monotonic, so the caller reports the outcome.
   */
  onFix?: (failed: RankMathCheck[]) => Promise<{ ok: boolean; error?: string; message?: string }>;
}

// ── Category groupings matching RankMath sidebar ──────────────────────────────

const CATEGORIES: { key: string; label: string; ids: string[] }[] = [
  {
    key: "basic",
    label: "Basic SEO",
    ids: ["kw-in-title", "kw-in-meta", "kw-in-slug", "kw-in-intro", "word-count", "kw-density"],
  },
  {
    key: "additional",
    label: "Additional SEO",
    ids: ["kw-in-h2h3", "external-links", "internal-links", "slug-length", "kw-in-image-alt", "faq-section"],
  },
  {
    key: "title",
    label: "Title Readability",
    ids: ["title-length", "title-kw-position", "title-power-word", "title-sentiment", "title-number"],
  },
  {
    key: "content",
    label: "Content Readability",
    ids: ["para-length", "meta-length"],
  },
  {
    key: "aeo",
    label: "AEO / GEO (AI Engine Optimization)",
    ids: ["aeo-quick-answer", "aeo-subquery-coverage", "aeo-date-signal"],
  },
];

// On-palette grade colors — the prior #22c55e / #f97316 were off the app's own --green/--yellow scale
// and rendered brighter than the rest of the console. Ring uses the vivid token; grade text uses a
// readable-on-white shade (amber needs the darker --severity-medium for contrast).
const GRADE_RING: Record<RankMathReport["grade"], string> = {
  green: "var(--green)", orange: "var(--yellow)", red: "var(--red)",
};
const GRADE_TEXT: Record<RankMathReport["grade"], string> = {
  green: "var(--green)", orange: "var(--severity-medium)", red: "var(--red)",
};
const GRADE_LABEL: Record<RankMathReport["grade"], string> = {
  green: "良好", orange: "待改善", red: "需加強",
};

// The score is the panel's headline, so it gets a gauge ring (RankMath / Lighthouse idiom) instead of
// a flat pill. Stroke color is the grade color; the track is the neutral card border.
function ScoreRing({ score, color }: { score: number; color: string }) {
  const size = 74, r = 30, sw = 7;
  const circ = 2 * Math.PI * r;
  // Coerce a non-finite score to 0 before clamping — guards both the gauge offset and the rendered
  // number against ever showing NaN (unreachable from current producers, but cheap to make airtight).
  const safe = Number.isFinite(score) ? score : 0;
  const pct = Math.max(0, Math.min(100, safe));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card-border)" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 20, fontWeight: 600, lineHeight: 1, color: "var(--text-primary)" }}>{safe}</span>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>/ 100</span>
      </div>
    </div>
  );
}

function CheckRow({ check }: { check: RankMathCheck }) {
  const isNa = !!check.na;
  const [open, setOpen] = useState(!check.pass && !isNa);
  const clickable = !isNa && !!check.suggestion;
  // N/A renders a neutral hollow chip (never red), so it never reads as a failure.
  const circleBg = isNa ? "var(--bg-hover)" : check.pass ? "var(--green)" : "var(--red)";
  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: "8px",
        padding: "7px 0",
        borderBottom: "1px solid var(--card-border)",
        cursor: clickable ? "pointer" : "default",
        opacity: isNa ? 0.65 : 1,
      }}
      onClick={() => clickable && setOpen(v => !v)}
    >
      <span style={{
        flexShrink: 0, width: 18, height: 18, borderRadius: "50%",
        background: circleBg,
        border: isNa ? "1px solid var(--card-border)" : "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginTop: "1px",
        fontSize: "11px", color: isNa ? "var(--text-muted)" : "var(--btn-primary-text)", fontWeight: 700,
      }}>
        {isNa ? "–" : check.pass ? "✓" : "✕"}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "12px", color: isNa ? "var(--text-muted)" : "var(--text-primary)", lineHeight: 1.4 }}>
          {check.label}
          {/* N/A: check.detail already reads "不適用於商品頁（…）", so render it directly — the prior
              "— 不適用（{detail}）" wrapper doubled the word "不適用" and the parens. */}
          {isNa && (
            <span style={{ color: "var(--text-muted)", marginLeft: "4px", fontSize: "11px", fontStyle: "italic" }}>
              · {check.detail}
            </span>
          )}
          {!check.pass && !isNa && (
            <span style={{ color: "var(--text-muted)", marginLeft: "4px", fontSize: "11px" }}>
              — {check.detail}
            </span>
          )}
        </div>
        {!check.pass && !isNa && check.suggestion && open && (
          <div style={{
            marginTop: "4px", fontSize: "11px", color: "var(--severity-medium)",
            background: "color-mix(in srgb, var(--yellow) 12%, transparent)",
            borderRadius: "var(--radius-sm)", padding: "5px 8px",
            lineHeight: 1.4,
          }}>
            💡 {check.suggestion}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryBlock({
  category, checks, defaultOpen,
}: {
  category: { key: string; label: string; ids: string[] };
  checks: RankMathCheck[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const catChecks = checks.filter(c => category.ids.includes(c.id));
  const applicable = catChecks.filter(c => !c.na);
  const errors = applicable.filter(c => !c.pass).length;
  const allNa = catChecks.length > 0 && applicable.length === 0;

  return (
    <div style={{ borderBottom: "1px solid var(--card-border)" }}>
      {/* Category header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "9px 0", background: "none", border: "none", cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-primary)" }}>
          {category.label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {errors > 0 && (
            <span style={{
              fontSize: "11px", fontWeight: 600, color: "var(--btn-primary-text)",
              background: "var(--red)", borderRadius: "12px", padding: "1px 8px",
            }}>
              × {errors} 項
            </span>
          )}
          {errors === 0 && allNa && (
            <span style={{
              fontSize: "11px", color: "var(--text-muted)", background: "var(--bg-subtle)",
              borderRadius: "12px", padding: "1px 8px", fontWeight: 600,
            }}>
              不適用
            </span>
          )}
          {errors === 0 && !allNa && (
            <span style={{
              fontSize: "11px", color: "var(--green)",
              background: "color-mix(in srgb, var(--green) 12%, transparent)",
              borderRadius: "12px", padding: "1px 8px", fontWeight: 600,
            }}>
              ✓ 全數通過
            </span>
          )}
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Checks list */}
      {open && (
        <div style={{ paddingBottom: "6px" }}>
          {catChecks.map(c => <CheckRow key={c.id} check={c} />)}
        </div>
      )}
    </div>
  );
}

export function SeoCheckPanel({
  report, loading,
  articleMarkdown, focusKeyword, seoTitle, metaDescription, slug,
  onFixApply, onCost, onFix,
}: Props) {
  const { canUse, why } = usePaidFeatures();
  const [fixing,     setFixing]     = useState(false);
  const [fixError,   setFixError]   = useState("");
  const [fixMessage, setFixMessage] = useState("");

  if (!report && !loading) return null;

  if (loading) {
    return (
      <div style={{ marginTop: "16px", borderTop: "1px solid var(--card-border)", paddingTop: "12px" }}>
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>⏳ 分析 RankMath SEO 合規分數中…</span>
      </div>
    );
  }
  if (!report) return null;

  const ringColor = GRADE_RING[report.grade];
  // N/A checks are not failures — exclude them from the fixable set, the counts, and the grade.
  const failed     = report.checks.filter(c => !c.pass && !c.na);
  const applicable = report.checks.filter(c => !c.na);
  const passed     = applicable.filter(c => c.pass).length;
  const failedCount = applicable.length - passed;
  const naCount    = report.checks.length - applicable.length;
  // Two fix paths: a custom onFix (product copy → regenerate) takes precedence; otherwise the
  // built-in Markdown rewrite via /api/content/seo-fix (blog article) requires markdown + keyword.
  const canFix     = failed.length > 0 && (!!onFix || (!!onFixApply && !!articleMarkdown && !!focusKeyword));

  async function handleFix() {
    if (!canFix || fixing) return;
    setFixing(true); setFixError(""); setFixMessage("");
    try {
      // Custom path (product): the caller regenerates the structured copy and reports the outcome —
      // including a score delta, or a note that it kept the higher-scoring prior version.
      if (onFix) {
        const r = await onFix(failed);
        if (!r.ok) { setFixError(r.error ?? "AI 修正失敗"); return; }
        setFixMessage(r.message ?? "✓ 已更新，重新計分中…");
        return;
      }
      const res  = await fetch("/api/content/seo-fix", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: articleMarkdown, focusKeyword,
          seoTitle: seoTitle ?? "", metaDescription: metaDescription ?? "",
          slug: slug ?? "", failedChecks: failed,
        }),
      });
      let json: FixResponse;
      try {
        json = await res.json() as FixResponse;
      } catch {
        setFixError(`伺服器錯誤 (HTTP ${res.status})，請重試`);
        return;
      }
      if (!json.ok || !json.markdown) { setFixError(json.error ?? "AI 修正失敗"); return; }
      const meta = (json.seoTitle || json.metaDescription)
        ? { seoTitle: json.seoTitle ?? seoTitle ?? "", metaDesc: json.metaDescription ?? metaDescription ?? "" }
        : undefined;
      onFixApply!(json.markdown, meta);
      if (json._cost) onCost?.(json._cost);
      setFixMessage("✓ 已更新，重新計分中…");
    } catch { setFixError("網路錯誤，請重試"); }
    finally   { setFixing(false); }
  }

  return (
    <div style={{
      marginTop: "16px",
      border: "1px solid var(--card-border)",
      borderRadius: "var(--radius)",
      overflow: "hidden",
      background: "var(--bg-card)",
    }}>
      {/* ── Header row: score ring + grade + breakdown ───────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: "14px",
        padding: "14px",
        borderBottom: "1px solid var(--card-border)",
        background: "var(--bg-subtle)",
      }}>
        <ScoreRing score={report.score} color={ringColor} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "15px", fontWeight: 600, color: GRADE_TEXT[report.grade] }}>
            {GRADE_LABEL[report.grade]}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "3px" }}>
            {applicable.length} 項適用 · {passed} 通過 · {failedCount} 待修正
            {naCount > 0 ? ` · ${naCount} 項不適用` : ""}
          </div>
        </div>
      </div>

      {/* ── Category accordions ─────────────────────────────────────────────── */}
      <div style={{ padding: "0 14px" }}>
        {CATEGORIES.map(cat => {
          const catChecks = report.checks.filter(c => cat.ids.includes(c.id));
          // Match the badge: N/A checks aren't errors, so a category rendering "✓ 全數通過" (or
          // "不適用") must not auto-expand. Blog flow sets no na → identical to before (critic 2026-06-15).
          const catErrors = catChecks.filter(c => !c.pass && !c.na).length;
          return (
            <CategoryBlock
              key={cat.key}
              category={cat}
              checks={report.checks}
              defaultOpen={catErrors > 0}
            />
          );
        })}
      </div>

      {/* ── AI fix row ──────────────────────────────────────────────────────── */}
      {canFix && (
        <div style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--card-border)",
          background: "var(--bg-subtle)",
          display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
        }}>
          <button title={onFix ? undefined : why("content.seo-fix")}
            className="btn-primary"
            onClick={handleFix}
            disabled={(fixing) || (!onFix && !canUse("content.seo-fix"))}
            style={{ fontSize: "12px", padding: "6px 14px" }}
          >
            {fixing ? "🤖 AI 修正中…" : "🤖 AI 自動修正 SEO"}
          </button>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            {onFix ? "AI 重生文案，只在分數更高時才採用" : "AI 針對失敗項目修正，保留原有風格"}
          </span>
          {fixError && <span style={{ fontSize: "11px", color: "var(--red)" }}>{fixError}</span>}
          {fixMessage && (
            <span style={{ fontSize: "11px", color: fixMessage.includes("↑") ? "var(--green)" : "var(--text-muted)" }}>
              {fixMessage}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
