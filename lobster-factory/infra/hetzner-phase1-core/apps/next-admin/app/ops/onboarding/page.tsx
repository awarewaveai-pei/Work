"use client";

import { useState } from "react";
import type { IntakeForm, WebsiteSpec } from "@/lib/onboarding/intake-form";

const STEPS = [
  { num: 1, label: "公司品牌", duration: "2 min" },
  { num: 2, label: "客群", duration: "1 min" },
  { num: 3, label: "功能需求", duration: "2 min" },
  { num: 4, label: "視覺參考", duration: "2 min" },
  { num: 5, label: "素材時程", duration: "1 min" },
];

const PAGES = [
  { value: "home", label: "首頁" },
  { value: "about", label: "關於" },
  { value: "products", label: "產品/服務" },
  { value: "blog", label: "部落格" },
  { value: "contact", label: "聯絡" },
  { value: "cart", label: "購物車" },
  { value: "booking", label: "預約" },
];

const PRODUCT_TYPES = [
  { value: "physical", label: "實體商品" },
  { value: "digital", label: "數位商品" },
  { value: "pod", label: "客製商品 (POD)" },
  // 「服務預約」已移除 — 與「功能需求 → 預約系統」重疊；預約走 needs_booking。
];

const VISUAL_STYLES = [
  { value: "minimal", label: "極簡" },
  { value: "warm", label: "溫暖" },
  { value: "professional", label: "專業" },
  { value: "playful", label: "活潑" },
  { value: "luxury", label: "奢華" },
];

function toggleArr<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

export default function OnboardingPage() {
  const [flow, setFlow] = useState<"form" | "submitting" | "generating" | "done" | "triggering" | "triggered" | "error">("form");
  const [formStep, setFormStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<WebsiteSpec | null>(null);
  const [intakeId, setIntakeId] = useState<string | null>(null);
  const [websiteSpecId, setWebsiteSpecId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<IntakeForm>>({
    industry: "service",
    pages_needed: ["home", "about", "contact"],
    has_ecommerce: false,
    needs_crm: false,
    needs_booking: false,
    budget_tier: "business",
    language: "zh-TW",
    visual_style: ["professional"],
    logo_status: "will_provide",
    existing_content: "partial",
    launch_urgency: "no_rush",
  });

  const set = (k: keyof IntakeForm, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  function validateStep(s: number): string | null {
    if (s === 1 && !form.company_name?.trim()) return "請填寫公司/品牌名稱";
    if (s === 3 && !form.pages_needed?.length) return "請至少選一個頁面";
    return null;
  }

  function nextStep() {
    const err = validateStep(formStep);
    if (err) { setError(err); return; }
    setError(null);
    setFormStep((s) => Math.min(s + 1, 5));
  }

  function prevStep() {
    setError(null);
    setFormStep((s) => Math.max(s - 1, 1));
  }

  async function handleSubmit() {
    const err = validateStep(5);
    if (err) { setError(err); return; }
    if (!form.company_name?.trim() || !form.pages_needed?.length) {
      setError("請確認必填欄位已填寫（公司名稱、頁面）");
      return;
    }
    setError(null);
    setFlow("submitting");

    const submitRes = await fetch("/api/onboarding/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ form }),
    });
    const submitData = await submitRes.json();
    if (!submitData.ok) {
      setError(`Submit failed: ${submitData.error}`);
      setFlow("error");
      return;
    }
    setIntakeId(submitData.intake_form_id);
    setFlow("generating");

    const genRes = await fetch("/api/onboarding/generate-spec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intake_form_id: submitData.intake_form_id }),
    });
    const genData = await genRes.json();
    if (!genData.ok) {
      setError(`Spec generation failed: ${genData.error}`);
      setFlow("error");
      return;
    }
    setSpec(genData.spec);
    setWebsiteSpecId(genData.website_spec_id ?? null);
    setFlow("done");
  }

  async function handleTriggerBuild() {
    // Guard with a visible message (was a silent return → looked like nothing happened).
    if (!websiteSpecId || !intakeId) {
      setError("無法觸發建站：規格 ID 遺失，請重新產生規格。");
      return;
    }
    setError(null);
    setFlow("triggering");
    try {
      const res = await fetch("/api/onboarding/trigger-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website_spec_id: websiteSpecId, intake_form_id: intakeId }),
      });
      // Read as text first so a non-JSON error page (500/HTML) doesn't throw and crash the handler.
      const text = await res.text();
      let data: { ok?: boolean; error?: string; details?: string; run_id?: string };
      try {
        data = JSON.parse(text);
      } catch {
        setError(`觸發建站失敗：伺服器回應非預期（HTTP ${res.status}）${text ? ` — ${text.slice(0, 160)}` : ""}`);
        setFlow("done");
        return;
      }
      if (!res.ok || !data.ok) {
        setError(`觸發建站失敗：${data.error ?? `HTTP ${res.status}`}${data.details ? ` — ${data.details}` : ""}`);
        setFlow("done");
        return;
      }
      setRunId(data.run_id ?? null);
      setFlow("triggered");
    } catch (e) {
      // Network/abort error — keep the operator on the spec view with a clear message,
      // never let the handler throw (an unhandled rejection here looked like a reset).
      setError(`觸發建站失敗：${e instanceof Error ? e.message : String(e)}`);
      setFlow("done");
    }
  }

  // ── Spec result view ──────────────────────────────────────────
  if ((flow === "done" || flow === "triggering" || flow === "triggered") && spec) {
    return (
      <div className="intake-page-wrap">
        <div className="intake-card">
          <div className="intake-result-header">
            <span className="intake-result-icon">✓</span>
            <div>
              <h1 className="intake-result-title">規格生成完成</h1>
              <p className="intake-result-sub">Intake Form ID: <code>{intakeId}</code></p>
            </div>
          </div>

          <div className="intake-spec-block">
            <h2 style={{ fontWeight: 700, marginBottom: "0.25rem", fontSize: "1.1rem" }}>{spec.site_name}</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "0.5rem" }}>{spec.tagline}</p>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              <strong>Package:</strong> {spec.package_slug} &nbsp;|&nbsp; <strong>Packs:</strong> {spec.packs.join(", ")}
            </p>
          </div>

          <div className="intake-spec-block">
            <h3 className="intake-spec-block-title">設計方向</h3>
            <p>{spec.design.style_direction}</p>
            <p style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong>主色：</strong>
              <span style={{ background: spec.design.primary_color, padding: "2px 10px", borderRadius: 4, color: "#fff", fontSize: "0.85rem" }}>{spec.design.primary_color}</span>
              {spec.design.secondary_color && (
                <>
                  <strong style={{ marginLeft: 6 }}>輔色：</strong>
                  <span style={{ background: spec.design.secondary_color, padding: "2px 10px", borderRadius: 4, color: "#fff", fontSize: "0.85rem" }}>{spec.design.secondary_color}</span>
                </>
              )}
            </p>
            <p><strong>字體：</strong>{spec.design.font_suggestion}</p>
          </div>

          <div className="intake-spec-block">
            <h3 className="intake-spec-block-title">網站地圖（{spec.sitemap.length} 頁）</h3>
            <ul style={{ paddingLeft: "1.5rem", columns: 2 }}>
              {spec.sitemap.map((p) => (
                <li key={p.slug}>{p.title} <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>/{p.slug}</span></li>
              ))}
            </ul>
          </div>

          <div className="intake-spec-block">
            <h3 className="intake-spec-block-title">首頁 Hero</h3>
            <p><strong>標題：</strong>{spec.homepage.hero.headline}</p>
            <p><strong>副標：</strong>{spec.homepage.hero.subheadline}</p>
            <p><strong>CTA：</strong>{spec.homepage.hero.cta_text}</p>
          </div>

          <details style={{ marginTop: "0.75rem" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, padding: "0.5rem 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>完整 JSON 規格</summary>
            <pre style={{ background: "var(--code-bg)", color: "var(--pre-text)", padding: "1rem", borderRadius: 8, overflow: "auto", fontSize: "0.75rem", marginTop: "0.5rem" }}>
              {JSON.stringify(spec, null, 2)}
            </pre>
          </details>

          {flow === "triggered" && runId ? (
            <div className="intake-success-banner">
              <strong>已排入建站佇列</strong>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>Run ID：<code>{runId}</code></p>
              <a href="/build" className="intake-success-link">前往 /build 查看進度 →</a>
            </div>
          ) : (
            <div className="intake-result-actions">
              {error && <p className="intake-error-inline">{error}</p>}
              <button onClick={handleTriggerBuild} disabled={flow === "triggering"} className="btn-primary intake-btn-full">
                {flow === "triggering" ? "排入中..." : "觸發建站 →"}
              </button>
              <button
                onClick={() => { setFlow("form"); setFormStep(1); setSpec(null); setIntakeId(null); setWebsiteSpecId(null); setRunId(null); setError(null); }}
                className="btn-secondary">
                建立另一個
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Processing state ──────────────────────────────────────────
  if (flow === "submitting" || flow === "generating") {
    return (
      <div className="intake-page-wrap">
        <div className="intake-card intake-processing">
          <div className="intake-processing-icon">{flow === "submitting" ? "⏳" : "🤖"}</div>
          <h2 className="intake-processing-title">
            {flow === "submitting" ? "儲存表單中..." : "Claude 正在生成規格"}
          </h2>
          {flow === "generating" && (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              分析需求、設計網站藍圖，約 30 秒...
            </p>
          )}
          <div className="intake-processing-bar">
            <div className="intake-processing-bar-fill" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────
  if (flow === "error") {
    return (
      <div className="intake-page-wrap">
        <div className="intake-card">
          <div className="intake-error-block">
            <strong>發生錯誤</strong>
            <p style={{ marginTop: "0.5rem" }}>{error}</p>
          </div>
          <button onClick={() => { setFlow("form"); setError(null); }} className="btn-primary" style={{ marginTop: "1rem" }}>
            重試
          </button>
        </div>
      </div>
    );
  }

  // ── Multi-step form ───────────────────────────────────────────
  return (
    <div className="intake-page-wrap">
      {/* Page title outside the card */}
      <div className="intake-page-head">
        <h1 className="intake-page-title">新客戶建站</h1>
        <p className="intake-page-sub">填完表單後 Claude 自動生成完整網站規格</p>
      </div>

      <div className="intake-card">
        {/* ── Step indicator ── */}
        <div className="intake-stepper">
          {STEPS.map((s, i) => {
            const isDone = formStep > s.num;
            const isActive = formStep === s.num;
            return (
              <div key={s.num} className="intake-stepper-item">
                {/* connecting line before this step (not on first) */}
                {i > 0 && (
                  <div className={`intake-stepper-line${isDone || isActive ? " intake-stepper-line--filled" : ""}`} />
                )}
                <div className={`intake-stepper-circle${isActive ? " active" : ""}${isDone ? " done" : ""}`}>
                  {isDone ? "✓" : s.num}
                </div>
                <span className={`intake-stepper-label${isActive ? " active" : ""}${isDone ? " done" : ""}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* step meta */}
        <p className="intake-step-meta">步驟 {formStep} / 5 &nbsp;·&nbsp; 預估 {STEPS[formStep - 1].duration}</p>

        {/* step heading */}
        <h2 className="intake-step-title">{STEPS[formStep - 1].label}</h2>

        {/* error */}
        {error && <p className="intake-error-inline">{error}</p>}

        {/* ── Step 1: 公司 & 品牌 ── */}
        {formStep === 1 && (
          <div className="intake-fields">
            <div className="form-row">
              <label className="form-label">公司 / 品牌名稱 <span className="intake-required">*</span></label>
              <input required value={form.company_name ?? ""} onChange={e => set("company_name", e.target.value)}
                placeholder="例：AwareWave" className="form-input" autoFocus />
            </div>
            <div className="form-row">
              <label className="form-label">品牌標語（選填）</label>
              <input value={form.brand_tagline ?? ""} onChange={e => set("brand_tagline", e.target.value)}
                placeholder="一句話定位，例：讓 AI 幫你省時間" className="form-input" />
            </div>
            <div className="form-row">
              <label className="form-label">產業類別 <span className="intake-required">*</span></label>
              <select value={form.industry} onChange={e => set("industry", e.target.value)} className="form-select">
                <option value="service">服務業</option>
                <option value="ecommerce">電商</option>
                <option value="tourism">觀光旅遊</option>
                <option value="arts">藝術創作</option>
                <option value="education">教育</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div className="form-row">
              <label className="form-label">品牌主色（選填）</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="color" value={form.primary_color?.startsWith("#") ? form.primary_color : "#1a73e8"}
                  onChange={e => set("primary_color", e.target.value)}
                  style={{ width: 44, height: 38, padding: 2, borderRadius: 6, border: "1px solid var(--card-border)", cursor: "pointer", flexShrink: 0 }} />
                <input value={form.primary_color ?? ""} onChange={e => set("primary_color", e.target.value)}
                  placeholder="#1a73e8 或「深藍色」" className="form-input" style={{ flex: 1 }} />
              </div>
            </div>
            <div className="form-row">
              <label className="form-label">品牌輔色（選填）</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="color" value={form.secondary_color?.startsWith("#") ? form.secondary_color : "#e94560"}
                  onChange={e => set("secondary_color", e.target.value)}
                  style={{ width: 44, height: 38, padding: 2, borderRadius: 6, border: "1px solid var(--card-border)", cursor: "pointer", flexShrink: 0 }} />
                <input value={form.secondary_color ?? ""} onChange={e => set("secondary_color", e.target.value)}
                  placeholder="留空 Claude 會自動配和諧輔色" className="form-input" style={{ flex: 1 }} />
              </div>
              <p className="form-hint" style={{ marginTop: 4 }}>品牌通常有主色＋輔色；只有一個色就留空，Claude 會自動搭配。</p>
            </div>
            <div className="form-row">
              <label className="form-label">LOGO 狀態</label>
              <select value={form.logo_status ?? "will_provide"} onChange={e => set("logo_status", e.target.value as IntakeForm["logo_status"])} className="form-select">
                <option value="has_logo">已有 LOGO</option>
                <option value="will_provide">之後提供</option>
                <option value="need_placeholder">需要生成佔位圖</option>
              </select>
            </div>
          </div>
        )}

        {/* ── Step 2: 客群 ── */}
        {formStep === 2 && (
          <div className="intake-fields">
            <div className="form-row">
              <label className="form-label">主要客群（選填）</label>
              <textarea value={form.target_audience ?? ""} onChange={e => set("target_audience", e.target.value)}
                placeholder="描述你的目標客戶，例：25-45 歲台灣女性，對健康生活有興趣" rows={4}
                className="form-textarea" />
              <p className="form-hint" style={{ marginTop: 4 }}>建站目的會從你下一步的「頁面 / 功能需求」自動判斷，不用另外填。</p>
            </div>
          </div>
        )}

        {/* ── Step 3: 功能需求 ── */}
        {formStep === 3 && (
          <div className="intake-fields">
            <div className="form-row">
              <label className="form-label">需要哪些頁面 <span className="intake-required">*</span><span className="intake-hint-inline">（可多選）</span></label>
              <div className="intake-chip-grid">
                {PAGES.map(p => {
                  const active = (form.pages_needed ?? []).includes(p.value as IntakeForm["pages_needed"][0]);
                  return (
                    <label key={p.value} className={`intake-chip${active ? " active" : ""}`}>
                      <input type="checkbox"
                        checked={active}
                        onChange={() => set("pages_needed", toggleArr(form.pages_needed ?? [], p.value as IntakeForm["pages_needed"][0]))}
                        className="intake-chip-input" />
                      {p.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="form-row">
              <label className="form-label">附加功能</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label className={`intake-chip intake-chip--wide${form.has_ecommerce ? " active" : ""}`}>
                  <input type="checkbox" checked={!!form.has_ecommerce} onChange={e => set("has_ecommerce", e.target.checked)} className="intake-chip-input" />
                  <span>
                    <strong>線上販售</strong>
                    <span className="intake-chip-sub">WooCommerce</span>
                  </span>
                </label>
                <label className={`intake-chip intake-chip--wide${form.needs_crm ? " active" : ""}`}>
                  <input type="checkbox" checked={!!form.needs_crm} onChange={e => set("needs_crm", e.target.checked)} className="intake-chip-input" />
                  <span>
                    <strong>CRM / 客戶名單管理</strong>
                    <span className="intake-chip-sub">FluentCRM</span>
                  </span>
                </label>
                <label className={`intake-chip intake-chip--wide${form.needs_booking ? " active" : ""}`}>
                  <input type="checkbox" checked={!!form.needs_booking} onChange={e => set("needs_booking", e.target.checked)} className="intake-chip-input" />
                  <span>
                    <strong>預約系統</strong>
                    <span className="intake-chip-sub">FluentBooking</span>
                  </span>
                </label>
              </div>
            </div>
            {form.has_ecommerce && (
              <div className="form-row">
                <label className="form-label">商品類型<span className="intake-hint-inline">（可多選）</span></label>
                <div className="intake-chip-grid">
                  {PRODUCT_TYPES.map(p => {
                    const active = (form.product_type ?? []).includes(p.value as IntakeForm["product_type"][0]);
                    return (
                      <label key={p.value} className={`intake-chip${active ? " active" : ""}`}>
                        <input type="checkbox"
                          checked={active}
                          onChange={() => set("product_type", toggleArr(form.product_type ?? [], p.value as IntakeForm["product_type"][0]))}
                          className="intake-chip-input" />
                        {p.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: 視覺偏好 + 參考 ── */}
        {formStep === 4 && (
          <div className="intake-fields">
            <div className="form-row">
              <label className="form-label">視覺風格偏好<span className="intake-hint-inline">（可多選）</span></label>
              <div className="intake-chip-grid">
                {VISUAL_STYLES.map(s => {
                  const active = (form.visual_style ?? []).includes(s.value as IntakeForm["visual_style"][0]);
                  return (
                    <button key={s.value} type="button"
                      onClick={() => set("visual_style", toggleArr(form.visual_style ?? [], s.value as IntakeForm["visual_style"][0]))}
                      className={`intake-chip${active ? " active" : ""}`}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="form-row">
              <label className="form-label">參考網站（最多 3 個，選填）</label>
              <input value={(form.reference_sites ?? []).join(", ")}
                onChange={e => set("reference_sites", e.target.value.split(",").map(s => s.trim()).filter(Boolean).slice(0, 3))}
                placeholder="https://example.com, https://another.com" className="form-input" />
              <p className="form-hint">Claude 會參考這些網站的視覺風格</p>
            </div>
            <div className="form-row">
              <label className="form-label">主要語言</label>
              <select value={form.language ?? "zh-TW"} onChange={e => set("language", e.target.value)} className="form-select">
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
                <option value="other">其他</option>
              </select>
            </div>
          </div>
        )}

        {/* ── Step 5: 素材 & 時程 ── */}
        {formStep === 5 && (
          <div className="intake-fields">
            <div className="form-row">
              <label className="form-label">已有文案素材？</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { value: "yes", label: "是，素材齊全" },
                  { value: "partial", label: "部分有，需補充" },
                  { value: "no", label: "無，需 AI 全部生成" },
                ].map(o => (
                  <label key={o.value} className={`intake-chip intake-chip--wide${form.existing_content === o.value ? " active" : ""}`}>
                    <input type="radio" name="existing_content" value={o.value}
                      checked={form.existing_content === o.value}
                      onChange={() => set("existing_content", o.value)}
                      className="intake-chip-input" />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-row">
              <label className="form-label">聯絡 Email（選填）</label>
              <input type="email" value={form.contact_email ?? ""} onChange={e => set("contact_email", e.target.value)}
                placeholder="hello@company.com（用於設定 FluentSMTP）" className="form-input" />
            </div>
            <div className="form-row">
              <label className="form-label">現有網域（選填）</label>
              <input value={form.domain ?? ""} onChange={e => set("domain", e.target.value)}
                placeholder="company.com（無則留空，系統建 staging）" className="form-input" />
            </div>
            <div className="form-row">
              <label className="form-label">預算範圍 <span className="intake-required">*</span></label>
              <select value={form.budget_tier} onChange={e => set("budget_tier", e.target.value as IntakeForm["budget_tier"])} className="form-select">
                <option value="starter">5 萬以下</option>
                <option value="business">5 – 15 萬</option>
                <option value="enterprise">15 萬以上</option>
              </select>
              <p className="form-hint" style={{ marginTop: 4 }}>幫助我們抓建站規模與報價方向；功能由上面的需求決定，不受此影響。</p>
            </div>
            <div className="form-row">
              <label className="form-label">上線時程</label>
              <select value={form.launch_urgency ?? "no_rush"} onChange={e => set("launch_urgency", e.target.value as IntakeForm["launch_urgency"])} className="form-select">
                <option value="within_month">1 個月內</option>
                <option value="one_to_three_months">1-3 個月</option>
                <option value="no_rush">無特定時程</option>
              </select>
            </div>
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="intake-nav">
          <button type="button" onClick={prevStep} disabled={formStep === 1} className="btn-secondary">
            ← 上一步
          </button>
          {formStep < 5 ? (
            <button type="button" onClick={nextStep} className="btn-primary intake-nav-next">
              下一步 →
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} className="btn-primary intake-nav-next">
              生成網站規格 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
