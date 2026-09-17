"use client";

import { useState, useEffect, type CSSProperties } from "react";
import Link from "next/link";
import { roleHeader } from "@/lib/ops-role";
import { WpUpdateButtons } from "./WpUpdateButtons";
import { CollectionSourcesPanel } from "@/app/(shell)/ops/collect/CollectionSourcesPanel";
import { KnowledgeDetailModal } from "./KnowledgeDetailModal";
import type { ClientConfig, WpUpdateLatest } from "@/app/api/ops/clients/route";
import type { DepartmentSummaryPayload } from "@/app/api/ops/clients/[slug]/department-summary/route";
import type { SiteContentDefaults } from "@/app/api/content/sites/route";

// ── Content-defaults dropdown options (mirror ContentStudio constants) ─────────

const LANGUAGES = ["English", "繁體中文", "簡體中文", "日文", "西班牙文", "法文", "德文", "葡萄牙文"];
const COUNTRIES = [
  "全球（不指定）", "台灣", "香港", "新加坡", "馬來西亞",
  "美國", "英國", "加拿大", "澳洲", "日本", "德國", "法國", "印度", "巴西",
];
const ARTICLE_TYPES = [
  { value: "Pillar Article", label: "支柱文章" }, { value: "How-to Guide", label: "操作指南" },
  { value: "Opinion Piece",  label: "觀點文章" }, { value: "Comparison",    label: "比較評測" },
  { value: "Tutorial",       label: "教學教程" }, { value: "Q&A Page",      label: "Q&A 問答頁" },
  { value: "Listicle",       label: "列表文章" }, { value: "Case Study",    label: "案例研究" },
];
const TONES = [
  { value: "Friendly",        label: "親切友善" }, { value: "Professional",    label: "專業正式" },
  { value: "Educational",     label: "教育啟發" }, { value: "Inspirational",   label: "鼓舞人心" },
  { value: "Warm & Credible", label: "溫暖可信" },
];
const POVS = [
  { value: "none",          label: "不指定" },        { value: "First person",  label: "第一人稱（我）" },
  { value: "Second person", label: "第二人稱（你）" }, { value: "Third person",  label: "第三人稱（他／她）" },
];
const READABILITIES = [
  { value: "6th grade (very easy)",   label: "簡單（6 年級）" },
  { value: "8th grade (recommended)", label: "推薦（8 年級）" },
  { value: "10th grade",              label: "一般（10 年級）" },
  { value: "College",                 label: "大學程度" },
  { value: "Professional",            label: "專業級" },
];
const FUNNEL_STAGES = [
  { value: "",              label: "不指定" },
  { value: "awareness",     label: "認知（剛發現問題）" },
  { value: "interest",      label: "興趣（在比較方案）" },
  { value: "consideration", label: "考慮（評估是否適合）" },
  { value: "decision",      label: "決策（準備購買）" },
  { value: "retention",     label: "留存（深化既有客戶）" },
];
const PRICE_POSITIONS = [
  { value: "",        label: "不指定" },
  { value: "premium", label: "高端精品（價值與稀缺）" },
  { value: "midhigh", label: "中高端（品質與專業）" },
  { value: "mid",     label: "中端（性價比）" },
  { value: "value",   label: "平價親民" },
];

// ── Audience profile chip constants (mirrors ScriptForge.tsx) ─────────────────

const CONTENT_GOALS = ["吸粉增長", "教育受眾", "銷售產品", "引流導網", "品牌曝光", "建立信任"];
const CONTENT_TONES_CHIPS = ["專業權威", "溫柔親切", "幽默搞笑", "犀利直接", "高級質感", "情緒共鳴"];
const CONTENT_CTAS = ["留言互動", "追蹤頻道", "購買產品", "預約服務", "下載資源", "私訊詢問"];
const AUDIENCE_CATS = [
  { key: "age",       label: "年齡層",          opts: ["18–24", "25–34", "35–44", "45–54", "55+"],             multi: true,  custom: false },
  { key: "gender",    label: "性別",             opts: ["女性", "男性", "不限"],                                  multi: false, custom: false },
  { key: "job",       label: "職業 / 身分",      opts: ["上班族", "學生", "創業/自雇", "家長", "退休族", "創作者"], multi: true,  custom: true  },
  { key: "emotion",   label: "情緒 / 心理狀態",  opts: ["焦慮壓力", "想自我成長", "尋找療癒", "缺乏自信", "想被理解"], multi: true, custom: true },
  { key: "awareness", label: "對主題的熟悉度",   opts: ["完全新手", "在比較方案", "進階老手"],                     multi: false, custom: false },
  { key: "spending",  label: "消費力",           opts: ["平價親民", "中等", "高端精品"],                          multi: false, custom: false },
] as const;
const AUDIENCE_PRESETS = [
  { label: "想成長的年輕上班族", sel: { age: ["25–34"],        gender: ["不限"],  job: ["上班族"],         emotion: ["想自我成長"],           awareness: ["在比較方案"], spending: ["中等"] } },
  { label: "尋求療癒的家長",     sel: { age: ["35–44"],        gender: ["女性"],  job: ["家長"],           emotion: ["尋找療癒"],             awareness: ["完全新手"],   spending: ["中等"] } },
  { label: "想學創作的新手",     sel: { age: ["25–34","35–44"], gender: ["不限"], job: ["創作者","上班族"], emotion: ["缺乏自信","想自我成長"], awareness: ["完全新手"],   spending: ["平價親民"] } },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntegrationBinding {
  provider: string;
  status: string;
  last_tested_at: string | null;
  last_error: string | null;
}

export interface WpSiteStub {
  id: string;
  name: string;
  url: string;
  color: string | null;
  active: boolean;
  content_defaults: Record<string, unknown> | null;
}

export interface RunRow {
  id: string;
  action_id: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  /** ops_action_runs.metadata — writers stamp action_key here for display. */
  metadata?: Record<string, unknown> | null;
  /** Resolved from ops_action_catalog by page.tsx (action_id is just a uuid). */
  action_key?: string | null;
}

export interface InstallRunRow {
  id: string;
  status: string;
  result_summary: unknown;
  created_at: string | null;
}

export interface ClientHubTabsProps {
  org: { id: string; slug: string; name: string; type: string; status: string };
  cfg: ClientConfig;
  health: { ok: boolean; statusCode: number | null } | null;
  wp: WpUpdateLatest | null;
  runs: RunRow[];
  installRuns: InstallRunRow[];
  deptSummary: DepartmentSummaryPayload;
  integrations: IntegrationBinding[];
  wpSites: WpSiteStub[];
}

// ── Provider catalogue ────────────────────────────────────────────────────────

const PROVIDER_GROUPS: Array<{ label: string; providers: Array<{ key: string; name: string }> }> = [
  // Changes to this array automatically update the "未設定" metric below via TOTAL_PROVIDERS
  {
    label: "監控 & 分析",
    providers: [
      { key: "sentry", name: "Sentry" },
      { key: "uptime_kuma", name: "Uptime Kuma" },
      { key: "grafana", name: "Grafana" },
      { key: "netdata", name: "Netdata" },
      { key: "posthog", name: "PostHog" },
    ],
  },
  {
    label: "協作 & 自動化",
    providers: [
      { key: "github", name: "GitHub" },
      { key: "slack", name: "Slack" },
      { key: "telegram", name: "Telegram" },
      { key: "n8n", name: "n8n" },
      { key: "trigger", name: "Trigger.dev" },
    ],
  },
  {
    label: "基礎設施",
    providers: [
      { key: "supabase", name: "Supabase" },
      { key: "wordpress", name: "WordPress" },
      { key: "cloudflare", name: "Cloudflare" },
    ],
  },
];

const TOTAL_PROVIDERS = PROVIDER_GROUPS.reduce((n, g) => n + g.providers.length, 0);

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  const ms = Date.now() - new Date(isoStr).getTime();
  if (Number.isNaN(ms)) return "—";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "剛才";
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  return `${Math.floor(h / 24)} 天前`;
}

type InstallSummary = { plugin_slug?: string; status?: string; version?: string | null; error_message?: string | null };

// ── Sub-components ────────────────────────────────────────────────────────────

function Card({ title, badge, children, action }: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border-subtle)",
      borderRadius: 12, padding: "16px 18px", marginBottom: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {badge && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{badge}</span>}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

function NoData({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.7 }}>{children}</p>;
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, marginTop: 12 }}>{children}</div>;
}

function PluginRow({ name, from, to, statusColor }: { name: string; from?: string; to?: string; statusColor: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--bg-card)", fontSize: 12 }}>
      <span style={{ flex: 1, fontFamily: "monospace", fontSize: 11, color: statusColor, fontWeight: 600 }}>{name}</span>
      {from && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{from}</span>}
      {to && <><span style={{ color: "var(--text-muted)", fontSize: 10 }}>→</span><span style={{ color: "var(--text-primary)", fontSize: 11 }}>{to}</span></>}
    </div>
  );
}

function MetricGrid({ items }: { items: Array<{ label: string; value: string | number; color?: string }> }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ fontSize: 18, fontWeight: 700, color: item.color ?? "var(--text-primary)" }}>{item.value}</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function ChipBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "3px 10px", borderRadius: 20, fontSize: 11, border: "1px solid",
        cursor: "pointer", whiteSpace: "nowrap",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "var(--btn-primary-text)" : "var(--text-secondary)",
        borderColor: active ? "var(--accent)" : "var(--card-border)",
        fontWeight: active ? 600 : 400,
        lineHeight: 1.6,
      }}
    >
      {label}
    </button>
  );
}

function IntegrationTile({ name, status }: { name: string; status: "active" | "failed" | "pending" | "none" }) {
  const icons: Record<string, string> = { active: "✓", failed: "✗", pending: "…", none: "—" };
  const colors: Record<string, string> = {
    active: "var(--green)", failed: "var(--red)", pending: "var(--severity-medium)", none: "var(--border)",
  };
  return (
    <div style={{
      background: "var(--bg-canvas)", border: "1px solid var(--card-border)",
      borderRadius: 6, padding: "7px 10px", display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ flex: 1, fontSize: 11, color: "var(--text-primary)" }}>{name}</span>
      <span style={{ color: colors[status], fontWeight: 600, fontSize: 13 }}>{icons[status]}</span>
    </div>
  );
}

// ── Tab content ───────────────────────────────────────────────────────────────

function ContentTab({ org, cfg, wpSites }: Pick<ClientHubTabsProps, "org" | "cfg" | "wpSites">) {
  const site = wpSites[0];
  const siteId = site?.id;

  const [defaults, setDefaults] = useState<SiteContentDefaults>(
    () => (site?.content_defaults ?? {}) as SiteContentDefaults,
  );
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  function sf(key: keyof SiteContentDefaults, val: string) {
    setDefaults(d => ({ ...d, [key]: val }));
  }
  function sm(key: keyof NonNullable<SiteContentDefaults["marketing"]>, val: string) {
    setDefaults(d => ({ ...d, marketing: { ...d.marketing, [key]: val } }));
  }

  // Audience profile chip helpers
  type AP = NonNullable<SiteContentDefaults["audienceProfile"]>;
  function getAP(): AP { return defaults.audienceProfile ?? {}; }
  function setAP(updater: (prev: AP) => AP) {
    setDefaults(d => ({ ...d, audienceProfile: updater(d.audienceProfile ?? {}) }));
  }
  function toggleSingle(field: keyof AP, val: string) {
    setAP(ap => {
      const cur = ap[field] as string | string[] | undefined;
      const arr = Array.isArray(cur) ? cur : [];
      return { ...ap, [field]: arr.includes(val) ? [] : [val] };
    });
  }
  function toggleMulti(field: keyof AP, val: string) {
    setAP(ap => {
      const arr = (ap[field] as string[] | undefined) ?? [];
      return { ...ap, [field]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  }
  function setSingle(field: keyof AP, val: string) {
    setAP(ap => ({ ...ap, [field]: ap[field] === val ? undefined : val }));
  }
  function applyPreset(sel: Record<string, string[]>) {
    setAP(ap => ({ ...ap, ...sel, jobCustom: undefined, emotionCustom: undefined }));
  }

  async function save() {
    // 這個客戶沒有 wp_sites 列時，按鈕原本按了完全沒反應。siteId 現在來自 page.tsx 的
    // organization_id 查詢（不再用 hostname 猜），所以「查不到列」正是那個查詢出錯時會有的
    // 樣子 —— 靜默 return 會讓它隱形。
    if (!siteId) { setSaveMsg("此客戶尚未連接 WP 網站（wp_sites 無對應列），無法儲存"); return; }
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch(`/api/content/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentDefaults: defaults }),
      });
      const data = await r.json() as { ok: boolean; error?: string };
      setSaveMsg(data.ok ? "已儲存 ✓" : `錯誤：${data.error ?? "unknown"}`);
    } catch {
      setSaveMsg("網路錯誤，請重試");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "5px 8px", borderRadius: 5,
    border: "1px solid var(--card-border)", background: "var(--form-input-bg)",
    color: "var(--text-primary)", fontSize: 12,
  };
  const taStyle: React.CSSProperties = {
    ...inputStyle, resize: "vertical", minHeight: 60, lineHeight: 1.5,
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 10, color: "var(--text-muted)", marginBottom: 4, fontWeight: 500,
  };

  return (
    <>
      {/* ── WP 連線 ──────────────────────────────────────────────────────── */}
      <Card title="WP 連線" action={
        <Link href="/tools/content/sites" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
          管理連線 →
        </Link>
      }>
        {wpSites.length === 0 ? (
          <NoData>
            未找到對應此客戶的 WP 連線。<br />
            <Link href="/tools/content/sites" style={{ color: "var(--accent)", textDecoration: "none" }}>
              + 新增 WP 連線
            </Link>
          </NoData>
        ) : (
          wpSites.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color ?? "var(--text-muted)", flexShrink: 0 }} />
              <span style={{ flex: 1, fontWeight: 500 }}>{s.name}</span>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{s.url.replace(/^https?:\/\//, "")}</span>
              <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: s.active ? "var(--badge-green-bg)" : "var(--badge-red-bg)", color: s.active ? "var(--badge-green-text)" : "var(--badge-red-text)" }}>
                {s.active ? "已連線" : "停用"}
              </span>
            </div>
          ))
        )}
      </Card>

      {/* ── 品牌 & 文章設定（可編輯）───────────────────────────────────── */}
      {wpSites.length > 0 && (
        <Card title="品牌聲音（Brand Voice）" action={
          saveMsg ? (
            <span style={{ fontSize: 11, color: saveMsg.startsWith("已") ? "var(--green)" : "var(--red)" }}>{saveMsg}</span>
          ) : (
            <button
              onClick={() => void save()}
              disabled={saving}
              style={{ fontSize: 11, padding: "3px 10px", borderRadius: 5, border: "none", cursor: saving ? "wait" : "pointer", background: "var(--accent)", color: "var(--btn-primary-text)" }}
            >
              {saving ? "儲存中…" : "儲存"}
            </button>
          )
        }>
          {/* 基本設定 */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid var(--border-subtle)" }}>
              基本設定
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
              <div>
                <label style={labelStyle}>語言</label>
                <select style={inputStyle} value={defaults.language ?? ""} onChange={e => sf("language", e.target.value)}>
                  <option value="">不指定</option>
                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>目標地區</label>
                <select style={inputStyle} value={defaults.targetCountry ?? ""} onChange={e => sf("targetCountry", e.target.value)}>
                  <option value="">不指定</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>文章類型</label>
                <select style={inputStyle} value={defaults.articleType ?? ""} onChange={e => sf("articleType", e.target.value)}>
                  <option value="">不指定</option>
                  {ARTICLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>語氣風格</label>
                <select style={inputStyle} value={defaults.tone ?? ""} onChange={e => sf("tone", e.target.value)}>
                  <option value="">不指定</option>
                  {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>人稱視角</label>
                <select style={inputStyle} value={defaults.pointOfView ?? ""} onChange={e => sf("pointOfView", e.target.value)}>
                  {POVS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>閱讀難度</label>
                <select style={inputStyle} value={defaults.readability ?? ""} onChange={e => sf("readability", e.target.value)}>
                  <option value="">不指定</option>
                  {READABILITIES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* 品牌語調 / 精準行銷 */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid var(--border-subtle)" }}>
              品牌語調 / 精準行銷
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={labelStyle}>目標受眾</label>
                <textarea style={taStyle} value={defaults.marketing?.audience ?? ""} onChange={e => sm("audience", e.target.value)} placeholder="例：台灣 30-45 歲尋找自我療癒的女性" />
              </div>
              <div>
                <label style={labelStyle}>品牌定位</label>
                <textarea style={taStyle} value={defaults.marketing?.positioning ?? ""} onChange={e => sm("positioning", e.target.value)} placeholder="例：透過藝術療癒，幫助成人重拾創造力與內心平靜" />
              </div>
              <div>
                <label style={labelStyle}>獨特賣點（USP）</label>
                <textarea style={taStyle} value={defaults.marketing?.usp ?? ""} onChange={e => sm("usp", e.target.value)} placeholder="例：無需繪畫天份，引導式藝術療癒體驗" />
              </div>
              <div>
                <label style={labelStyle}>主要 CTA</label>
                <input style={inputStyle} value={defaults.marketing?.primaryCta ?? ""} onChange={e => sm("primaryCta", e.target.value)} placeholder="例：預約免費體驗課" />
              </div>
              <div>
                <label style={labelStyle}>漏斗階段</label>
                <select style={inputStyle} value={defaults.marketing?.funnelStage ?? ""} onChange={e => sm("funnelStage", e.target.value)}>
                  {FUNNEL_STAGES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>價格定位</label>
                <select style={inputStyle} value={defaults.marketing?.pricePositioning ?? ""} onChange={e => sm("pricePositioning", e.target.value)}>
                  {PRICE_POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>情感觸發點</label>
                <textarea style={taStyle} value={defaults.marketing?.emotionalTriggers ?? ""} onChange={e => sm("emotionalTriggers", e.target.value)} placeholder="例：渴望被理解、想找回創造力" />
              </div>
              <div>
                <label style={labelStyle}>客戶顧慮（Objections）</label>
                <textarea style={taStyle} value={defaults.marketing?.objections ?? ""} onChange={e => sm("objections", e.target.value)} placeholder="例：我沒有繪畫天份；會不會很貴？" />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>禁用詞／不能說的事</label>
                <textarea style={{ ...taStyle, minHeight: 44 }} value={defaults.marketing?.forbiddenClaims ?? ""} onChange={e => sm("forbiddenClaims", e.target.value)} placeholder="例：不能宣稱治療、不用「療癒」作主標" />
              </div>
            </div>
          </div>

          {/* 進階指示 */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid var(--border-subtle)" }}>
              品牌語調 / 進階指示（選填）
            </div>
            <textarea
              style={{ ...taStyle, minHeight: 80, width: "100%" }}
              value={defaults.brandVoiceInstructions ?? ""}
              onChange={e => sf("brandVoiceInstructions", e.target.value)}
              placeholder={"例：文章開頭避免用問句；標題要情感導向而非功能性；語氣像朋友聊天，不像教授上課"}
            />
          </div>

          {/* 精準受眾畫像 */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid var(--border-subtle)" }}>
              精準受眾畫像（注入文章生成）
            </div>

            {/* 常用人設一鍵套用 */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 5, fontWeight: 500 }}>常用人設（一鍵套整組）</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {AUDIENCE_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p.sel)}
                    style={{
                      padding: "4px 12px", borderRadius: 6, fontSize: 11, border: "1px solid var(--accent)",
                      cursor: "pointer", background: "transparent", color: "var(--accent)", fontWeight: 500,
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 內容目的 (single) */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 5, fontWeight: 500 }}>內容目的</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {CONTENT_GOALS.map(g => (
                  <ChipBtn key={g} label={g} active={getAP().contentGoal === g} onClick={() => setSingle("contentGoal", g)} />
                ))}
              </div>
            </div>

            {/* 語氣風格 (single) */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 5, fontWeight: 500 }}>語氣風格</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {CONTENT_TONES_CHIPS.map(t => (
                  <ChipBtn key={t} label={t} active={getAP().contentTone === t} onClick={() => setSingle("contentTone", t)} />
                ))}
              </div>
            </div>

            {/* 觀眾行動 (single) */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 5, fontWeight: 500 }}>觀眾行動（期望 CTA）</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {CONTENT_CTAS.map(c => (
                  <ChipBtn key={c} label={c} active={getAP().audienceAction === c} onClick={() => setSingle("audienceAction", c)} />
                ))}
              </div>
            </div>

            {/* 目標受眾各維度 */}
            {AUDIENCE_CATS.map(cat => (
              <div key={cat.key} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 5, fontWeight: 500 }}>{cat.label}</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  {cat.opts.map(opt => {
                    const arr = (getAP()[cat.key as keyof AP] as string[] | undefined) ?? [];
                    const active = arr.includes(opt);
                    return (
                      <ChipBtn
                        key={opt}
                        label={opt}
                        active={active}
                        onClick={() => cat.multi ? toggleMulti(cat.key as keyof AP, opt) : toggleSingle(cat.key as keyof AP, opt)}
                      />
                    );
                  })}
                  {cat.custom && (
                    <input
                      placeholder="+ 自訂"
                      style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, border: "1px dashed var(--card-border)", background: "transparent", color: "var(--text-primary)", width: 72 }}
                      value={(getAP()[(cat.key + "Custom") as keyof AP] as string | undefined) ?? ""}
                      onChange={e => setAP(ap => ({ ...ap, [(cat.key + "Custom") as keyof AP]: e.target.value }))}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Save button (bottom) */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14, gap: 8, alignItems: "center" }}>
            {saveMsg && <span style={{ fontSize: 11, color: saveMsg.startsWith("已") ? "var(--green)" : "var(--red)" }}>{saveMsg}</span>}
            <button
              onClick={() => void save()}
              disabled={saving}
              style={{ padding: "6px 18px", borderRadius: 6, border: "none", cursor: saving ? "wait" : "pointer", background: "var(--accent)", color: "var(--btn-primary-text)", fontSize: 12, fontWeight: 500 }}
            >
              {saving ? "儲存中…" : "💾 儲存品牌設定"}
            </button>
          </div>
        </Card>
      )}

      {/* ── Content Studio 快速入口 ──────────────────────────────────────── */}
      <Card title="Content Studio">
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.7 }}>
          在 Content Studio 中為此客戶生成 SEO 文章，品牌設定自動套用。
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href={siteId ? `/tools/content?siteId=${siteId}` : "/tools/content"}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6, background: "var(--accent)", color: "var(--btn-primary-text)", fontSize: 12, fontWeight: 500, textDecoration: "none" }}
          >
            ✍ 開啟 Content Studio
          </Link>
          <Link
            href={siteId ? `/tools/content?siteId=${siteId}` : "/tools/content"}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6, border: "1px solid var(--card-border)", background: "var(--bg-card)", color: "var(--text-primary)", fontSize: 12, textDecoration: "none" }}
          >
            📅 內容行事曆
          </Link>
        </div>
      </Card>
    </>
  );
}

function IntegrationsTab({ integrations }: Pick<ClientHubTabsProps, "integrations">) {
  const byProvider = new Map(integrations.map((i) => [i.provider, i]));

  function getStatus(key: string): "active" | "failed" | "pending" | "none" {
    const b = byProvider.get(key);
    if (!b) return "none";
    if (b.status === "active") return "active";
    if (b.status === "failed") return "failed";
    return "pending";
  }

  const activeCount = integrations.filter((i) => i.status === "active").length;
  const failedCount = integrations.filter((i) => i.status === "failed").length;

  return (
    <>
      <MetricGrid items={[
        { label: "已連線", value: activeCount, color: "var(--green)" },
        { label: "失敗", value: failedCount, color: failedCount > 0 ? "var(--red)" : "var(--text-muted)" },
        { label: "未設定", value: TOTAL_PROVIDERS - integrations.length, color: "var(--text-muted)" },
      ]} />

      {PROVIDER_GROUPS.map((group) => (
        <Card key={group.label} title={group.label}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {group.providers.map((p) => (
              <IntegrationTile key={p.key} name={p.name} status={getStatus(p.key)} />
            ))}
          </div>
          {group.providers.some((p) => getStatus(p.key) === "failed") && (
            <Link
              href="/ops/integrations"
              style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", display: "block", marginTop: 8 }}
            >
              查看詳細整合設定 →
            </Link>
          )}
        </Card>
      ))}
    </>
  );
}

function ProvisioningTab({ deptSummary, runs, cfg }: Pick<ClientHubTabsProps, "deptSummary" | "runs" | "cfg">) {
  // action_key resolved from the catalog by page.tsx; the legacy action_id
  // check never matched (action_id is a uuid) — kept only as a harmless fallback.
  const buildRuns = runs.filter((r) => {
    const key = r.action_key ?? "";
    return key.includes("build") || key.includes("provision") || key.includes("create-wp-site") || key.includes("adopt")
      || r.action_id?.includes("build") || r.action_id?.includes("provision");
  });

  return (
    <>
      <Card title="部門覆蓋率 M3" badge={`${deptSummary.activeCount}/${deptSummary.totalCount} 叢集 · ${deptSummary.enterpriseTier} tier`}>
        {deptSummary.byGroup.map((group) => (
          <div key={group.groupKey} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", width: 80, flexShrink: 0 }}>{group.groupLabel}</span>
            <div style={{ flex: 1, height: 5, background: "var(--bg-canvas)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 3, background: "var(--accent-hover)",
                width: group.total > 0 ? `${Math.round((group.active / group.total) * 100)}%` : "0%",
                transition: "width 0.3s",
              }} />
            </div>
            <span style={{ fontSize: 10, color: "var(--text-muted)", width: 36, textAlign: "right" }}>
              {group.active}/{group.total}
            </span>
          </div>
        ))}
        <Link href={`/ops/clients/${deptSummary.slug}`} style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", display: "block", marginTop: 6 }}>
          設定部門覆蓋 →
        </Link>
      </Card>

      <Card title="佈建步驟">
        {[
          "客戶探索問卷 (Intake)",
          "AI 網站規格生成",
          "Build Console 部署觸發",
          "初始外掛堆疊安裝",
          "整合串接確認",
        ].map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12 }}>
            <span style={{
              width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, flexShrink: 0, fontWeight: 600,
              background: "var(--badge-green-bg)", color: "var(--badge-green-text)",
            }}>✓</span>
            {step}
          </div>
        ))}
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <Link href="/ops/onboarding" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
            重新 Onboarding →
          </Link>
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>·</span>
          <Link href="/build" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
            Build Console →
          </Link>
        </div>
      </Card>

      {buildRuns.length > 0 && (
        <Card title="佈建執行紀錄" badge={`${buildRuns.length} 筆`}>
          {buildRuns.slice(0, 5).map((run) => (
            <div key={run.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--bg-canvas)", fontSize: 11 }}>
              <span style={{ fontFamily: "monospace", flex: 1, color: "var(--text-secondary)" }}>{run.action_id ?? "—"}</span>
              <span style={{ color: run.status === "completed" || run.status === "success" ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{run.status}</span>
              <span style={{ color: "var(--text-muted)" }}>{relativeTime(run.started_at)}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

function MaintenanceTab({ org, cfg, wp, runs, installRuns }: Pick<ClientHubTabsProps, "org" | "cfg" | "wp" | "runs" | "installRuns">) {
  type PluginResult = { plugin: string; from: string; to: string; status: string };
  const updated = (wp?.results?.filter((r) => r.status === "updated") ?? []) as PluginResult[];
  const skipped = (wp?.results?.filter((r) => r.status === "skipped_license") ?? []) as PluginResult[];
  const failed = (wp?.results?.filter((r) => r.status === "failed") ?? []) as PluginResult[];

  const pluginInstalled = installRuns.filter((r) => (r.result_summary as InstallSummary)?.status === "installed");
  const pluginSkipped = installRuns.filter((r) => (r.result_summary as InstallSummary)?.status === "skipped_license");
  const pluginFailed = installRuns.filter((r) => (r.result_summary as InstallSummary)?.status === "failed");

  return (
    <>
      {cfg.platform === "wordpress" && cfg.ssh_host && (
        <WpUpdateButtons slug={org.slug} waves={cfg.waves ?? {}} />
      )}

      {cfg.platform === "wordpress" && (
        <Card
          title="外掛更新狀態"
          badge={wp ? relativeTime(wp.ran_at) : "尚無記錄"}
        >
          {!wp ? (
            <NoData>執行 update-client-wp-plugins.ps1 後自動同步</NoData>
          ) : (
            <>
              <MetricGrid items={[
                { label: "已更新", value: wp.updated_count ?? 0, color: "var(--green)" },
                { label: "需授權", value: skipped.length, color: skipped.length > 0 ? "var(--severity-medium)" : "var(--text-muted)" },
                { label: "失敗", value: failed.length, color: failed.length > 0 ? "var(--red)" : "var(--text-muted)" },
                { label: "健康狀態", value: wp.health_final ?? "—", color: wp.ok ? "var(--green)" : "var(--red)" },
              ]} />
              {skipped.length > 0 && (
                <>
                  <SubLabel>🔑 需授權（WP 管理後台）</SubLabel>
                  {skipped.map((r) => <PluginRow key={r.plugin} name={r.plugin} from={r.from} to={r.to} statusColor="var(--severity-medium)" />)}
                </>
              )}
              {failed.length > 0 && (
                <>
                  <SubLabel>⚠️ 失敗</SubLabel>
                  {failed.map((r) => <PluginRow key={r.plugin} name={r.plugin} from={r.from} to={r.to} statusColor="var(--red)" />)}
                </>
              )}
              {updated.length > 0 && (
                <>
                  <SubLabel>✅ 已更新</SubLabel>
                  {updated.map((r) => <PluginRow key={r.plugin} name={r.plugin} from={r.from} to={r.to} statusColor="var(--green)" />)}
                </>
              )}
            </>
          )}
        </Card>
      )}

      <Card
        title="初始外掛堆疊安裝"
        badge={installRuns.length > 0 ? `${installRuns.length} 筆` : "尚無記錄"}
      >
        {installRuns.length === 0 ? (
          <NoData>透過 Onboard Wizard 觸發 Build 後自動安裝</NoData>
        ) : (
          <>
            <MetricGrid items={[
              { label: "已安裝", value: pluginInstalled.length, color: "var(--green)" },
              { label: "需手動授權", value: pluginSkipped.length, color: "var(--severity-medium)" },
              { label: "失敗", value: pluginFailed.length, color: "var(--red)" },
            ]} />
            {pluginInstalled.slice(0, 5).map((r) => {
              const s = r.result_summary as InstallSummary;
              return <PluginRow key={r.id} name={s.plugin_slug ?? "—"} to={s.version ?? undefined} statusColor="var(--green)" />;
            })}
          </>
        )}
      </Card>

      <Card title="最近工作流程執行" badge={`最近 ${runs.length} 筆`}>
        {runs.length === 0 ? (
          <NoData>此組織尚無工作流程執行紀錄</NoData>
        ) : (
          runs.slice(0, 8).map((run) => {
            const color =
              run.status === "completed" || run.status === "success"
                ? "var(--green)"
                : run.status === "failed" || run.status === "error"
                  ? "var(--red)"
                  : "var(--text-muted)";
            return (
              <div key={run.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--bg-canvas)", fontSize: 11 }}>
                <span style={{ fontFamily: "monospace", flex: 1, color: "var(--text-secondary)", fontSize: 10 }}>{run.action_key ?? (typeof run.metadata?.action_key === "string" ? run.metadata.action_key : null) ?? run.action_id ?? "—"}</span>
                <span style={{ color, fontWeight: 600 }}>{run.status}</span>
                <span style={{ color: "var(--text-muted)" }}>{relativeTime(run.started_at)}</span>
              </div>
            );
          })
        )}
      </Card>

      <div style={{ display: "flex", gap: 10 }}>
        <Link
          href={`/ops/repairs?client_slug=${org.slug}`}
          style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}
        >
          → Repair Center
        </Link>
      </div>
    </>
  );
}

function BrandColorsCard({ slug, initial }: { slug: string; initial?: { primary?: string; secondary?: string; accent?: string } }) {
  const [primary, setPrimary] = useState(initial?.primary ?? "#6366f1");
  const [secondary, setSecondary] = useState(initial?.secondary ?? "#111827");
  const [accent, setAccent] = useState(initial?.accent ?? "#f59e0b");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch(`/api/ops/clients/${slug}/brand-colors`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: JSON.stringify({ primary, secondary, accent }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `save_failed_${res.status}`);
      setMsg("✓ 已儲存，Banner Studio 即可選此品牌帶入配色");
    } catch (e) {
      setMsg(`⚠ ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const row = (label: string, val: string, setter: (v: string) => void) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12 }}>
      <span style={{ color: "var(--text-muted)", width: 70, flexShrink: 0 }}>{label}</span>
      <input type="color" value={val} onChange={(e) => setter(e.target.value)}
        style={{ width: 40, height: 28, border: "none", background: "none", cursor: "pointer", padding: 0 }} />
      <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)" }}>{val}</span>
    </div>
  );

  return (
    <Card title="🎨 品牌色 (brandColors)">
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 6px" }}>
        設定後，Banner Studio 的「配色 / 品牌色」可直接選此客戶帶入。
      </p>
      {row("主色", primary, setPrimary)}
      {row("次色", secondary, setSecondary)}
      {row("強調色", accent, setAccent)}
      <button onClick={save} disabled={saving}
        style={{ marginTop: 8, fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer",
          background: "var(--accent)", color: "var(--btn-primary-text)", border: "none", opacity: saving ? 0.6 : 1 }}>
        {saving ? "儲存中…" : "儲存品牌色"}
      </button>
      {msg && <div style={{ marginTop: 6, fontSize: 11, color: msg.startsWith("✓") ? "var(--green)" : "var(--red)" }}>{msg}</div>}
    </Card>
  );
}

function SettingsTab({ org, cfg, wpSites }: Pick<ClientHubTabsProps, "org" | "cfg" | "wpSites">) {
  const configFields: Array<[string, string | undefined]> = [
    ["site_url", cfg.site_url],
    ["platform", cfg.platform],
    ["wp_slug", cfg.wp_slug],
    ["ssh_host", cfg.ssh_host],
    ["hosting_type", cfg.hosting_type],
  ].filter(([, v]) => v) as Array<[string, string]>;

  return (
    <>
      <Card title="Org 設定 (metadata.client_config)">
        {configFields.map(([k, v]) => (
          <div key={k} style={{ display: "flex", padding: "5px 0", borderBottom: "1px solid var(--bg-canvas)", fontSize: 12 }}>
            <span style={{ color: "var(--text-muted)", width: 100, flexShrink: 0, fontFamily: "monospace", fontSize: 11 }}>{k}</span>
            <span style={{ color: "var(--text-primary)", fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>{v}</span>
          </div>
        ))}
        <div style={{ marginTop: 8 }}>
          <Link href="/ops/integrations" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
            → 整合設定
          </Link>
        </div>
      </Card>

      <div style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 4px" }}>
        品牌色 / Logo / 客服語氣已移至「品牌識別」分頁。
      </div>

      <Card
        title="WP 網站連線 (wp_sites)"
        action={
          <Link href="/tools/content/sites" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
            完整管理 →
          </Link>
        }
      >
        {wpSites.length === 0 ? (
          <NoData>
            未找到與此客戶 URL 相符的 WP 連線。<br />
            <Link href="/tools/content/sites" style={{ color: "var(--accent)", textDecoration: "none" }}>
              + 新增 WP 連線
            </Link>
          </NoData>
        ) : (
          wpSites.map((site) => (
            <div key={site.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: site.color ?? "var(--text-muted)", flexShrink: 0 }} />
              <span style={{ flex: 1, fontWeight: 500 }}>{site.name}</span>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{site.url.replace(/^https?:\/\//, "")}</span>
            </div>
          ))
        )}
      </Card>

      {cfg.platform === "wordpress" && cfg.wp_slug && (
        <Card title="CLI 快速指令">
          {[
            { label: "列出待更新", args: `-ClientSlug ${cfg.wp_slug} -Plugins list` },
            { label: "wave1 高風險", args: `-ClientSlug ${cfg.wp_slug} -Plugins wave1` },
            { label: "wave2 中風險", args: `-ClientSlug ${cfg.wp_slug} -Plugins wave2` },
            { label: "wave3 低風險", args: `-ClientSlug ${cfg.wp_slug} -Plugins wave3` },
          ].map((cmd) => (
            <div key={cmd.label} style={{ marginBottom: 8, fontSize: 11 }}>
              <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>{cmd.label}</div>
              <code style={{
                display: "block", padding: "4px 8px",
                background: "#1e293b", color: "#94a3b8",
                borderRadius: 6, fontSize: 10, wordBreak: "break-all",
              }}>
                .\scripts\update-client-wp-plugins.ps1 {cmd.args}
              </code>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

// ── Brand identity (CIS) tab ──────────────────────────────────────────────────

const cisBtnStyle: CSSProperties = {
  marginTop: 8, fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer",
  background: "var(--accent)", color: "var(--btn-primary-text)", border: "none",
};

function CisText({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
      <span style={{ color: "var(--text-muted)", width: 88, flexShrink: 0 }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ flex: 1, fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--card-border)",
          background: "var(--bg-canvas)", color: "var(--text-primary)", fontFamily: mono ? "monospace" : "inherit" }} />
    </div>
  );
}

function CisSelect<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: Array<[T, string]>;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
      <span style={{ color: "var(--text-muted)", width: 88, flexShrink: 0 }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}
        style={{ flex: 1, fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--card-border)",
          background: "var(--bg-canvas)", color: "var(--text-primary)" }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

async function patchCis(slug: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(`/api/ops/clients/${slug}/cis`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...roleHeader("admin") },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? `save_failed_${res.status}`);
}

function BrandKitCard({ slug, initial }: { slug: string; initial?: ClientConfig["brandKit"] }) {
  const [logoPrimary, setLogoPrimary] = useState(initial?.logo?.primary ?? "");
  const [logoInverse, setLogoInverse] = useState(initial?.logo?.inverse ?? "");
  const [logoIcon, setLogoIcon] = useState(initial?.logo?.icon ?? "");
  const [headingFont, setHeadingFont] = useState(initial?.typography?.headingFont ?? "");
  const [bodyFont, setBodyFont] = useState(initial?.typography?.bodyFont ?? "");
  const [cjkFont, setCjkFont] = useState(initial?.typography?.cjkFont ?? "");
  const [iconStyle, setIconStyle] = useState(initial?.graphics?.iconStyle ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await patchCis(slug, { brandKit: {
        logo: { primary: logoPrimary, inverse: logoInverse, icon: logoIcon },
        typography: { headingFont, bodyFont, cjkFont },
        graphics: { iconStyle },
      } });
      setMsg("✓ 已儲存品牌資產");
    } catch (e) { setMsg(`⚠ ${String(e)}`); } finally { setSaving(false); }
  }

  return (
    <Card title="🖼️ 品牌資產 (brandKit · VI)">
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 6px" }}>
        Logo 存 URL（走資產庫）；標準字與輔助圖形給客服 widget 與生圖工具參考。標準色在上方「品牌色」卡。
      </p>
      <CisText label="Logo 主標" value={logoPrimary} onChange={setLogoPrimary} placeholder="https://…" mono />
      <CisText label="Logo 反白" value={logoInverse} onChange={setLogoInverse} placeholder="https://…" mono />
      <CisText label="Logo 圖示" value={logoIcon} onChange={setLogoIcon} placeholder="https://…" mono />
      <CisText label="標題字" value={headingFont} onChange={setHeadingFont} placeholder="Fraunces" />
      <CisText label="內文字" value={bodyFont} onChange={setBodyFont} placeholder="General Sans" />
      <CisText label="中文字" value={cjkFont} onChange={setCjkFont} placeholder="Noto Sans TC" />
      <CisText label="圖示風格" value={iconStyle} onChange={setIconStyle} placeholder="lucide / phosphor" />
      <button onClick={save} disabled={saving} style={{ ...cisBtnStyle, opacity: saving ? 0.6 : 1 }}>
        {saving ? "儲存中…" : "儲存品牌資產"}
      </button>
      {msg && <div style={{ marginTop: 6, fontSize: 11, color: msg.startsWith("✓") ? "var(--green)" : "var(--red)" }}>{msg}</div>}
    </Card>
  );
}

function CsVoiceCard({ slug, initial }: { slug: string; initial?: ClientConfig["csVoice"] }) {
  const [personaName, setPersonaName] = useState(initial?.personaName ?? "");
  const [languages, setLanguages] = useState((initial?.languages ?? ["zh-Hant"]).join(", "));
  const [formality, setFormality] = useState<"casual" | "polite" | "formal">(initial?.formality ?? "polite");
  const [honorifics, setHonorifics] = useState(initial?.honorifics ?? "你");
  const [emojiPolicy, setEmojiPolicy] = useState<"none" | "sparing" | "friendly">(initial?.emojiPolicy ?? "sparing");
  const [greeting, setGreeting] = useState(initial?.greeting ?? "");
  const [signoff, setSignoff] = useState(initial?.signoff ?? "");
  const [refusalStyle, setRefusalStyle] = useState(initial?.refusalStyle ?? "");
  const [escalationTone, setEscalationTone] = useState(initial?.escalationTone ?? "");
  const [servicePrinciples, setServicePrinciples] = useState((initial?.servicePrinciples ?? []).join("\n"));
  const [mission, setMission] = useState(initial?.mission ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await patchCis(slug, { csVoice: {
        personaName, formality, honorifics, emojiPolicy, greeting, signoff, refusalStyle, escalationTone, mission,
        languages: languages.split(",").map((s) => s.trim()).filter(Boolean),
        servicePrinciples: servicePrinciples.split("\n").map((s) => s.trim()).filter(Boolean),
      } });
      setMsg("✓ 已儲存客服語氣，將套用到 widget 與 AI");
    } catch (e) { setMsg(`⚠ ${String(e)}`); } finally { setSaving(false); }
  }

  return (
    <Card title="💬 客服語氣 (csVoice · BI/MI)">
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 6px" }}>
        驅動客服 AI 的人格與口吻；語氣本體可連動內容引擎品牌聲音（同源）。
      </p>
      <CisText label="化身名" value={personaName} onChange={setPersonaName} placeholder="小柔" />
      <CisText label="語言" value={languages} onChange={setLanguages} placeholder="zh-Hant, en" />
      <CisSelect<"casual" | "polite" | "formal"> label="正式度" value={formality} onChange={setFormality}
        options={[["casual", "輕鬆"], ["polite", "禮貌"], ["formal", "正式"]]} />
      <CisSelect label="敬語" value={honorifics} onChange={setHonorifics} options={[["你", "你"], ["您", "您"]]} />
      <CisSelect<"none" | "sparing" | "friendly"> label="Emoji" value={emojiPolicy} onChange={setEmojiPolicy}
        options={[["none", "不用"], ["sparing", "節制"], ["friendly", "友善"]]} />
      <CisText label="招呼語" value={greeting} onChange={setGreeting} placeholder="嗨，我是小柔…" />
      <CisText label="結尾語" value={signoff} onChange={setSignoff} placeholder="還有需要再找我喔" />
      <CisText label="拒絕用語" value={refusalStyle} onChange={setRefusalStyle} placeholder="做不到時的說法" />
      <CisText label="轉真人語氣" value={escalationTone} onChange={setEscalationTone} placeholder="轉接時的說法" />
      <CisText label="品牌使命" value={mission} onChange={setMission} placeholder="MI（選填）" />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 0", fontSize: 12 }}>
        <span style={{ color: "var(--text-muted)", width: 88, flexShrink: 0, paddingTop: 5 }}>服務準則</span>
        <textarea value={servicePrinciples} onChange={(e) => setServicePrinciples(e.target.value)}
          placeholder="一行一條（能否開玩笑 / 同理優先…）" rows={3}
          style={{ flex: 1, fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--card-border)",
            background: "var(--bg-canvas)", color: "var(--text-primary)", resize: "vertical", fontFamily: "inherit" }} />
      </div>
      <button onClick={save} disabled={saving} style={{ ...cisBtnStyle, opacity: saving ? 0.6 : 1 }}>
        {saving ? "儲存中…" : "儲存客服語氣"}
      </button>
      {msg && <div style={{ marginTop: 6, fontSize: 11, color: msg.startsWith("✓") ? "var(--green)" : "var(--red)" }}>{msg}</div>}
    </Card>
  );
}

function BrandIdentityTab({ org, cfg }: Pick<ClientHubTabsProps, "org" | "cfg">) {
  return (
    <>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 10px", lineHeight: 1.6 }}>
        CIS 企業識別 — <strong>VI 視覺</strong>（標準色 / Logo / 標準字）+ <strong>BI·MI 客服語氣</strong>，同一份設定同時驅動客服 widget 視覺與 AI 口吻，跨觸點一致。
      </p>
      <BrandColorsCard slug={org.slug} initial={cfg.brandColors} />
      <BrandKitCard slug={org.slug} initial={cfg.brandKit} />
      <CsVoiceCard slug={org.slug} initial={cfg.csVoice} />
    </>
  );
}

/** Small coloured label. Pure presentation, shared by the knowledge and customer-service tabs. */
const badge = (bg: string, fg: string, text: string) => (
  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: bg, color: fg, whiteSpace: "nowrap" }}>{text}</span>
);

// ── Customer service tab ──────────────────────────────────────────────────────

type CsIntentRow = {
  key: string; label: string; answer_level: string; action_level: string;
  is_sensitive: boolean; confidence_threshold: number; canary_pct: number;
};

function CustomerServiceTab({ org }: Pick<ClientHubTabsProps, "org">) {
  const [loading, setLoading] = useState(true);
  const [csEnabled, setCsEnabled] = useState(true);
  const [intents, setIntents] = useState<CsIntentRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // new-intent form
  const [iKey, setIKey] = useState(""); const [iLabel, setILabel] = useState(""); const [iAns, setIAns] = useState("L1"); const [iAct, setIAct] = useState("A0");
  const [iSensitive, setISensitive] = useState(false); const [iSaving, setISaving] = useState(false); const [iMsg, setIMsg] = useState<string | null>(null);

  async function reloadConfig() {
    try {
      const res = await fetch(`/api/ops/clients/${org.slug}/cs-config`, { headers: { ...roleHeader("admin") } });
      const data = (await res.json()) as { ok?: boolean; csEnabled?: boolean; intents?: CsIntentRow[] };
      if (data.ok) { setCsEnabled(data.csEnabled ?? true); setIntents(data.intents ?? []); }
    } catch { /* ignore */ }
  }
  useEffect(() => {
    let alive = true;
    (async () => { await reloadConfig(); if (alive) setLoading(false); })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.slug]);

  async function toggleKill() {
    setSaving(true); setMsg(null);
    const next = !csEnabled;
    try {
      const res = await fetch(`/api/ops/clients/${org.slug}/cs-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: JSON.stringify({ csEnabled: next }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; csEnabled?: boolean };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `save_failed_${res.status}`);
      setCsEnabled(data.csEnabled ?? next);
      setMsg(next ? "✓ 已啟用此客戶 AI 客服" : "✓ 已停用（kill-switch）— AI 不再自動回覆此客戶");
    } catch (e) { setMsg(`⚠ ${String(e)}`); } finally { setSaving(false); }
  }

  async function addIntent() {
    setISaving(true); setIMsg(null);
    try {
      const res = await fetch(`/api/ops/clients/${org.slug}/cs-intents`, {
        method: "POST", headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: JSON.stringify({ key: iKey, label: iLabel, answerLevel: iAns, actionLevel: iAct, isSensitive: iSensitive }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `failed_${res.status}`);
      setIMsg("✓ 已新增意圖"); setIKey(""); setILabel(""); setISensitive(false);
      await reloadConfig();
    } catch (e) { setIMsg(`⚠ ${String(e)}`); } finally { setISaving(false); }
  }
  async function delIntent(key: string) {
    await fetch(`/api/ops/clients/${org.slug}/cs-intents`, { method: "DELETE", headers: { "Content-Type": "application/json", ...roleHeader("admin") }, body: JSON.stringify({ key }) });
    await reloadConfig();
  }

  const ansBadge = (l: string) =>
    l === "L2" ? badge("var(--badge-green-bg)", "var(--green)", "L2 自動")
      : l === "L1" ? badge("var(--bg-canvas)", "var(--text-secondary)", "L1 草稿")
        : badge("var(--bg-canvas)", "var(--text-muted)", "L0 關閉");
  const actBadge = (l: string) =>
    l === "A2" ? badge("var(--bg-canvas)", "var(--text-secondary)", "A2 受閘寫")
      : l === "A1" ? badge("var(--bg-canvas)", "var(--text-secondary)", "A1 唯讀")
        : badge("var(--bg-canvas)", "var(--text-muted)", "A0 無動作");

  return (
    <>
      <Card title={csEnabled ? "🟢 AI 客服：啟用中" : "🔴 AI 客服：已停用 (kill-switch)"}>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 8px" }}>
          每租戶 kill-switch（停用後此客戶的對話一律轉真人，不自動回覆）。意圖層級與全域開關另在「客服營運中心」。
        </p>
        <button onClick={toggleKill} disabled={saving}
          style={{ ...cisBtnStyle, background: csEnabled ? "var(--red)" : "var(--accent)", opacity: saving ? 0.6 : 1 }}>
          {saving ? "處理中…" : csEnabled ? "停用 AI 客服" : "啟用 AI 客服"}
        </button>
        {msg && <div style={{ marginTop: 6, fontSize: 11, color: msg.startsWith("✓") ? "var(--green)" : "var(--red)" }}>{msg}</div>}
      </Card>

      <Card title={`意圖與自動化分級（${loading ? "…" : intents.length}）`}>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 8px" }}>
          雙軸：答覆 L0 關閉 / L1 草稿 / L2 自動 × 行動 A0 無 / A1 唯讀 / A2 受閘寫；勾「敏感」= money/身分/法律，永遠轉真人。
        </p>
        {!loading && intents.map((it) => (
          <div key={it.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 12 }}>
            <span style={{ flex: 1, fontWeight: 500 }}>{it.label}<span style={{ color: "var(--text-muted)", fontWeight: 400, marginLeft: 6, fontFamily: "monospace", fontSize: 10 }}>{it.key}</span></span>
            {it.is_sensitive && badge("var(--badge-red-bg)", "var(--red)", "敏感·轉真人")}
            {ansBadge(it.answer_level)}
            {actBadge(it.action_level)}
            {it.canary_pct > 0 && it.canary_pct < 100 && badge("var(--bg-canvas)", "var(--text-secondary)", `canary ${it.canary_pct}%`)}
            <button onClick={() => delIntent(it.key)} aria-label="刪除" style={{ border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14 }}>×</button>
          </div>
        ))}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10, marginTop: 4 }}>
          <CisText label="代碼 key" value={iKey} onChange={setIKey} placeholder="order_status" mono />
          <CisText label="名稱" value={iLabel} onChange={setILabel} placeholder="訂單狀態查詢" />
          <CisSelect label="答覆" value={iAns} onChange={setIAns} options={[["L0", "L0 關閉"], ["L1", "L1 草稿"], ["L2", "L2 自動"]]} />
          <CisSelect label="行動" value={iAct} onChange={setIAct} options={[["A0", "A0 無"], ["A1", "A1 唯讀"], ["A2", "A2 受閘寫"]]} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", padding: "4px 0 0 96px" }}>
            <input type="checkbox" checked={iSensitive} onChange={(e) => setISensitive(e.target.checked)} /> 敏感（永遠轉真人）
          </label>
          <button onClick={addIntent} disabled={iSaving || !iKey || !iLabel} style={{ ...cisBtnStyle, opacity: iSaving || !iKey || !iLabel ? 0.5 : 1 }}>
            {iSaving ? "新增中…" : "新增意圖"}
          </button>
          {iMsg && <div style={{ marginTop: 6, fontSize: 11, color: iMsg.startsWith("✓") ? "var(--green)" : "var(--red)" }}>{iMsg}</div>}
        </div>
      </Card>
    </>
  );
}

// ── Knowledge base tab ───────────────────────────────────────────────────────
//
// Its own tab, not a card inside 客服. The knowledge base is a product in its own right (ADR 011):
// customer service is its first consumer, with SEO writing / cold outreach / research to follow.
// Buried inside another tab it read as missing — reported twice by the operator.

function KnowledgeTab({ org }: Pick<ClientHubTabsProps, "org">) {
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<Array<{ id: string; title: string; kind: string; isSensitive: boolean; canonicalUrl: string | null; chunks: number }>>([]);
  const [archived, setArchived] = useState<Array<{ id: string; title: string; kind: string; isSensitive: boolean }>>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [kTitle, setKTitle] = useState(""); const [kBody, setKBody] = useState(""); const [kKind, setKKind] = useState("doc");
  const [kSensitive, setKSensitive] = useState(false); const [kSaving, setKSaving] = useState(false); const [kMsg, setKMsg] = useState<string | null>(null);
  // Per-row draft while typing a real URL to rebind a manual document to (FAQ-duplication fix,
  // operator decision 2026-09-12) — keyed by source id so two rows' inputs never collide.
  const [rebindDraft, setRebindDraft] = useState<Record<string, string>>({});
  const [rebindMsg, setRebindMsg] = useState<Record<string, string>>({});
  const [rebindBusy, setRebindBusy] = useState<string | null>(null);
  // K2g: which row's content viewer is open, if any.
  const [viewingId, setViewingId] = useState<string | null>(null);

  async function reloadSources() {
    try {
      const res = await fetch(`/api/ops/clients/${org.slug}/cs-knowledge`, { headers: { ...roleHeader("admin") } });
      const data = (await res.json()) as { ok?: boolean; sources?: Array<{ id: string; title: string; kind: string; isSensitive: boolean; canonicalUrl: string | null; chunks: number }> };
      if (data.ok && data.sources) setSources(data.sources);
    } catch { /* ignore */ }
  }
  async function reloadArchived() {
    try {
      const res = await fetch(`/api/ops/clients/${org.slug}/cs-knowledge?status=archived`, { headers: { ...roleHeader("admin") } });
      const data = (await res.json()) as { ok?: boolean; sources?: Array<{ id: string; title: string; kind: string; isSensitive: boolean }> };
      if (data.ok && data.sources) setArchived(data.sources);
    } catch { /* ignore */ }
  }
  useEffect(() => {
    let alive = true;
    (async () => { await reloadSources(); if (alive) setLoading(false); })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.slug]);

  async function addKnowledge() {
    setKSaving(true); setKMsg(null);
    try {
      const res = await fetch(`/api/ops/clients/${org.slug}/cs-knowledge`, {
        method: "POST", headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: JSON.stringify({ title: kTitle, body: kBody, kind: kKind, isSensitive: kSensitive }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; chunks?: number; version?: number; unchanged?: boolean };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `failed_${res.status}`);
      // Same title + changed text = a new version; same title + same text = nothing happened, and
      // saying "已建索引（0 塊）" would read as a failure.
      setKMsg(data.unchanged
        ? `✓ 內容與第 ${data.version ?? 1} 版相同，未重建索引`
        : `✓ 已建索引（第 ${data.version ?? 1} 版，${data.chunks ?? 0} 塊）`);
      setKTitle(""); setKBody(""); setKSensitive(false);
      await reloadSources();
    } catch (e) { setKMsg(`⚠ ${String(e)}`); } finally { setKSaving(false); }
  }
  async function archiveKnowledge(id: string) {
    setRebindMsg((m) => ({ ...m, [id]: "" }));
    const res = await fetch(`/api/ops/clients/${org.slug}/cs-knowledge`, { method: "PATCH", headers: { "Content-Type": "application/json", ...roleHeader("admin") }, body: JSON.stringify({ sourceId: id, action: "archive" }) });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    // Checked, not assumed: a 403 (wrong role) or 409 (e.g. the row already changed under us) must
    // not look like "the click did nothing" — the operator needs to see WHY it did not archive.
    if (!res.ok || !data.ok) { setRebindMsg((m) => ({ ...m, [id]: `⚠ 封存失敗：${data.error ?? res.status}` })); return; }
    await reloadSources();
    if (showArchived) await reloadArchived();
  }
  async function restoreKnowledge(id: string) {
    setRebindMsg((m) => ({ ...m, [id]: "" }));
    const res = await fetch(`/api/ops/clients/${org.slug}/cs-knowledge`, { method: "PATCH", headers: { "Content-Type": "application/json", ...roleHeader("admin") }, body: JSON.stringify({ sourceId: id, action: "restore" }) });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      // The one restore-specific failure worth naming: db.ts refuses when a newer version is
      // already live, rather than silently creating two "current" documents side by side.
      setRebindMsg((m) => ({ ...m, [id]: "⚠ 取消封存失敗：這個文件家族已經有其他生效中的版本，不能同時存在兩個" }));
      return;
    }
    await reloadArchived();
    await reloadSources();
  }
  async function rebindKnowledge(id: string) {
    const url = (rebindDraft[id] ?? "").trim();
    if (!url) return;
    setRebindBusy(id);
    setRebindMsg((m) => ({ ...m, [id]: "" }));
    try {
      const res = await fetch(`/api/ops/clients/${org.slug}/cs-knowledge`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: JSON.stringify({ sourceId: id, action: "rebind", canonicalUrl: url }),
      });
      const data = (await res.json()) as { ok?: boolean; hint?: string; error?: string };
      if (!res.ok || !data.ok) {
        setRebindMsg((m) => ({ ...m, [id]: `⚠ ${data.hint ?? data.error ?? "失敗"}` }));
        return;
      }
      setRebindDraft((d) => ({ ...d, [id]: "" }));
      await reloadSources();
    } finally {
      setRebindBusy(null);
    }
  }
  async function delKnowledge(id: string) {
    if (!confirm("永久刪除此文件？此操作無法恢復，資料會直接消失（不是封存）。")) return;
    await fetch(`/api/ops/clients/${org.slug}/cs-knowledge`, { method: "DELETE", headers: { "Content-Type": "application/json", ...roleHeader("admin") }, body: JSON.stringify({ sourceId: id }) });
    await reloadSources();
    await reloadArchived();
  }
  async function toggleArchived() {
    const next = !showArchived;
    setShowArchived(next);
    if (next) await reloadArchived();
  }

  return (
    <>
      <Card title={`知識庫（${loading ? "…" : sources.length} 筆來源）`}>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 8px" }}>
          餵給 AI 的資料（FAQ / SOP / 產品說明…）。新增後自動切塊 + 向量化（pgvector），AI 只根據這些內容回答，答不出來轉真人。
        </p>
        {sources.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {sources.map((s) => (
              <div key={s.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    onClick={() => setViewingId(s.id)}
                    title="檢視內容"
                    style={{ flex: 1, textAlign: "left", fontWeight: 500, border: "none", background: "none", color: "var(--text-primary)", cursor: "pointer", padding: 0, font: "inherit", textDecoration: "underline", textDecorationColor: "var(--border-subtle)" }}
                  >
                    {s.title}
                  </button>
                  {badge("var(--bg-canvas)", "var(--text-muted)", s.kind)}
                  {s.isSensitive && badge("var(--badge-red-bg)", "var(--red)", "敏感")}
                  <span style={{ color: "var(--text-muted)" }}>{s.chunks} 塊</span>
                  <button onClick={() => archiveKnowledge(s.id)} title="封存（從 AI 檢索範圍移除，資料保留，可復原）"
                    style={{ border: "1px solid var(--card-border)", background: "var(--bg-canvas)", color: "var(--text-secondary)", cursor: "pointer", fontSize: 11, padding: "3px 8px", borderRadius: 4 }}>
                    封存
                  </button>
                  <button onClick={() => delKnowledge(s.id)} title="永久刪除（無法恢復）" aria-label="永久刪除"
                    style={{ border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14 }}>×</button>
                </div>
                {!s.canonicalUrl ? (
                  //手動文件才會出現：開爬前先補上真實網址，爬蟲抓到同一網址時才會認成同一份文件的新版本，
                  // 而不是多一份互相矛盾的內容（TASKS.md 2026-09-11「人工上傳 vs 爬蟲抓回」，操作者選項 A）。
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, paddingLeft: 4 }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>手動文件，尚無網址</span>
                    <input
                      value={rebindDraft[s.id] ?? ""}
                      onChange={(e) => setRebindDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                      placeholder="開爬前先補上這篇對應的真實網址（可留白）"
                      style={{ flex: 1, fontSize: 11, padding: "3px 6px", borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--bg-canvas)", color: "var(--text-primary)" }}
                    />
                    <button
                      onClick={() => rebindKnowledge(s.id)}
                      disabled={rebindBusy === s.id || !(rebindDraft[s.id] ?? "").trim()}
                      style={{ border: "1px solid var(--card-border)", background: "var(--bg-canvas)", color: "var(--text-secondary)", cursor: "pointer", fontSize: 11, padding: "3px 8px", borderRadius: 4, flexShrink: 0, opacity: rebindBusy === s.id || !(rebindDraft[s.id] ?? "").trim() ? 0.5 : 1 }}
                    >
                      設定真實網址
                    </button>
                  </div>
                ) : null}
                {rebindMsg[s.id] ? <div style={{ fontSize: 10, color: "var(--red)", marginTop: 2, paddingLeft: 4 }}>{rebindMsg[s.id]}</div> : null}
              </div>
            ))}
          </div>
        )}
        <button onClick={toggleArchived} style={{ border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11, padding: "0 0 8px", textDecoration: "underline" }}>
          {showArchived ? "隱藏已封存" : `已封存文件${archived.length ? `（${archived.length}）` : ""}`}
        </button>
        {showArchived && (
          <div style={{ marginBottom: 10, background: "var(--bg-canvas)", borderRadius: 6, padding: archived.length ? "4px 8px" : 0 }}>
            {archived.length === 0 && <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 8px" }}>沒有已封存的文件。</p>}
            {archived.map((s) => (
              <div key={s.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    onClick={() => setViewingId(s.id)}
                    title="檢視內容"
                    style={{ flex: 1, textAlign: "left", fontWeight: 500, color: "var(--text-muted)", border: "none", background: "none", cursor: "pointer", padding: 0, font: "inherit", textDecoration: "underline", textDecorationColor: "var(--border-subtle)" }}
                  >
                    {s.title}
                  </button>
                  {badge("var(--bg-canvas)", "var(--text-muted)", s.kind)}
                  {s.isSensitive && badge("var(--badge-red-bg)", "var(--red)", "敏感")}
                  <button onClick={() => restoreKnowledge(s.id)} title="取消封存（恢復進 AI 檢索範圍）"
                    style={{ border: "1px solid var(--card-border)", background: "var(--bg-canvas)", color: "var(--text-secondary)", cursor: "pointer", fontSize: 11, padding: "3px 8px", borderRadius: 4 }}>
                    取消封存
                  </button>
                  <button onClick={() => delKnowledge(s.id)} title="永久刪除（無法恢復）" aria-label="永久刪除"
                    style={{ border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14 }}>×</button>
                </div>
                {rebindMsg[s.id] ? <div style={{ fontSize: 10, color: "var(--red)", marginTop: 2, paddingLeft: 4 }}>{rebindMsg[s.id]}</div> : null}
              </div>
            ))}
          </div>
        )}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
          <CisText label="標題" value={kTitle} onChange={setKTitle} placeholder="退換貨政策" />
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 0", fontSize: 12 }}>
            <span style={{ color: "var(--text-muted)", width: 88, flexShrink: 0, paddingTop: 5 }}>內容</span>
            <textarea value={kBody} onChange={(e) => setKBody(e.target.value)} placeholder="貼上 FAQ / 政策 / 產品說明…（≥10 字）" rows={4}
              style={{ flex: 1, fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--card-border)", background: "var(--bg-canvas)", color: "var(--text-primary)", resize: "vertical", fontFamily: "inherit" }} />
          </div>
          <CisSelect label="類型" value={kKind} onChange={setKKind} options={[["doc", "文件"], ["faq", "FAQ"], ["sop", "SOP"], ["conversation", "對話範例"], ["url", "網址"]]} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", padding: "4px 0 0 96px" }}>
            <input type="checkbox" checked={kSensitive} onChange={(e) => setKSensitive(e.target.checked)} /> 敏感內容
          </label>
          <button onClick={addKnowledge} disabled={kSaving || !kTitle || kBody.length < 10} style={{ ...cisBtnStyle, opacity: kSaving || !kTitle || kBody.length < 10 ? 0.5 : 1 }}>
            {kSaving ? "建索引中…" : "新增並建索引"}
          </button>
          {kMsg && <div style={{ marginTop: 6, fontSize: 11, color: kMsg.startsWith("✓") ? "var(--green)" : "var(--red)" }}>{kMsg}</div>}
        </div>
      </Card>

      {viewingId && (
        <KnowledgeDetailModal slug={org.slug} sourceId={viewingId} onClose={() => setViewingId(null)} />
      )}
    </>
  );
}

// ── Data collection tab ──────────────────────────────────────────────────────
//
// The same panel as /ops/collect, bound to this client. Shared rather than reimplemented: a second
// copy of the source picker would drift from the first the day a source is added.

function CollectionTab({ org }: Pick<ClientHubTabsProps, "org">) {
  return (
    <div style={{ marginTop: -4 }}>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 12px", lineHeight: 1.7 }}>
        讓這個客戶的知識庫自己長出來：選來源、試跑、正式抓取。<strong>試跑不會存任何東西</strong>——新來源先試跑，看它抓回來的是不是內文。
      </p>
      <CollectionSourcesPanel slug={org.slug} />
    </div>
  );
}

// ── Social channels tab ───────────────────────────────────────────────────────

type PostizIntegrationItem = {
  id: string;
  name: string;
  identifier: string;
  picture: string | null;
  disabled: boolean;
  profile: string;
};

type ConnectedChannelItem = {
  clientId: string;
  postizIntegrationId: string;
  platform: string;
  label: string;
  status: string;
};

const SUPPORTED_PLATFORMS = new Set([
  "instagram", "facebook", "reddit", "linkedin", "x",
  "threads", "tiktok", "pinterest", "bluesky",
]);

async function fetchSocialData(orgId: string) {
  const [intsRes, chRes] = await Promise.all([
    fetch("/api/content/social-admin/integrations"),
    fetch(`/api/content/social-channels?clientId=${orgId}`),
  ]);
  if (!intsRes.ok) throw new Error("社群整合載入失敗");
  if (!chRes.ok) throw new Error("已連結帳號載入失敗");
  const [intsData, chData] = await Promise.all([intsRes.json(), chRes.json()]);
  return {
    integrations: (intsData.integrations ?? []) as PostizIntegrationItem[],
    connected: (chData.channels ?? []) as ConnectedChannelItem[],
  };
}

function SocialChannelsTab({ org }: Pick<ClientHubTabsProps, "org">) {
  const [integrations, setIntegrations] = useState<PostizIntegrationItem[]>([]);
  const [connected, setConnected] = useState<ConnectedChannelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // useEffect with mounted guard to prevent stale state on unmount/org change
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetchSocialData(org.id)
      .then(({ integrations: ints, connected: conn }) => {
        if (mounted) { setIntegrations(ints); setConnected(conn); }
      })
      .catch((e: unknown) => {
        if (mounted) setError(e instanceof Error ? e.message : "載入失敗");
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [org.id]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { integrations: ints, connected: conn } = await fetchSocialData(org.id);
      setIntegrations(ints);
      setConnected(conn);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  async function connect(integration: PostizIntegrationItem) {
    setSaving(integration.id);
    try {
      const res = await fetch("/api/content/social-admin/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // platform is derived server-side from postizIntegrationId; do not send from client
        body: JSON.stringify({
          clientId: org.id,
          postizIntegrationId: integration.id,
          label: integration.name,
        }),
      });
      if (!res.ok) {
        if (res.status === 409) throw new Error("已連結");
        if (res.status === 403) throw new Error("權限不足");
        if (res.status === 404) throw new Error("找不到帳號或客戶");
        throw new Error(`連結失敗 (${res.status})`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "連結失敗");
    } finally {
      setSaving(null);
    }
  }

  async function disconnect(integrationId: string) {
    setSaving(integrationId);
    try {
      const res = await fetch(
        `/api/content/social-admin/connections?clientId=${encodeURIComponent(org.id)}&integrationId=${encodeURIComponent(integrationId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        if (res.status === 403) throw new Error("權限不足");
        throw new Error(`解除失敗 (${res.status})`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "解除失敗");
    } finally {
      setSaving(null);
    }
  }

  const connectedMap = new Map(connected.map((c) => [c.postizIntegrationId, c]));

  if (loading) return <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 13 }}>載入中⋯</div>;

  return (
    <>
      {error && (
        <div style={{
          margin: "0 0 12px", padding: "10px 14px", borderRadius: 8, fontSize: 12,
          background: "var(--badge-red-bg)", color: "var(--red)", border: "1px solid var(--red)",
        }}>
          {error}
        </div>
      )}
      <MetricGrid items={[
        { label: "已連結", value: connected.filter((c) => c.status === "connected").length, color: "var(--green)" },
        { label: "可用帳號", value: integrations.length, color: "var(--text-muted)" },
      ]} />
      <Card title="Postiz 帳號">
        {integrations.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Postiz 尚無整合帳號。</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {integrations.map((integration) => {
              const isConnected = connectedMap.has(integration.id);
              const isSaving = saving === integration.id;
              const isSupported = SUPPORTED_PLATFORMS.has(integration.identifier);
              return (
                <div
                  key={integration.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", borderRadius: 8,
                    border: `1px solid ${isConnected ? "var(--accent)" : "var(--card-border)"}`,
                    background: isConnected ? "var(--badge-green-bg)" : "var(--bg-canvas)",
                    opacity: !isSupported && !isConnected ? 0.5 : 1,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                      {integration.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {integration.identifier}
                      {integration.profile && integration.profile !== integration.name && ` · ${integration.profile}`}
                      {integration.disabled && <span style={{ color: "var(--yellow)", marginLeft: 6 }}>已停用</span>}
                    </div>
                  </div>
                  {!isSupported ? (
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>不支援</div>
                  ) : (
                    <button
                      disabled={isSaving}
                      onClick={() => isConnected ? disconnect(integration.id) : connect(integration)}
                      style={{
                        padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                        cursor: isSaving ? "default" : "pointer",
                        border: "none", flexShrink: 0,
                        background: isConnected ? "var(--badge-red-bg)" : "var(--accent)",
                        color: isConnected ? "var(--red)" : "var(--btn-primary-text)",
                        opacity: isSaving ? 0.6 : 1,
                      }}
                    >
                      {isSaving ? "⋯" : isConnected ? "解除" : "連結"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

// ── Credentials Vault Tab (migration 0050) ────────────────────────────────────

type CredentialItem = {
  id: string;
  client_id: string;
  category: string;
  label: string;
  identifier: string | null;
  note: string | null;
  secretSet: boolean;
  sort_order: number;
  created_at: string;
};

const CRED_CATEGORIES: Array<{ value: string; label: string; color: string }> = [
  { value: "social",    label: "社群",    color: "#8b5cf6" },
  { value: "cms",       label: "CMS",     color: "#0ea5e9" },
  { value: "analytics", label: "分析",    color: "#f59e0b" },
  { value: "email",     label: "Email",   color: "#10b981" },
  { value: "ads",       label: "廣告",    color: "#f43f5e" },
  { value: "crm",       label: "CRM",     color: "#6366f1" },
  { value: "hosting",   label: "主機",    color: "#64748b" },
  { value: "api",       label: "API",     color: "#0284c7" },
  { value: "other",     label: "其他",    color: "var(--text-muted)" },
];

const CRED_CATEGORY_MAP = new Map(CRED_CATEGORIES.map((c) => [c.value, c]));

const EMPTY_FORM = { category: "other", label: "", identifier: "", note: "" };

function CredentialsTab({ org }: Pick<ClientHubTabsProps, "org">) {
  const [credentials, setCredentials] = useState<CredentialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // credentialId being saved

  // Add-form state
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formSaving, setFormSaving] = useState(false);

  // Inline secret input per row: credentialId → input value
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({});
  const [secretVisible, setSecretVisible] = useState<Record<string, boolean>>({});

  // Active category tab ("all" = show all grouped)
  const [activeCat, setActiveCat] = useState<string>("all");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ops/clients/credentials?clientId=${encodeURIComponent(org.id)}`);
      if (!res.ok) throw new Error(`載入失敗 (${res.status})`);
      const json = await res.json();
      setCredentials(json.credentials ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetch(`/api/ops/clients/credentials?clientId=${encodeURIComponent(org.id)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`載入失敗 (${r.status})`)))
      .then((json) => { if (mounted) setCredentials(json.credentials ?? []); })
      .catch((e: unknown) => { if (mounted) setError(e instanceof Error ? e.message : "載入失敗"); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [org.id]);

  async function handleCreate() {
    if (!form.label.trim()) { setError("label 必填"); return; }
    setFormSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/clients/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: org.id,
          category: form.category,
          label: form.label.trim(),
          identifier: form.identifier.trim() || null,
          note: form.note.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `新增失敗 (${res.status})`);
      setShowForm(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "新增失敗");
    } finally {
      setFormSaving(false);
    }
  }

  async function handleSetSecret(credentialId: string) {
    const value = secretInputs[credentialId];
    if (!value?.trim()) { setError("密碼不能為空"); return; }
    setSaving(credentialId);
    setError(null);
    try {
      const res = await fetch("/api/ops/clients/credentials/secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `設定失敗 (${res.status})`);
      setSecretInputs((prev) => { const n = { ...prev }; delete n[credentialId]; return n; });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "設定失敗");
    } finally {
      setSaving(null);
    }
  }

  async function handleClearSecret(credentialId: string) {
    setSaving(credentialId);
    setError(null);
    try {
      const res = await fetch(
        `/api/ops/clients/credentials/secret?credentialId=${encodeURIComponent(credentialId)}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `清除失敗 (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "清除失敗");
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(credentialId: string, label: string) {
    if (!confirm(`確認刪除「${label}」？此操作無法恢復。`)) return;
    setSaving(credentialId);
    setError(null);
    try {
      const res = await fetch(
        `/api/ops/clients/credentials?id=${encodeURIComponent(credentialId)}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `刪除失敗 (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "刪除失敗");
    } finally {
      setSaving(null);
    }
  }

  // Group by category
  const grouped = new Map<string, CredentialItem[]>();
  for (const cred of credentials) {
    const existing = grouped.get(cred.category) ?? [];
    existing.push(cred);
    grouped.set(cred.category, existing);
  }

  const secretCount = credentials.filter((c) => c.secretSet).length;

  if (loading) return <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 13 }}>載入中⋯</div>;

  return (
    <>
      {error && (
        <div style={{
          margin: "0 0 12px", padding: "10px 14px", borderRadius: 8, fontSize: 12,
          background: "var(--badge-red-bg)", color: "var(--red)", border: "1px solid var(--red)",
        }}>
          {error}
        </div>
      )}

      <MetricGrid items={[
        { label: "憑證項目", value: credentials.length, color: "var(--text-muted)" },
        { label: "已設密碼", value: secretCount, color: "var(--green)" },
        { label: "未設密碼", value: credentials.length - secretCount, color: secretCount < credentials.length ? "var(--yellow)" : "var(--text-muted)" },
      ]} />

      {/* Add credential form */}
      {showForm ? (
        <Card title="新增憑證">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CRED_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setForm((f) => ({ ...f, category: cat.value }))}
                  style={{
                    padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                    cursor: "pointer", border: `1px solid ${cat.color}`,
                    background: form.category === cat.value ? cat.color : "transparent",
                    color: form.category === cat.value ? "#fff" : cat.color,
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <input
              placeholder="名稱 * (e.g. Instagram @soulful)"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--card-border)", fontSize: 12, background: "var(--bg-canvas)", color: "var(--text-primary)" }}
            />
            <input
              placeholder="帳號 / Email / ID（可選，非密碼）"
              value={form.identifier}
              onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
              style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--card-border)", fontSize: 12, background: "var(--bg-canvas)", color: "var(--text-primary)" }}
            />
            <textarea
              placeholder="備注（可選）"
              value={form.note}
              rows={2}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--card-border)", fontSize: 12, background: "var(--bg-canvas)", color: "var(--text-primary)", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleCreate}
                disabled={formSaving}
                style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "none", background: "var(--accent)", color: "var(--btn-primary-text)", cursor: formSaving ? "default" : "pointer", opacity: formSaving ? 0.6 : 1 }}
              >
                {formSaving ? "新增中⋯" : "確認新增"}
              </button>
              <button
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setError(null); }}
                style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500, border: "1px solid var(--card-border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                取消
              </button>
            </div>
          </div>
        </Card>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => {
              setShowForm(true);
              setError(null);
              if (activeCat !== "all") setForm((f) => ({ ...f, category: activeCat }));
            }}
            style={{ padding: "7px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "none", background: "var(--accent)", color: "var(--btn-primary-text)", cursor: "pointer" }}
          >
            ＋ 新增憑證
          </button>
        </div>
      )}

      {/* Category tab strip */}
      {credentials.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            onClick={() => setActiveCat("all")}
            style={{
              padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${activeCat === "all" ? "var(--accent)" : "var(--card-border)"}`,
              background: activeCat === "all" ? "var(--accent)" : "transparent",
              color: activeCat === "all" ? "var(--btn-primary-text)" : "var(--text-secondary)",
            }}
          >
            全部 <span style={{ fontWeight: 700 }}>{credentials.length}</span>
          </button>
          {CRED_CATEGORIES.filter((cat) => grouped.has(cat.value)).map((cat) => {
            const count = grouped.get(cat.value)?.length ?? 0;
            const isActive = activeCat === cat.value;
            return (
              <button
                key={cat.value}
                onClick={() => setActiveCat(cat.value)}
                style={{
                  padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${isActive ? cat.color : "var(--card-border)"}`,
                  background: isActive ? cat.color : "transparent",
                  color: isActive ? "#fff" : "var(--text-secondary)",
                }}
              >
                {cat.label} <span style={{ fontWeight: 700 }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Credential list */}
      {credentials.length === 0 ? (
        <Card title="憑證庫">
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>尚無憑證。點「新增憑證」開始建立。</div>
        </Card>
      ) : (() => {
        const displayCats = activeCat === "all"
          ? CRED_CATEGORIES.filter((cat) => grouped.has(cat.value))
          : CRED_CATEGORIES.filter((cat) => cat.value === activeCat && grouped.has(cat.value));
        return displayCats.map((cat) => (
          <Card key={cat.value} title={activeCat === "all" ? cat.label : ""}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(grouped.get(cat.value) ?? []).map((cred) => {
                const isSaving = saving === cred.id;
                const secretInput = secretInputs[cred.id] ?? "";
                const isVisible = secretVisible[cred.id] ?? false;
                return (
                  <div
                    key={cred.id}
                    style={{
                      padding: "12px 14px", borderRadius: 8,
                      border: `1px solid ${cred.secretSet ? "var(--card-border)" : "var(--yellow)"}`,
                      background: "var(--bg-canvas)",
                      opacity: isSaving ? 0.7 : 1,
                    }}
                  >
                    {/* Row header */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                          {cred.label}
                        </div>
                        {cred.identifier && (
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                            {cred.identifier}
                          </div>
                        )}
                        {cred.note && (
                          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4, fontStyle: "italic" }}>
                            {cred.note}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10,
                          background: cred.secretSet ? "var(--badge-green-bg)" : "var(--badge-yellow-bg)",
                          color: cred.secretSet ? "var(--badge-green-text)" : "var(--badge-yellow-text)",
                          border: `1px solid ${cred.secretSet ? "var(--green)" : "#d97706"}`,
                        }}>
                          {cred.secretSet ? "已設密碼" : "未設密碼"}
                        </span>
                        <button
                          disabled={isSaving}
                          onClick={() => handleDelete(cred.id, cred.label)}
                          style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--red)", background: "transparent", color: "var(--red)", cursor: isSaving ? "default" : "pointer" }}
                        >
                          刪除
                        </button>
                      </div>
                    </div>

                    {/* Secret controls */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ position: "relative", flex: "1 1 200px" }}>
                        <input
                          type={isVisible ? "text" : "password"}
                          placeholder={cred.secretSet ? "輸入新密碼以覆蓋" : "輸入密碼 / API Key"}
                          value={secretInput}
                          onChange={(e) => setSecretInputs((prev) => ({ ...prev, [cred.id]: e.target.value }))}
                          autoComplete="new-password"
                          style={{ width: "100%", padding: "6px 32px 6px 8px", borderRadius: 6, border: "1px solid var(--card-border)", fontSize: 11, background: "var(--bg-canvas)", color: "var(--text-primary)", boxSizing: "border-box" }}
                        />
                        <button
                          onClick={() => setSecretVisible((prev) => ({ ...prev, [cred.id]: !isVisible }))}
                          style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-muted)", padding: 0 }}
                          title={isVisible ? "隱藏" : "顯示"}
                        >
                          {isVisible ? "🙈" : "👁"}
                        </button>
                      </div>
                      <button
                        disabled={isSaving || !secretInput.trim()}
                        onClick={() => handleSetSecret(cred.id)}
                        style={{ padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, border: "none", background: "var(--accent)", color: "var(--btn-primary-text)", cursor: (isSaving || !secretInput.trim()) ? "default" : "pointer", opacity: (isSaving || !secretInput.trim()) ? 0.5 : 1, whiteSpace: "nowrap" }}
                      >
                        {isSaving ? "⋯" : "儲存密碼"}
                      </button>
                      {cred.secretSet && (
                        <button
                          disabled={isSaving}
                          onClick={() => handleClearSecret(cred.id)}
                          style={{ padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, border: "1px solid var(--red)", background: "transparent", color: "var(--red)", cursor: isSaving ? "default" : "pointer", whiteSpace: "nowrap" }}
                        >
                          清除密碼
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ));
      })()}
    </>
  );
}

// ── Cold Outreach tab ─────────────────────────────────────────────────────────

function OutreachTab({ org }: Pick<ClientHubTabsProps, "org">) {
  const [config, setConfig] = useState<{
    selfServeEnabled: boolean;
    hasSupabaseUrl: boolean;
    hasSupabaseKey: boolean;
    supabaseSource: "vault" | "credentials_library" | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [urlInput, setUrlInput] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [selfServe, setSelfServe] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ops/clients/${encodeURIComponent(org.slug)}/outreach-config`);
      if (!res.ok) throw new Error(`載入失敗 (${res.status})`);
      const json = await res.json();
      setConfig(json);
      setSelfServe(json.selfServeEnabled ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = { selfServeEnabled: selfServe };
    if (urlInput.trim()) body.supabaseUrl = urlInput.trim();
    if (keyInput.trim()) body.supabaseKey = keyInput.trim();
    try {
      const res = await fetch(`/api/ops/clients/${encodeURIComponent(org.slug)}/outreach-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `儲存失敗 (${res.status})`);
      setUrlInput("");
      setKeyInput("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  const pill = (ok: boolean, yes: string, no: string) => (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: ok ? "var(--badge-green-bg)" : "var(--badge-red-bg)",
      color: ok ? "var(--badge-green-text)" : "var(--red)",
      border: `1px solid ${ok ? "var(--green)" : "var(--red)"}`,
    }}>{ok ? yes : no}</span>
  );

  return (
    <div style={{ maxWidth: 540 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>冷開發工作台設定</h2>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
        設定 {org.name} 的獨立 Supabase（資料落在客戶自己的庫）及 self-serve 開關。
      </p>

      {loading && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>載入中…</p>}
      {error && <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 12 }}>{error}</p>}

      {config && !loading && (
        <>
          {/* Status badges */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {pill(config.hasSupabaseUrl, "Supabase URL ✓", "Supabase URL 未設定")}
            {pill(config.hasSupabaseKey, "Service Key ✓", "Service Key 未設定")}
            {pill(config.selfServeEnabled, "Self-serve 開啟", "Self-serve 關閉（代操模式）")}
          </div>
          {config.supabaseSource === "credentials_library" && (
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>
              ✦ 已從「憑證庫」自動帶入 Supabase 憑證
            </p>
          )}

          {/* Supabase credentials — only show inputs if not yet configured from either source */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
              Supabase Project URL{config.hasSupabaseUrl ? "（已設定，留空不更新）" : ""}
            </label>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://xxxx.supabase.co"
              style={{
                width: "100%", padding: "7px 10px", fontSize: 12, borderRadius: 6,
                border: "1px solid var(--card-border)", background: "var(--bg-canvas)",
                color: "var(--text-primary)", boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
              Service Role Key{config.hasSupabaseKey ? "（已設定，留空不更新）" : ""}
            </label>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="eyJhb…（存入 Vault，不留 DB）"
              style={{
                width: "100%", padding: "7px 10px", fontSize: 12, borderRadius: 6,
                border: "1px solid var(--card-border)", background: "var(--bg-canvas)",
                color: "var(--text-primary)", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Self-serve toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <button
              onClick={() => setSelfServe((v) => !v)}
              style={{
                width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                background: selfServe ? "var(--accent)" : "var(--card-border)",
                position: "relative", transition: "background 0.2s",
              }}
            >
              <span style={{
                position: "absolute", top: 3, left: selfServe ? 20 : 3,
                width: 16, height: 16, borderRadius: "50%", background: "#fff",
                transition: "left 0.2s",
              }} />
            </button>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Self-serve 開放（客戶付費後可自行操作工作台）
            </span>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 20px", borderRadius: 6, border: "none", cursor: saving ? "default" : "pointer",
              background: saving ? "var(--card-border)" : "var(--accent)", color: "#fff",
              fontSize: 12, fontWeight: 600, opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "儲存中…" : "儲存設定"}
          </button>
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const TABS = ["內容工具", "整合", "佈建", "維護", "設定", "品牌識別", "知識庫", "資料蒐集", "客服", "社群頻道", "憑證庫", "冷開發"] as const;
type Tab = typeof TABS[number];

export function ClientHubTabs(props: ClientHubTabsProps) {
  const { org, cfg, health, wp, runs, installRuns, deptSummary, integrations, wpSites } = props;
  const [activeTab, setActiveTab] = useState<Tab>("維護");

  const initials = org.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ padding: "16px 24px 0", borderBottom: "1px solid var(--card-border)", background: "var(--bg-card)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700,
            background: "var(--bg-canvas)", color: "var(--accent)",
            border: "1px solid var(--card-border)",
          }}>
            {initials}
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{org.name}</h1>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              {org.slug} · {org.type} · {org.status}
              {cfg.site_url && <> · <a href={cfg.site_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>{cfg.site_url.replace(/^https?:\/\//, "")}</a></>}
            </div>
          </div>
          {health && (
            <div style={{
              marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: health.ok ? "var(--badge-green-bg)" : "var(--badge-red-bg)",
              color: health.ok ? "var(--badge-green-text)" : "var(--red)",
              border: `1px solid ${health.ok ? "var(--green)" : "var(--red)"}`,
            }}>
              <span style={{ fontSize: 9 }}>●</span>
              {health.ok ? "上線中" : "離線"}
              {health.statusCode && <span style={{ opacity: 0.7 }}>HTTP {health.statusCode}</span>}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0 }}>
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 16px",
                border: "none", borderBottom: `2px solid ${activeTab === tab ? "var(--accent)" : "transparent"}`,
                background: "transparent", cursor: "pointer",
                fontSize: 12, color: activeTab === tab ? "var(--accent)" : "var(--text-secondary)",
                fontWeight: activeTab === tab ? 600 : 400,
                whiteSpace: "nowrap",
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 24px", background: "var(--bg-canvas)" }}>
        {activeTab === "內容工具" && <ContentTab org={org} cfg={cfg} wpSites={wpSites} />}
        {activeTab === "整合" && <IntegrationsTab integrations={integrations} />}
        {activeTab === "佈建" && <ProvisioningTab deptSummary={deptSummary} runs={runs} cfg={cfg} />}
        {activeTab === "維護" && <MaintenanceTab org={org} cfg={cfg} wp={wp} runs={runs} installRuns={installRuns} />}
        {activeTab === "設定" && <SettingsTab org={org} cfg={cfg} wpSites={wpSites} />}
        {activeTab === "品牌識別" && <BrandIdentityTab org={org} cfg={cfg} />}
        {activeTab === "知識庫" && <KnowledgeTab org={org} />}
        {activeTab === "資料蒐集" && <CollectionTab org={org} />}
        {activeTab === "客服" && <CustomerServiceTab org={org} />}
        {activeTab === "社群頻道" && <SocialChannelsTab org={org} />}
        {activeTab === "憑證庫" && <CredentialsTab org={org} />}
        {activeTab === "冷開發" && <OutreachTab org={org} />}
      </div>
    </div>
  );
}
