// /api/social/accounts?brand=<id> -- a brand's channels (ADR 016 §4).
//   GET     the accounts, after attaching a channel a pending connection produced; plus the open connection, if any
//   POST    { brand, platform, accountId? } -> Postiz's OAuth URL for the person to open; accountId = reconnect it.
//           One connection per brand at a time (the new channel is matched to the brand by time).
//   DELETE  ?brand&id -> unlink a channel from the brand (Postiz keeps it); refused while posts target it.
//           ?brand&attempt -> give up an open connection now (frees the brand and the instance's new-channel slot).
import { ANY_ROLE, WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { cancelConnect, listAccounts, resolveConnectAttempt, startConnect, unlinkAccount } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    requireBrandRole(req, brand, ANY_ROLE);
    const attempt = await resolveConnectAttempt(brand);
    return { accounts: await listAccounts(brand), connecting: attempt.open, justConnected: attempt.connected ?? null, connectFailed: attempt.failed ?? null };
  });
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    requireBrandRole(req, brand, WRITE_ROLES);
    if (typeof body.platform !== "string" || !/^[a-z][a-z0-9-]{0,30}$/.test(body.platform)) throw new BadRequest("platform must be a Postiz provider id, e.g. bluesky");
    const accountId = body.accountId === undefined || body.accountId === null ? null : uuid(body.accountId, "accountId");
    return await startConnect(brand, body.platform, accountId, actorOf(req));
  });
}

export async function DELETE(req: Request): Promise<Response> {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const brand = uuid(q.get("brand"), "brand");
    requireBrandRole(req, brand, WRITE_ROLES);
    if (q.has("attempt")) await cancelConnect(brand, uuid(q.get("attempt"), "attempt"), actorOf(req));
    else await unlinkAccount(brand, uuid(q.get("id"), "id"), actorOf(req));
    return {};
  });
}
