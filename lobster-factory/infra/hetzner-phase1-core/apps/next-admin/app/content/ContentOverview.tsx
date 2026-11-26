"use client";
// content.<base domain>/ (blueprint §15A rule 4: home = status + main action). Three numbers for the current client, an
// org-layer page: the whole client, or one site when the URL names one. Read from the APIs the destination pages use; a
// number whose read failed shows "—", never 0. Nothing is read unless the client context is "ok" (ADR 020); the client
// rail shows why it is not.
import { useEffect, useState } from "react";
import type { OverviewData } from "@/lib/content/topics/overview-load";
import { useClientContext } from "@/lib/client-context/use-client-context";
import { useCarry } from "../NavRail";

/** GET /api/content/drafts answers at most this many rows. */
const DRAFT_LIMIT = 100;
/** null = not read (loading or failed). */
type Counts = { pending: number | null; drafts: string | null; scheduled: number | null };
const NONE: Counts = { pending: null, drafts: null, scheduled: null };

async function read<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = (await res.json()) as T & { ok?: boolean };
  if (!res.ok || !json.ok) throw new Error(`${url}: ${res.status}`);
  return json;
}

export function ContentOverview() {
  const { org, site, status } = useClientContext("org");
  const carry = useCarry();
  const key = org && status === "ok" ? `${org}|${site ?? ""}` : null;
  const [got, setGot] = useState<{ key: string; counts: Counts } | null>(null);

  useEffect(() => {
    if (!key || !org) return;
    let live = true;
    const put = (part: Partial<Counts>) => {
      if (live) setGot((g) => ({ key, counts: { ...(g?.key === key ? g.counts : NONE), ...part } }));
    };
    const failed = (e: unknown) => console.error("[content overview]", e);

    // always this client's rows: a site id alone would also count another client's drafts saved under it
    const by = `organizationId=${encodeURIComponent(org)}${site ? `&siteId=${encodeURIComponent(site)}` : ""}`;
    read<{ drafts: unknown[] }>(`/api/content/drafts?${by}`)
      .then(({ drafts }) => put({ drafts: drafts.length >= DRAFT_LIMIT ? `${DRAFT_LIMIT}+` : String(drafts.length) }))
      .catch(failed);

    read<{ overview: OverviewData }>(`/api/content/topics/overview?organizationId=${encodeURIComponent(org)}`)
      .then(async ({ overview }) => {
        const rows = overview.rows.filter((r) => !site || r.siteId === site);
        put({ pending: rows.reduce((n, r) => n + r.pending, 0) });
        if (!rows.length) { put({ scheduled: 0 }); return; }
        // GET /api/content/topics answers the whole organization's month, whichever of its sites names it
        const { topics } = await read<{ topics: Array<{ site_id: string | null; status: string }> }>(
          `/api/content/topics?siteId=${encodeURIComponent(rows[0].siteId)}&month=${overview.month.slice(0, 7)}`);
        put({ scheduled: topics.filter((t) => t.status === "scheduled" && (!site || t.site_id === site)).length });
      })
      .catch(failed);
    return () => { live = false; };
  }, [key, org, site]);

  const counts = got && got.key === key ? got.counts : NONE;
  const cards = [
    { label: "待核准題目", value: counts.pending, sub: "本月", href: "/topics" },
    { label: "草稿", value: counts.drafts, sub: "已儲存的文章", href: "/drafts" },
    { label: "已排程", value: counts.scheduled, sub: "本月等待發布的題目", href: "/topics" },
  ];

  return (
    <>
      {!org && status === "unselected" && <p style={{ color: "var(--text-muted)" }}>先選一個客戶，這裡才有數字。</p>}
      <div className="card-grid" style={{ marginTop: 16 }}>
        {cards.map((c) => (
          <a key={c.label} className="card" href={carry(c.href)} style={{ textDecoration: "none" }}>
            <div className="card-label">{c.label}</div>
            <div className="card-value">{c.value ?? "—"}</div>
            <div className="card-sub">{c.sub}</div>
          </a>
        ))}
      </div>
      <a className="btn-primary" href={carry("/write")} style={{ textDecoration: "none" }}>寫文章</a>
    </>
  );
}
