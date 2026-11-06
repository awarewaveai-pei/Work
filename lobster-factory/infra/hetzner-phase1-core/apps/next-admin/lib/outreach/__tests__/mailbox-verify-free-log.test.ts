// Each verifier response spends a free quota, so each is recorded (logFreeCall) on the calling organization; a transport error
// before any response is not, and neither the email nor the key is written.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));
vi.mock("@/lib/ai/log-ai-call", () => ({ logFreeCall: async (a: Record<string, unknown>) => { m.calls.push(a); } }));

import { findMailbox, verifyMailbox } from "../mailbox-verify";

beforeEach(() => { m.calls = []; });
const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("verifier calls are recorded", () => {
  it("a successful verify logs once, with the calling org and no secrets", async () => {
    await verifyMailbox("a@b.co", { provider: "reoon", apiKey: "SECRET", billOrg: "org-1" }, reply(200, { status: "safe" }));
    expect(m.calls).toEqual([{ route: "outreach/verify-email", vendor: "Reoon", model: "reoon.verify", organizationId: "org-1", tool: "outreach", metadata: { status: 200 } }]);
    expect(JSON.stringify(m.calls)).not.toMatch(/SECRET|a@b\.co/);
  });
  it("an HTTP error is a response too; a key with no billOrg logs the agency (null)", async () => {
    await expect(verifyMailbox("a@b.co", { provider: "zerobounce", apiKey: "K" }, reply(402, {}))).rejects.toThrow();
    expect(m.calls).toEqual([expect.objectContaining({ vendor: "ZeroBounce", model: "zerobounce.verify", organizationId: null, metadata: { status: 402 } })]);
  });
  it("a network error before any response logs nothing", async () => {
    await expect(verifyMailbox("a@b.co", { provider: "hunter", apiKey: "K" }, (async () => { throw new Error("down"); }) as unknown as typeof fetch)).rejects.toThrow();
    expect(m.calls).toEqual([]);
  });
  it("the Hunter finder logs hunter.find", async () => {
    await findMailbox("b.co", "a", "b", { provider: "hunter", apiKey: "K", billOrg: "org-2" }, reply(200, { data: { email: "a@b.co" } }));
    expect(m.calls).toEqual([expect.objectContaining({ vendor: "Hunter", model: "hunter.find", organizationId: "org-2" })]);
  });
});
