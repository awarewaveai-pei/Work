"use client";

import { useState, useEffect, useCallback } from "react";
import type { ManagedSite, SiteContentDefaults } from "@/app/api/content/sites/route";

const FUNNEL_STAGES = [
  { value: "",              label: "不指定" },
  { value: "awareness",     label: "認知" },
  { value: "interest",      label: "興趣" },
  { value: "consideration", label: "考慮" },
  { value: "decision",      label: "決策" },
  { value: "retention",     label: "留存" },
];
const PRICE_POSITIONS = [
  { value: "",        label: "不指定" },
  { value: "premium", label: "高端精品" },
  { value: "midhigh", label: "中高端" },
  { value: "mid",     label: "中端" },
  { value: "value",   label: "平價親民" },
];
const IMAGE_MODELS = [
  { value: "none",                 label: "None（不生成）" },
  { value: "flux-schnell",         label: "Flux Schnell（預設）" },
  { value: "flux-dev",             label: "Flux Dev（高品質）" },
  { value: "ideogram-v3-balanced", label: "Ideogram v3" },
  { value: "flux-2-max",           label: "Flux.2 Max（旗艦）" },
];

const LANGUAGES = ["Traditional Chinese", "Simplified Chinese", "English", "Japanese", "Korean"];

const EMPTY_DEFAULTS: SiteContentDefaults = {
  language: "", targetCountry: "", imageModel: "",
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

  const inp: React.CSSProperties = { background: "#12121e", border: "1px solid #333", borderRadius: 5, color: "#e0e0f0", padding: "6px 8px", fontSize: 13, width: "100%", boxSizing: "border-box" };
  const sel: React.CSSProperties = { ...inp };
  const lbl: React.CSSProperties = { color: "#aaa", fontSize: 12, display: "block", marginBottom: 3 };

  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ fontSize: 12, color: "#5855d0", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        {open ? "▲ 收合" : "▼ Content Studio 預設設定"}
      </button>
      {open && (
        <div style={{ marginTop: 10, padding: "14px 16px", background: "#12121e", border: "1px solid #333", borderRadius: 8, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ color: "#888", fontSize: 12 }}>選此站台時自動帶入 Content Studio 表單（只填空白欄位）。</div>

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

          {/* Row 2: audience / positioning / USP */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <label>
              <span style={lbl}>目標受眾</span>
              <input style={inp} value={d.marketing?.audience ?? ""} placeholder="台灣 30-45 歲女性…" onChange={e => setM("audience", e.target.value)} />
            </label>
            <label>
              <span style={lbl}>品牌定位（一句話）</span>
              <input style={inp} value={d.marketing?.positioning ?? ""} placeholder="陪伴而非治療…" onChange={e => setM("positioning", e.target.value)} />
            </label>
            <label>
              <span style={lbl}>獨特賣點（USP）</span>
              <input style={inp} value={d.marketing?.usp ?? ""} placeholder="跨文化、結構化模組…" onChange={e => setM("usp", e.target.value)} />
            </label>
          </div>

          {/* Row 3: CTA / funnel / price */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <label>
              <span style={lbl}>主要 CTA</span>
              <input style={inp} value={d.marketing?.primaryCta ?? ""} placeholder="預約免費體驗課" onChange={e => setM("primaryCta", e.target.value)} />
            </label>
            <label>
              <span style={lbl}>漏斗階段預設</span>
              <select style={sel} value={d.marketing?.funnelStage ?? ""} onChange={e => setM("funnelStage", e.target.value)}>
                {FUNNEL_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label>
              <span style={lbl}>價格定位預設</span>
              <select style={sel} value={d.marketing?.pricePositioning ?? ""} onChange={e => setM("pricePositioning", e.target.value)}>
                {PRICE_POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
          </div>

          {/* Row 4: emotional / objections / forbidden */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <label>
              <span style={lbl}>情緒觸發點</span>
              <input style={inp} value={d.marketing?.emotionalTriggers ?? ""} placeholder="渴望被理解…" onChange={e => setM("emotionalTriggers", e.target.value)} />
            </label>
            <label>
              <span style={lbl}>常見疑慮 / 抗拒點</span>
              <input style={inp} value={d.marketing?.objections ?? ""} placeholder="我沒有繪畫天份…" onChange={e => setM("objections", e.target.value)} />
            </label>
            <label>
              <span style={lbl}>禁用聲明（逗號）</span>
              <input style={inp} value={d.marketing?.forbiddenClaims ?? ""} placeholder="治癒, 保證療效…" onChange={e => setM("forbiddenClaims", e.target.value)} />
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={handleSave} disabled={saving}>
              {saving ? "儲存中…" : "儲存預設"}
            </button>
            {saved && <span style={{ color: "#10b981", fontSize: 12 }}>✓ 已儲存，下次選此站台會自動帶入</span>}
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
            border: value === c ? "2px solid #fff" : "2px solid transparent",
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
  onSiteUpdated,
  testResult,
  testing,
}: {
  site: ManagedSite;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  onEdit: (site: ManagedSite) => void;
  onSiteUpdated: (updated: ManagedSite) => void;
  testResult: TestResult;
  testing: boolean;
}) {
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div
      style={{
        background: "#1e1e2e",
        border: "1px solid #333",
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
          <strong style={{ color: "#e0e0f0", fontSize: 15 }}>{site.name}</strong>
          {site.source === "env" && (
            <span style={{ fontSize: 11, color: "#888", background: "#2a2a3e", padding: "2px 6px", borderRadius: 4 }}>
              ENV（唯讀）
            </span>
          )}
          {!site.active && (
            <span style={{ fontSize: 11, color: "#f59e0b", background: "#2a2010", padding: "2px 6px", borderRadius: 4 }}>
              停用
            </span>
          )}
        </div>
        <div style={{ color: "#888", fontSize: 13, marginTop: 3, paddingLeft: 18 }}>{site.url}</div>
        {site.note && (
          <div style={{ color: "#666", fontSize: 12, marginTop: 2, paddingLeft: 18 }}>{site.note}</div>
        )}
        <div style={{ paddingLeft: 18, marginTop: 4, fontSize: 12, color: site.usernameSet ? "#10b981" : "#f59e0b" }}>
          用戶：{site.usernameSet ? "已設定 ✓" : "未設定"} ／ 密碼：{site.tokenSet ? "已設定 ✓" : "未設定 ✗"}
        </div>
        {testResult && (
          <div
            style={{
              paddingLeft: 18, marginTop: 4, fontSize: 12,
              color: testResult.ok ? "#10b981" : "#ef4444",
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
                  style={{ fontSize: 12, background: "#ef4444", color: "#fff" }}
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
                style={{ fontSize: 12, color: "#ef4444" }}
                onClick={() => setConfirmDel(true)}
              >
                移除
              </button>
            )}
          </>
        )}
        {site.source === "env" && (
          <span style={{ fontSize: 12, color: "#666" }}>由環境變數設定，請在伺服器上修改</span>
        )}
      </div>
      {/* Content Studio defaults — full width below actions */}
      {site.source === "db" && (
        <div style={{ width: "100%", marginTop: 2 }}>
          <ContentDefaultsPanel site={site} onSaved={onSiteUpdated} />
        </div>
      )}
    </div>
  );
}

function SiteForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: typeof EMPTY_FORM & { id?: string };
  onSave: (data: typeof EMPTY_FORM) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState(initial);
  const isEdit = Boolean(initial.id);

  function set(k: keyof typeof EMPTY_FORM, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const inputStyle: React.CSSProperties = {
    background: "#12121e",
    border: "1px solid #333",
    borderRadius: 6,
    color: "#e0e0f0",
    padding: "8px 10px",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        background: "#1a1a2e",
        border: "1px solid #5855d0",
        borderRadius: 10,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <strong style={{ color: "#e0e0f0", fontSize: 16 }}>
        {isEdit ? "編輯網站" : "新增 WordPress 網站"}
      </strong>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#aaa", fontSize: 13 }}>網站名稱 *</span>
          <input
            style={inputStyle}
            placeholder="例：soulful.com.tw"
            value={form.name}
            onChange={e => set("name", e.target.value)}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#aaa", fontSize: 13 }}>WordPress 網址 *</span>
          <input
            style={inputStyle}
            placeholder="https://example.com"
            value={form.url}
            onChange={e => set("url", e.target.value)}
          />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#aaa", fontSize: 13 }}>WP 用戶名稱 *</span>
          <input
            style={inputStyle}
            placeholder="例：admin"
            value={form.username}
            onChange={e => set("username", e.target.value)}
            autoComplete="username"
          />
          <span style={{ color: "#666", fontSize: 11 }}>WP 登入帳號</span>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ color: "#aaa", fontSize: 13 }}>
            Application Password *
            {isEdit && <span style={{ color: "#666", marginLeft: 6 }}>（留空 = 不變更）</span>}
          </span>
          <input
            style={inputStyle}
            type="password"
            placeholder={isEdit ? "留空維持原本" : "xxxx xxxx xxxx xxxx xxxx xxxx"}
            value={form.token}
            onChange={e => set("token", e.target.value)}
            autoComplete="new-password"
          />
          <span style={{ color: "#666", fontSize: 11 }}>
            WP Admin → 用戶 → 個人資料 → Application Passwords
          </span>
        </label>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ color: "#aaa", fontSize: 13 }}>標籤顏色</span>
        <ColorPicker value={form.color} onChange={v => set("color", v)} />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ color: "#aaa", fontSize: 13 }}>備註（可選）</span>
        <input
          style={inputStyle}
          placeholder="客戶名稱、合約備注…"
          value={form.note}
          onChange={e => set("note", e.target.value)}
        />
      </label>

      {error && (
        <div style={{ color: "#ef4444", fontSize: 13, background: "#2a1010", padding: "8px 12px", borderRadius: 6 }}>
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
      const res = await fetch("/api/content/sites");
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
          <h2 style={{ color: "#e0e0f0", margin: 0, fontSize: 22 }}>WordPress 網站連線</h2>
          <p style={{ color: "#888", margin: "4px 0 0", fontSize: 13 }}>
            管理所有客戶的 WP 站點。Token 加密儲存，不會顯示明文。
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setShowForm(true); setEditingSite(null); setFormError(null); }}
          disabled={showForm || Boolean(editingSite)}
        >
          + 新增網站
        </button>
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
      {loading && <div style={{ color: "#888", textAlign: "center", padding: 32 }}>載入中…</div>}

      {/* DB sites */}
      {!loading && dbSites.length === 0 && !showForm && (
        <div
          style={{
            border: "1px dashed #333",
            borderRadius: 8,
            padding: 32,
            textAlign: "center",
            color: "#666",
          }}
        >
          尚無 WordPress 網站連線。點「+ 新增網站」開始設定。
        </div>
      )}

      {dbSites.map(site => (
        editingSite?.id === site.id ? (
          <SiteForm
            key={site.id}
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
          />
        ) : (
          <SiteCard
            key={site.id}
            site={site}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onTest={handleTest}
            onEdit={s => { setEditingSite(s); setShowForm(false); setFormError(null); }}
            onSiteUpdated={updated => setSites(s => s.map(x => x.id === updated.id ? updated : x))}
            testResult={testResults[site.id] ?? null}
            testing={testingIds.has(site.id)}
          />
        )
      ))}

      {/* ENV fallback sites (read-only) */}
      {envSites.length > 0 && (
        <>
          <div style={{ color: "#666", fontSize: 12, marginTop: 8 }}>
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
              onSiteUpdated={() => undefined}
              testResult={null}
              testing={false}
            />
          ))}
        </>
      )}

      {/* Footer nav */}
      <div style={{ marginTop: 8, display: "flex", gap: 12 }}>
        <a href="/tools/content" style={{ color: "#5855d0", fontSize: 13, textDecoration: "none" }}>
          ← 返回 Content Studio
        </a>
        <a href="/tools/content/calendar" style={{ color: "#5855d0", fontSize: 13, textDecoration: "none" }}>
          內容行事曆 →
        </a>
      </div>
    </div>
  );
}
