// credentials_ref is server-owned (connectors/secret and the OAuth callback set it to connectorSecretRef(id)): a caller
// naming a vault entry could make the server read another tenant's secret and send it to an AI vendor.
import { describe, expect, it, vi } from "vitest";

const insert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/org-client", () => ({ getOrgSupabaseWriteClient: async () => ({ from: () => ({ insert }) }) }));

const { POST } = await import("./route");
const post = (body: object) => POST(new Request("http://app.test/api/outreach/connectors", { method: "POST",
  headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("POST /api/outreach/connectors", () => {
  it("refuses a caller-supplied credentialsRef before touching the table", async () => {
    const res = await post({ connectorName: "openai", connectorType: "ai", credentialsRef: "org:other-client:supabase_key" });
    expect(res.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
  it("refuses caller-supplied settings: the mailbox a Gmail token belongs to is written only by the OAuth callback", async () => {
    const res = await post({ connectorName: "gmail", connectorType: "email_send", settings: { email: "other@x.example" } });
    expect(res.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
});
