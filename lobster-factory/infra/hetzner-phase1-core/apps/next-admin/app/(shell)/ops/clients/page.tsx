// /ops/clients — landing page; layout.tsx provides the client panel nav on the left.
// Staff only: lists the clients (of the nav's first NAV_FIRST) whose auto-content has a problem, each a link to its content tab
// (F9: the old 題目 › 客戶 list is gone and its problem list lives here). Same rule as the overview rows: loadClientProblems.
import Link from "next/link";
import { headers } from "next/headers";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { canAccessOrg } from "@/lib/tenant-guard";
import { loadClientProblems } from "@/lib/content/topics/overview-load";
import { NAV_FIRST } from "./nav-orgs";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const sb = getSupabaseWriteClient();
  let problems: Array<{ slug: string; name: string; reason: string }> = [];
  let failure: string | null = null;
  if (sb) {
    try {
      const { data, error } = await sb.from("organizations").select("id, slug, name").neq("status", "inactive").order("created_at", { ascending: true }).limit(NAV_FIRST);
      if (error) throw new Error(error.message);
      const orgs = (data ?? []) as Array<{ id: string; slug: string; name: string | null }>;
      const req = new Request("http://localhost", { headers: await headers() });
      const found = await loadClientProblems(sb, orgs.map((o) => o.id), (org) => canAccessOrg(req, org));
      const bad = new Map(found.filter((f) => f.problem).map((f) => [f.organizationId, f]));
      problems = orgs.filter((o) => bad.has(o.id.toLowerCase())).map((o) => {
        const f = bad.get(o.id.toLowerCase())!;
        return { slug: o.slug, name: o.name || o.slug, reason: f.lastError ? `排程出錯：${f.lastError}` : `${f.failedTopics} 個題目失敗` };
      });
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }
  }
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 6px", color: "var(--text-primary)" }}>客戶</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-base)", margin: "0 0 20px" }}>從左側選擇客戶；下面是自動內容有問題的客戶。</p>
      {failure ? (
        <p style={{ color: "var(--red)" }}>讀取失敗：{failure}</p>
      ) : problems.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>沒有有問題的客戶。</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {problems.map((p) => (
            <li key={p.slug}>
              <Link href={`/ops/clients/${encodeURIComponent(p.slug)}?tab=${encodeURIComponent("內容工具")}`}
                style={{ display: "flex", gap: 10, padding: "10px 12px", border: "1px solid var(--card-border)", borderRadius: 6, background: "var(--bg-card)", color: "var(--text-primary)", textDecoration: "none", fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: "var(--text-muted)" }}>{p.reason}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
