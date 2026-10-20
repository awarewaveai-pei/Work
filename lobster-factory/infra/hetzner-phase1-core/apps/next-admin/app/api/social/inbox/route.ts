// GET /api/social/inbox?brand — C29 read-only Chatwoot unread summary.
import { loadCis } from "@/lib/cs/cis";
import { getInboxUnreadCount } from "@/lib/cs/chatwoot-client";
import { ANY_ROLE, requireBrandRole } from "@/lib/social/authz";
import { handle, uuid } from "@/lib/social/http";
import { listAccounts } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function chatwootInboxUrl(baseUrl: string, accountId: number, inboxId: number): string | null {
  try {
    const url = new URL(baseUrl);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
    url.pathname = `/app/accounts/${accountId}/inbox/${inboxId}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    await requireBrandRole(req, brand, ANY_ROLE);
    const [accounts, cis] = await Promise.all([listAccounts(brand, { hydrateProfile: false }), loadCis(brand)]);
    const rows = await Promise.all(accounts.map(async (account) => {
      const inboxId = account.chatwoot_inbox_id;
      const base = {
        accountId: account.id,
        platform: account.platform,
        label: account.label,
        handle: account.handle,
        picture: account.picture,
        chatwootInboxId: inboxId,
        unread: 0,
        chatwootUrl: cis.chatwoot && inboxId ? chatwootInboxUrl(cis.chatwoot.baseUrl, cis.chatwoot.accountId, inboxId) : null,
      };
      if (!inboxId) return { ...base, status: "unlinked" as const };
      if (!cis.chatwoot) return { ...base, status: "not_configured" as const };
      try {
        const unread = await getInboxUnreadCount(brand, cis.chatwoot, inboxId);
        return { ...base, unread, status: "ok" as const };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const notConfigured = message === "chatwoot_api_token_missing" || message === "chatwoot_api_401" || message === "chatwoot_api_403";
        return { ...base, status: notConfigured ? "not_configured" as const : "unavailable" as const };
      }
    }));
    // only the sanitised per-inbox links leave the server; the configured baseUrl never does (it may carry credentials)
    return { inboxes: rows };
  });
}
