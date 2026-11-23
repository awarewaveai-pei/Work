// client_credentials rows the site flow owns (card SF-J2): steps/bridge.ts registerNewKey writes the wp-bridge key
// pair's row with metadata.source = SITE_FLOW_CREDENTIAL_SOURCE, and environments.metadata.bridge.credential_id points
// at it. Only the flow may change or delete such a row: the client page's credential routes refuse them
// (app/api/ops/clients/credentials{,/secret}/route.ts), and refuse to stamp the source on any other row.
// Pure module: no I/O, so the routes, the step and the client page all read the same rule.

export const SITE_FLOW_CREDENTIAL_SOURCE = "site-flow";

/** True when a client_credentials.metadata value marks the row as the site flow's. */
export function isSiteFlowCredential(metadata: unknown): boolean {
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>).source === SITE_FLOW_CREDENTIAL_SOURCE;
}

/** The error code and sentence the credential routes answer for a site-flow row (HTTP 409). */
export const SITE_FLOW_CREDENTIAL_ERROR = "managed_by_site_flow";
export const SITE_FLOW_CREDENTIAL_TEXT =
  "這筆金鑰由建站流程管理，不能在客戶頁修改或刪除。要換金鑰，請到該網站的建站流程頁處理「接上 AI 控制通道」。";
