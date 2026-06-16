"use client";

import { useState } from "react";
import type { RankMathReport, RankMathCheck } from "@/lib/seo/rankmath-checker";

interface FixResponse {
  ok: boolean;
  markdown?: string;
  seoTitle?: string;
  metaDescription?: string;
  error?: string;
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
  /**
   * Custom fix path (e.g. product copy, which is structured 6 fields — not a Markdown article that
   * /api/content/seo-fix can rewrite). When provided, it REPLACES the built-in markdown-fix fetch:
   * the panel calls onFix(failedChecks) and the caller regenerates the copy. Receives only the
   * applicable failed checks (N/A excluded). Returns ok / error so the panel can show feedback.
   */
  onFix?: (failed: RankMathCheck[]) => Promise<{ ok: boolean; error?: string }>;
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
    ids: ["kw-in-h2h3", "external-links", "internal-links", "slug-length"],
  },
  {
    key: "title",
    label: "Title Readability",
    ids: ["title-length"],
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

const GRADE_COLOR = { green: "#22c55e", orange: "#f97316", red: "#ef4444" };
const GRADE_LABEL = { green: "🟢 良好", orange: "🟠 待改善", red: "🔴 需加強" };

function CheckRow({ check }: { check: RankMathCheck }) {
  const isNa = !!check.na;
  const [open, setOpen] = useState(!check.pass && !isNa);
  const clickable = !isNa && !!check.suggestion;
  return (
    <div
      style={{
        display: "flex", alignItems: "flex-start", gap: "8px",
        padding: "7px 0",
        borderBottom: "1px solid var(--card-border)",
        cursor: clickable ? "pointer" : "default",
        opacity: isNa ? 0.6 : 1,
      }}
      onClick={() => clickable && setOpen(v => !v)}
    >
      {/* Circle icon — N/A renders neutral grey (not red), so it never reads as a failure */}
      <span style={{
        flexShrink: 0, width: 18, height: 18, borderRadius: "50%",
        background: isNa ? "#9ca3af" : check.pass ? "#22c55e" : "#ef4444",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginTop: "1px",
        fontSize: "11px", color: "#fff", fontWeight: 700,
      }}>
        {isNa ? "–" : check.pass ? "✓" : "✕"}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "12px", color: isNa ? "var(--text-muted)" : "var(--text-primary)", lineHeight: 1.4 }}>
          {check.label}
          {isNa && (
            <span style={{ color: "var(--text-muted)", marginLeft: "4px", fontSize: "11px" }}>
              — 不適用（{check.detail}）
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
            marginTop: "4px", fontSize: "11px", color: "#f97316",
            background: "#fff7ed", borderRadius: "4px", padding: "4px 6px",
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
              fontSize: "11px", fontWeight: 600, color: "#fff",
              background: "#ef4444", borderRadius: "12px", padding: "1px 7px",
            }}>
              × {errors} Error{errors > 1 ? "s" : ""}
            </span>
          )}
          {errors === 0 && allNa && (
            <span style={{
              fontSize: "11px", color: "var(--text-muted)", background: "var(--bg-page, #f1f5f9)",
              borderRadius: "12px", padding: "1px 7px", fontWeight: 600,
            }}>
              — 不適用
            </span>
          )}
          {errors === 0 && !allNa && (
            <span style={{
              fontSize: "11px", color: "#22c55e", background: "#f0fdf4",
              borderRadius: "12px", padding: "1px 7px", fontWeight: 600,
            }}>
              ✓ All pass
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
  onFixApply, onFix,
}: Props) {
  const [fixing,     setFixing]     = useState(false);
  const [fixError,   setFixError]   = useState("");
  const [fixSuccess, setFixSuccess] = useState(false);

  if (!report && !loading) return null;

  if (loading) {
    return (
      <div style={{ marginTop: "16px", borderTop: "1px solid var(--card-border)", paddingTop: "12px" }}>
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>⏳ 分析 RankMath SEO 合規分數中…</span>
      </div>
    );
  }
  if (!report) return null;

  const color     = GRADE_COLOR[report.grade];
  // N/A checks are not failures — exclude them from the fixable set, the error count, and the badge.
  const failed    = report.checks.filter(c => !c.pass && !c.na);
  // Two fix paths: a custom onFix (product copy → regenerate) takes precedence; otherwise the
  // built-in Markdown rewrite via /api/content/seo-fix (blog article) requires markdown + keyword.
  const canFix    = failed.length > 0 && (!!onFix || (!!onFixApply && !!articleMarkdown && !!focusKeyword));
  const totalErrs = failed.length;

  async function handleFix() {
    if (!canFix || fixing) return;
    setFixing(true); setFixError(""); setFixSuccess(false);
    try {
      // Custom path (product): the caller regenerates the structured copy from the failed checks.
      if (onFix) {
        const r = await onFix(failed);
        if (!r.ok) { setFixError(r.error ?? "AI 修正失敗"); return; }
        setFixSuccess(true);
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
      const json = await res.json() as FixResponse;
      if (!json.ok || !json.markdown) { setFixError(json.error ?? "AI 修正失敗"); return; }
      const meta = (json.seoTitle || json.metaDescription)
        ? { seoTitle: json.seoTitle ?? seoTitle ?? "", metaDesc: json.metaDescription ?? metaDescription ?? "" }
        : undefined;
      onFixApply!(json.markdown, meta);
      setFixSuccess(true);
    } catch { setFixError("網路錯誤，請重試"); }
    finally   { setFixing(false); }
  }

  return (
    <div style={{
      marginTop: "16px",
      border: "1px solid var(--card-border)",
      borderRadius: "8px",
      overflow: "hidden",
      background: "var(--bg-card, #fff)",
    }}>
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px",
        borderBottom: "1px solid var(--card-border)",
        background: "var(--bg-page, #f8f9fc)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Score badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: "4px",
            background: color, color: "#fff",
            borderRadius: "20px", padding: "2px 10px",
            fontWeight: 700, fontSize: "13px",
          }}>
            {report.score} / 100
          </div>
          <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
            {GRADE_LABEL[report.grade]}
          </span>
        </div>
        {totalErrs > 0 && (
          <span style={{ fontSize: "12px", color: "#ef4444", fontWeight: 500 }}>
            × {totalErrs} 項需修正
          </span>
        )}
      </div>

      {/* ── Category accordions ─────────────────────────────────────────────── */}
      <div style={{ padding: "0 12px" }}>
        {CATEGORIES.map(cat => {
          const catChecks = report.checks.filter(c => cat.ids.includes(c.id));
          // Match the badge: N/A checks aren't errors, so a category rendering "✓ All pass" (or
          // "— 不適用") must not auto-expand. Blog flow sets no na → identical to before (critic 2026-06-15).
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
          padding: "10px 12px",
          borderTop: "1px solid var(--card-border)",
          background: "var(--bg-page, #f8f9fc)",
          display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
        }}>
          <button
            className="btn-primary"
            onClick={handleFix}
            disabled={fixing}
            style={{ fontSize: "12px", padding: "6px 14px" }}
          >
            {fixing ? "🤖 AI 修正中…" : "🤖 AI 自動修正 SEO"}
          </button>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            AI 針對紅色失敗項目修正，保留原有風格
          </span>
          {fixError   && <span style={{ fontSize: "11px", color: "#ef4444" }}>{fixError}</span>}
          {fixSuccess && <span style={{ fontSize: "11px", color: "#22c55e" }}>✓ 已更新，重新計分中…</span>}
        </div>
      )}
    </div>
  );
}
