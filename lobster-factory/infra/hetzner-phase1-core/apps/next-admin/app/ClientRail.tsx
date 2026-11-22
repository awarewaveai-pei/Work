"use client";

// 客戶欄（ADR 020；藍圖 §9.3、§16）：外框左欄旁第二欄。本頁沒登記層 → 不渲染。
// 員工：OrgPicker（搜尋＋一列一個＋色點），app 主機與產品門同一支 /api/ops/org-search；「AwareWave 自己」＝內部組織一列。
// 客戶帳號：沒有客戶清單；本頁登記 site 層時只顯示自己的網站按鈕。類別按鈕列是 U3 的事。只用 theme token，零色碼。
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { OrgPicker } from "@/app/(shell)/ops/clients/OrgPicker";
import type { PickOrg } from "@/app/(shell)/ops/clients/nav-orgs";
import { roleHeader } from "@/lib/ops-role";
import { useClientContextState, type ClientContextValue } from "@/lib/client-context/use-client-context";

export const ORG_SEARCH_PATH = "/api/ops/org-search";
const SELF_NAME = "AwareWave 自己";

const STATUS_TEXT: Partial<Record<ClientContextValue["status"], string>> = {
  rejected: "此網址與登入的客戶不一致，無法顯示。",
  site_mismatch: "這個網站不屬於目前的客戶，請重選網站。",
  not_found: "找不到網址指定的網站。",
  forbidden: "沒有權限使用網址指定的網站。",
};

const note: CSSProperties = { fontSize: 11, color: "var(--text-muted)", padding: "6px 8px" };

function siteStyle(on: boolean): CSSProperties {
  return {
    font: "inherit",
    display: "block", width: "100%", textAlign: "left",
    padding: "7px 8px", marginBottom: 1, borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 12,
    background: on ? "var(--accent-light)" : "transparent",
    color: on ? "var(--accent-text)" : "var(--text-primary)",
    fontWeight: on ? 600 : 400,
  };
}

/** 員工的客戶第一頁（+ 網址指定的那一個），交給 OrgPicker 畫。 */
function useFirstPage(enabled: boolean, include: string | null): { first: PickOrg[]; total: number; failed: boolean } {
  const [state, setState] = useState<{ first: PickOrg[]; total: number; failed: boolean }>({ first: [], total: 0, failed: false });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const qs = include ? `?${new URLSearchParams({ include })}` : "";
    fetch(`${ORG_SEARCH_PATH}${qs}`, { headers: { ...roleHeader("operator") } })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || json.ok !== true) throw new Error(String(json.error ?? res.status));
        if (live) setState({ first: json.orgs as PickOrg[], total: Number(json.total ?? 0), failed: false });
      })
      .catch(() => { if (live) setState((s) => ({ ...s, failed: true })); });
    return () => { live = false; };
  }, [enabled, include]);
  return state;
}

export function ClientRail() {
  const ctx = useClientContextState();
  const staff = ctx?.viewer === "staff";
  const shown = Boolean(ctx?.layer) && (staff || ctx?.layer === "site");
  const page = useFirstPage(Boolean(shown && staff), ctx?.org ?? null);
  if (!ctx || !shown) return null;

  const { org, site, sites, status, layer, internalOrgId } = ctx;
  const self: PickOrg | null = internalOrgId
    ? { id: internalOrgId, slug: "", name: SELF_NAME, color: "var(--accent)", brandColors: [] }
    : null;
  const others = page.first.filter((o) => o.id !== internalOrgId);
  const rows: PickOrg[] = self ? [self, ...others] : others;
  const current = page.first.find((o) => o.id === org && o.id !== internalOrgId) ?? null;

  return (
    <aside
      aria-label="客戶欄"
      style={{
        width: 220, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0,
        borderRight: "1px solid var(--card-border)", background: "var(--bg-card)",
      }}
    >
      {staff && (
        <>
          {current && !ctx.onDoor && (
            <div style={{ padding: "8px 8px 0", fontSize: 12 }}>
              <Link href={`/ops/clients/${encodeURIComponent(current.slug)}`}>客戶頁 →</Link>
            </div>
          )}
          {!org && <div role="status" style={{ ...note, color: "var(--text-primary)" }}>請先選客戶</div>}
          {page.failed && <div style={note}>客戶清單載入失敗，請重新整理。</div>}
          <OrgPicker
            orgs={rows}
            total={page.total + (self ? 1 : 0)}
            selected={org}
            by="id"
            onPick={(o) => ctx.setOrg(o ? o.id : null)}
            searchPath={ORG_SEARCH_PATH}
            fill
          />
        </>
      )}
      {STATUS_TEXT[status] && <div role="alert" style={note}>{STATUS_TEXT[status]}</div>}
      {layer === "site" && org && (
        <div role="group" aria-label="網站" style={{ padding: 6, borderTop: staff ? "1px solid var(--card-border)" : undefined }}>
          {sites === null && <div style={note}>載入網站中…</div>}
          {sites !== null && sites.length === 0 && <div style={note}>這個客戶還沒有網站。</div>}
          {sites !== null && sites.length > 0 && !site && <div style={note}>請選網站</div>}
          {(sites ?? []).map((s) => (
            <button key={s.id} type="button" aria-pressed={s.id === site} onClick={() => ctx.setSite(s.id)} style={siteStyle(s.id === site)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
