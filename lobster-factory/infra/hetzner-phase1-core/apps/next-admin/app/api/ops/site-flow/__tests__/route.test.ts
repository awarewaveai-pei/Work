// Role gate of the site-flow step route (card SF-G): only owner/admin staff may plan, execute or poll a step; a
// refusal happens before any database client is created (so before any run, gate or host call).
import { describe, expect, it, vi } from "vitest";

const writeClient = vi.hoisted(() => vi.fn(() => null));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: writeClient }));

import { POST } from "../[siteId]/[step]/route";

const SITE = "6f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";
const ctx = { params: Promise.resolve({ siteId: SITE, step: "create" }) };
const req = (role: string, action: "execute" | "poll", kind = "staff") =>
  new Request(`http://x/api/ops/site-flow/${SITE}/create`, {
    method: "POST",
    headers: { "x-ops-claims-role": role, "x-ops-user-kind": kind, "content-type": "application/json" },
    body: JSON.stringify(action === "execute" ? { action, planHash: "a".repeat(64) } : { action, runId: SITE }),
  });

describe("site-flow step route role gate", () => {
  it.each(["operator", "viewer"])("%s gets 403 on execute and poll, before any DB client", async (role) => {
    expect((await POST(req(role, "execute"), ctx)).status).toBe(403);
    expect((await POST(req(role, "poll"), ctx)).status).toBe(403);
    expect(writeClient).not.toHaveBeenCalled();
  });

  it("a customer account gets 403 even with an owner claim", async () => {
    expect((await POST(req("owner", "execute", "client"), ctx)).status).toBe(403);
    expect(writeClient).not.toHaveBeenCalled();
  });

  it("owner passes the role gate (then stops at the unconfigured DB)", async () => {
    expect((await POST(req("owner", "execute"), ctx)).status).toBe(503);
    expect(writeClient).toHaveBeenCalledTimes(1);
  });
});
