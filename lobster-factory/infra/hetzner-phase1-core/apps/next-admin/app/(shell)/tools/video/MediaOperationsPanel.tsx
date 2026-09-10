"use client";

import { useState } from "react";
import OrganizationPicker from "./OrganizationPicker";

export default function MediaOperationsPanel() {
  const [organizationId, setOrganizationId] = useState("");
  const [billing, setBilling] = useState<Record<string, unknown> | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setError("");
    try {
      const [b, o] = await Promise.all([
        fetch(`/api/video/billing?organizationId=${encodeURIComponent(organizationId)}`),
        fetch(`/api/video/outcomes?organizationId=${encodeURIComponent(organizationId)}`),
      ]);
      const bj = await b.json() as Record<string, unknown>; const oj = await o.json() as Record<string, unknown>;
      if (!b.ok || bj.ok !== true) throw new Error(String(bj.error ?? "billing read failed"));
      if (!o.ok || oj.ok !== true) throw new Error(String(oj.error ?? "outcome read failed"));
      setBilling(bj); setOutcomes(oj);
    } catch (e) { setError(e instanceof Error ? e.message : "載入失敗"); }
    finally { setBusy(false); }
  }
  return <div style={{ padding: "20px 28px", display: "grid", gap: 14 }}>
    <div><b style={{ fontSize: 15 }}>營運與成效</b><p style={{ margin: "4px 0", fontSize: 12, color: "var(--text-secondary)" }}>查詢方案、點數、BYO provider 與平台成效快照。只顯示目前租戶可讀資料。</p></div>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}><div style={{ flex: 1 }}><OrganizationPicker value={organizationId} onChange={setOrganizationId} /></div><button type="button" onClick={() => void load()} disabled={busy || !organizationId.trim()} style={{ padding: "0 14px", height: 34, border: 0, borderRadius: 7, background: "var(--accent)", color: "var(--btn-primary-text)", fontWeight: 700 }}>{busy ? "讀取中…" : "載入"}</button></div>
    {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
    {billing && <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14, fontSize: 12 }}><b>方案與點數</b><div style={{ marginTop: 8 }}>方案：{String((billing.account as Record<string, unknown> | undefined)?.plan ?? "free")}　狀態：{String((billing.account as Record<string, unknown> | undefined)?.status ?? "active")}　餘額：{String(billing.balance ?? 0)}</div><div style={{ marginTop: 6, color: "var(--text-secondary)" }}>Provider：{((billing.providers as unknown[]) ?? []).map((p) => { const x = p as Record<string, unknown>; return `${String(x.provider)} (${String(x.mode)})`; }).join("、") || "尚未設定"}</div></div>}
    {outcomes && <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14, fontSize: 12 }}><b>平台成效快照</b><div style={{ marginTop: 8 }}>事件數：{String(outcomes.count ?? 0)}</div><pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", color: "var(--text-secondary)" }}>{JSON.stringify(outcomes.totals ?? {}, null, 2)}</pre></div>}
  </div>;
}
