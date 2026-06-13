"use client";

import { useState, useRef, useCallback } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────

const LANGUAGES = ["English", "繁體中文", "Simplified Chinese", "Japanese", "Spanish", "French", "German", "Portuguese"];
const COUNTRIES = [
  "Global",
  "Taiwan", "Hong Kong", "Singapore", "Malaysia",
  "United States", "United Kingdom", "Canada", "Australia",
  "Japan", "Germany", "France", "India", "Brazil",
];
const ARTICLE_TYPES = [
  "Pillar Article", "How-to Guide", "Opinion Piece",
  "Comparison", "Tutorial", "Q&A Page", "Listicle", "Case Study",
];
const SIZES = [
  { value: "short",  label: "Short (~1200 words)"  },
  { value: "medium", label: "Medium (~2500 words)" },
  { value: "long",   label: "Long (~4000 words)"   },
];
const TONES = ["Friendly", "Professional", "Educational", "Inspirational", "Warm & Credible"];
const POVS = [
  { value: "none",          label: "None"                          },
  { value: "First person",  label: "First person (I / me)"         },
  { value: "Second person", label: "Second person (you / your)"    },
  { value: "Third person",  label: "Third person (he / she / they)"},
];
const READABILITIES = [
  "6th grade (very easy)", "8th grade (recommended)",
  "10th grade", "College", "Professional",
];

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab       = "generate" | "humanize";
type GenStatus = "idle" | "streaming" | "done" | "error";
type PubStatus = "idle" | "publishing" | "done" | "error";
type SynStatus = "idle" | "generating" | "done" | "error";
type HumStatus = "idle" | "streaming" | "done" | "error";
type RemoveAI  = "none" | "basic" | "extended";
type HumMode   = "humanize" | "rewrite";

interface ArticleStructure {
  quickAnswer: boolean;
  keyTakeaways: boolean;
  comparisonTable: boolean;
  faq: boolean;
  conclusion: boolean;
}

interface GenerateForm {
  keyword: string;
  title: string;
  language: string;
  targetCountry: string;
  articleType: string;
  articleSize: string;
  tone: string;
  pointOfView: string;
  readability: string;
  removeAiWords: RemoveAI;
  details: string;
  nlpKeywords: string;
  outline: string;
  externalLinks: string;
  structure: ArticleStructure;
  generateMeta: boolean;
  scheduleDate: string;
}

interface MetaData { seoTitle: string; metaDesc: string; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

function extractMeta(text: string): MetaData | null {
  const m = text.match(
    /<!-- CONTENT_META_START -->\s*SEO_TITLE:\s*([^\n]+)\s*META_DESC:\s*([^\n]+)\s*<!-- CONTENT_META_END -->/
  );
  if (!m) return null;
  return { seoTitle: m[1].trim(), metaDesc: m[2].trim() };
}

function stripMeta(text: string): string {
  return text
    .replace(/<!-- CONTENT_META_START -->[\s\S]*?<!-- CONTENT_META_END -->/g, "")
    .trim();
}

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

function downloadMd(text: string, filename = "article.md") {
  const blob = new Blob([text], { type: "text/markdown" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_STRUCTURE: ArticleStructure = {
  quickAnswer: true, keyTakeaways: true,
  comparisonTable: true, faq: true, conclusion: true,
};

const DEFAULT_FORM: GenerateForm = {
  keyword: "", title: "", language: "English", targetCountry: "Global",
  articleType: "Pillar Article", articleSize: "medium", tone: "Friendly",
  pointOfView: "none", readability: "8th grade (recommended)", removeAiWords: "none",
  details: "", nlpKeywords: "", outline: "", externalLinks: "",
  structure: { ...DEFAULT_STRUCTURE },
  generateMeta: true, scheduleDate: "",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionToggle({
  label, open, onToggle, children,
}: { label: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--card-border)", borderRadius: "6px", marginBottom: "12px" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 14px", background: "none", border: "none", cursor: "pointer",
          fontSize: "13px", fontWeight: 500, color: "var(--text-primary)",
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ContentStudio() {
  // ── Tab ────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("generate");

  // ── Generate form state ────────────────────────────────────────────────────
  const [form, setForm] = useState<GenerateForm>(DEFAULT_FORM);

  // ── Generate output ────────────────────────────────────────────────────────
  const [generated, setGenerated] = useState("");
  const [metaData, setMetaData]   = useState<MetaData | null>(null);
  const [genStatus, setGenStatus] = useState<GenStatus>("idle");
  const [genError, setGenError]   = useState("");

  // ── Publish ────────────────────────────────────────────────────────────────
  const [pubStatus, setPubStatus]   = useState<PubStatus>("idle");
  const [pubResult, setPubResult]   = useState<{ edit_url?: string; view_url?: string } | null>(null);
  const [pubError, setPubError]     = useState("");

  // ── Title suggestions ──────────────────────────────────────────────────────
  const [titleStatus, setTitleStatus]     = useState<"idle" | "loading">("idle");
  const [titleSuggestions, setTitleSugs]  = useState<string[]>([]);
  const [showTitleDrop, setShowTitleDrop] = useState(false);

  // ── Expanded sections ──────────────────────────────────────────────────────
  const [showNlp,      setShowNlp]      = useState(false);
  const [showOutline,  setShowOutline]  = useState(false);
  const [showExtLinks, setShowExtLinks] = useState(false);
  const [showStruct,   setShowStruct]   = useState(true);

  // ── Syndication ────────────────────────────────────────────────────────────
  const [showSyn, setShowSyn]         = useState(false);
  const [synPlatforms, setSynPlatforms] = useState({ twitter: false, linkedin: false, facebook: false });
  const [synStatus, setSynStatus]     = useState<SynStatus>("idle");
  const [synContent, setSynContent]   = useState<Record<string, string>>({});
  const [synCopied, setSynCopied]     = useState<Record<string, boolean>>({});

  // ── Humanize tab ───────────────────────────────────────────────────────────
  const [humMode,     setHumMode]     = useState<HumMode>("humanize");
  const [humInput,    setHumInput]    = useState("");
  const [humLang,     setHumLang]     = useState("English");
  const [humRead,     setHumRead]     = useState("8th grade (recommended)");
  const [humAiWords,  setHumAiWords]  = useState<RemoveAI>("basic");
  const [humOutput,   setHumOutput]   = useState("");
  const [humStatus,   setHumStatus]   = useState<HumStatus>("idle");
  const [humError,    setHumError]    = useState("");

  // ── Abort refs ─────────────────────────────────────────────────────────────
  const abortRef    = useRef<AbortController | null>(null);
  const humAbortRef = useRef<AbortController | null>(null);

  // ─── Form helpers ──────────────────────────────────────────────────────────

  const setF = useCallback(
    <K extends keyof GenerateForm>(key: K, value: GenerateForm[K]) =>
      setForm(prev => ({ ...prev, [key]: value })),
    []
  );

  const setStruct = useCallback(
    (key: keyof ArticleStructure, value: boolean) =>
      setForm(prev => ({ ...prev, structure: { ...prev.structure, [key]: value } })),
    []
  );

  // ─── Suggest titles ────────────────────────────────────────────────────────

  async function handleSuggestTitles() {
    if (!form.keyword.trim() || titleStatus === "loading") return;
    setTitleStatus("loading");
    setTitleSugs([]);
    try {
      const res  = await fetch("/api/content/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: form.keyword, language: form.language, articleType: form.articleType }),
      });
      const json = await res.json() as { ok: boolean; titles?: string[] };
      if (json.ok && json.titles?.length) {
        setTitleSugs(json.titles);
        setShowTitleDrop(true);
      }
    } catch { /* silent */ } finally {
      setTitleStatus("idle");
    }
  }

  // ─── Generate article ──────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!form.keyword.trim()) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setGenerated(""); setMetaData(null);
    setGenStatus("streaming"); setGenError("");
    setPubStatus("idle"); setPubResult(null);
    setShowSyn(false); setSynStatus("idle"); setSynContent({});

    try {
      const externalLinks = form.externalLinks
        .split("\n")
        .map(u => u.trim())
        .filter(u => /^https?:\/\//.test(u))
        .slice(0, 5);

      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, externalLinks }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        setGenStatus("error");
        setGenError(`Server error: ${res.status}`);
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setGenerated(text);
      }
      text += decoder.decode(); // flush remaining bytes

      const meta = extractMeta(text);
      if (meta) {
        setMetaData(meta);
        setGenerated(stripMeta(text));
      } else {
        setGenerated(text);
      }
      setGenStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setGenStatus("idle");
      } else {
        setGenStatus("error");
        setGenError("Generation failed");
      }
    }
  }

  // ─── Publish to WordPress ──────────────────────────────────────────────────

  async function handlePublish() {
    if (!generated.trim()) return;
    setPubStatus("publishing"); setPubError(""); setPubResult(null);
    try {
      const res  = await fetch("/api/content/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: generated,
          slug: slugify(form.keyword),
          seoTitle: metaData?.seoTitle || undefined,
          metaDescription: metaData?.metaDesc || undefined,
          scheduleDate: form.scheduleDate || undefined,
        }),
      });
      const json = await res.json() as { ok: boolean; error?: string; edit_url?: string; view_url?: string };
      if (!json.ok) {
        setPubStatus("error");
        setPubError(json.error ?? "Unknown error");
      } else {
        setPubStatus("done");
        setPubResult({ edit_url: json.edit_url, view_url: json.view_url });
      }
    } catch {
      setPubStatus("error");
      setPubError("Network error");
    }
  }

  // ─── Generate social posts ─────────────────────────────────────────────────

  async function handleSyndicate() {
    const platforms = Object.entries(synPlatforms)
      .filter(([, v]) => v).map(([k]) => k);
    if (platforms.length === 0 || !generated.trim()) return;
    setSynStatus("generating"); setSynContent({});
    try {
      const res  = await fetch("/api/content/syndicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          article: generated,
          platforms,
          articleUrl: pubResult?.view_url || undefined,
        }),
      });
      const json = await res.json() as { ok: boolean; posts?: Record<string, string>; error?: string };
      if (json.ok && json.posts) {
        setSynContent(json.posts);
        setSynStatus("done");
      } else {
        setSynStatus("error");
      }
    } catch {
      setSynStatus("error");
    }
  }

  // ─── Humanize ─────────────────────────────────────────────────────────────

  async function handleHumanize() {
    if (!humInput.trim()) return;
    humAbortRef.current?.abort();
    const ac = new AbortController();
    humAbortRef.current = ac;

    setHumOutput(""); setHumStatus("streaming"); setHumError("");

    try {
      const res = await fetch("/api/content/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: humInput, mode: humMode,
          language: humLang, readability: humRead, removeAiWords: humAiWords,
        }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        setHumStatus("error"); setHumError(`Server error: ${res.status}`); return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setHumOutput(text);
      }
      text += decoder.decode();
      setHumOutput(text);
      setHumStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") { setHumStatus("idle"); }
      else { setHumStatus("error"); setHumError("Processing failed"); }
    }
  }

  // ─── Computed ─────────────────────────────────────────────────────────────

  const isGenerating = genStatus === "streaming";
  const hasContent   = generated.trim().length > 0;
  const canPublish   = hasContent;
  const isHumanizing = humStatus === "streaming";
  const hasHumOutput = humOutput.trim().length > 0;

  // ─── Styles ───────────────────────────────────────────────────────────────

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 18px", border: "none", cursor: "pointer",
    background: "none", fontSize: "13px", fontWeight: active ? 600 : 400,
    color: active ? "var(--btn-primary-bg, #5855d0)" : "var(--text-muted)",
    borderBottom: active ? "2px solid var(--btn-primary-bg, #5855d0)" : "2px solid transparent",
    marginBottom: "-1px",
  });

  const checkRow: React.CSSProperties = {
    display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "6px",
  };
  const checkLabel: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "6px",
    fontSize: "13px", cursor: "pointer", userSelect: "none",
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "24px", maxWidth: "1400px" }}>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--card-border)", marginBottom: "24px" }}>
        <button style={tabStyle(activeTab === "generate")} onClick={() => setActiveTab("generate")}>
          Generate Article
        </button>
        <button style={tabStyle(activeTab === "humanize")} onClick={() => setActiveTab("humanize")}>
          Humanize / Rewrite
        </button>
        <span style={{ ...tabStyle(false), cursor: "default", opacity: 0.4 }}>Bulk (Soon)</span>
      </div>

      {/* ══════════════ GENERATE TAB ══════════════ */}
      {activeTab === "generate" && (
        <>
          <div className="form-block" style={{ marginBottom: "16px" }}>

            {/* ── Core: Keyword + Title ── */}
            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "14px", color: "var(--text-primary)" }}>
              Article Settings
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
              <div>
                <label className="form-label">Main Keyword *</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    className="form-input"
                    value={form.keyword}
                    onChange={e => setF("keyword", e.target.value)}
                    placeholder="e.g. art-based healing"
                    disabled={isGenerating}
                    style={{ flex: 1 }}
                  />
                  <div style={{ position: "relative" }}>
                    <button
                      className="btn-secondary"
                      onClick={handleSuggestTitles}
                      disabled={isGenerating || !form.keyword.trim() || titleStatus === "loading"}
                      title="Suggest titles from keyword"
                      style={{ whiteSpace: "nowrap", fontSize: "12px" }}
                    >
                      {titleStatus === "loading" ? "…" : "✨ Titles"}
                    </button>
                    {showTitleDrop && titleSuggestions.length > 0 && (
                      <div style={{
                        position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
                        background: "var(--bg-card, #fff)", border: "1px solid var(--card-border)",
                        borderRadius: "6px", boxShadow: "0 4px 12px rgba(0,0,0,.12)",
                        minWidth: "340px", padding: "6px",
                      }}>
                        {titleSuggestions.map((t, i) => (
                          <button
                            key={i}
                            onClick={() => { setF("title", t); setShowTitleDrop(false); }}
                            style={{
                              display: "block", width: "100%", textAlign: "left",
                              padding: "7px 10px", background: "none", border: "none",
                              cursor: "pointer", fontSize: "12px", lineHeight: 1.4,
                              color: "var(--text-primary)", borderRadius: "4px",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover, #f5f5f5)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}
                          >
                            {t}
                          </button>
                        ))}
                        <button
                          onClick={() => setShowTitleDrop(false)}
                          style={{ fontSize: "11px", color: "var(--text-muted)", padding: "4px 10px", background: "none", border: "none", cursor: "pointer" }}
                        >
                          close
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="form-label">Article Title <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span></label>
                <input
                  className="form-input"
                  value={form.title}
                  onChange={e => setF("title", e.target.value)}
                  placeholder="Auto-generated if empty"
                  disabled={isGenerating}
                />
              </div>
            </div>

            {/* ── Row 1: Language + Country + Type + Size ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label className="form-label">Language</label>
                <select className="form-select" value={form.language} onChange={e => setF("language", e.target.value)} disabled={isGenerating}>
                  {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Target Country</label>
                <select className="form-select" value={form.targetCountry} onChange={e => setF("targetCountry", e.target.value)} disabled={isGenerating}>
                  {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Article Type</label>
                <select className="form-select" value={form.articleType} onChange={e => setF("articleType", e.target.value)} disabled={isGenerating}>
                  {ARTICLE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Article Size</label>
                <select className="form-select" value={form.articleSize} onChange={e => setF("articleSize", e.target.value)} disabled={isGenerating}>
                  {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {/* ── Row 2: Tone + POV + Readability + Remove AI Words ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label className="form-label">Tone of Voice</label>
                <select className="form-select" value={form.tone} onChange={e => setF("tone", e.target.value)} disabled={isGenerating}>
                  {TONES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Point of View</label>
                <select className="form-select" value={form.pointOfView} onChange={e => setF("pointOfView", e.target.value)} disabled={isGenerating}>
                  {POVS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Text Readability</label>
                <select className="form-select" value={form.readability} onChange={e => setF("readability", e.target.value)} disabled={isGenerating}>
                  {READABILITIES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">AI Content Cleaning</label>
                <select className="form-select" value={form.removeAiWords} onChange={e => setF("removeAiWords", e.target.value as RemoveAI)} disabled={isGenerating}>
                  <option value="none">None</option>
                  <option value="basic">Basic (remove AI words)</option>
                  <option value="extended">Extended (aggressive)</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Article Structure ── */}
          <SectionToggle label="Article Structure" open={showStruct} onToggle={() => setShowStruct(v => !v)}>
            <div style={checkRow}>
              {(Object.keys(DEFAULT_STRUCTURE) as (keyof ArticleStructure)[]).map(key => (
                <label key={key} style={checkLabel}>
                  <input
                    type="checkbox"
                    checked={form.structure[key]}
                    onChange={e => setStruct(key, e.target.checked)}
                    disabled={isGenerating}
                  />
                  {key === "quickAnswer"    ? "Quick Answer"     :
                   key === "keyTakeaways"   ? "Key Takeaways"    :
                   key === "comparisonTable"? "Comparison Table" :
                   key === "faq"            ? "FAQ"              : "Conclusion"}
                </label>
              ))}
            </div>
            <div style={{ marginTop: "10px" }}>
              <label style={checkLabel}>
                <input
                  type="checkbox"
                  checked={form.generateMeta}
                  onChange={e => setF("generateMeta", e.target.checked)}
                  disabled={isGenerating}
                />
                Generate SEO Meta Title + Description
              </label>
            </div>
          </SectionToggle>

          {/* ── NLP Keywords ── */}
          <SectionToggle label="SEO / NLP Keywords to Include" open={showNlp} onToggle={() => setShowNlp(v => !v)}>
            <label className="form-label" style={{ marginTop: 0 }}>
              Keywords (comma-separated)
              <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>
                — AI will include these naturally, no keyword stuffing
              </span>
            </label>
            <input
              className="form-input"
              value={form.nlpKeywords}
              onChange={e => setF("nlpKeywords", e.target.value)}
              placeholder="e.g. expressive arts, self-discovery, arts-based therapy"
              disabled={isGenerating}
            />
          </SectionToggle>

          {/* ── Outline Editor ── */}
          <SectionToggle label="Outline Editor (Custom H2/H3 headings)" open={showOutline} onToggle={() => setShowOutline(v => !v)}>
            <label className="form-label" style={{ marginTop: 0 }}>
              Custom Outline
              <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>
                — use ## for H2 and ### for H3
              </span>
            </label>
            <textarea
              className="form-textarea"
              style={{ minHeight: "120px", fontFamily: "monospace", fontSize: "12px" }}
              value={form.outline}
              onChange={e => setF("outline", e.target.value)}
              disabled={isGenerating}
              placeholder={"## What Is Art-Based Healing?\n## Benefits of Art-Based Practices\n### Emotional Benefits\n### Cognitive Benefits\n## How to Get Started\n## FAQ\n## Conclusion"}
            />
          </SectionToggle>

          {/* ── External Links ── */}
          <SectionToggle label="External Linking (Custom URLs)" open={showExtLinks} onToggle={() => setShowExtLinks(v => !v)}>
            <label className="form-label" style={{ marginTop: 0 }}>
              URLs to include as contextual links
              <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>
                — one URL per line, max 5
              </span>
            </label>
            <textarea
              className="form-textarea"
              style={{ minHeight: "90px" }}
              value={form.externalLinks}
              onChange={e => setF("externalLinks", e.target.value)}
              disabled={isGenerating}
              placeholder={"https://example.com/resource\nhttps://example.com/study"}
            />
          </SectionToggle>

          {/* ── Brand / Details ── */}
          <div className="form-block" style={{ marginBottom: "16px" }}>
            <label className="form-label">
              Brand Voice / Additional Instructions
              <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>
                — brand name, forbidden claims, YMYL rules, audience notes…
              </span>
            </label>
            <textarea
              className="form-textarea"
              style={{ minHeight: "90px" }}
              value={form.details}
              onChange={e => setF("details", e.target.value)}
              disabled={isGenerating}
              placeholder={`brand_name: "Soulful Expression"\npublic_label: "Arts Practice for Self-Discovery"\nforbidden_claims: ["cure", "heal illness", "guaranteed results"]\naudience: Taiwan-based adults interested in expressive arts`}
            />
          </div>

          {/* ── Publishing Options ── */}
          <div className="form-block" style={{ marginBottom: "20px" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "12px", color: "var(--text-primary)" }}>
              Publishing
            </div>
            <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <label className="form-label">Publish Date</label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <label style={checkLabel}>
                    <input
                      type="radio"
                      name="scheduleMode"
                      checked={!form.scheduleDate}
                      onChange={() => setF("scheduleDate", "")}
                      disabled={isGenerating}
                    />
                    Now (save as draft)
                  </label>
                  <label style={checkLabel}>
                    <input
                      type="radio"
                      name="scheduleMode"
                      checked={!!form.scheduleDate}
                      onChange={() => setF("scheduleDate", new Date(Date.now() + 86400000).toISOString().slice(0, 16))}
                      disabled={isGenerating}
                    />
                    Schedule
                  </label>
                  {form.scheduleDate && (
                    <input
                      type="datetime-local"
                      className="form-input"
                      style={{ width: "auto", fontSize: "12px" }}
                      value={form.scheduleDate}
                      onChange={e => setF("scheduleDate", e.target.value)}
                      disabled={isGenerating}
                    />
                  )}
                </div>
                <div className="form-hint" style={{ marginTop: 4 }}>
                  Status stays &ldquo;Draft&rdquo; — publish manually from WP admin.
                </div>
              </div>
            </div>
          </div>

          {/* ── Generate button ── */}
          <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "28px" }}>
            <button
              className="btn-primary"
              onClick={handleGenerate}
              disabled={isGenerating || !form.keyword.trim()}
              style={{ fontSize: "14px", padding: "10px 24px" }}
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

          {/* ═══════ OUTPUT SECTION ═══════ */}
          {(hasContent || isGenerating) && (
            <div className="form-block">

              {/* ── Header row ── */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
                  Generated Article
                  {isGenerating && <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>streaming…</span>}
                  {genStatus === "done" && <span style={{ fontWeight: 400, color: "#22c55e", marginLeft: 8 }}>✓ done</span>}
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {hasContent && (
                    <>
                      <button className="btn-secondary" style={{ fontSize: "12px" }} onClick={() => copyText(generated)}>Copy MD</button>
                      <button className="btn-secondary" style={{ fontSize: "12px" }} onClick={() => downloadMd(generated, `${slugify(form.keyword) || "article"}.md`)}>↓ .md</button>
                    </>
                  )}
                  {canPublish && pubStatus === "idle" && (
                    <button className="btn-primary" onClick={handlePublish} style={{ fontSize: "13px" }}>
                      Publish to WordPress (draft)
                    </button>
                  )}
                  {pubStatus === "publishing" && (
                    <button className="btn-primary" disabled style={{ fontSize: "13px" }}>Publishing…</button>
                  )}
                  {pubStatus === "done" && pubResult?.edit_url && (
                    <span style={{ fontSize: "13px", color: "#22c55e" }}>
                      ✓ Draft created —{" "}
                      <a href={pubResult.edit_url} target="_blank" rel="noreferrer" style={{ color: "var(--btn-primary-bg)" }}>
                        Edit in WP ↗
                      </a>
                    </span>
                  )}
                  {pubStatus === "error" && (
                    <span style={{ fontSize: "12px", color: "var(--color-error, #ef4444)" }}>
                      Publish failed: {pubError}
                    </span>
                  )}
                </div>
              </div>

              {/* ── Article textarea ── */}
              <textarea
                style={{
                  width: "100%", minHeight: "480px", fontFamily: "monospace",
                  fontSize: "13px", lineHeight: 1.6, padding: "12px",
                  border: "1px solid var(--card-border)", borderRadius: "6px",
                  background: "var(--bg-page, #f8f9fc)", color: "var(--text-primary)",
                  resize: "vertical", boxSizing: "border-box",
                }}
                value={generated}
                onChange={e => setGenerated(e.target.value)}
                spellCheck={false}
                placeholder="Article will appear here…"
              />

              {/* ── Meta fields ── */}
              {metaData && (
                <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label className="form-label">SEO Title <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({metaData.seoTitle.length} chars)</span></label>
                    <input
                      className="form-input"
                      value={metaData.seoTitle}
                      onChange={e => setMetaData(prev => prev ? { ...prev, seoTitle: e.target.value } : prev)}
                    />
                  </div>
                  <div>
                    <label className="form-label">Meta Description <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({metaData.metaDesc.length} chars)</span></label>
                    <input
                      className="form-input"
                      value={metaData.metaDesc}
                      onChange={e => setMetaData(prev => prev ? { ...prev, metaDesc: e.target.value } : prev)}
                    />
                  </div>
                </div>
              )}

              <div className="form-hint" style={{ marginTop: "6px" }}>
                Editable — review before publishing.{" "}
                <code>{"<!-- NEEDS_BRAND_VERIFY -->"}</code> = replace with real brand data,{" "}
                <code>{"<!-- NEEDS_FACT_CHECK -->"}</code> = verify the statistic.
              </div>

              {/* ── Social Syndication ── */}
              {genStatus === "done" && hasContent && (
                <div style={{ marginTop: "16px", borderTop: "1px solid var(--card-border)", paddingTop: "14px" }}>
                  <button
                    onClick={() => setShowSyn(v => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", padding: 0 }}
                  >
                    {showSyn ? "▲" : "▼"} Social Syndication — generate posts from this article
                  </button>

                  {showSyn && (
                    <div style={{ marginTop: "12px" }}>
                      <div style={checkRow}>
                        {(["twitter", "linkedin", "facebook"] as const).map(p => (
                          <label key={p} style={checkLabel}>
                            <input
                              type="checkbox"
                              checked={synPlatforms[p]}
                              onChange={e => setSynPlatforms(prev => ({ ...prev, [p]: e.target.checked }))}
                            />
                            {p === "twitter" ? "Twitter / X" : p.charAt(0).toUpperCase() + p.slice(1)}
                          </label>
                        ))}
                        <button
                          className="btn-primary"
                          style={{ fontSize: "12px", padding: "5px 14px" }}
                          onClick={handleSyndicate}
                          disabled={
                            synStatus === "generating" ||
                            !Object.values(synPlatforms).some(Boolean)
                          }
                        >
                          {synStatus === "generating" ? "Generating…" : "Generate Social Posts"}
                        </button>
                      </div>

                      {synStatus === "done" && Object.keys(synContent).length > 0 && (
                        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                          {Object.entries(synContent).map(([platform, content]) => (
                            <div key={platform} style={{ border: "1px solid var(--card-border)", borderRadius: "6px", padding: "10px 12px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                <span style={{ fontSize: "12px", fontWeight: 600, textTransform: "capitalize" }}>{platform}</span>
                                <button
                                  className="btn-secondary"
                                  style={{ fontSize: "11px", padding: "3px 10px" }}
                                  onClick={() => {
                                    void navigator.clipboard.writeText(content);
                                    setSynCopied(prev => ({ ...prev, [platform]: true }));
                                    setTimeout(() => setSynCopied(prev => ({ ...prev, [platform]: false })), 2000);
                                  }}
                                >
                                  {synCopied[platform] ? "✓ Copied" : "Copy"}
                                </button>
                              </div>
                              <textarea
                                readOnly
                                value={content}
                                style={{
                                  width: "100%", minHeight: "80px", fontFamily: "inherit",
                                  fontSize: "12px", lineHeight: 1.5, padding: "8px",
                                  border: "1px solid var(--card-border)", borderRadius: "4px",
                                  background: "var(--bg-page, #f8f9fc)", resize: "vertical",
                                  boxSizing: "border-box",
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════ HUMANIZE TAB ══════════════ */}
      {activeTab === "humanize" && (
        <div>
          <div className="form-block" style={{ marginBottom: "16px" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "14px", color: "var(--text-primary)" }}>
              Humanize / Rewrite Settings
            </div>

            {/* Mode toggle */}
            <div style={{ display: "flex", gap: "0", marginBottom: "16px", border: "1px solid var(--card-border)", borderRadius: "6px", overflow: "hidden", width: "fit-content" }}>
              {(["humanize", "rewrite"] as HumMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setHumMode(m)}
                  style={{
                    padding: "8px 20px", border: "none", cursor: "pointer", fontSize: "13px",
                    background: humMode === m ? "var(--btn-primary-bg, #5855d0)" : "transparent",
                    color: humMode === m ? "#fff" : "var(--text-primary)",
                    fontWeight: humMode === m ? 600 : 400,
                  }}
                >
                  {m === "humanize" ? "Humanize Text" : "Rewrite for SEO"}
                </button>
              ))}
            </div>

            {/* Settings row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "14px" }}>
              <div>
                <label className="form-label">Language</label>
                <select className="form-select" value={humLang} onChange={e => setHumLang(e.target.value)} disabled={isHumanizing}>
                  {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Target Readability</label>
                <select className="form-select" value={humRead} onChange={e => setHumRead(e.target.value)} disabled={isHumanizing}>
                  {READABILITIES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">AI Content Cleaning</label>
                <select className="form-select" value={humAiWords} onChange={e => setHumAiWords(e.target.value as RemoveAI)} disabled={isHumanizing}>
                  <option value="none">None</option>
                  <option value="basic">Basic</option>
                  <option value="extended">Extended</option>
                </select>
              </div>
            </div>

            {/* Input */}
            <label className="form-label">Input Text *</label>
            <textarea
              className="form-textarea"
              style={{ minHeight: "240px" }}
              value={humInput}
              onChange={e => setHumInput(e.target.value)}
              disabled={isHumanizing}
              placeholder="Paste your AI-generated article or text here…"
            />

            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "12px" }}>
              <button
                className="btn-primary"
                onClick={handleHumanize}
                disabled={isHumanizing || !humInput.trim()}
              >
                {isHumanizing ? "Processing…" : humMode === "humanize" ? "Humanize Text" : "Rewrite for SEO"}
              </button>
              {isHumanizing && (
                <button
                  className="btn-secondary"
                  onClick={() => { humAbortRef.current?.abort(); setHumStatus("idle"); }}
                >
                  Stop
                </button>
              )}
              {humStatus === "error" && (
                <span style={{ color: "var(--color-error, #ef4444)", fontSize: "13px" }}>{humError}</span>
              )}
            </div>
          </div>

          {/* Humanize output */}
          {(hasHumOutput || isHumanizing) && (
            <div className="form-block">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
                  Output
                  {isHumanizing && <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>streaming…</span>}
                  {humStatus === "done" && <span style={{ fontWeight: 400, color: "#22c55e", marginLeft: 8 }}>✓ done</span>}
                </div>
                {hasHumOutput && (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button className="btn-secondary" style={{ fontSize: "12px" }} onClick={() => copyText(humOutput)}>Copy</button>
                    <button className="btn-secondary" style={{ fontSize: "12px" }} onClick={() => downloadMd(humOutput, "humanized.md")}>↓ .md</button>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: "12px" }}
                      onClick={() => { setHumInput(humOutput); setHumOutput(""); setHumStatus("idle"); }}
                      title="Use this output as new input"
                    >
                      ↺ Re-process
                    </button>
                  </div>
                )}
              </div>
              <textarea
                style={{
                  width: "100%", minHeight: "400px", fontFamily: "monospace",
                  fontSize: "13px", lineHeight: 1.6, padding: "12px",
                  border: "1px solid var(--card-border)", borderRadius: "6px",
                  background: "var(--bg-page, #f8f9fc)", color: "var(--text-primary)",
                  resize: "vertical", boxSizing: "border-box",
                }}
                value={humOutput}
                onChange={e => setHumOutput(e.target.value)}
                spellCheck={false}
                placeholder="Humanized text will appear here…"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
