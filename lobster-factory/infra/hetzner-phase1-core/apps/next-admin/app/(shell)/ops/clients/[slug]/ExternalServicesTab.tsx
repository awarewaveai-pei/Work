"use client";

// 外部服務 tab: the per-client service provisioning that was step 4 of the retired /onboard wizard (card SF-P). It shows
// what each service already has for this client (tenant_integration_bindings, written by the Trigger task
// orchestrate-tenant-provisioning) and sends the ticked ones to POST /api/build/provision-services for this
// organization. Nothing here writes a binding itself: the task does, and the next page load shows it.
import { useState } from "react";
import { roleHeader } from "@/lib/ops-role";
import { Card } from "./hub-ui";

export interface ServiceBinding { provider: string; status: string; last_tested_at: string | null; last_error: string | null }

// Netdata is infra-level (monitors the host, not a client), so it is not provisioned per client.
export const PROVISIONABLE_SERVICES = [
  { id: "sentry", label: "Sentry", desc: "錯誤追蹤：建立 project 與 DSN", hints: [{ key: "sentryProjectSlug", label: "Project slug" }, { key: "sentryProjectName", label: "Project 名稱" }] },
  { id: "posthog", label: "PostHog", desc: "產品分析：建立 project 與 API key", hints: [{ key: "posthogProjectName", label: "Project 名稱" }] },
  { id: "uptime_kuma", label: "Uptime Kuma", desc: "網站監控：建立 HTTP 監控", hints: [{ key: "uptimeMonitorUrl", label: "監控網址" }, { key: "uptimeMonitorName", label: "監控名稱" }] },
  { id: "n8n", label: "n8n", desc: "自動化：複製 onboarding 工作流程", hints: [{ key: "n8nWorkflowSuffix", label: "工作流程後綴" }] },
  { id: "github", label: "GitHub", desc: "程式碼：建立客戶 repo", hints: [{ key: "githubRepoName", label: "Repo 名稱" }] },
  { id: "trigger", label: "Trigger.dev", desc: "背景任務：建立 project 與部署 token", hints: [] },
  { id: "supabase", label: "Supabase", desc: "資料庫：建立 project 與 schema", hints: [] },
] as const;

const STATUS_TEXT: Record<string, string> = { active: "已開通", failed: "失敗", pending: "處理中" };

export function ExternalServicesTab({ org, siteUrl, bindings }: {
  org: { id: string; slug: string; name: string };
  siteUrl?: string;
  bindings: readonly ServiceBinding[];
}) {
  const byProvider = new Map(bindings.map((b) => [b.provider, b]));
  const [picked, setPicked] = useState<string[]>([]);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  // What an empty hint sends (shown grey in the field). No site URL = no monitor-URL default: the task's own default
  // (TENANT_PROVISION_UPTIME_DEFAULT_URL) would watch another site, so the field must be filled.
  const defaults: Record<string, string> = {
    sentryProjectSlug: org.slug, sentryProjectName: org.name, posthogProjectName: org.name, githubRepoName: org.slug,
    uptimeMonitorName: org.name, n8nWorkflowSuffix: org.slug, ...(siteUrl ? { uptimeMonitorUrl: siteUrl } : {}),
  };
  const sentHints = () => Object.fromEntries(
    PROVISIONABLE_SERVICES.filter((s) => picked.includes(s.id)).flatMap((s) => s.hints.map((h) => h.key))
      .map((k) => [k, hints[k]?.trim() || defaults[k] || ""] as const).filter(([, v]) => v !== ""),
  );
  const missingUptimeUrl = picked.includes("uptime_kuma") && !(hints.uptimeMonitorUrl?.trim() || defaults.uptimeMonitorUrl);
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id]));
  const canSubmit = picked.length > 0 && email.includes("@") && !missingUptimeUrl && !busy;

  async function submit() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/build/provision-services", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body: JSON.stringify({
          organizationId: org.id,
          customerEmail: email.trim(),
          providers: picked,
          hints: sentHints(),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; runId?: string | null; providers?: string[]; error?: string; detail?: string };
      setResult(j.ok
        ? { ok: true, text: `已送出開通：${(j.providers ?? picked).join(", ")}（run ${j.runId ?? "未知"}）。完成後重新整理本頁看狀態。` }
        : { ok: false, text: `送出失敗：${j.error ?? `HTTP ${res.status}`}${j.detail ? ` — ${j.detail}` : ""}` });
    } catch (e) {
      setResult({ ok: false, text: `送出失敗：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="外部服務開通" badge={`${PROVISIONABLE_SERVICES.filter((s) => byProvider.get(s.id)?.status === "active").length}/${PROVISIONABLE_SERVICES.length} 已開通`}>
      <p className="form-hint" style={{ marginBottom: 12 }}>
        勾選要替這個客戶開通的服務，按「開通」。系統用伺服器上的主金鑰替客戶建立各自的 project、監控或 DSN，結果寫回下面的狀態。提示欄留空就送出灰字的預設值。
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        {PROVISIONABLE_SERVICES.map((s) => {
          const on = picked.includes(s.id);
          const b = byProvider.get(s.id);
          return (
            <div key={s.id} data-service={s.id} style={{ border: `1px solid ${on ? "var(--accent)" : "var(--card-border)"}`, borderRadius: 8, padding: "10px 12px", background: "var(--bg-canvas)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={on} onChange={() => toggle(s.id)} />
                <strong style={{ fontSize: 13 }}>{s.label}</strong>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.desc}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: b?.status === "active" ? "var(--green)" : b?.status === "failed" ? "var(--red)" : "var(--text-muted)" }}>
                  {b ? STATUS_TEXT[b.status] ?? b.status : "未開通"}
                </span>
              </label>
              {b?.last_error && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>上次錯誤：{b.last_error}</div>}
              {on && s.hints.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 8 }}>
                  {s.hints.map((h) => (
                    <label key={h.key} style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {h.label}
                      <input className="form-input" value={hints[h.key] ?? ""} onChange={(e) => setHints((cur) => ({ ...cur, [h.key]: e.target.value }))} placeholder={defaults[h.key] ? `預設：${defaults[h.key]}` : "必填"} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
        客戶聯絡 email（各服務邀請用）
        <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
      </label>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn-primary" disabled={!canSubmit} onClick={() => void submit()}>
          {busy ? "送出中…" : `開通選取的 ${picked.length} 個服務`}
        </button>
        {result && <span role="status" style={{ fontSize: 12, color: result.ok ? "var(--green)" : "var(--red)" }}>{result.text}</span>}
      </div>
    </Card>
  );
}
