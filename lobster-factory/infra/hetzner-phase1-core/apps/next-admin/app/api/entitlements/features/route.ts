import { NextResponse } from "next/server";
import { normalizeQuery, PARAM } from "@/lib/client-context/contract";
import { featureList } from "@/lib/entitlements/features";
import { requestActor, resolveSubject, supabaseSubjectStore, type SubjectHint, type SubjectStore } from "@/lib/entitlements/subject";
import { actorFor, NotAuthorizedForOrgError } from "@/lib/social/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** An org that does not exist and one the caller has no role on get this same answer, so it never says which. */
const refuse = () => NextResponse.json({ ok: false, code: "not_authorized_for_org" }, { status: 403 });

/** The org's root billing account is the internal one. A missing row (or root) is "no", not a failure; a failed query throws. */
async function isInternal(store: SubjectStore, orgId: string): Promise<boolean> {
  const row = await store.byId(orgId);
  const root = row?.parent_organization_id ? await store.byId(row.parent_organization_id) : row;
  return root?.kind === "internal";
}

/** GET /api/entitlements/features[?org=<uuid>] -- the signed "能用的功能" list (lib/entitlements/features.ts) for the
 *  caller's billing account, or with `org` for that org's root account (ADR 020 目前客戶). `org` is honoured only through
 *  actorFor: staff owner/admin, a member row there, or a client naming its own org. No role there and no such org give the
 *  same 403 (refuse), so no caller can tell an existing org from a made-up uuid; only a failed query is 503. */
export async function GET(req: Request): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const { org } = normalizeQuery(sp);
  if (sp.get(PARAM.org) !== null && org === null) return NextResponse.json({ ok: false, code: "invalid_org" }, { status: 400 });
  try {
    const store = supabaseSubjectStore();
    let hint: SubjectHint = { req };
    if (org) {
      const acting = await actorFor(req, org).catch((error: unknown) => {
        if (error instanceof NotAuthorizedForOrgError) return null;
        throw error;
      });
      if (acting) {
        if (!(await store.byId(acting.orgId))) return refuse();
        hint = { req, orgId: acting.orgId };
      } else if (requestActor(req).startsWith("client:") || !(await isInternal(store, org))) {
        // Same rule as withFeature (grant.ts): staff need no role on the internal account itself, which is what no `org` gives them.
        return refuse();
      }
    }
    const { runtimeGateDependencies } = await import("@/lib/entitlements/runtime");
    const signed = await featureList(await resolveSubject(hint, store), requestActor(req), runtimeGateDependencies());
    return NextResponse.json(signed, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.warn(`[entitlement] feature list failed: ${String(error).slice(0, 200)}`);
    return NextResponse.json({ ok: false, code: "infrastructure_error" }, { status: 503 });
  }
}
