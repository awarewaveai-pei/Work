"use client";

import { useState, useRef, useCallback } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────

const LANGUAGES = ["English", "繁體中文", "簡體中文", "日文", "西班牙文", "法文", "德文", "葡萄牙文"];

const COUNTRIES = [
  "全球（不指定）",
  "台灣", "香港", "新加坡", "馬來西亞",
  "美國", "英國", "加拿大", "澳洲",
  "日本", "德國", "法國", "印度", "巴西",
];

const ARTICLE_TYPES = [
  { value: "Pillar Article",  label: "支柱文章" },
  { value: "How-to Guide",    label: "操作指南" },
  { value: "Opinion Piece",   label: "觀點文章" },
  { value: "Comparison",      label: "比較評測" },
  { value: "Tutorial",        label: "教學教程" },
  { value: "Q&A Page",        label: "Q&A 問答頁" },
  { value: "Listicle",        label: "列表文章" },
  { value: "Case Study",      label: "案例研究" },
];

const SIZES = [
  { value: "short",  label: "短篇（約 1200 字）" },
  { value: "medium", label: "中篇（約 2500 字）"  },
  { value: "long",   label: "長篇（約 4000 字）"  },
];

const TONES = [
  { value: "Friendly",          label: "親切友善" },
  { value: "Professional",      label: "專業正式" },
  { value: "Educational",       label: "教育啟發" },
  { value: "Inspirational",     label: "鼓舞人心" },
  { value: "Warm & Credible",   label: "溫暖可信" },
];

const POVS = [
  { value: "none",          label: "不指定" },
  { value: "First person",  label: "第一人稱（我）" },
  { value: "Second person", label: "第二人稱（你）" },
  { value: "Third person",  label: "第三人稱（他／她）" },
];

const READABILITIES = [
  { value: "6th grade (very easy)",     label: "簡單（6 年級）" },
  { value: "8th grade (recommended)",   label: "推薦（8 年級）" },
  { value: "10th grade",                label: "一般（10 年級）" },
  { value: "College",                   label: "大學程度" },
  { value: "Professional",              label: "專業級" },
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
  keyword: "", title: "", language: "English", targetCountry: "全球（不指定）",
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
  const [showSyn, setShowSyn]           = useState(false);
  const [synPlatforms, setSynPlatforms] = useState({ twitter: false, linkedin: false, facebook: false });
  const [synStatus, setSynStatus]       = useState<SynStatus>("idle");
  const [synContent, setSynContent]     = useState<Record<string, string>>({});
  const [synCopied, setSynCopied]       = useState<Record<string, boolean>>({});

  // ── Humanize tab ───────────────────────────────────────────────────────────
  const [humMode,    setHumMode]    = useState<HumMode>("humanize");
  const [humInput,   setHumInput]   = useState("");
  const [humLang,    setHumLang]    = useState("English");
  const [humRead,    setHumRead]    = useState("8th grade (recommended)");
  const [humAiWords, setHumAiWords] = useState<RemoveAI>("basic");
  const [humOutput,  setHumOutput]  = useState("");
  const [humStatus,  setHumStatus]  = useState<HumStatus>("idle");
  const [humError,   setHumError]   = useState("");

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
        setGenError(`伺服器錯誤：${res.status}`);
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
      text += decoder.decode();

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
        setGenError("產生失敗，請重試");
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
        setPubError(json.error ?? "未知錯誤");
      } else {
        setPubStatus("done");
        setPubResult({ edit_url: json.edit_url, view_url: json.view_url });
      }
    } catch {
      setPubStatus("error");
      setPubError("網路錯誤");
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
        body: JSON.stringify({ article: generated, platforms, articleUrl: pubResult?.view_url }),
      });
      const json = await res.json() as { ok: boolean; posts?: Record<string, string> };
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
        body: JSON.stringify({ text: humInput, mode: humMode, language: humLang, readability: humRead, removeAiWords: humAiWords }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        setHumStatus("error"); setHumError(`伺服器錯誤：${res.status}`); return;
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
      else { setHumStatus("error"); setHumError("處理失敗，請重試"); }
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
          產文
        </button>
        <button style={tabStyle(activeTab === "humanize")} onClick={() => setActiveTab("humanize")}>
          人性化 / 改寫
        </button>
        <span style={{ ...tabStyle(false), cursor: "default", opacity: 0.4 }}>批量（即將推出）</span>
      </div>

      {/* ══════════════ 產文頁籤 ══════════════ */}
      {activeTab === "generate" && (
        <>
          <div className="form-block" style={{ marginBottom: "16px" }}>

            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "14px", color: "var(--text-primary)" }}>
              文章設定
            </div>

            {/* ── 關鍵字 + 標題 ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
              <div>
                <label className="form-label">主要關鍵字 *</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    className="form-input"
                    value={form.keyword}
                    onChange={e => setF("keyword", e.target.value)}
                    placeholder="例：藝術療癒"
                    disabled={isGenerating}
                    style={{ flex: 1 }}
                  />
                  <div style={{ position: "relative" }}>
                    <button
                      className="btn-secondary"
                      onClick={handleSuggestTitles}
                      disabled={isGenerating || !form.keyword.trim() || titleStatus === "loading"}
                      title="AI 建議 5 個標題"
                      style={{ whiteSpace: "nowrap", fontSize: "12px" }}
                    >
                      {titleStatus === "loading" ? "…" : "✨ 建議標題"}
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
                          關閉
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="form-label">文章標題 <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>（選填，空白則自動生成）</span></label>
                <input
                  className="form-input"
                  value={form.title}
                  onChange={e => setF("title", e.target.value)}
                  placeholder="例：什麼是藝術療癒？"
                  disabled={isGenerating}
                />
              </div>
            </div>

            {/* ── 語言 / 地區 / 類型 / 長度 ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label className="form-label">語言</label>
                <select className="form-select" value={form.language} onChange={e => setF("language", e.target.value)} disabled={isGenerating}>
                  {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">目標地區</label>
                <select className="form-select" value={form.targetCountry} onChange={e => setF("targetCountry", e.target.value)} disabled={isGenerating}>
                  {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">文章類型</label>
                <select className="form-select" value={form.articleType} onChange={e => setF("articleType", e.target.value)} disabled={isGenerating}>
                  {ARTICLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">文章長度</label>
                <select className="form-select" value={form.articleSize} onChange={e => setF("articleSize", e.target.value)} disabled={isGenerating}>
                  {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {/* ── 語氣 / 視角 / 可讀性 / AI 清理 ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label className="form-label">語氣風格</label>
                <select className="form-select" value={form.tone} onChange={e => setF("tone", e.target.value)} disabled={isGenerating}>
                  {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">人稱視角</label>
                <select className="form-select" value={form.pointOfView} onChange={e => setF("pointOfView", e.target.value)} disabled={isGenerating}>
                  {POVS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">閱讀難度</label>
                <select className="form-select" value={form.readability} onChange={e => setF("readability", e.target.value)} disabled={isGenerating}>
                  {READABILITIES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">AI 用詞清理</label>
                <select className="form-select" value={form.removeAiWords} onChange={e => setF("removeAiWords", e.target.value as RemoveAI)} disabled={isGenerating}>
                  <option value="none">關閉</option>
                  <option value="basic">基本（去除常見 AI 用詞）</option>
                  <option value="extended">加強（深度清理）</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── 文章結構 ── */}
          <SectionToggle label="文章結構" open={showStruct} onToggle={() => setShowStruct(v => !v)}>
            <div style={checkRow}>
              {(Object.keys(DEFAULT_STRUCTURE) as (keyof ArticleStructure)[]).map(key => (
                <label key={key} style={checkLabel}>
                  <input
                    type="checkbox"
                    checked={form.structure[key]}
                    onChange={e => setStruct(key, e.target.checked)}
                    disabled={isGenerating}
                  />
                  {key === "quickAnswer"    ? "快速解答"   :
                   key === "keyTakeaways"   ? "重點摘要"   :
                   key === "comparisonTable"? "比較表格"   :
                   key === "faq"            ? "FAQ 常見問答" : "結語 CTA"}
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
                自動生成 SEO 標題 + Meta 描述
              </label>
            </div>
          </SectionToggle>

          {/* ── SEO 關鍵字 ── */}
          <SectionToggle label="SEO / NLP 關鍵字" open={showNlp} onToggle={() => setShowNlp(v => !v)}>
            <label className="form-label" style={{ marginTop: 0 }}>
              關鍵字列表（逗號分隔）
              <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>
                — AI 自然融入，不塞字
              </span>
            </label>
            <input
              className="form-input"
              value={form.nlpKeywords}
              onChange={e => setF("nlpKeywords", e.target.value)}
              placeholder="例：表達藝術, 自我探索, 藝術工作坊, 創意療癒"
              disabled={isGenerating}
            />
          </SectionToggle>

          {/* ── 大綱編輯器 ── */}
          <SectionToggle label="大綱編輯器（自訂 H2/H3 標題）" open={showOutline} onToggle={() => setShowOutline(v => !v)}>
            <label className="form-label" style={{ marginTop: 0 }}>
              自訂大綱
              <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>
                — ## 為 H2，### 為 H3
              </span>
            </label>
            <textarea
              className="form-textarea"
              style={{ minHeight: "120px", fontFamily: "monospace", fontSize: "12px" }}
              value={form.outline}
              onChange={e => setF("outline", e.target.value)}
              disabled={isGenerating}
              placeholder={"## 什麼是藝術療癒？\n## 藝術療癒的好處\n### 情緒層面\n### 認知層面\n## 如何開始\n## FAQ\n## 結語"}
            />
          </SectionToggle>

          {/* ── 外部連結 ── */}
          <SectionToggle label="外部連結（自訂 URL）" open={showExtLinks} onToggle={() => setShowExtLinks(v => !v)}>
            <label className="form-label" style={{ marginTop: 0 }}>
              指定插入的外部連結
              <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>
                — 每行一個，最多 5 個
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

          {/* ── 品牌說明 ── */}
          <div className="form-block" style={{ marginBottom: "16px" }}>
            <label className="form-label">
              品牌語調 / 額外指示
              <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>
                — 品牌名稱、禁用詞、YMYL 規則、目標受眾…
              </span>
            </label>
            <textarea
              className="form-textarea"
              style={{ minHeight: "90px" }}
              value={form.details}
              onChange={e => setF("details", e.target.value)}
              disabled={isGenerating}
              placeholder={`brand_name: "Soulful Expression"\npublic_label: "藝術自我探索工作坊"\nforbidden_claims: ["治癒", "治療疾病", "保證效果"]\naudience: 對表達藝術有興趣的台灣成人`}
            />
          </div>

          {/* ── 發布設定 ── */}
          <div className="form-block" style={{ marginBottom: "20px" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "12px", color: "var(--text-primary)" }}>
              發布設定
            </div>
            <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <label className="form-label">發布日期</label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <label style={checkLabel}>
                    <input
                      type="radio"
                      name="scheduleMode"
                      checked={!form.scheduleDate}
                      onChange={() => setF("scheduleDate", "")}
                      disabled={isGenerating}
                    />
                    立即存為草稿
                  </label>
                  <label style={checkLabel}>
                    <input
                      type="radio"
                      name="scheduleMode"
                      checked={!!form.scheduleDate}
                      onChange={() => setF("scheduleDate", new Date(Date.now() + 86400000).toISOString().slice(0, 16))}
                      disabled={isGenerating}
                    />
                    排程
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
                  狀態保持「草稿」，需從 WP 後台手動發布。
                </div>
              </div>
            </div>
          </div>

          {/* ── 產生按鈕 ── */}
          <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "28px" }}>
            <button
              className="btn-primary"
              onClick={handleGenerate}
              disabled={isGenerating || !form.keyword.trim()}
              style={{ fontSize: "14px", padding: "10px 24px" }}
            >
              {isGenerating ? "產生中…" : "產生文章"}
            </button>
            {isGenerating && (
              <button
                className="btn-secondary"
                onClick={() => { abortRef.current?.abort(); setGenStatus("idle"); }}
              >
                停止
              </button>
            )}
            {genStatus === "error" && (
              <span style={{ color: "var(--color-error, #ef4444)", fontSize: "13px" }}>{genError}</span>
            )}
          </div>

          {/* ═══════ 輸出區 ═══════ */}
          {(hasContent || isGenerating) && (
            <div className="form-block">

              {/* ── 標題列 ── */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
                  產出文章
                  {isGenerating && <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>串流中…</span>}
                  {genStatus === "done" && <span style={{ fontWeight: 400, color: "#22c55e", marginLeft: 8 }}>✓ 完成</span>}
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {hasContent && (
                    <>
                      <button className="btn-secondary" style={{ fontSize: "12px" }} onClick={() => void navigator.clipboard.writeText(generated)}>複製 MD</button>
                      <button className="btn-secondary" style={{ fontSize: "12px" }} onClick={() => downloadMd(generated, `${slugify(form.keyword) || "article"}.md`)}>↓ .md</button>
                    </>
                  )}
                  {canPublish && pubStatus === "idle" && (
                    <button className="btn-primary" onClick={handlePublish} style={{ fontSize: "13px" }}>
                      推送到 WordPress（草稿）
                    </button>
                  )}
                  {pubStatus === "publishing" && (
                    <button className="btn-primary" disabled style={{ fontSize: "13px" }}>推送中…</button>
                  )}
                  {pubStatus === "done" && pubResult?.edit_url && (
                    <span style={{ fontSize: "13px", color: "#22c55e" }}>
                      ✓ 草稿已建立 —{" "}
                      <a href={pubResult.edit_url} target="_blank" rel="noreferrer" style={{ color: "var(--btn-primary-bg)" }}>
                        WP 後台編輯 ↗
                      </a>
                    </span>
                  )}
                  {pubStatus === "error" && (
                    <span style={{ fontSize: "12px", color: "var(--color-error, #ef4444)" }}>
                      推送失敗：{pubError}
                    </span>
                  )}
                </div>
              </div>

              {/* ── 文章內容 ── */}
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
                placeholder="文章將在此串流顯示…"
              />

              {/* ── Meta 欄位 ── */}
              {metaData && (
                <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label className="form-label">SEO 標題 <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>（{metaData.seoTitle.length} 字元）</span></label>
                    <input
                      className="form-input"
                      value={metaData.seoTitle}
                      onChange={e => setMetaData(prev => prev ? { ...prev, seoTitle: e.target.value } : prev)}
                    />
                  </div>
                  <div>
                    <label className="form-label">Meta 描述 <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>（{metaData.metaDesc.length} 字元）</span></label>
                    <input
                      className="form-input"
                      value={metaData.metaDesc}
                      onChange={e => setMetaData(prev => prev ? { ...prev, metaDesc: e.target.value } : prev)}
                    />
                  </div>
                </div>
              )}

              <div className="form-hint" style={{ marginTop: "6px" }}>
                可直接編輯後推送。<code>{"<!-- NEEDS_BRAND_VERIFY -->"}</code> = 填入真實品牌資料，<code>{"<!-- NEEDS_FACT_CHECK -->"}</code> = 需核實數據。
              </div>

              {/* ── 社群分發 ── */}
              {genStatus === "done" && hasContent && (
                <div style={{ marginTop: "16px", borderTop: "1px solid var(--card-border)", paddingTop: "14px" }}>
                  <button
                    onClick={() => setShowSyn(v => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", padding: 0 }}
                  >
                    {showSyn ? "▲" : "▼"} 社群分發 — 自動生成各平台貼文
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
                            {p === "twitter" ? "Twitter / X" : p === "linkedin" ? "LinkedIn" : "Facebook"}
                          </label>
                        ))}
                        <button
                          className="btn-primary"
                          style={{ fontSize: "12px", padding: "5px 14px" }}
                          onClick={handleSyndicate}
                          disabled={synStatus === "generating" || !Object.values(synPlatforms).some(Boolean)}
                        >
                          {synStatus === "generating" ? "生成中…" : "生成社群貼文"}
                        </button>
                      </div>

                      {synStatus === "done" && Object.keys(synContent).length > 0 && (
                        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                          {Object.entries(synContent).map(([platform, content]) => (
                            <div key={platform} style={{ border: "1px solid var(--card-border)", borderRadius: "6px", padding: "10px 12px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                <span style={{ fontSize: "12px", fontWeight: 600 }}>
                                  {platform === "twitter" ? "Twitter / X" : platform === "linkedin" ? "LinkedIn" : "Facebook"}
                                </span>
                                <button
                                  className="btn-secondary"
                                  style={{ fontSize: "11px", padding: "3px 10px" }}
                                  onClick={() => {
                                    void navigator.clipboard.writeText(content);
                                    setSynCopied(prev => ({ ...prev, [platform]: true }));
                                    setTimeout(() => setSynCopied(prev => ({ ...prev, [platform]: false })), 2000);
                                  }}
                                >
                                  {synCopied[platform] ? "✓ 已複製" : "複製"}
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

      {/* ══════════════ 人性化頁籤 ══════════════ */}
      {activeTab === "humanize" && (
        <div>
          <div className="form-block" style={{ marginBottom: "16px" }}>
            <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "14px", color: "var(--text-primary)" }}>
              人性化 / 改寫設定
            </div>

            {/* 模式切換 */}
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
                  {m === "humanize" ? "人性化文字" : "SEO 改寫"}
                </button>
              ))}
            </div>

            {/* 設定列 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "14px" }}>
              <div>
                <label className="form-label">語言</label>
                <select className="form-select" value={humLang} onChange={e => setHumLang(e.target.value)} disabled={isHumanizing}>
                  {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">目標閱讀難度</label>
                <select className="form-select" value={humRead} onChange={e => setHumRead(e.target.value)} disabled={isHumanizing}>
                  {READABILITIES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">AI 用詞清理</label>
                <select className="form-select" value={humAiWords} onChange={e => setHumAiWords(e.target.value as RemoveAI)} disabled={isHumanizing}>
                  <option value="none">關閉</option>
                  <option value="basic">基本</option>
                  <option value="extended">加強</option>
                </select>
              </div>
            </div>

            {/* 輸入 */}
            <label className="form-label">輸入文字 *</label>
            <textarea
              className="form-textarea"
              style={{ minHeight: "240px" }}
              value={humInput}
              onChange={e => setHumInput(e.target.value)}
              disabled={isHumanizing}
              placeholder="貼上要處理的 AI 文章或任何文字…"
            />

            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "12px" }}>
              <button
                className="btn-primary"
                onClick={handleHumanize}
                disabled={isHumanizing || !humInput.trim()}
              >
                {isHumanizing ? "處理中…" : humMode === "humanize" ? "人性化文字" : "SEO 改寫"}
              </button>
              {isHumanizing && (
                <button
                  className="btn-secondary"
                  onClick={() => { humAbortRef.current?.abort(); setHumStatus("idle"); }}
                >
                  停止
                </button>
              )}
              {humStatus === "error" && (
                <span style={{ color: "var(--color-error, #ef4444)", fontSize: "13px" }}>{humError}</span>
              )}
            </div>
          </div>

          {/* 輸出 */}
          {(hasHumOutput || isHumanizing) && (
            <div className="form-block">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
                  輸出結果
                  {isHumanizing && <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>串流中…</span>}
                  {humStatus === "done" && <span style={{ fontWeight: 400, color: "#22c55e", marginLeft: 8 }}>✓ 完成</span>}
                </div>
                {hasHumOutput && (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button className="btn-secondary" style={{ fontSize: "12px" }} onClick={() => void navigator.clipboard.writeText(humOutput)}>複製</button>
                    <button className="btn-secondary" style={{ fontSize: "12px" }} onClick={() => downloadMd(humOutput, "humanized.md")}>↓ .md</button>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: "12px" }}
                      onClick={() => { setHumInput(humOutput); setHumOutput(""); setHumStatus("idle"); }}
                      title="將此輸出作為新輸入再處理"
                    >
                      ↺ 再處理
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
                placeholder="處理後文字將在此顯示…"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
