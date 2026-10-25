"use client";

// The layout hands over the first NAV_FIRST clients; typing searches every client on the server
// (GET /api/ops/org-search?q=, OrgPicker.tsx useOrgSearch), so the list never holds the whole organizations table.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_FIRST, NAV_SEARCH_LIMIT } from "./nav-orgs";
import { useOrgSearch } from "./OrgPicker";

export interface OrgStub {
  slug: string;
  name: string;
  color: string;
}

const NAV_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: 220,
  flexShrink: 0,
  background: "var(--bg-card)",
  borderRight: "1px solid var(--card-border)",
  height: "100%",
  overflow: "hidden",
};

export function ClientPanelNav({ orgs, total }: { orgs: OrgStub[]; total: number }) {
  const [search, setSearch] = useState("");
  const { found, failed } = useOrgSearch(search);   // found = null: no search running; show the first page
  const pathname = usePathname();

  const filtered = found ?? orgs;

  return (
    <nav aria-label="客戶列表" style={NAV_STYLE}>
      <div style={{ padding: "12px 12px 8px", borderBottom: "1px solid var(--card-border)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
          客戶
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋客戶..."
          aria-label="搜尋客戶"
          style={{
            width: "100%", padding: "6px 8px",
            border: "1px solid var(--card-border)", borderRadius: 6,
            fontSize: 12, background: "var(--form-input-bg)",
            color: "var(--text-primary)", outline: "none",
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
        {filtered.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "12px 8px" }}>
            {failed ? "搜尋失敗，請再試一次" : search ? "無符合的客戶" : "尚無客戶"}
          </div>
        )}
        {filtered.map((org) => {
          const isActive =
            pathname === `/ops/clients/${org.slug}` ||
            pathname.startsWith(`/ops/clients/${org.slug}/`);
          return (
            <Link
              key={org.slug}
              href={`/ops/clients/${org.slug}`}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 8px", borderRadius: 6,
                fontSize: 12, textDecoration: "none", marginBottom: 1,
                background: isActive ? "rgba(88,85,208,0.10)" : "transparent",
                color: isActive ? "var(--accent-text)" : "var(--text-primary)",
                fontWeight: isActive ? 500 : 400,
              }}
            >
              <span
                aria-hidden="true"
                style={{ width: 8, height: 8, borderRadius: "50%", background: org.color, flexShrink: 0 }}
              />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {org.name}
              </span>
            </Link>
          );
        })}
        {found === null && total > orgs.length && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "8px" }}>
            共 {total.toLocaleString("zh-TW")} 個客戶，這裡列最早的 {NAV_FIRST} 個；其他請用上面的搜尋。
          </div>
        )}
        {found !== null && found.length >= NAV_SEARCH_LIMIT && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "8px" }}>只列前 {NAV_SEARCH_LIMIT} 個符合的，請打得更完整。</div>
        )}
      </div>

      <div style={{ padding: "8px 10px", borderTop: "1px solid var(--card-border)" }}>
        <Link
          href="/ops/onboarding"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 8px", borderRadius: 6,
            border: "1px dashed var(--card-border)",
            color: "var(--text-muted)", fontSize: 12, textDecoration: "none",
          }}
        >
          + 新增客戶
        </Link>
      </div>
    </nav>
  );
}
