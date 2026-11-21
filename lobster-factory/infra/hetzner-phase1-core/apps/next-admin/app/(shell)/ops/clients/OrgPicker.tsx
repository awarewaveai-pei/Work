"use client";

// The one way a page picks a client (R10 rule, operator 2026-11-21: hundreds of clients ahead, every page that picks a
// client uses this block). Look: a search box over one row per client with its colour dot (the /ops/clients sidebar).
// Data: never the whole table -- the caller hands over a first page (NAV_FIRST), typing searches every client on the
// server (searchPath?q=: GET /api/ops/org-search on staff pages, names only, at most NAV_SEARCH_LIMIT). Visible rows, no dropdown, theme tokens only.
// Enforced by __tests__/client-picker-rule.test.ts: a file that fetches a client list must render it through this block.
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { roleHeader } from "@/lib/ops-role";
import { NAV_FIRST, NAV_SEARCH_LIMIT, type PickOrg } from "./nav-orgs";

/** brandColors: only clients with a valid brand colour (the banner studio's brand picker). */
export type OrgFilter = "brandColors";

/** Server search for `search` at `path` (?q=, debounced). found = null while no search runs; failed = the last search did
 *  not answer. The route answers { ok, orgs: PickOrg[] }. */
function useOrgSearch(search: string, path: string, filter?: OrgFilter): { found: PickOrg[] | null; failed: boolean } {
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
        const res = await fetch(`${path}?${params}`, { headers: { ...roleHeader("operator") }, signal: ctrl.signal });
        const json = await res.json();
        if (!res.ok || json.ok !== true) throw new Error(String(json.error ?? res.status));
        setFound(json.orgs as PickOrg[]);
        setFailed(false);
      } catch {
        if (!ctrl.signal.aborted) { setFound([]); setFailed(true); }
      }
    }, 250);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [search, path, filter]);

  return { found, failed };
}

const note: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", padding: "8px" };

/** One client row: colour dot + name, the picked one on the accent tint (theme tokens only). */
function rowStyle(on: boolean, disabled = false): React.CSSProperties {
  return {
    font: "inherit",   // first: the longhands below override it (a <button> does not inherit the page font)
    display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
    padding: "7px 8px", marginBottom: 1, borderRadius: 6, border: "none", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
    fontSize: 12, textDecoration: "none",
    background: on ? "var(--accent-light)" : "transparent",
    color: on ? "var(--accent-text)" : "var(--text-primary)",
    fontWeight: on ? 600 : 400,
  };
}

function RowBody({ org }: { org: PickOrg }) {
  return (
    <>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: org.color, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{org.name}</span>
    </>
  );
}

export interface OrgPickerProps {
  /** The first page (NAV_FIRST rows); a selected client outside it should be put first by the caller. */
  orgs: PickOrg[];
  /** Every client the first page was cut from (the hint says how many the search covers). */
  total: number;
  /** The picked client's `by` key, or null. */
  selected: string | null;
  by?: "id" | "slug";
  /** Button mode: called with the picked client (null = the `none` row). Not called in link mode. */
  onPick?(org: PickOrg | null): void;
  /** Link mode (a navigation list such as /ops/clients): each row is a link to hrefFor(org). */
  hrefFor?(org: PickOrg): string;
  /** A first row that picks no client (onPick(null)), e.g. 自用. */
  none?: ReactNode;
  filter?: OrgFilter;
  /** The route that answers the search (?q=): "/api/ops/org-search" on staff pages, the door's own route on a door. */
  searchPath: string;
  /** false = no search box (a list that is already the whole answer, e.g. a customer's own organization). */
  searchable?: boolean;
  /** Fill the parent's height (a sidebar); otherwise a box of at most 320px wide, 280px of rows. */
  fill?: boolean;
  /** Every row and the search box disabled (a caller mid-work that must not switch client). */
  disabled?: boolean;
}

export function OrgPicker({ orgs, total, selected, by = "slug", onPick, hrefFor, none, filter, searchPath, searchable = true, fill = false, disabled = false }: OrgPickerProps) {
  const [search, setSearch] = useState("");
  const { found, failed } = useOrgSearch(searchable ? search : "", searchPath, filter);
  // a client picked from search results stays on screen once the search box is cleared
  const [picked, setPicked] = useState<PickOrg | null>(null);
  const first = picked && picked[by] === selected && !orgs.some((o) => o[by] === selected) ? [picked, ...orgs] : orgs;
  const shown = found ?? first;

  function pick(org: PickOrg | null) {
    setPicked(org);
    onPick?.(org);
  }

  return (
    <div style={fill
      ? { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }
      : { maxWidth: 320, border: "1px solid var(--card-border)", borderRadius: 8, background: "var(--bg-card)" }}>
      {searchable && (
        <div style={{ padding: "8px 8px 6px", borderBottom: "1px solid var(--card-border)" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={disabled}
            placeholder="搜尋客戶..."
            aria-label="搜尋客戶"
            style={{
              width: "100%", padding: "6px 8px",
              border: "1px solid var(--card-border)", borderRadius: 6,
              fontSize: 12, background: "var(--form-input-bg)", color: "var(--text-primary)", outline: "none",
            }}
          />
        </div>
      )}
      <div role="group" aria-label="客戶" style={{ padding: 6, overflowY: "auto", ...(fill ? { flex: 1 } : { maxHeight: 280 }) }}>
        {none !== undefined && found === null && !hrefFor && (
          <button type="button" aria-pressed={selected === null} disabled={disabled} onClick={() => pick(null)} style={rowStyle(selected === null, disabled)}>
            <span style={{ flex: 1 }}>{none}</span>
          </button>
        )}
        {shown.map((org) => {
          const on = org[by] === selected;
          return hrefFor ? (
            <Link key={org.id || org.slug} href={hrefFor(org)} aria-current={on ? "page" : undefined} style={rowStyle(on)}>
              <RowBody org={org} />
            </Link>
          ) : (
            <button key={org.id} type="button" aria-pressed={on} disabled={disabled} onClick={() => pick(org)} style={rowStyle(on, disabled)}>
              <RowBody org={org} />
            </button>
          );
        })}
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
