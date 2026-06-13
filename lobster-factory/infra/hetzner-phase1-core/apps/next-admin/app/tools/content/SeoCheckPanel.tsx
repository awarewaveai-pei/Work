"use client";

import type { RankMathReport } from "@/lib/seo/rankmath-checker";

interface Props {
  report: RankMathReport | null;
  loading: boolean;
}

const GRADE_COLOR = { green: "#22c55e", orange: "#f97316", red: "#ef4444" };
const GRADE_LABEL = { green: "🟢 良好", orange: "🟠 待改善", red: "🔴 需加強" };

export function SeoCheckPanel({ report, loading }: Props) {
  if (!report && !loading) return null;

  if (loading) {
    return (
      <div style={{ marginTop: "16px", borderTop: "1px solid var(--card-border)", paddingTop: "14px" }}>
        <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>⏳ 分析 RankMath SEO 合規分數中…</span>
      </div>
    );
  }
  if (!report) return null;

  const color  = GRADE_COLOR[report.grade];
  const failed = report.checks.filter(c => !c.pass);
  const passed = report.checks.filter(c => c.pass);

  return (
    <div style={{ marginTop: "16px", borderTop: "1px solid var(--card-border)", paddingTop: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          border: `3px solid ${color}`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: "16px", fontWeight: 700, color, lineHeight: 1 }}>{report.score}</span>
          <span style={{ fontSize: "9px", color: "var(--text-muted)", lineHeight: 1.4 }}>/ 100</span>
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: "13px", color }}>{GRADE_LABEL[report.grade]}</div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
            RankMath 合規：{report.passed}/{report.total} 項通過
          </div>
        </div>
      </div>

      {failed.length > 0 && (
        <div style={{ marginTop: "12px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "5px" }}>未通過：</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {failed.map(c => (
              <div key={c.id} style={{ display: "flex", gap: "6px", fontSize: "12px" }}>
                <span style={{ color: "#ef4444", flexShrink: 0 }}>✗</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 500, flexShrink: 0 }}>{c.label}</span>
                <span style={{ color: "var(--text-muted)" }}>— {c.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {passed.length > 0 && (
        <details style={{ marginTop: "8px" }}>
          <summary style={{ fontSize: "12px", color: "var(--text-muted)", cursor: "pointer", userSelect: "none" }}>
            ▶ 通過項目（{passed.length}）
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px", paddingLeft: "4px" }}>
            {passed.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                <span style={{ color: "#22c55e" }}>✓</span>
                <span style={{ color: "var(--text-muted)" }}>{c.label}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
