// /ops/collect — the collection control surface.
//
// Everything under lib/collect was a library nobody could press. This is the button: pick a client,
// see what it collects from, add a source, run it. The dry run is deliberately the prominent one —
// a new source should be tried against sink/null before it is allowed to write into a customer's
// knowledge base.
//
// The first NAV_FIRST clients come from the server; the picker searches the rest (OrgPicker.tsx). Everything that
// changes lives in the client component beside this file.

import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { isResearchBridgesEnabled } from "@/lib/research-bridges";
import { NAV_FIRST, toPickOrg, type PickOrg } from "../clients/nav-orgs";
import { OrgUrlPicker } from "../clients/OrgPicker";
import { CollectionSourcesPanel } from "./CollectionSourcesPanel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORG_COLS = "id,slug,name,color:metadata->>color";

/** The first NAV_FIRST clients, plus ?slug= first when it is a client outside them; selected = ?slug= if it exists.
 *  lookupFailed: ?slug= could not be checked -- the page then opens no client rather than a different one. */
async function loadClients(slug: string | undefined): Promise<{ clients: PickOrg[]; total: number; selected?: string; lookupFailed?: boolean }> {
  const sb = getSupabaseWriteClient();
  if (!sb) return { clients: [], total: 0 };
  const [firstPage, asked] = await Promise.all([
    sb.from("organizations").select(ORG_COLS, { count: "exact" }).order("created_at", { ascending: true }).limit(NAV_FIRST),
    slug ? sb.from("organizations").select(ORG_COLS).eq("slug", slug).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (firstPage.error || !firstPage.data) return { clients: [], total: 0 };
  const clients = firstPage.data.map(toPickOrg);
  const one = asked.data ? toPickOrg(asked.data) : null;
  if (one && !clients.some((c) => c.slug === one.slug)) clients.unshift(one);
  const total = firstPage.count ?? clients.length;
  if (asked.error) return { clients, total, lookupFailed: true };
  return { clients, total, selected: one?.slug ?? clients[0]?.slug };
}

export default async function CollectPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const { slug } = await searchParams;
  const { clients, total, selected, lookupFailed } = await loadClients(slug);

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>資料蒐集</h1>
      <p style={{ color: "#6b7280", margin: "0 0 20px", fontSize: 13, lineHeight: 1.7 }}>
        選來源、試跑、再讓它寫進知識庫。
        <strong>試跑不會存任何東西</strong>
        ——新來源請先試跑，看它抓回來的是不是內文。
      </p>

      {clients.length === 0 ? (
        <p style={{ color: "#b91c1c" }}>沒有讀到任何客戶（Supabase 未設定或 organizations 是空的）。</p>
      ) : (
        <>
          <nav aria-label="選客戶" style={{ marginBottom: 20 }}>
            <OrgUrlPicker orgs={clients} total={total} param="slug" by="slug" selected={selected ?? null} />
          </nav>
          {lookupFailed ? <p style={{ color: "var(--red)" }}>讀不到客戶「{slug}」，請重新整理或從上面重選。</p> : null}
          {selected ? <CollectionSourcesPanel slug={selected} researchBridgesEnabled={isResearchBridgesEnabled()} /> : null}
        </>
      )}
    </div>
  );
}
