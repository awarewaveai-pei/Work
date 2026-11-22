"use client";

// 客戶欄（ADR 020；藍圖 §9.3、§16）：外框左欄旁第二欄。本頁沒登記層 → 不渲染。
// 員工：上方一排類別按鈕（單選，線框圖第 15 頁 A；類別與標籤由 /api/ops/org-search?category= 在伺服器算，詞表也由它回傳）
// ＋OrgPicker（搜尋＋一列一個＋色點），app 主機與產品門同一支；「AwareWave 自己」＝內部組織一列（id 優先取回應的
// internalOrgId，門上沒有 prop 也畫得出）。TEST 單位只在「測試」類別出現。
// 客戶帳號：沒有客戶清單；本頁登記 site 層時只顯示自己的網站按鈕。只用 theme token，零色碼。
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { OrgPicker } from "@/app/(shell)/ops/clients/OrgPicker";
import { NAV_FIRST, type PickOrg } from "@/app/(shell)/ops/clients/nav-orgs";
import type { OrgCategory, OrgTag, TaggedOrg } from "@/app/api/ops/org-search/route";
import { roleHeader } from "@/lib/ops-role";
import { STAFF_HOST_KEY, useClientContextState, type ClientContextValue } from "@/lib/client-context/use-client-context";

export const ORG_SEARCH_PATH = "/api/ops/org-search";
const SELF_NAME = "AwareWave 自己";
const SELF_DOT = "var(--accent)";   // the row's dot (a background in OrgPicker), not text

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

function categoryStyle(on: boolean): CSSProperties {
  return {
    font: "inherit", fontSize: 11, padding: "3px 8px", borderRadius: 999, cursor: "pointer",
    border: "1px solid var(--card-border)",
    background: on ? "var(--accent-light)" : "transparent",
    color: on ? "var(--accent-text)" : "var(--text-secondary)",
    fontWeight: on ? 600 : 400,
  };
}

interface RailPage {
  /** the category this page answers; another one = still loading the button just pressed */
  category: OrgCategory | null;
  first: TaggedOrg[];
  tagsFailed: boolean;
  total: number;
  failed: boolean;
  categories: Array<{ key: OrgCategory; label: string }>;
  internalOrgId: string | null;
}

/** 員工的客戶第一頁（這個類別；+ 網址指定的那一個），交給 OrgPicker 畫。 */
function useFirstPage(enabled: boolean, category: OrgCategory, include: string | null): RailPage {
  const [state, setState] = useState<RailPage>({ category: null, first: [], total: 0, failed: false, tagsFailed: false, categories: [], internalOrgId: null });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    // never the previous category's rows under the new button, nor after its request fails
    setState((s) => (s.category === category ? s : { ...s, category: null, first: [], total: 0, failed: false }));
    const qs = new URLSearchParams({ category });
    if (include) qs.set("include", include);
    fetch(`${ORG_SEARCH_PATH}?${qs}`, { headers: { ...roleHeader("operator") } })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || json.ok !== true) throw new Error(String(json.error ?? res.status));
        if (live) setState({
          category, first: json.orgs as TaggedOrg[], total: Number(json.total ?? 0), failed: false, tagsFailed: json.tagsFailed === true,
          categories: Array.isArray(json.categories) ? json.categories : [],
          internalOrgId: typeof json.internalOrgId === "string" ? json.internalOrgId : null,
        });
      })
      .catch(() => { if (live) setState((s) => ({ ...s, failed: true })); });
    return () => { live = false; };
  }, [enabled, category, include]);
  return state;
}

export function ClientRail() {
  const ctx = useClientContextState();
  const staff = ctx?.viewer === "staff";
  const shown = Boolean(ctx?.layer) && (staff || ctx?.layer === "site");
  const [category, setCategory] = useState<OrgCategory>("all");
  const page = useFirstPage(Boolean(shown && staff), category, ctx?.org ?? null);
  if (!ctx || !shown) return null;

  const { org, site, sites, status, layer } = ctx;
  // the answer's id first: a door's frame has no internal org to hand over (it never reads with the service role)
  const internalOrgId = page.internalOrgId ?? ctx.internalOrgId;
  // under 全部, or wherever it is the picked client (it must not vanish from the list)
  const self: PickOrg | null = internalOrgId && (category === "all" || org === internalOrgId)
    ? { id: internalOrgId, slug: "", name: SELF_NAME, color: SELF_DOT, brandColors: [] }
    : null;
  const others = page.first.filter((o) => o.id !== internalOrgId);
  const rows: PickOrg[] = self ? [self, ...others] : others;
  const current = page.first.find((o) => o.id === org && o.id !== internalOrgId) ?? null;
  const label = new Map<OrgTag | OrgCategory, string>(page.categories.map((c) => [c.key, c.label]));
  const tagsById = new Map(page.first.map((o) => [o.id, o.tags ?? []]));
  const badge = (o: PickOrg) => {
    const names = (tagsById.get(o.id) ?? []).flatMap((t) => label.get(t) ?? []);
    return names.length ? <span style={{ color: "var(--text-muted)" }}>{names.join("・")}</span> : null;
  };
  const hint = category === "all" ? undefined
    : <>共 {page.total.toLocaleString("zh-TW")} 個，這裡列前 {NAV_FIRST} 個；其他請用上面的搜尋。</>;

  return (
    <aside
      aria-label="客戶欄"
      style={{
        // a long page scrolls the window: the rail stays in view and scrolls its own list (both frames' rows are flex)
        position: "sticky", top: 0, alignSelf: "flex-start", height: "100vh", overflowY: "auto",
        width: 220, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0,
        borderRight: "1px solid var(--card-border)", background: "var(--bg-card)",
      }}
    >
      {staff && (
        <>
          {current && (!ctx.onDoor || ctx.hosts[STAFF_HOST_KEY]) && (
            <div style={{ padding: "8px 8px 0", fontSize: 12 }}>
              {/* /ops/clients is a staff-console page (404 on a door): from a door it opens on the staff host */}
              {ctx.onDoor
                ? <a href={`${ctx.hosts[STAFF_HOST_KEY]}/ops/clients/${encodeURIComponent(current.slug)}`}>客戶頁 →</a>
                : <Link href={`/ops/clients/${encodeURIComponent(current.slug)}`}>客戶頁 →</Link>}
            </div>
          )}
          {!org && <div role="status" style={{ ...note, color: "var(--text-primary)" }}>請先選客戶</div>}
          {page.categories.length > 0 && (
            <div role="group" aria-label="類別" style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "8px 8px 0" }}>
              {page.categories.map((c) => (
                <button key={c.key} type="button" aria-pressed={c.key === category} onClick={() => setCategory(c.key)} style={categoryStyle(c.key === category)}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {page.failed && <div style={note}>客戶清單載入失敗，請重新整理。</div>}
          {!page.failed && page.category !== category && <div style={note}>載入中…</div>}
          {page.tagsFailed && <div style={note}>類別標籤暫時讀不到，清單照常可選。</div>}
          <OrgPicker
            orgs={rows}
            total={page.total + (self ? 1 : 0)}
            selected={org}
            by="id"
            onPick={(o) => ctx.setOrg(o ? o.id : null)}
            searchPath={ORG_SEARCH_PATH}
            badge={badge}
            hint={hint}
            fill
          />
        </>
      )}
      {STATUS_TEXT[status] && <div role="alert" style={note}>{STATUS_TEXT[status]}</div>}
      {/* outside the org-gated group: a URL with only a site (no org yet) can fail its lookup too */}
      {layer === "site" && ctx.sitesFailed && <div role="alert" style={note}>網站載入失敗，請重新整理。</div>}
      {layer === "site" && org && (
        <div role="group" aria-label="網站" style={{ padding: 6, borderTop: staff ? "1px solid var(--card-border)" : undefined }}>
          {!ctx.sitesFailed && sites === null && <div style={note}>載入網站中…</div>}
          {!ctx.sitesFailed && sites !== null && sites.length === 0 && <div style={note}>這個客戶還沒有網站。</div>}
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
