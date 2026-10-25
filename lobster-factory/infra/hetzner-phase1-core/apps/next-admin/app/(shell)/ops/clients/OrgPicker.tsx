"use client";

// The one way a page picks a client. Every WordPress buyer is an organization, so a picker never holds the whole
// table: the caller hands over a first page (NAV_FIRST), typing searches every client on the server
// (GET /api/ops/org-search?q=, names only, at most NAV_SEARCH_LIMIT). Visible buttons, no dropdown.
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { roleHeader } from "@/lib/ops-role";
import { NAV_FIRST, NAV_SEARCH_LIMIT, type PickOrg } from "./nav-orgs";

/** brandColors: only clients with a valid brand colour (the banner studio's brand picker). */
export type OrgFilter = "brandColors";

/** Server search for `search` (debounced). found = null while no search runs; failed = the last search did not answer. */
export function useOrgSearch(search: string, filter?: OrgFilter): { found: PickOrg[] | null; failed: boolean } {
  const [found, setFound] = useState<PickOrg[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = search.trim();
    if (!q) { setFound(null); setFailed(false); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (filter) params.set(filter, "1");
        const res = await fetch(`/api/ops/org-search?${params}`, { headers: { ...roleHeader("operator") }, signal: ctrl.signal });
        const json = await res.json();
        if (!res.ok || json.ok !== true) throw new Error(String(json.error ?? res.status));
        setFound(json.orgs as PickOrg[]);
        setFailed(false);
      } catch {
        if (!ctrl.signal.aborted) { setFound([]); setFailed(true); }
      }
    }, 250);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [search, filter]);

  return { found, failed };
}

const chip = (on: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "5px 12px", borderRadius: 999, fontSize: 13, cursor: "pointer",
  border: `1px solid ${on ? "var(--accent)" : "var(--card-border)"}`,
  background: on ? "rgba(88,85,208,0.10)" : "var(--bg-card)",
  color: on ? "var(--accent-text)" : "var(--text-primary)",
  fontWeight: on ? 600 : 400,
});

const note: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", marginTop: 6 };

export interface OrgPickerProps {
  /** The first page (NAV_FIRST rows); a selected client outside it should be put first by the caller. */
  orgs: PickOrg[];
  /** Every client the first page was cut from (the hint says how many the search covers). */
  total: number;
  /** The picked client's `by` key, or null. */
  selected: string | null;
  by?: "id" | "slug";
  onPick(org: PickOrg | null): void;
  /** A first button that picks no client (onPick(null)), e.g. 自用. */
  none?: ReactNode;
  filter?: OrgFilter;
}

export function OrgPicker({ orgs, total, selected, by = "slug", onPick, none, filter }: OrgPickerProps) {
  const [search, setSearch] = useState("");
  const { found, failed } = useOrgSearch(search, filter);
  // a client picked from search results stays on screen once the search box is cleared
  const [picked, setPicked] = useState<PickOrg | null>(null);
  const first = picked && picked[by] === selected && !orgs.some((o) => o[by] === selected) ? [picked, ...orgs] : orgs;
  const shown = found ?? first;

  function pick(org: PickOrg | null) {
    setPicked(org);
    onPick(org);
  }

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜尋客戶名稱或代號..."
        aria-label="搜尋客戶"
        style={{
          width: "100%", maxWidth: 320, padding: "6px 8px", marginBottom: 8,
          border: "1px solid var(--card-border)", borderRadius: 6,
          fontSize: 12, background: "var(--form-input-bg)", color: "var(--text-primary)", outline: "none",
        }}
      />
      <div role="group" aria-label="客戶" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {none !== undefined && found === null && (
          <button type="button" aria-pressed={selected === null} onClick={() => pick(null)} style={chip(selected === null)}>
            {none}
          </button>
        )}
        {shown.map((org) => (
          <button key={org.id} type="button" aria-pressed={org[by] === selected} onClick={() => pick(org)} style={chip(org[by] === selected)}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: org.color, flexShrink: 0 }} />
            {org.name}
          </button>
        ))}
      </div>
      {shown.length === 0 && (
        <div style={note}>{failed ? "搜尋失敗，請再試一次" : search.trim() ? "無符合的客戶" : "尚無客戶"}</div>
      )}
      {found === null && total > orgs.length && (
        <div style={note}>共 {total.toLocaleString("zh-TW")} 個客戶，這裡列最早的 {NAV_FIRST} 個；其他請用上面的搜尋。</div>
      )}
      {found !== null && found.length >= NAV_SEARCH_LIMIT && (
        <div style={note}>只列前 {NAV_SEARCH_LIMIT} 個符合的，請打得更完整。</div>
      )}
    </div>
  );
}

/** OrgPicker that writes the pick into the URL (?<param>=<by key>), keeping the other query params. */
export function OrgUrlPicker({ param, selected, ...rest }: Omit<OrgPickerProps, "onPick" | "selected"> & {
  param: string;
  /** The server-resolved pick; omitted = read ?<param> from the URL. */
  selected?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const by = rest.by ?? "slug";
  return (
    <OrgPicker
      {...rest}
      selected={selected !== undefined ? selected : sp.get(param)}
      onPick={(org) => {
        const params = new URLSearchParams(Array.from(sp.entries()));
        if (org) params.set(param, org[by]);
        else params.delete(param);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      }}
    />
  );
}
