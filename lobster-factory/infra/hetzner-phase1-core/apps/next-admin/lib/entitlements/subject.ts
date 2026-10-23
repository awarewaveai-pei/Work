import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { resolveOpsRole } from "@/lib/ops-role";
import { resolveTenant } from "@/lib/tenant-guard";
import type { Subject } from "./can";

export interface OrgRow { id: string; parent_organization_id: string | null; kind: "internal" | "customer" }
export interface SubjectStore {
  byId(id: string): Promise<OrgRow | null>;
  bySlug(slug: string): Promise<OrgRow | null>;
  internal(): Promise<OrgRow | null>;
}
export interface SubjectHint { req?: Request; orgId?: string | null; slug?: string | null; brandId?: string | null }

/** Who did it: `ops:<role>` or `client:<org>`, then `:<user id>`. Only middleware-set headers (social/authz actorOf delegates here). */
export function requestActor(req: Request): string {
  const tenant = resolveTenant(req);
  const who = tenant.userKind === "client" ? `client:${tenant.orgId}` : `ops:${resolveOpsRole(req).role}`;
  const userId = req.headers.get("x-ops-user-id")?.trim();
  return userId ? `${who}:${userId}` : who;
}

/** Proof that the actor may act for this org; minted only by `actorFor` in social/authz.ts after the role check. */
export class AuthorizedOrg {
  constructor(readonly orgId: string, readonly actor: string) {}
}

const COLUMNS = "id, parent_organization_id, kind";
const INTERNAL_TTL_MS = 5 * 60_000;
let internalCache: { row: OrgRow; at: number } | null = null;

export function supabaseSubjectStore(client: SupabaseClient | null = getSupabaseWriteClient()): SubjectStore {
  if (!client) throw new Error("entitlements_db_unavailable");
  const db = client;
  const one = async (column: string, value: string) => {
    const { data, error } = await db.from("organizations").select(COLUMNS).eq(column, value).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as OrgRow | null) ?? null;
  };
  return {
    byId: (id) => one("id", id),
    bySlug: (slug) => one("slug", slug),
    async internal() {
      if (internalCache && Date.now() - internalCache.at < INTERNAL_TTL_MS) return internalCache.row;
      const { data, error } = await db.from("organizations").select(COLUMNS).eq("kind", "internal").limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      if (data) internalCache = { row: data as OrgRow, at: Date.now() };
      return (data as OrgRow | null) ?? null;
    },
  };
}
export const resetSubjectCache = () => { internalCache = null; };

/** THE subject rule, one place: a named customer org (org id / brand id / client session, or slug) -> its root billing
 *  account (coalesce(parent, id)); no customer -> the organizations.kind='internal' row. A staff caller naming a foreign
 *  org must hold an AuthorizedOrg first (grant.ts). Throws on any lookup failure; grantFor / withFeature turn that into
 *  shadow-allow or deny. */
export async function resolveSubject(hint: SubjectHint = {}, store?: SubjectStore): Promise<Subject> {
  const s = store ?? supabaseSubjectStore();
  const tenant = hint.req ? resolveTenant(hint.req) : null;
  // A client with no organization binding must not fall through to the internal account below.
  if (tenant?.userKind === "client" && !tenant.orgId) throw new Error("client_without_org");
  const named =hint.orgId ?? hint.brandId ?? (tenant?.userKind === "client" ? tenant.orgId : null);
  let row: OrgRow | null;
  if (named) row = await s.byId(named);
  else if (hint.slug) row = await s.bySlug(hint.slug);
  else row = await s.internal();
  if (!row) throw new Error("subject_not_found");
  const root = row.parent_organization_id ? await s.byId(row.parent_organization_id) : row;
  if (!root) throw new Error("subject_root_not_found");
  return { orgId: root.id, kind: root.kind === "internal" ? "internal" : "customer" };
}
