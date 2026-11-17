import { ANY_ROLE, requireBrandRole } from "@/lib/social/authz";
import { handle, uuid } from "@/lib/social/http";
import { SocialStoreError } from "@/lib/social/store";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { readDraftOutcome } from "@/lib/content/video/draft-outcome";
import { productHost } from "@/lib/portal/hosts";
import { PRODUCTS } from "@/lib/portal/products";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const q = new URL(req.url).searchParams, org = uuid(q.get("organizationId"), "organizationId"), candidate = uuid(q.get("candidateAssetId"), "candidateAssetId");
    await requireBrandRole(req, org, ANY_ROLE);
    const db = getSupabaseWriteClient(); if (!db) throw Error("db unavailable");
    const result = await readDraftOutcome(db, org, candidate);
    if (!result) throw new SocialStoreError(404, "not_found");
    return { ...result, socialUrl: "https://" + productHost(PRODUCTS.find((p) => p.key === "social")!) + "/?brand=" + encodeURIComponent(org) };
  });
}
