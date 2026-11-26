// 「繼續上次」 (card U17, blueprint §6.2): the unit's 3 newest works (media_assets images) and content drafts, merged by
// time. Read here on the server: a customer on the portal host may call only /portal/* (middleware isClientOutsideDoor),
// so the browser cannot reach /api/tools/designs or /api/content/drafts. The org is the one requireClientOrg gave the
// page, never a request value. A click opens the door's menu page (作品庫 / 草稿), not the single item: the door
// route's `next` accepts menu paths only (app/portal/api/door/route.ts).
import { getSupabaseReadClient, getSupabaseWriteClient } from "@/lib/supabase-server";
import { listDesigns } from "@/lib/studio/designs-list";
import { listContentDrafts } from "@/lib/content/drafts-list";
import { doorHref } from "@/lib/portal/door-href";
import { servedNextAdminProducts, type NextAdminProduct } from "@/lib/portal/doors";

const SHOWN = 3;

export function DoorForm({ productKey, next, label }: { productKey: string; next?: string; label: string }) {
  return (
    <form method="post" action="/portal/api/door">
      <input type="hidden" name="product_key" value={productKey} />
      {next && <input type="hidden" name="next" value={next} />}
      <button className="btn-primary">{label}</button>
    </form>
  );
}

interface Found { kind: "work" | "draft"; id: string; name: string; at: string }
export interface ResumeItem extends Found { productKey: string; next?: string; label: string }

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const short = (s: string) => (s.length > 40 ? `${s.slice(0, 40)}…` : s);

function workName(metadata: unknown): string {
  const m = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>;
  const name = text(m.title) ?? text(m.subject) ?? text(m.cardName) ?? text(m.prompt);
  return name ? short(name) : "未命名作品";
}

/** The held door to open for this kind of item: works -> the design door first (its home IS the library), else any held
 *  door listing the library; drafts -> the content door's 草稿 page. null = no held door shows it. */
function doorFor(kind: Found["kind"], held: ReadonlySet<string>): Omit<ResumeItem, keyof Found> | null {
  const doors = servedNextAdminProducts().filter((p) => held.has(p.key));
  const pick = (p: NextAdminProduct | undefined, staff: string, label: string) => {
    if (!p) return null;
    const path = doorHref(p.door.nav ?? [], staff);
    if (!path) return null;
    return { productKey: p.key, next: path === "/" ? undefined : path, label };
  };
  if (kind === "draft") return pick(doors.find((p) => p.key === "content"), "/tools/content/drafts", "到草稿");
  const sorted = [...doors.filter((p) => p.key === "design"), ...doors.filter((p) => p.key !== "design")];
  for (const p of sorted) {
    const hit = pick(p, "/tools/designs", "到我的作品");
    if (hit) return hit;
  }
  return null;
}

/** The 3 newest items a held door can open, or "failed" when either read failed. orgId must be the session's org:
 *  listDesigns / listContentDrafts treat a null org as every org. */
export async function loadResume(orgId: string, held: ReadonlySet<string>): Promise<ResumeItem[] | "failed"> {
  if (!orgId) return [];
  const db = getSupabaseWriteClient() ?? getSupabaseReadClient();
  if (!db) return "failed";
  try {
    const [works, drafts] = await Promise.all([
      // the library is off without POD_DESIGNS_ENABLED (GET /api/tools/designs answers 503): no works, not a failure
      process.env.POD_DESIGNS_ENABLED === "true"
        ? listDesigns(db, { organizationId: orgId, mimePrefix: "image/%", group: null, model: null, product: null, theme: null, brand: null, time: null, tzOffsetMin: 0 },
            { cursor: null, order: "desc", withCounts: false }).then((r) => r.assets)
        : Promise.resolve([]),
      listContentDrafts(db, { organizationId: orgId, limit: SHOWN }),
    ]);
    const found: Found[] = [
      ...works.slice(0, SHOWN).map((a) => ({ kind: "work" as const, id: String(a.id), name: workName(a.metadata), at: String(a.created_at) })),
      ...drafts.map((d) => ({ kind: "draft" as const, id: d.id, name: short(d.title?.trim() || d.keyword || "未命名草稿"), at: d.createdAt })),
    ];
    found.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const out: ResumeItem[] = [];
    for (const f of found) {
      const door = doorFor(f.kind, held);
      if (door) out.push({ ...f, ...door });
      if (out.length === SHOWN) break;
    }
    return out;
  } catch (error) {
    console.error("[portal/launcher] resume read failed", { orgId, error: error instanceof Error ? error.message : String(error) });
    return "failed";
  }
}

const H2 = { fontSize: 15, fontWeight: 700, margin: "0 0 12px" } as const;
const KIND = { work: "作品", draft: "草稿" } as const;

export function ResumeSection({ items }: { items: ResumeItem[] | "failed" }) {
  if (items === "failed") return <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: "0 0 20px" }}>繼續上次：暫時讀不到。</p>;
  if (items.length === 0) return null;
  return (
    <section aria-label="繼續上次" style={{ margin: "0 0 28px" }}>
      <h2 style={H2}>繼續上次</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item) => (
          <li key={`${item.kind}:${item.id}`} data-resume={item.kind} className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ flex: "1 1 200px", minWidth: 0 }}>
              <strong style={{ color: "var(--text-primary)" }}>{item.name}</strong>
              <span style={{ fontSize: 12.5, color: "var(--text-muted)", marginLeft: 8 }}>{KIND[item.kind]} · {item.at.slice(0, 10)}</span>
            </span>
            <DoorForm productKey={item.productKey} next={item.next} label={item.label} />
          </li>
        ))}
      </ul>
    </section>
  );
}
