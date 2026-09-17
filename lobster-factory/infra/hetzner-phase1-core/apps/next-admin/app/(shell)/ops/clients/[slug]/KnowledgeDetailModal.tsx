"use client";

// K2g — the content-viewer the KB tab never had: every row was `<span>{title}</span>`, no click, no
// way to read back what was actually ingested (agency-os/docs/knowledge-base/KNOWLEDGE_BASE_PLAN.md
// §K2g, operator report 2026-09-17). Backend contract: GET .../cs-knowledge?sourceId=<id> →
// { detail: SourceDetail, versions: VersionSummary[] }.

import { useEffect, useState } from "react";
import { roleHeader } from "@/lib/ops-role";

// Not imported from ClientHubTabs.tsx: that file already imports THIS one (to render the modal),
// and importing badge back would make the two files circularly dependent for a 3-line helper.
const badge = (bg: string, fg: string, text: string) => (
  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: bg, color: fg, whiteSpace: "nowrap" }}>{text}</span>
);

interface SourceDetail {
  id: string;
  title: string;
  kind: string;
  isSensitive: boolean;
  status: string;
  version: number;
  docFamilyId: string;
  canonicalUrl: string | null;
  body: string | null;
  language: string | null;
  epistemicType: string | null;
  authorshipState: string | null;
  locked: string | null;
  author: string | null;
  publishedAt: string | null;
  venue: string | null;
  doi: string | null;
  createdAt: string;
}

interface VersionSummary {
  id: string;
  version: number;
  status: string;
  createdAt: string;
}

const PROVENANCE_LABEL: Record<string, string> = {
  SOURCE_FACT: "來源事實", EVIDENCE: "證據（廠商／第三方聲稱）", ASSUMPTION: "假設",
  HYPOTHESIS: "假說", AI_INFERENCE: "AI 推論", AI_SUGGESTION: "AI 建議",
  HUMAN_OPINION: "人工意見", CALCULATED_RESULT: "計算結果", SIMULATED_RESULT: "模擬結果",
  UNKNOWN: "未標記", DECISION: "決策",
};
const AUTHORSHIP_LABEL: Record<string, string> = {
  HUMAN_ORIGINAL: "操作者手寫", AI_GENERATED: "AI 產生", AI_SUGGESTED: "AI 建議、人未過目",
  HUMAN_EDITED: "人工編輯過", HUMAN_APPROVED: "人工核准過", SOURCE_QUOTATION: "原文引用（爬蟲／匯入）",
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-TW", { hour12: false });
  } catch {
    return iso;
  }
}

export function KnowledgeDetailModal({
  slug,
  sourceId: initialSourceId,
  onClose,
}: {
  slug: string;
  sourceId: string;
  onClose: () => void;
}) {
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [detail, setDetail] = useState<SourceDetail | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/ops/clients/${slug}/cs-knowledge?sourceId=${encodeURIComponent(sourceId)}`, {
          headers: { ...roleHeader("admin") },
        });
        const data = (await res.json()) as { ok?: boolean; detail?: SourceDetail; versions?: VersionSummary[]; error?: string };
        if (!alive) return;
        if (!res.ok || !data.ok || !data.detail) {
          setError(data.error === "not_found" ? "找不到這份文件（可能已被永久刪除）" : "讀取失敗");
          return;
        }
        setDetail(data.detail);
        setVersions(data.versions ?? []);
      } catch {
        if (alive) setError("讀取失敗（網路錯誤）");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug, sourceId]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-canvas)", borderRadius: 10, maxWidth: 720, width: "100%",
          maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
          <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{detail?.title ?? "載入中…"}</span>
          <button onClick={onClose} aria-label="關閉" style={{ border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "14px 16px", fontSize: 12 }}>
          {loading && <p style={{ color: "var(--text-muted)" }}>載入中…</p>}
          {error && <p style={{ color: "var(--red)" }}>⚠ {error}</p>}

          {detail && !loading && (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {badge("var(--bg-canvas)", "var(--text-muted)", detail.kind)}
                {badge("var(--bg-canvas)", "var(--text-muted)", `第 ${detail.version} 版`)}
                {detail.status !== "active" && badge("var(--bg-canvas)", "var(--text-muted)", detail.status === "archived" ? "已封存" : detail.status)}
                {detail.isSensitive && badge("var(--badge-red-bg)", "var(--red)", "敏感")}
                {detail.locked && badge("var(--badge-red-bg)", "var(--red)", detail.locked === "LOCKED_FACT" ? "鎖定（自動化不得覆寫）" : "鎖定決策")}
                {detail.epistemicType && badge("var(--bg-canvas)", "var(--text-secondary)", PROVENANCE_LABEL[detail.epistemicType] ?? detail.epistemicType)}
                {detail.authorshipState && badge("var(--bg-canvas)", "var(--text-secondary)", AUTHORSHIP_LABEL[detail.authorshipState] ?? detail.authorshipState)}
              </div>

              <div style={{ color: "var(--text-muted)", marginBottom: 10, lineHeight: 1.7 }}>
                {detail.canonicalUrl && (
                  <div>
                    出處：<a href={detail.canonicalUrl} target="_blank" rel="noreferrer" style={{ color: "var(--text-secondary)" }}>{detail.canonicalUrl}</a>
                  </div>
                )}
                {detail.author && <div>作者／來源：{detail.author}</div>}
                {detail.publishedAt && <div>發布日期：{fmtDate(detail.publishedAt)}</div>}
                {detail.venue && <div>刊物／平台：{detail.venue}</div>}
                {detail.doi && <div>DOI：{detail.doi}</div>}
                <div>建立於：{fmtDate(detail.createdAt)}</div>
              </div>

              {versions.length > 1 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: "var(--text-muted)", flexBasis: "100%" }}>版本歷史（{versions.length} 版）：</span>
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSourceId(v.id)}
                      style={{
                        border: `1px solid ${v.id === detail.id ? "var(--text-primary)" : "var(--card-border)"}`,
                        background: v.id === detail.id ? "var(--text-primary)" : "var(--bg-canvas)",
                        color: v.id === detail.id ? "var(--bg-canvas)" : "var(--text-secondary)",
                        cursor: "pointer", fontSize: 11, padding: "3px 8px", borderRadius: 4,
                      }}
                    >
                      第 {v.version} 版{v.status === "archived" ? "（已取代）" : ""}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>內容</div>
              {detail.body !== null ? (
                <pre style={{
                  whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit", fontSize: 12,
                  background: "var(--card-bg, transparent)", border: "1px solid var(--border-subtle)",
                  borderRadius: 6, padding: "10px 12px", margin: 0, lineHeight: 1.7,
                }}>
                  {detail.body}
                </pre>
              ) : (
                <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                  此文件建於「內容檢視」功能上線前，尚未存有原文——重新上傳（同標題貼上內容）即可啟用檢視。
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
