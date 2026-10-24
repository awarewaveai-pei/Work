// /ops/knowledge — every knowledge document the agency holds, across clients.
//
// The sidebar used to carry a disabled「知識庫（soon）」, which read as "not built yet" long after
// K1 shipped. The knowledge base is per-client and edited in the client hub「客服」tab, so a global
// link had nowhere honest to point. This is that missing place: one list of what is actually in the
// knowledge base, and a way into the client that owns each row.
//
// Read-only on purpose. Editing a document means choosing a client first; doing it here would be a
// second write path into the same table, with its own version and lock handling to get wrong.

import Link from "next/link";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Row {
  id: string;
  title: string;
  kind: string;
  status: string;
  version: number;
  canonicalUrl: string | null;
  author: string | null;
  epistemicType: string | null;
  authorshipState: string | null;
  locked: string | null;
  isSensitive: boolean;
  updatedAt: string | null;
  orgName: string;
  orgSlug: string | null;
  chunks: number;
  cognitiveOsProjectId: string | null;
}

async function loadRows(): Promise<{ rows: Row[]; archived: number } | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;

  // Archived versions are counted but not listed: they are history, and showing every superseded
  // version would bury the ~1 live row per document that anyone is looking for.
  const { data, error } = await sb
    .from("cs_knowledge_sources")
    .select(
      "id,title,kind,status,source_version,canonical_url,author,epistemic_type,authorship_state,locked,is_sensitive,updated_at,organization_id,cognitive_os_project_id",
    )
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error || !data) return null;

  const { count: archived } = await sb
    .from("cs_knowledge_sources")
    .select("id", { count: "exact", head: true })
    .eq("status", "archived");

  const orgIds = [...new Set(data.map((r) => r.organization_id as string))];
  const orgs = new Map<string, { name: string; slug: string | null }>();
  if (orgIds.length) {
    const { data: orgRows } = await sb.from("organizations").select("id,name,slug").in("id", orgIds);
    for (const o of orgRows ?? []) orgs.set(o.id as string, { name: (o.name as string) ?? "—", slug: (o.slug as string) ?? null });
  }

  // One grouped count instead of a query per row: 500 rows would otherwise be 500 round trips.
  const counts = new Map<string, number>();
  const ids = data.map((r) => r.id as string);
  if (ids.length) {
    const { data: chunkRows } = await sb.from("cs_knowledge_chunks").select("source_id").in("source_id", ids);
    for (const c of chunkRows ?? []) counts.set(c.source_id as string, (counts.get(c.source_id as string) ?? 0) + 1);
  }

  return {
    archived: archived ?? 0,
    rows: data.map((r) => ({
      id: r.id as string,
      title: (r.title as string) ?? "—",
      kind: (r.kind as string) ?? "—",
      status: (r.status as string) ?? "—",
      version: (r.source_version as number) ?? 1,
      canonicalUrl: (r.canonical_url as string) ?? null,
      author: (r.author as string) ?? null,
      epistemicType: (r.epistemic_type as string) ?? null,
      authorshipState: (r.authorship_state as string) ?? null,
      locked: (r.locked as string) ?? null,
      isSensitive: Boolean(r.is_sensitive),
      updatedAt: (r.updated_at as string) ?? null,
      orgName: orgs.get(r.organization_id as string)?.name ?? "—",
      orgSlug: orgs.get(r.organization_id as string)?.slug ?? null,
      chunks: counts.get(r.id as string) ?? 0,
      cognitiveOsProjectId: (r.cognitive_os_project_id as string) ?? null,
    })),
  };
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ background: "var(--bg-canvas)", borderRadius: 10, padding: "14px 16px", minWidth: 150 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

/**
 * Where a document came from, in the operator's words.
 *
 * Shown on every row because it changes how much the answer can be trusted: text a crawler copied
 * off somebody's website and a policy the operator wrote are stored in the same table and look
 * identical in a title list. Unlabelled rows predate migration 0075 and say so rather than being
 * quietly presented as ours.
 */
function Origin({ row }: { row: Row }) {
  if (row.authorshipState === "SOURCE_QUOTATION") return <Tag color="#b45309">外部原文引用</Tag>;
  if (row.authorshipState === "HUMAN_ORIGINAL") return <Tag color="#047857">我們自己寫的</Tag>;
  if (row.authorshipState === "AI_GENERATED" || row.authorshipState === "AI_SUGGESTED") return <Tag color="#6d28d9">機器產生</Tag>;
  return <Tag color="#6b7280">未標記（0075 之前）</Tag>;
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ fontSize: 11, color, border: `1px solid ${color}33`, background: `${color}11`, borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export default async function KnowledgeOverview() {
  const data = await loadRows();
  const rows = data?.rows ?? [];
  const chunks = rows.reduce((n, r) => n + r.chunks, 0);
  const fromWeb = rows.filter((r) => r.authorshipState === "SOURCE_QUOTATION").length;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>知識庫</h1>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 20px", lineHeight: 1.6 }}>
        所有客戶的知識文件總覽。要新增或修改某個客戶的文件，到{" "}
        <Link href="/ops/clients" style={{ color: "var(--accent-text)" }}>客戶中心</Link> 開該客戶 →「客服」分頁。
        要讓它自動從網站或搜尋結果長出來，到{" "}
        <Link href="/ops/collect" style={{ color: "var(--accent-text)" }}>資料蒐集</Link>。
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Metric label="現行文件" value={String(rows.length)} hint="不含已封存的舊版本" />
        <Metric label="切片" value={String(chunks)} hint="檢索的最小單位" />
        <Metric label="外部原文引用" value={String(fromWeb)} hint="抓來的，不是我們寫的" />
        <Metric label="封存的舊版本" value={String(data?.archived ?? 0)} hint="仍可稽核，不會被檢索到" />
      </div>

      {data === null ? (
        <p style={{ fontSize: 13, color: "#b91c1c" }}>讀不到資料庫（服務金鑰未設定或連線失敗）。</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>知識庫目前是空的。</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 11 }}>
                <th style={th}>文件</th>
                <th style={th}>客戶</th>
                <th style={th}>出處</th>
                <th style={th}>版本</th>
                <th style={th}>切片</th>
                <th style={th}>更新</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--card-border)" }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                      {r.kind}
                      {r.author ? ` · ${r.author}` : ""}
                      {r.canonicalUrl ? ` · ${r.canonicalUrl}` : ""}
                    </div>
                  </td>
                  <td style={td}>
                    {r.orgSlug ? (
                      <Link href={`/ops/clients/${r.orgSlug}`} style={{ color: "var(--accent-text)" }}>{r.orgName}</Link>
                    ) : (
                      r.orgName
                    )}
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <Origin row={r} />
                      {r.locked ? <Tag color="#111827">已鎖定</Tag> : null}
                      {r.isSensitive ? <Tag color="#b91c1c">敏感</Tag> : null}
                      {r.cognitiveOsProjectId ? (
                        <a
                          // Handoff route, not a direct dashboard link — see
                          // app/api/cognitive-os/open/route.ts's header (service-tenant vs
                          // operator-tenant mismatch, operator report 2026-09-18).
                          href={`/api/cognitive-os/open?project=${encodeURIComponent(r.cognitiveOsProjectId)}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ textDecoration: "none" }}
                        >
                          <Tag color="#047857">已送 Cognitive OS</Tag>
                        </a>
                      ) : null}
                    </div>
                  </td>
                  <td style={td}>v{r.version}</td>
                  <td style={{ ...td, color: r.chunks === 0 ? "#b91c1c" : undefined }}>
                    {/* Zero chunks means the document exists but retrieval can never return it. */}
                    {r.chunks === 0 ? "0（檢索不到）" : r.chunks}
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: 11 }}>
                    {r.updatedAt ? r.updatedAt.slice(0, 16).replace("T", " ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "6px 10px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "10px", verticalAlign: "top", color: "var(--text-primary)" };
