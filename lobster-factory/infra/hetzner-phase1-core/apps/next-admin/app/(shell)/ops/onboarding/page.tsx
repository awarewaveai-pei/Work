"use client";

import { useState } from "react";
import type { IntakeForm, WebsiteSpec } from "@/lib/onboarding/intake-form";
import { IntakeFormSteps } from "@/lib/onboarding/intake-form-steps";

interface IntakeHistoryItem {
  id: string;
  organization_id: string | null;
  status: string;
  submitted_at: string;
  submitted_by: string;
  form_data: Record<string, unknown>;
  website_spec_id?: string | null;
}

function statusBadge(status: string): string {
  if (status === "live") return "badge-green";
  if (status === "building" || status === "spec_generated") return "badge-gray";
  if (status === "cancelled") return "badge-red";
  return "badge-gray";
}

function IntakeHistory() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<IntakeHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [triggered, setTriggered] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  async function load() {
    if (loading) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/onboarding/submit");
      if (r.status === 401 || r.status === 403) { setErr("請重新登入或權限不足"); return; }
      const j = await r.json() as { ok: boolean; intake_forms?: IntakeHistoryItem[]; error?: string };
      if (!j.ok) throw new Error(j.error ?? "載入失敗");
      setItems(j.intake_forms ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleRowTrigger(item: IntakeHistoryItem) {
    if (!item.website_spec_id) {
      setRowErrors((e) => ({ ...e, [item.id]: "無規格 ID，請重新生成規格" }));
      return;
    }
    setTriggering(item.id);
    setRowErrors((e) => { const n = { ...e }; delete n[item.id]; return n; });
    try {
      const res = await fetch("/api/onboarding/trigger-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website_spec_id: item.website_spec_id, intake_form_id: item.id }),
      });
      const text = await res.text();
      let data: { ok?: boolean; error?: string; run_id?: string };
      try { data = JSON.parse(text) as typeof data; } catch { data = {}; }
      if (!res.ok || !data.ok) {
        setRowErrors((e) => ({ ...e, [item.id]: data.error ?? `HTTP ${res.status}` }));
      } else {
        setTriggered((s) => new Set([...s, item.id]));
        setItems((prev) => prev.map((r) => r.id === item.id ? { ...r, status: "building" } : r));
      }
    } catch (e) {
      setRowErrors((prev) => ({ ...prev, [item.id]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setTriggering(null);
    }
  }

  function toggle() {
    if (!open && items.length === 0 && !err) void load();
    setOpen((v) => !v);
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto 12px", padding: "0 16px" }}>
      <button type="button" onClick={toggle} className="btn-secondary" style={{ fontSize: 13 }}>
        {open ? "收起歷史 ↑" : "歷史提交紀錄 ↓"}
      </button>
      {open && (
        <div className="intake-card" style={{ marginTop: 8 }}>
          {loading ? (
            <p className="card-sub">載入中…</p>
          ) : err ? (
            <p className="card-sub" style={{ color: "var(--badge-red-text)" }}>{err}</p>
          ) : items.length === 0 ? (
            <p className="card-sub">尚無提交紀錄。</p>
          ) : (
            <>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>最近 20 筆</p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {(["公司", "產業", "狀態", "提交時間", "提交者", "操作"] as const).map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "4px 8px", color: "var(--text-secondary)", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                    <td style={{ padding: "7px 8px", fontWeight: 600 }}>{String(item.form_data.company_name ?? "—")}</td>
                    <td style={{ padding: "7px 8px", color: "var(--text-secondary)" }}>{String(item.form_data.industry ?? "—")}</td>
                    <td style={{ padding: "7px 8px" }}><span className={`card-badge ${statusBadge(item.status)}`}>{item.status}</span></td>
                    <td style={{ padding: "7px 8px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{item.submitted_at ? new Date(item.submitted_at).toLocaleString("zh-TW") : "—"}</td>
                    <td style={{ padding: "7px 8px", color: "var(--text-secondary)" }}>{item.submitted_by}</td>
                    <td style={{ padding: "7px 8px" }}>
                      {triggered.has(item.id) ? (
                        <span style={{ color: "var(--badge-green-text, green)", fontSize: 12 }}>已排入 ✓</span>
                      ) : item.status === "spec_generated" && item.website_spec_id ? (
                        <>
                          <button
                            onClick={() => void handleRowTrigger(item)}
                            disabled={triggering === item.id}
                            className="btn-primary"
                            style={{ fontSize: 12, padding: "3px 10px" }}
                          >
                            {triggering === item.id ? "排入中…" : "觸發建站"}
                          </button>
                          {rowErrors[item.id] && (
                            <p style={{ color: "var(--badge-red-text, red)", fontSize: 11, margin: "2px 0 0" }}>{rowErrors[item.id]}</p>
                          )}
                        </>
                      ) : rowErrors[item.id] ? (
                        <span style={{ color: "var(--badge-red-text, red)", fontSize: 11 }}>{rowErrors[item.id]}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  const [flow, setFlow] = useState<"form" | "submitting" | "generating" | "done" | "triggering" | "triggered" | "error">("form");
  const [formStep, setFormStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<WebsiteSpec | null>(null);
  const [intakeId, setIntakeId] = useState<string | null>(null);
  const [websiteSpecId, setWebsiteSpecId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [buildStatus, setBuildStatus] = useState<string | null>(null);

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

  const handleChange = (k: keyof IntakeForm, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

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

    try {
      const submitRes = await fetch("/api/onboarding/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form }),
      });
      const submitText = await submitRes.text();
      let submitData: { ok?: boolean; error?: string; intake_form_id?: string };
      try {
        submitData = JSON.parse(submitText);
      } catch {
        setError(`Submit failed: 伺服器回應非預期（HTTP ${submitRes.status}）${submitText ? ` — ${submitText.slice(0, 160)}` : ""}`);
        setFlow("error");
        return;
      }
      if (!submitRes.ok || !submitData.ok || !submitData.intake_form_id) {
        setError(`Submit failed: ${submitData.error ?? `HTTP ${submitRes.status}`}`);
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
      const genText = await genRes.text();
      let genData: { ok?: boolean; error?: string; spec?: WebsiteSpec; website_spec_id?: string };
      try {
        genData = JSON.parse(genText);
      } catch {
        setError(`Spec generation failed: 伺服器回應非預期（HTTP ${genRes.status}）${genText ? ` — ${genText.slice(0, 160)}` : ""}`);
        setFlow("error");
        return;
      }
      if (!genRes.ok || !genData.ok || !genData.spec) {
        setError(`Spec generation failed: ${genData.error ?? `HTTP ${genRes.status}`}`);
        setFlow("error");
        return;
      }
      setSpec(genData.spec);
      setWebsiteSpecId(genData.website_spec_id ?? null);
      setFlow("done");
    } catch (e) {
      setError(`提交失敗：${e instanceof Error ? e.message : String(e)}`);
      setFlow("error");
    }
  }

  async function handleTriggerBuild() {
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
      const text = await res.text();
      let data: { ok?: boolean; error?: string; details?: string; run_id?: string; build_status?: string };
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
      setBuildStatus(data.build_status ?? null);
      setFlow("triggered");
    } catch (e) {
      setError(`觸發建站失敗：${e instanceof Error ? e.message : String(e)}`);
      setFlow("done");
    }
  }

  // ── Spec result view ──────────────────────────────────────────
  if ((flow === "done" || flow === "triggering" || flow === "triggered") && spec) {
    return (
      <div>
      <IntakeHistory />
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
              <strong>{buildStatus === "completed" ? "建站已完成" : buildStatus === "failed" ? "建站執行失敗" : "建站 Run 已建立"}</strong>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>Run ID：<code>{runId}</code></p>
              {buildStatus ? <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>Build status：<code>{buildStatus}</code></p> : null}
              <a href={`/build?runId=${encodeURIComponent(runId)}`} className="intake-success-link">前往 /build 查看進度 →</a>
            </div>
          ) : (
            <div className="intake-result-actions">
              {error && <p className="intake-error-inline">{error}</p>}
              <button onClick={handleTriggerBuild} disabled={flow === "triggering"} className="btn-primary intake-btn-full">
                {flow === "triggering" ? "排入中..." : "觸發建站 →"}
              </button>
              <button
                onClick={() => { setFlow("form"); setFormStep(1); setSpec(null); setIntakeId(null); setWebsiteSpecId(null); setRunId(null); setBuildStatus(null); setError(null); }}
                className="btn-secondary">
                建立另一個
              </button>
            </div>
          )}
        </div>
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
    <div>
    <IntakeHistory />
    <div className="intake-page-wrap">
      <div className="intake-page-head">
        <h1 className="intake-page-title">新客戶建站</h1>
        <p className="intake-page-sub">填完表單後 Claude 自動生成完整網站規格</p>
      </div>

      <div className="intake-card">
        <IntakeFormSteps
          form={form}
          formStep={formStep}
          error={error}
          onChange={handleChange}
          onNext={nextStep}
          onPrev={prevStep}
          onSubmit={handleSubmit}
          submitLabel="生成網站規格 →"
        />
      </div>
    </div>
    </div>
  );
}
