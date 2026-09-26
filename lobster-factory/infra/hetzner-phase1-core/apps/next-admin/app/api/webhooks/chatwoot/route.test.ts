// T27 (agency-os/reports/decisions/2026-09-26-system-mode-inbound-events.md): a blocking system mode
// pauses the AI and hands the conversation to a human -- no AI call (handleInbound), no credit
// reserved (reserveCsCredit) while paused. Every heavy dependency is a stub; only the gate's wiring
// into this route (placement, idempotency via claimMessage, never-5xx) is under test here. The
// pre-existing safety gates (token/account/claim/silence-rule) are exercised incidentally by every
// test's setup, not individually re-verified (unchanged by this commit).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

const handleInbound = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cs/orchestrator", () => ({ handleInbound }));

const loadCis = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cs/cis", () => ({ loadCis }));

const claimMessage = vi.hoisted(() => vi.fn());
const findOrganizationIdByChatwootAccountId = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cs/db", () => ({ claimMessage, findOrganizationIdByChatwootAccountId }));

const handoffToHuman = vi.hoisted(() => vi.fn(async () => undefined));
const sendPrivateDraft = vi.hoisted(() => vi.fn(async () => undefined));
const sendReply = vi.hoisted(() => vi.fn(async () => undefined));
const verifyWebhookToken = vi.hoisted(() => vi.fn(() => true));
const loadWebhookSecret = vi.hoisted(() => vi.fn(async () => "secret"));
vi.mock("@/lib/cs/chatwoot-client", () => ({
  handoffToHuman,
  sendPrivateDraft,
  sendReply,
  verifyWebhookToken,
  loadWebhookSecret,
}));

const reserveCsCredit = vi.hoisted(() => vi.fn(async () => ({ metered: false, allowed: true })));
vi.mock("@/lib/cs/billing", () => ({ reserveCsCredit }));

const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({ allowed: true, mode: "normal" })),
);
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));

const fakeDb = vi.hoisted(() => ({}));
const getSupabaseWriteClient = vi.hoisted(() => vi.fn((): unknown => fakeDb));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));

const { POST } = await import("./route");

const ORG_ID = "55555555-5555-4555-8555-555555555555";
const CHATWOOT_CONFIG = { accountId: 42, baseUrl: "https://chatwoot.example" };

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    event: "message_created",
    id: 123,
    content: "Hello",
    message_type: "incoming",
    sender: { type: "contact" },
    account: { id: 42 },
    conversation: { id: 999, status: "pending", contact_inbox: { source_id: "c1" } },
    ...overrides,
  };
}
const post = (payload: Record<string, unknown>, token = "good-token") =>
  POST(new Request(`http://x/api/webhooks/chatwoot?token=${token}`, { method: "POST", body: JSON.stringify(payload) }));

const DEFAULT_DECISION = { action: "auto_sent" as const, replyText: "hi there", retrievedChunkIds: [], toolCalls: [], traceMeta: {} };

beforeEach(() => {
  handleInbound.mockReset();
  handleInbound.mockResolvedValue(DEFAULT_DECISION);
  loadCis.mockReset();
  loadCis.mockResolvedValue({ organizationId: ORG_ID, chatwoot: CHATWOOT_CONFIG, csEnabled: true });
  claimMessage.mockReset();
  claimMessage.mockResolvedValue("claimed");
  findOrganizationIdByChatwootAccountId.mockReset();
  findOrganizationIdByChatwootAccountId.mockResolvedValue(ORG_ID);
  handoffToHuman.mockClear();
  handoffToHuman.mockResolvedValue(undefined);
  sendPrivateDraft.mockClear();
  sendPrivateDraft.mockResolvedValue(undefined);
  sendReply.mockClear();
  sendReply.mockResolvedValue(undefined);
  verifyWebhookToken.mockClear();
  verifyWebhookToken.mockReturnValue(true);
  loadWebhookSecret.mockClear();
  loadWebhookSecret.mockResolvedValue("secret");
  reserveCsCredit.mockReset();
  reserveCsCredit.mockResolvedValue({ metered: false, allowed: true });
  checkProductionChangeAllowed.mockClear();
  checkProductionChangeAllowed.mockResolvedValue({ allowed: true, mode: "normal" });
  getSupabaseWriteClient.mockClear();
  getSupabaseWriteClient.mockReturnValue(fakeDb);
});

describe("POST /api/webhooks/chatwoot -- system-mode gate (T27)", () => {
  it("allowed: unchanged -- handleInbound runs, credit reserved, reply sent", async () => {
    const res = await post(makePayload());
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, action: "auto_sent", sent: true });
    expect(reserveCsCredit).toHaveBeenCalledTimes(1);
    expect(handleInbound).toHaveBeenCalledTimes(1);
    expect(sendReply).toHaveBeenCalledTimes(1);
    expect(sendPrivateDraft).not.toHaveBeenCalled();
    expect(handoffToHuman).not.toHaveBeenCalled();
  });

  it("blocked: no handleInbound, no credit reserved, one private note + handoff, 2xx", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    const res = await post(makePayload());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, action: "handoff", reason: "system_mode_blocked", mode: "emergency_stop" });
    expect(handleInbound).not.toHaveBeenCalled();
    expect(reserveCsCredit).not.toHaveBeenCalled();
    expect(sendPrivateDraft).toHaveBeenCalledTimes(1);
    expect(sendPrivateDraft).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", expect.stringContaining("emergency_stop"));
    expect(handoffToHuman).toHaveBeenCalledTimes(1);
    expect(handoffToHuman).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999");
  });

  it("blocked: the note is sent BEFORE the handoff (agent sees why when the conversation opens)", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "maintenance" });
    await post(makePayload());
    const noteOrder = sendPrivateDraft.mock.invocationCallOrder[0];
    const handoffOrder = handoffToHuman.mock.invocationCallOrder[0];
    expect(noteOrder).toBeLessThan(handoffOrder);
  });

  it("unreadable mode (gate says unavailable) is treated as blocked", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "unavailable", reason: "supabase_not_configured" });
    const res = await post(makePayload());
    expect(await res.json()).toMatchObject({ ok: true, action: "handoff", mode: "unavailable" });
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it("blocked but the note AND handoff both fail: still 2xx (never 5xx -- the claim already committed)", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "read_only" });
    sendPrivateDraft.mockRejectedValueOnce(new Error("chatwoot_api_500"));
    handoffToHuman.mockRejectedValueOnce(new Error("chatwoot_api_500"));
    const res = await post(makePayload());
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("blocked with no Chatwoot config yet: no API calls attempted, still answers handoff", async () => {
    loadCis.mockResolvedValue({ organizationId: ORG_ID, csEnabled: true }); // no .chatwoot
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    const res = await post(makePayload());
    expect(res.status).toBe(200);
    expect(sendPrivateDraft).not.toHaveBeenCalled();
    expect(handoffToHuman).not.toHaveBeenCalled();
  });

  it("gates on the resolved organizationId", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    await post(makePayload());
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(fakeDb, ORG_ID);
  });

  it("duplicate delivery (Chatwoot retry of the SAME message): claimMessage dedupes, gate runs at most once, one note total", async () => {
    checkProductionChangeAllowed.mockResolvedValue({ allowed: false, mode: "emergency_stop" });
    claimMessage.mockResolvedValueOnce("claimed"); // first delivery
    const first = await post(makePayload());
    expect(await first.json()).toMatchObject({ action: "handoff" });
    expect(sendPrivateDraft).toHaveBeenCalledTimes(1);

    claimMessage.mockResolvedValueOnce("duplicate"); // retry of the same message id
    const second = await post(makePayload());
    expect(await second.json()).toEqual({ ok: true, deduped: true });
    expect(sendPrivateDraft).toHaveBeenCalledTimes(1); // still 1 -- the retry never reached the gate
    expect(checkProductionChangeAllowed).toHaveBeenCalledTimes(1); // gate itself only ran once
  });
});
