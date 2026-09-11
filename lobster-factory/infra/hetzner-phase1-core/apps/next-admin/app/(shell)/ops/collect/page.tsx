// /ops/collect — the collection control surface.
//
// Everything under lib/collect was a library nobody could press. This is the button: pick a client,
// see what it collects from, add a source, run it. The dry run is deliberately the prominent one —
// a new source should be tried against sink/null before it is allowed to write into a customer's
// knowledge base.
//
// The client list is rendered on the server; everything that changes lives in the client component
// beside this file.

import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { CollectionSourcesPanel } from "./CollectionSourcesPanel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function loadClients(): Promise<Array<{ slug: string; name: string }>> {
  const sb = getSupabaseWriteClient();
  if (!sb) return [];
  const { data, error } = await sb.from("organizations").select("slug,name").order("name");
  if (error || !data) return [];
  return data.map((o) => ({ slug: o.slug as string, name: (o.name as string) ?? (o.slug as string) }));
}

export default async function CollectPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const [{ slug }, clients] = await Promise.all([searchParams, loadClients()]);
  const selected = slug && clients.some((c) => c.slug === slug) ? slug : clients[0]?.slug;

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
          <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            {clients.map((c) => (
              <a
                key={c.slug}
                href={`/ops/collect?slug=${encodeURIComponent(c.slug)}`}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: c.slug === selected ? "#111827" : "#fff",
                  color: c.slug === selected ? "#fff" : "#374151",
                  fontSize: 13,
                  textDecoration: "none",
                }}
              >
                {c.name}
              </a>
            ))}
          </nav>
          {selected ? <CollectionSourcesPanel slug={selected} /> : null}
        </>
      )}
    </div>
  );
}
