"use client";

import { useState, useRef } from "react";

const LANGUAGES = ["English", "繁體中文", "Simplified Chinese"];
const ARTICLE_TYPES = [
  "Pillar Article",
  "How-to Guide",
  "Opinion Piece",
  "Comparison",
  "Tutorial",
  "Q&A Page",
  "Listicle",
  "Case Study",
];
const SIZES = [
  { value: "short",  label: "Short (~1200 words)" },
  { value: "medium", label: "Medium (~2500 words)" },
  { value: "long",   label: "Long (~4000 words)" },
];
const TONES = ["Friendly", "Professional", "Educational", "Inspirational", "Warm & Credible"];
const POVS = [
  { value: "none",         label: "None" },
  { value: "First person", label: "First person (I / me)" },
  { value: "Second person", label: "Second person (you / your)" },
  { value: "Third person", label: "Third person (he / she / they)" },
];
const READABILITIES = [
  "6th grade (very easy)",
  "8th grade (recommended)",
  "10th grade",
  "College",
  "Professional",
];

interface FormState {
  keyword: string;
  title: string;
  language: string;
  articleType: string;
  articleSize: string;
  tone: string;
  pointOfView: string;
  readability: string;
  details: string;
}

type GenStatus = "idle" | "streaming" | "done" | "error";
type PubStatus = "idle" | "publishing" | "done" | "error";

const DEFAULT_FORM: FormState = {
  keyword: "",
  title: "",
  language: "English",
  articleType: "Pillar Article",
  articleSize: "medium",
  tone: "Friendly",
  pointOfView: "none",
  readability: "8th grade (recommended)",
  details: "",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

export default function ContentStudio() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [generated, setGenerated] = useState("");
  const [genStatus, setGenStatus] = useState<GenStatus>("idle");
  const [genError, setGenError] = useState("");
  const [pubStatus, setPubStatus] = useState<PubStatus>("idle");
  const [pubResult, setPubResult] = useState<{ edit_url?: string; view_url?: string } | null>(null);
  const [pubError, setPubError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  function set(key: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleGenerate() {
    if (!form.keyword.trim()) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setGenerated("");
    setGenStatus("streaming");
    setGenError("");
    setPubStatus("idle");
    setPubResult(null);

    try {
      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        setGenStatus("error");
        setGenError(`Server error: ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setGenerated(text);
      }
      setGenStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setGenStatus("idle");
      } else {
        setGenStatus("error");
        setGenError(String(err));
      }
    }
  }

  async function handlePublish() {
    if (!generated.trim()) return;
    setPubStatus("publishing");
    setPubError("");
    setPubResult(null);

    try {
      const res = await fetch("/api/content/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: generated, slug: slugify(form.keyword) }),
      });
      const json = await res.json() as { ok: boolean; error?: string; edit_url?: string; view_url?: string };
      if (!json.ok) {
        setPubStatus("error");
        setPubError(json.error ?? "unknown error");
      } else {
        setPubStatus("done");
        setPubResult({ edit_url: json.edit_url, view_url: json.view_url });
      }
    } catch (err) {
      setPubStatus("error");
      setPubError(String(err));
    }
  }

  const isGenerating = genStatus === "streaming";
  const hasContent = generated.trim().length > 0;

  return (
    <div style={{ padding: "24px", maxWidth: "1400px" }}>

      {/* ── Settings ──────────────────────────────── */}
      <div className="form-block" style={{ marginBottom: "24px" }}>
        <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "16px", color: "var(--text-primary)" }}>
          Article Settings
        </div>

        {/* Row 1: keyword + title */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          <div>
            <label className="form-label">Main Keyword *</label>
            <input
              className="form-input"
              value={form.keyword}
              onChange={e => set("keyword", e.target.value)}
              placeholder="e.g. art-based healing"
              disabled={isGenerating}
            />
          </div>
          <div>
            <label className="form-label">Article Title (optional — auto-generated if empty)</label>
            <input
              className="form-input"
              value={form.title}
              onChange={e => set("title", e.target.value)}
              placeholder="e.g. What Is Art-Based Healing?"
              disabled={isGenerating}
            />
          </div>
        </div>

        {/* Row 2: language + type + size */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          <div>
            <label className="form-label">Language</label>
            <select className="form-select" value={form.language} onChange={e => set("language", e.target.value)} disabled={isGenerating}>
              {LANGUAGES.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Article Type</label>
            <select className="form-select" value={form.articleType} onChange={e => set("articleType", e.target.value)} disabled={isGenerating}>
              {ARTICLE_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Article Size</label>
            <select className="form-select" value={form.articleSize} onChange={e => set("articleSize", e.target.value)} disabled={isGenerating}>
              {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Row 3: tone + POV + readability */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          <div>
            <label className="form-label">Tone of Voice</label>
            <select className="form-select" value={form.tone} onChange={e => set("tone", e.target.value)} disabled={isGenerating}>
              {TONES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Point of View</label>
            <select className="form-select" value={form.pointOfView} onChange={e => set("pointOfView", e.target.value)} disabled={isGenerating}>
              {POVS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Text Readability</label>
            <select className="form-select" value={form.readability} onChange={e => set("readability", e.target.value)} disabled={isGenerating}>
              {READABILITIES.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {/* Details */}
        <div style={{ marginBottom: "16px" }}>
          <label className="form-label">
            Brand / Additional Instructions
            <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: "6px" }}>
              (brand knowledge base, forbidden claims, YMYL rules…)
            </span>
          </label>
          <textarea
            className="form-textarea"
            style={{ minHeight: "100px" }}
            value={form.details}
            onChange={e => set("details", e.target.value)}
            disabled={isGenerating}
            placeholder={`brand_name: "Soulful Expression"\npublic_label: "Arts Practice for Self-Discovery"\nforbidden_claims: ["cure", "heal illness", "guaranteed results"]\n...`}
          />
        </div>

        {/* Generate button */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button
            className="btn-primary"
            onClick={handleGenerate}
            disabled={isGenerating || !form.keyword.trim()}
          >
            {isGenerating ? "Generating…" : "Generate Article"}
          </button>
          {isGenerating && (
            <button
              className="btn-secondary"
              onClick={() => { abortRef.current?.abort(); setGenStatus("idle"); }}
            >
              Stop
            </button>
          )}
          {genStatus === "error" && (
            <span style={{ color: "var(--color-error, #ef4444)", fontSize: "13px" }}>{genError}</span>
          )}
        </div>
      </div>

      {/* ── Output ────────────────────────────────── */}
      {(hasContent || isGenerating) && (
        <div className="form-block">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
              Generated Article
              {isGenerating && (
                <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: "8px" }}>streaming…</span>
              )}
              {genStatus === "done" && (
                <span style={{ fontWeight: 400, color: "#22c55e", marginLeft: "8px" }}>✓ done</span>
              )}
            </div>

            {genStatus === "done" && (
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                {pubStatus === "idle" && (
                  <button className="btn-primary" onClick={handlePublish}>
                    Publish to WordPress (draft)
                  </button>
                )}
                {pubStatus === "publishing" && (
                  <button className="btn-primary" disabled>Publishing…</button>
                )}
                {pubStatus === "done" && pubResult?.edit_url && (
                  <span style={{ fontSize: "13px", color: "#22c55e" }}>
                    ✓ Draft created —{" "}
                    <a href={pubResult.edit_url} target="_blank" rel="noreferrer"
                      style={{ color: "var(--btn-primary-bg)" }}>Edit in WP ↗</a>
                  </span>
                )}
                {pubStatus === "error" && (
                  <span style={{ fontSize: "13px", color: "var(--color-error, #ef4444)" }}>
                    Publish failed: {pubError}
                  </span>
                )}
              </div>
            )}
          </div>

          <textarea
            style={{
              width: "100%",
              minHeight: "480px",
              fontFamily: "monospace",
              fontSize: "13px",
              lineHeight: 1.6,
              padding: "12px",
              border: "1px solid var(--card-border)",
              borderRadius: "6px",
              background: "var(--bg-page, #f8f9fc)",
              color: "var(--text-primary)",
              resize: "vertical",
              boxSizing: "border-box",
            }}
            value={generated}
            onChange={e => setGenerated(e.target.value)}
            spellCheck={false}
            placeholder="Article will appear here…"
          />
          <div className="form-hint" style={{ marginTop: "6px" }}>
            Editable — review before publishing.{" "}
            <code>{"<!-- NEEDS_BRAND_VERIFY -->"}</code> = replace with real brand data,{" "}
            <code>{"<!-- NEEDS_FACT_CHECK -->"}</code> = verify the statistic.
          </div>
        </div>
      )}
    </div>
  );
}
