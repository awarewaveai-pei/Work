// /ops/clients — landing page; layout.tsx provides the client panel nav on the left.
// Staff only: the clients whose auto-content has a problem, found from the problem rows (loadClientProblems), each a link to
// its content tab (F9). Not every kind of problem: 未開通 is not read here, so a client missing from the list is not proof of health.
import Link from "next/link";
import { headers } from "next/headers";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { canAccessOrg } from "@/lib/tenant-guard";
import { loadClientProblems, type ClientProblem } from "@/lib/content/topics/overview-load";

export const metadata = { title: "全部客戶" };

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const sb = getSupabaseWriteClient();
  let result: { clients: ClientProblem[]; more: boolean } = { clients: [], more: false };
  let failure: string | null = null;
  if (sb) {
    try {
      const req = new Request("http://localhost", { headers: await headers() });
      result = await loadClientProblems(sb, (org) => canAccessOrg(req, org));
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }
  }
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: "var(--font-size-xl)", margin: "0 0 6px", color: "var(--text-primary)" }}>全部客戶</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "var(--font-size-base)", margin: "0 0 20px" }}>
        從客戶清單選擇客戶。下面只列「自動內容排程出錯，或這個月有題目失敗」的客戶；沒有列出，不代表一切正常（例如還沒開通的客戶不在這裡）。
      </p>
      {failure ? (
        <p style={{ color: "var(--red)" }}>讀取失敗：{failure}</p>
      ) : result.clients.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>沒有排程出錯或題目失敗的客戶。</p>
      ) : (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {result.clients.map((c) => (
              <li key={c.slug}>
                <Link href={`/ops/clients/${encodeURIComponent(c.slug)}?tab=${encodeURIComponent("內容工具")}`}
                  style={{ display: "flex", gap: 10, padding: "10px 12px", border: "1px solid var(--card-border)", borderRadius: 6, background: "var(--bg-card)", color: "var(--text-primary)", textDecoration: "none", fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {[c.lastError ? `排程出錯：${c.lastError}` : "", c.failedTopics ? `${c.failedTopics} 個題目失敗` : ""].filter(Boolean).join("；")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {result.more && <p style={{ color: "var(--text-muted)", marginTop: 12 }}>還有更多，請用客戶清單的搜尋。</p>}
        </>
      )}
    </div>
  );
}
