"use client";

import type { IntakeForm } from "./intake-form";

export const STEPS = [
  { num: 1, label: "公司品牌", duration: "2 min" },
  { num: 2, label: "客群", duration: "1 min" },
  { num: 3, label: "功能需求", duration: "2 min" },
  { num: 4, label: "視覺參考", duration: "2 min" },
  { num: 5, label: "素材時程", duration: "1 min" },
];

export const PAGES_OPTIONS = [
  { value: "home", label: "首頁" },
  { value: "about", label: "關於" },
  { value: "products", label: "產品/服務" },
  { value: "blog", label: "部落格" },
  { value: "contact", label: "聯絡" },
  { value: "cart", label: "購物車" },
  { value: "booking", label: "預約" },
];

export const PRODUCT_TYPES = [
  { value: "physical", label: "實體商品" },
  { value: "digital", label: "數位商品" },
  { value: "pod", label: "客製商品 (POD)" },
];

export const VISUAL_STYLES = [
  { value: "minimal", label: "極簡" },
  { value: "warm", label: "溫暖" },
  { value: "professional", label: "專業" },
  { value: "playful", label: "活潑" },
  { value: "luxury", label: "奢華" },
];

export function toggleArr<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

interface IntakeFormStepsProps {
  form: Partial<IntakeForm>;
  formStep: number;
  error: string | null;
  onChange: (key: keyof IntakeForm, value: unknown) => void;
  onNext: () => void;
  onPrev: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  disabled?: boolean;
}

export function IntakeFormSteps({
  form,
  formStep,
  error,
  onChange,
  onNext,
  onPrev,
  onSubmit,
  submitLabel = "生成網站規格 →",
  disabled = false,
}: IntakeFormStepsProps) {
  const set = (k: keyof IntakeForm, v: unknown) => onChange(k, v);

  return (
    <>
      {/* ── Step indicator ── */}
      <div className="intake-stepper">
        {STEPS.map((s, i) => {
          const isDone = formStep > s.num;
          const isActive = formStep === s.num;
          return (
            <div key={s.num} className="intake-stepper-item">
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

      <p className="intake-step-meta">步驟 {formStep} / 5 &nbsp;·&nbsp; 預估 {STEPS[formStep - 1].duration}</p>
      <h2 className="intake-step-title">{STEPS[formStep - 1].label}</h2>

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
              {PAGES_OPTIONS.map(p => {
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
        <button type="button" onClick={onPrev} disabled={formStep === 1} className="btn-secondary">
          ← 上一步
        </button>
        {formStep < 5 ? (
          <button type="button" onClick={onNext} className="btn-primary intake-nav-next">
            下一步 →
          </button>
        ) : (
          <button type="button" onClick={onSubmit} disabled={disabled} className="btn-primary intake-nav-next">
            {submitLabel}
          </button>
        )}
      </div>
    </>
  );
}
