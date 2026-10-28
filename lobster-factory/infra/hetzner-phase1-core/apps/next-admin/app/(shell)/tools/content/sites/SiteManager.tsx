"use client";

import { useState, useEffect, useCallback } from "react";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { useDoorHref, useOnDoor } from "@/app/DoorContext";
import { FUNNEL_STAGES, PRICE_POSITIONS, type SiteContentDefaults } from "@/lib/content/brand-voice";
import PublishModeButtons from "./PublishModeButtons";
import TopicModeButtons from "./TopicModeButtons";

const MKT_PRESETS: Record<string, string[]> = {
  audience: ["台灣 30-45 歲女性", "有焦慮/壓力的上班族", "正在尋找自我療癒的成人", "對心理健康有興趣的父母", "藝術愛好者（非專業）", "身心科/諮商後進階探索者"],
  primaryCta: ["預約免費體驗課", "立即報名工作坊", "加入候補名單", "下載免費指南", "訂閱電子報", "聯絡我們了解更多"],
  emotionalTriggers: ["渴望被理解與接納", "想找回創造力與自信", "希望減輕焦慮與壓力", "尋找內心平靜與自我探索", "渴望與人真實連結", "想為孩子找到非藥物支持"],
  objections: ["我沒有繪畫天份", "會不會很貴？值得嗎？", "我不確定這對我有效", "我沒有時間", "這跟一般心理諮商有什麼不同？", "我的孩子適合嗎？"],
};
const IMAGE_MODELS = [
  { value: "none",                 label: "None（不生成）" },
  { value: "flux-schnell",         label: "Flux Schnell（預設）" },
  { value: "flux-dev",             label: "Flux Dev（高品質）" },
  { value: "ideogram-v3-balanced", label: "Ideogram v3" },
  { value: "flux-2-max",           label: "Flux.2 Max（旗艦）" },
];

const LANGUAGES = ["Traditional Chinese", "Simplified Chinese", "English", "Japanese", "Korean"];

const ARTICLE_TYPES = [
  { value: "",                label: "不指定" },
  { value: "Pillar Article",  label: "支柱文章" },
  { value: "How-to Guide",    label: "操作指南" },
  { value: "Opinion Piece",   label: "觀點文章" },
  { value: "Comparison",      label: "比較評測" },
  { value: "Tutorial",        label: "教學教程" },
  { value: "Q&A Page",        label: "Q&A 問答頁" },
  { value: "Listicle",        label: "列表文章" },
  { value: "Case Study",      label: "案例研究" },
];
const TONES = [
  { value: "",                label: "不指定" },
  { value: "Friendly",        label: "親切友善" },
  { value: "Professional",    label: "專業正式" },
  { value: "Educational",     label: "教育啟發" },
  { value: "Inspirational",   label: "鼓舞人心" },
  { value: "Warm & Credible", label: "溫暖可信" },
];
const READABILITIES = [
  { value: "",                          label: "不指定" },
  { value: "6th grade (very easy)",     label: "簡單（6 年級）" },
  { value: "8th grade (recommended)",   label: "推薦（8 年級）" },
  { value: "10th grade",                label: "一般（10 年級）" },
  { value: "College",                   label: "大學程度" },
  { value: "Professional",              label: "專業級" },
];
const POVS = [
  { value: "none",          label: "不指定" },
  { value: "First person",  label: "第一人稱（我）" },
  { value: "Second person", label: "第二人稱（你）" },
  { value: "Third person",  label: "第三人稱（他／她）" },
];

const EMPTY_DEFAULTS: SiteContentDefaults = {
  language: "", targetCountry: "", imageModel: "",
  tone: "", articleType: "", readability: "", pointOfView: "none",
  featuredImageFont: "sans", featuredImageTitlePosition: "bottom",
  marketing: { audience: "", positioning: "", usp: "", primaryCta: "", funnelStage: "", pricePositioning: "", emotionalTriggers: "", objections: "", forbiddenClaims: "" },
};

function ContentDefaultsPanel({ site, onSaved }: { site: ManagedSite; onSaved: (updated: ManagedSite) => void }) {
  const [open, setOpen]     = useState(false);
  const [d, setD]           = useState<SiteContentDefaults>(() => ({ ...EMPTY_DEFAULTS, ...site.contentDefaults, marketing: { ...EMPTY_DEFAULTS.marketing, ...(site.contentDefaults?.marketing ?? {}) } }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  function setM(k: keyof NonNullable<SiteContentDefaults["marketing"]>, v: string) {
    setD(p => ({ ...p, marketing: { ...p.marketing, [k]: v } }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true); setSaved(false);
    try {
      const res  = await fetch(`/api/content/sites/${site.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentDefaults: d }),
      });
      const json = await res.json() as { ok: boolean; site?: ManagedSite };
      if (json.ok && json.site) { onSaved(json.site); setSaved(true); }
    } finally { setSaving(false); }
  }

  const inp: React.CSSProperties = { background: "var(--form-input-bg)", border: "1px solid var(--card-border)", borderRadius: 5, color: "var(--text-primary)", padding: "6px 8px", fontSize: 13, width: "100%", boxSizing: "border-box" };
  const sel: React.CSSProperties = { ...inp };
  const lbl: React.CSSProperties = { color: "var(--text-muted)", fontSize: 12, display: "block", marginBottom: 3 };

  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ fontSize: 12, color: "var(--accent-text)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        {open ? "▲ 收合" : "▼ Content Studio 預設設定"}
      </button>
      {open && (
        <div style={{ marginTop: 10, padding: "14px 16px", background: "var(--form-input-bg)", border: "1px solid var(--card-border)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ color: "var(--text-muted)", fontSize: 12 }}>選此站台時自動帶入 Content Studio 表單（只填空白欄位）。</div>

          {/* Row 0: tone / articleType / readability / pointOfView */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
            <label>
              <span style={lbl}>語氣風格</span>
              <select style={sel} value={d.tone ?? ""} onChange={e => { setD(p => ({ ...p, tone: e.target.value })); setSaved(false); }}>
                {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label>
              <span style={lbl}>文章類型</span>
              <select style={sel} value={d.articleType ?? ""} onChange={e => { setD(p => ({ ...p, articleType: e.target.value })); setSaved(false); }}>
                {ARTICLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label>
              <span style={lbl}>可讀性</span>
              <select style={sel} value={d.readability ?? ""} onChange={e => { setD(p => ({ ...p, readability: e.target.value })); setSaved(false); }}>
                {READABILITIES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label>
              <span style={lbl}>人稱視角</span>
              <select style={sel} value={d.pointOfView ?? ""} onChange={e => { setD(p => ({ ...p, pointOfView: e.target.value })); setSaved(false); }}>
                {POVS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
          </div>

          {/* Row 1: language / country / image model */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <label>
              <span style={lbl}>語言</span>
              <select style={sel} value={d.language ?? ""} onChange={e => { setD(p => ({ ...p, language: e.target.value })); setSaved(false); }}>
                <option value="">不指定</option>
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label>
              <span style={lbl}>目標國家</span>
              <input style={inp} value={d.targetCountry ?? ""} placeholder="例：台灣"
                onChange={e => { setD(p => ({ ...p, targetCountry: e.target.value })); setSaved(false); }} />
            </label>
            <label>
              <span style={lbl}>圖片模型</span>
              <select style={sel} value={d.imageModel ?? ""} onChange={e => { setD(p => ({ ...p, imageModel: e.target.value })); setSaved(false); }}>
                {IMAGE_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
          </div>

          {/* Row 1b: featured image overlay settings */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label>
              <span style={lbl}>精選圖片標題字型</span>
              <select style={sel} value={d.featuredImageFont ?? "sans"} onChange={e => { setD(p => ({ ...p, featuredImageFont: e.target.value })); setSaved(false); }}>
                <option value="sans">無黑體（Noto Sans CJK）</option>
                <option value="serif">明體（Noto Serif CJK）</option>
                <option value="none">不疊標題文字</option>
              </select>
            </label>
            <label>
              <span style={lbl}>標題文字位置</span>
              <select style={sel} value={d.featuredImageTitlePosition ?? "bottom"} onChange={e => { setD(p => ({ ...p, featuredImageTitlePosition: e.target.value })); setSaved(false); }}>
                <option value="bottom">底部漸層（推薦）</option>
                <option value="center">正中央</option>
              </select>
            </label>
          </div>

          {/* Marketing grid — 2-col, matches ContentStudio layout */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {/* audience */}
            <div>
              <span style={lbl}>目標受眾</span>
              <input style={inp} value={d.marketing?.audience ?? ""} placeholder="例：台灣成人，對表達藝術有興趣"
                onChange={e => { setM("audience", e.target.value); }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {MKT_PRESETS.audience.map(p => (
                  <button key={p} type="button" onClick={() => setM("audience", p)}
                    style={{ padding: "1px 7px", borderRadius: 10, border: "1px solid var(--card-border)", fontSize: 11, cursor: "pointer", background: "var(--bg-card)", color: "var(--text-muted)" }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {/* positioning */}
            <div>
              <span style={lbl}>品牌定位（一句話）</span>
              <input style={inp} value={d.marketing?.positioning ?? ""} placeholder="例：陪伴而非治療的藝術自我探索空間"
                onChange={e => { setM("positioning", e.target.value); }} />
            </div>
            {/* USP */}
            <div>
              <span style={lbl}>獨特賣點 / 差異化（USP）</span>
              <input style={inp} value={d.marketing?.usp ?? ""} placeholder="例：跨文化、結構化模組、真人帶領"
                onChange={e => { setM("usp", e.target.value); }} />
            </div>
            {/* funnel */}
            <div>
              <span style={lbl}>漏斗階段預設</span>
              <select style={sel} value={d.marketing?.funnelStage ?? ""} onChange={e => setM("funnelStage", e.target.value)}>
                {FUNNEL_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {/* CTA */}
            <div>
              <span style={lbl}>主要行動呼籲（CTA）</span>
              <input style={inp} value={d.marketing?.primaryCta ?? ""} placeholder="例：預約免費體驗工作坊"
                onChange={e => { setM("primaryCta", e.target.value); }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {MKT_PRESETS.primaryCta.map(p => (
                  <button key={p} type="button" onClick={() => setM("primaryCta", p)}
                    style={{ padding: "1px 7px", borderRadius: 10, border: "1px solid var(--card-border)", fontSize: 11, cursor: "pointer", background: "var(--bg-card)", color: "var(--text-muted)" }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {/* price */}
            <div>
              <span style={lbl}>價格定位</span>
              <select style={sel} value={d.marketing?.pricePositioning ?? ""} onChange={e => setM("pricePositioning", e.target.value)}>
                {PRICE_POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            {/* emotional triggers */}
            <div>
              <span style={lbl}>情緒觸發點 / 讀者渴望</span>
              <input style={inp} value={d.marketing?.emotionalTriggers ?? ""} placeholder="例：渴望被理解、想找回創造力"
                onChange={e => { setM("emotionalTriggers", e.target.value); }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {MKT_PRESETS.emotionalTriggers.map(p => (
                  <button key={p} type="button" onClick={() => setM("emotionalTriggers", p)}
                    style={{ padding: "1px 7px", borderRadius: 10, border: "1px solid var(--card-border)", fontSize: 11, cursor: "pointer", background: "var(--bg-card)", color: "var(--text-muted)" }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {/* objections */}
            <div>
              <span style={lbl}>要化解的疑慮 / 抗拒點</span>
              <input style={inp} value={d.marketing?.objections ?? ""} placeholder="例：我沒有繪畫天份／會不會很貴"
                onChange={e => { setM("objections", e.target.value); }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {MKT_PRESETS.objections.map(p => (
                  <button key={p} type="button" onClick={() => setM("objections", p)}
                    style={{ padding: "1px 7px", borderRadius: 10, border: "1px solid var(--card-border)", fontSize: 11, cursor: "pointer", background: "var(--bg-card)", color: "var(--text-muted)" }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {/* forbidden claims — full width */}
            <div style={{ gridColumn: "1 / -1" }}>
              <span style={lbl}>避免使用 / 禁用聲明（逗號分隔）</span>
              <input style={inp} value={d.marketing?.forbiddenClaims ?? ""} placeholder="例：治癒, 治療疾病, 保證療效"
                onChange={e => { setM("forbiddenClaims", e.target.value); }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={handleSave} disabled={saving}>
              {saving ? "儲存中…" : "儲存預設"}
            </button>
            {saved && <span style={{ color: "var(--green)", fontSize: 12 }}>✓ 已儲存，下次選此站台會自動帶入</span>}
          </div>
        </div>
      )}
    </div>
  );
}

const PRESET_COLORS = [
  "#5855d0", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16",
];

const EMPTY_FORM = { name: "", url: "", username: "", token: "", color: "#5855d0", note: "" };

type TestResult = { ok: boolean; message: string } | null;

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: c,
            border: value === c ? "2px solid var(--card-bg)" : "2px solid transparent",
            outline: value === c ? `2px solid ${c}` : "none",
            cursor: "pointer",
            padding: 0,
          }}
          title={c}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: 24, height: 24, padding: 0, border: "none", cursor: "pointer", borderRadius: 6 }}
        title="自訂顏色"
      />
    </div>
  );
}

function SiteCard({
  site,
  onToggle,
  onDelete,
  onTest,
  onEdit,
  testResult,
  testing,
}: {
  site: ManagedSite;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  onEdit: (site: ManagedSite) => void;
  testResult: TestResult;
  testing: boolean;
}) {
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--card-border)",
        borderLeft: `4px solid ${site.color}`,
        borderRadius: 8,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      {/* Color dot + info */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 10, height: 10, borderRadius: "50%",
              background: site.color, display: "inline-block", flexShrink: 0,
            }}
          />
          <strong style={{ color: "var(--text-primary)", fontSize: 15 }}>{site.name}</strong>
          {site.source === "env" && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--bg-canvas)", padding: "2px 6px", borderRadius: 4 }}>
              ENV（唯讀）
            </span>
          )}
          {!site.active && (
            <span style={{ fontSize: 11, color: "var(--yellow)", background: "rgba(245,158,11,0.12)", padding: "2px 6px", borderRadius: 4 }}>
              停用
            </span>
          )}
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 3, paddingLeft: 18 }}>{site.url}</div>
        {site.note && (
          <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2, paddingLeft: 18 }}>{site.note}</div>
        )}
        <div style={{ paddingLeft: 18, marginTop: 4, fontSize: 12, color: site.usernameSet ? "var(--green)" : "var(--yellow)" }}>
          用戶：{site.usernameSet ? "已設定 ✓" : "未設定"} ／ 密碼：{site.tokenSet ? "已設定 ✓" : "未設定 ✗"}
        </div>
        {testResult && (
          <div
            style={{
              paddingLeft: 18, marginTop: 4, fontSize: 12,
              color: testResult.ok ? "var(--green)" : "var(--red)",
            }}
          >
            {testResult.ok ? "✓" : "✗"} {testResult.message}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {site.source === "db" && (
          <>
            <button
              className="btn btn-sm"
              style={{ fontSize: 12 }}
              onClick={() => onTest(site.id)}
              disabled={testing}
            >
              {testing ? "測試中…" : "測試連線"}
            </button>
            <button
              className="btn btn-sm"
              style={{ fontSize: 12 }}
              onClick={() => onToggle(site.id, !site.active)}
            >
              {site.active ? "停用" : "啟用"}
            </button>
            <button
              className="btn btn-sm"
              style={{ fontSize: 12 }}
              onClick={() => onEdit(site)}
            >
              編輯
            </button>
            {confirmDel ? (
              <>
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 12, background: "var(--red)", color: "var(--btn-primary-text)" }}
                  onClick={() => onDelete(site.id)}
                >
                  確認刪除
                </button>
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 12 }}
                  onClick={() => setConfirmDel(false)}
                >
                  取消
                </button>
              </>
            ) : (
              <button
                className="btn btn-sm"
                style={{ fontSize: 12, color: "var(--red)" }}
                onClick={() => setConfirmDel(true)}
              >
                移除
              </button>
            )}
          </>
        )}
        {site.source === "env" && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>由環境變數設定，請在伺服器上修改</span>
        )}
      </div>
    </div>
  );
}

function SiteForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
  urlLocked = false,
}: {
  initial: typeof EMPTY_FORM & { id?: string };
  onSave: (data: typeof EMPTY_FORM) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  urlLocked?: boolean;
}) {
  const [form, setForm] = useState(initial);
  const isEdit = Boolean(initial.id);

  function set(k: keyof typeof EMPTY_FORM, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--form-input-bg)",
    border: "1px solid var(--card-border)",
    borderRadius: 6,
    color: "var(--text-primary)",
    padding: "8px 10px",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--accent)",
        borderRadius: 10,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <strong style={{ color: "var(--text-primary)", fontSize: 16 }}>
        {isEdit ? "編輯網站" : "新增 WordPress 網站"}
      </strong>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>網站名稱 *</span>
          <input
            style={inputStyle}
            placeholder="例：soulful.com.tw"
            value={form.name}
            onChange={e => set("name", e.target.value)}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>WordPress 網址 *</span>
          <input
            style={inputStyle}
            placeholder="https://example.com"
            value={form.url}
            readOnly={urlLocked}
            title={urlLocked ? "網址要由我們變更" : undefined}
            onChange={e => set("url", e.target.value)}
          />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>WP 用戶名稱 *</span>
          <input
            style={inputStyle}
            placeholder="例：admin"
            value={form.username}
            onChange={e => set("username", e.target.value)}
            autoComplete="username"
          />
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>WP 登入帳號</span>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Application Password *
            {isEdit && <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>（留空 = 不變更）</span>}
          </span>
          <input
            style={inputStyle}
            type="password"
            placeholder={isEdit ? "留空維持原本" : "xxxx xxxx xxxx xxxx xxxx xxxx"}
            value={form.token}
            onChange={e => set("token", e.target.value)}
            autoComplete="new-password"
          />
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
            WP Admin → 用戶 → 個人資料 → Application Passwords
          </span>
        </label>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>標籤顏色</span>
        <ColorPicker value={form.color} onChange={v => set("color", v)} />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>備註（可選）</span>
        <input
          style={inputStyle}
          placeholder="客戶名稱、合約備注…"
          value={form.note}
          onChange={e => set("note", e.target.value)}
        />
      </label>

      {error && (
        <div style={{ color: "var(--red)", fontSize: 13, background: "var(--badge-red-bg)", padding: "8px 12px", borderRadius: 6 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary"
          style={{ fontSize: 14 }}
          onClick={() => onSave(form)}
          disabled={saving}
        >
          {saving ? "儲存中…" : isEdit ? "更新" : "新增網站"}
        </button>
        <button className="btn" style={{ fontSize: 14 }} onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}

export default function SiteManager() {
  // On the content door a customer edits its own sites, but adding one or changing a URL is staff-only
  // (siteUrlWriteGate, lib/content/wp-sites.ts): those controls do not show there.
  const onDoor = useOnDoor();
  const studioHref = useDoorHref("/tools/content");
  const calendarHref = useDoorHref("/tools/content/calendar");
  const [sites, setSites] = useState<ManagedSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSite, setEditingSite] = useState<ManagedSite | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());

  const loadSites = useCallback(async () => {
    setLoading(true);
    try {
      // 站別管理頁是唯一真的需要看見「已停用」站的畫面（要能重新啟用／刪除它們），
      // 所以明示 opt-in。其他消費端不帶這個參數 → 只拿得到 active（route.ts GET 的預設）。
      const res = await fetch("/api/content/sites?includeInactive=1");
      const data = await res.json() as { ok: boolean; sites?: ManagedSite[] };
      if (data.ok && data.sites) setSites(data.sites);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSites(); }, [loadSites]);

  async function handleAdd(form: typeof EMPTY_FORM) {
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/content/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { ok: boolean; error?: string; site?: ManagedSite };
      if (!data.ok) { setFormError(data.error ?? "新增失敗"); return; }
      if (data.site) setSites(s => [...s, data.site!]);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(form: typeof EMPTY_FORM) {
    if (!editingSite) return;
    setSaving(true);
    setFormError(null);
    const patch: Record<string, string | boolean> = {
      name: form.name, url: form.url, color: form.color, note: form.note,
    };
    if (form.username) patch.username = form.username;
    if (form.token)    patch.token    = form.token;
    try {
      const res = await fetch(`/api/content/sites/${editingSite.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json() as { ok: boolean; error?: string; site?: ManagedSite };
      if (!data.ok) { setFormError(data.error ?? "更新失敗"); return; }
      if (data.site) setSites(s => s.map(x => x.id === editingSite.id ? data.site! : x));
      setEditingSite(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string, active: boolean) {
    const res = await fetch(`/api/content/sites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    const data = await res.json() as { ok: boolean; site?: ManagedSite };
    if (data.ok && data.site) setSites(s => s.map(x => x.id === id ? data.site! : x));
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/content/sites/${id}`, { method: "DELETE" });
    const data = await res.json() as { ok: boolean };
    if (data.ok) setSites(s => s.filter(x => x.id !== id));
  }

  async function handleTest(id: string) {
    setTestingIds(prev => new Set([...prev, id]));
    try {
      const res = await fetch(`/api/content/sites/${id}/test`, { method: "POST" });
      const data = await res.json() as { ok: boolean; message: string };
      setTestResults(prev => ({ ...prev, [id]: data }));
    } finally {
      setTestingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  const dbSites = sites.filter(s => s.source === "db");
  const envSites = sites.filter(s => s.source === "env");

  return (
    <div
      style={{
        maxWidth: 800,
        margin: "0 auto",
        padding: "24px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ color: "var(--text-primary)", margin: 0, fontSize: 22 }}>WordPress 網站連線</h2>
          <p style={{ color: "var(--text-muted)", margin: "4px 0 0", fontSize: 13 }}>
            {onDoor ? "你的 WordPress 網站。" : "管理所有客戶的 WP 站點。"}Token 加密儲存，不會顯示明文。
          </p>
        </div>
        {!onDoor && <button
          className="btn btn-primary"
          onClick={() => { setShowForm(true); setEditingSite(null); setFormError(null); }}
          disabled={showForm || Boolean(editingSite)}
        >
          + 新增網站
        </button>}
      </div>

      {/* Add form */}
      {showForm && !editingSite && (
        <SiteForm
          initial={EMPTY_FORM}
          onSave={handleAdd}
          onCancel={() => { setShowForm(false); setFormError(null); }}
          saving={saving}
          error={formError}
        />
      )}

      {/* Loading */}
      {loading && <div style={{ color: "var(--text-muted)", textAlign: "center", padding: 32 }}>載入中…</div>}

      {/* DB sites */}
      {!loading && dbSites.length === 0 && !showForm && (
        <div
          style={{
            border: "1px dashed var(--card-border)",
            borderRadius: 8,
            padding: 32,
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          {onDoor ? "尚無 WordPress 網站連線。要新增網站，請聯絡我們。" : "尚無 WordPress 網站連線。點「+ 新增網站」開始設定。"}
        </div>
      )}

      {dbSites.map(site => (
        <div key={site.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {editingSite?.id === site.id ? (
            <SiteForm
              initial={{
                id: site.id,
                name: site.name,
                url: site.url,
                username: "",
                token: "",
                color: site.color,
                note: site.note ?? "",
              }}
              onSave={handleEdit}
              onCancel={() => { setEditingSite(null); setFormError(null); }}
              saving={saving}
              error={formError}
              urlLocked={onDoor}
            />
          ) : (
            <SiteCard
              site={site}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onTest={handleTest}
              onEdit={s => { setEditingSite(s); setShowForm(false); setFormError(null); }}
              testResult={testResults[site.id] ?? null}
              testing={testingIds.has(site.id)}
            />
          )}
          {/* Content Studio defaults always visible regardless of edit state */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "0 16px 10px" }}>
            <PublishModeButtons
              site={sites.find(x => x.id === site.id) ?? site}
              onSaved={updated => setSites(s => s.map(x => x.id === updated.id ? updated : x))}
              readOnly={onDoor}
            />
            <TopicModeButtons
              site={sites.find(x => x.id === site.id) ?? site}
              onSaved={updated => setSites(s => s.map(x => x.id === updated.id ? updated : x))}
              readOnly={onDoor}
            />
            <ContentDefaultsPanel
              site={sites.find(x => x.id === site.id) ?? site}
              onSaved={updated => setSites(s => s.map(x => x.id === updated.id ? updated : x))}
            />
          </div>
        </div>
      ))}

      {/* ENV fallback sites (read-only) */}
      {envSites.length > 0 && (
        <>
          <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8 }}>
            以下網站由伺服器環境變數設定（唯讀）：
          </div>
          {envSites.map(site => (
            <SiteCard
              key={site.id}
              site={site}
              onToggle={() => undefined}
              onDelete={() => undefined}
              onTest={() => undefined}
              onEdit={() => undefined}
              testResult={null}
              testing={false}
            />
          ))}
        </>
      )}

      {/* Footer nav */}
      <div style={{ marginTop: 8, display: "flex", gap: 12 }}>
        {studioHref && <a href={studioHref} style={{ color: "var(--accent-text)", fontSize: 13, textDecoration: "none" }}>
          ← 返回 Content Studio
        </a>}
        {calendarHref && <a href={calendarHref} style={{ color: "var(--accent-text)", fontSize: 13, textDecoration: "none" }}>
          內容行事曆 →
        </a>}
      </div>
    </div>
  );
}
