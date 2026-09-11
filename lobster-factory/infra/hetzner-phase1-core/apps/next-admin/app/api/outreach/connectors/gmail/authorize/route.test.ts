import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Regression coverage for critic Critical (2026-09-11): a canManageOutreach caller must not be
// able to mint an OAuth state for a Gmail connector belonging to a DIFFERENT org than their own —
// doing so let them overwrite that org's stored refresh token and have drafts.create() run
// against the attacker's own mailbox using the victim org's leads/copy.

const maybeSingle = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })));
vi.mock("@/lib/org-client", () => ({ getOrgSupabaseWriteClient: async () => ({ from }) }));

import { GET } from "./route";

const CONNECTOR_ID = "aaaaaaaa-0000-4000-8000-00000000000a";
const ORG_A = "bbbbbbbb-0000-4000-8000-00000000000b";
const ORG_B = "cccccccc-0000-4000-8000-00000000000c";

function request(headers: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost/api/outreach/connectors/gmail/authorize?connectorId=${CONNECTOR_ID}`, { headers });
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "test-client-secret");
  maybeSingle.mockReset();
  from.mockClear();
});

describe("GET /api/outreach/connectors/gmail/authorize — org ownership guard", () => {
  it("rejects a client-kind caller bound to a DIFFERENT org than the connector's own (the IDOR this route previously allowed)", async () => {
    maybeSingle.mockResolvedValue({ data: { id: CONNECTOR_ID, organization_id: ORG_A, connector_name: "gmail" }, error: null });
    const res = await GET(request({ "x-ops-claims-role": "operator", "x-ops-user-kind": "client", "x-ops-org-id": ORG_B }));
    expect(res.status).toBe(403);
    expect(res.headers.get("location")).toBeNull(); // must NOT have redirected to Google
  });

  it("allows a client-kind caller who owns the connector's own org", async () => {
    maybeSingle.mockResolvedValue({ data: { id: CONNECTOR_ID, organization_id: ORG_A, connector_name: "gmail" }, error: null });
    const res = await GET(request({ "x-ops-claims-role": "operator", "x-ops-user-kind": "client", "x-ops-org-id": ORG_A }));
    expect(res.status).toBe(307); // NextResponse.redirect default
    expect(res.headers.get("location")).toContain("accounts.google.com");
  });

  it("allows a staff caller regardless of the connector's org (staff = full cross-org access by design)", async () => {
    maybeSingle.mockResolvedValue({ data: { id: CONNECTOR_ID, organization_id: ORG_A, connector_name: "gmail" }, error: null });
    const res = await GET(request({ "x-ops-claims-role": "operator" }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("accounts.google.com");
  });

  it("rejects a role without canManageOutreach before even reading the connector row", async () => {
    const res = await GET(request({ "x-ops-claims-role": "viewer" }));
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
});
