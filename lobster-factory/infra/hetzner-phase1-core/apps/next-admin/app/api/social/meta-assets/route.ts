// Staff-only Meta asset bindings. Provider ids are configuration data, while tokens remain deployment secrets.
import { withFeature } from "@/lib/entitlements/grant";
import { WRITE_ROLES, actorOf, requireBrandRole, requireStaffForNewChannel } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { addMetaAsset, listMetaAssets, setMetaAssetEnabled, type MetaAssetKind } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kinds: readonly MetaAssetKind[] = ["facebook_page", "instagram_account", "ad_account"];

function kindOf(value: unknown): MetaAssetKind {
  if (typeof value !== "string" || !kinds.includes(value as MetaAssetKind)) throw new BadRequest("kind must be facebook_page, instagram_account or ad_account");
  return value as MetaAssetKind;
}

function externalIdOf(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 200) throw new BadRequest("externalId must be a non-empty provider id");
  return value.trim();
}

async function get(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    requireStaffForNewChannel(req);
    await requireBrandRole(req, brand, WRITE_ROLES);
    return { assets: await listMetaAssets(brand) };
  });
}

async function post(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    requireStaffForNewChannel(req);
    await requireBrandRole(req, brand, WRITE_ROLES);
    const kind = kindOf(body.kind);
    let externalId = externalIdOf(body.externalId);
    if (kind === "ad_account") {
      externalId = externalId.replace(/^act_/, "");
      if (!/^\d+$/.test(externalId)) throw new BadRequest("ad_account externalId must be numeric");
    }
    const pageExternalId = body.pageExternalId == null ? null : externalIdOf(body.pageExternalId);
    if (kind === "instagram_account" && !pageExternalId) throw new BadRequest("pageExternalId is required for an Instagram account");
    const label = body.label == null ? null : externalIdOf(body.label);
    return { asset: await addMetaAsset(brand, { kind, externalId, pageExternalId, label }, actorOf(req)) };
  });
}

async function patch(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    requireStaffForNewChannel(req);
    await requireBrandRole(req, brand, WRITE_ROLES);
    const id = uuid(body.id, "id");
    if (typeof body.enabled !== "boolean") throw new BadRequest("enabled must be boolean");
    return { asset: await setMetaAssetEnabled(brand, id, body.enabled, actorOf(req)) };
  });
}

export const GET = withFeature("social.meta", get);
export const POST = withFeature("social.meta", post);
export const PATCH = withFeature("social.meta", patch);
