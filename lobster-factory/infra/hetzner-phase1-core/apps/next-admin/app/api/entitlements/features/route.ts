import { NextResponse } from "next/server";
import { normalizeQuery, PARAM } from "@/lib/client-context/contract";
import { featureList } from "@/lib/entitlements/features";
import { requestActor, resolveSubject, type SubjectHint } from "@/lib/entitlements/subject";
import { actorFor, NotAuthorizedForOrgError } from "@/lib/social/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/entitlements/features[?org=<uuid>] -- the signed "能用的功能" list (lib/entitlements/features.ts) for the
 *  caller's billing account, or with `org` for that org's root account (ADR 020 目前客戶). `org` is honoured only through
 *  actorFor: staff owner/admin, a member row there, or a client naming its own org; anyone else gets 403 before any
 *  lookup, so a refused caller cannot tell an existing org from a made-up uuid. */
export async function GET(req: Request): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const { org } = normalizeQuery(sp);
  if (sp.get(PARAM.org) !== null && org === null) return NextResponse.json({ ok: false, code: "invalid_org" }, { status: 400 });
  try {
    let hint: SubjectHint = { req };
    if (org) {
      try {
        hint = { req, orgId: (await actorFor(req, org)).orgId };
      } catch (error) {
        if (!(error instanceof NotAuthorizedForOrgError)) throw error;
        // Same rule as withFeature (grant.ts): staff need no role on the internal account itself, which is what no `org` gives them.
        const internal = !requestActor(req).startsWith("client:") && (await resolveSubject({ orgId: org })).kind === "internal";
        if (!internal) return NextResponse.json({ ok: false, code: error.code }, { status: 403 });
      }
    }
    const { runtimeGateDependencies } = await import("@/lib/entitlements/runtime");
    const signed = await featureList(await resolveSubject(hint), requestActor(req), runtimeGateDependencies());
    return NextResponse.json(signed, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.warn(`[entitlement] feature list failed: ${String(error).slice(0, 200)}`);
    return NextResponse.json({ ok: false, code: "infrastructure_error" }, { status: 503 });
  }
}
