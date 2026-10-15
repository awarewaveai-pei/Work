// The route answers right after claimMessage and runs the pipeline in after() (Chatwoot v4.18 fails an
// AgentBot call after 5 s and opens the conversation itself). `after` is captured, not run, so each test
// decides when the post-response work happens. T27 (agency-os/reports/decisions/2026-09-26-system-mode-
// inbound-events.md): a blocking system mode pauses the AI and hands the conversation to a human -- no
// AI call, no credit reserved. Every heavy dependency is a stub.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureException, captureMessage: vi.fn() }));

const afterQueue = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => void afterQueue.push(fn),
}));
async function runAfter(): Promise<void> {
  while (afterQueue.length) await afterQueue.shift()!();
}

const handleInbound = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cs/orchestrator", () => ({ handleInbound }));

const loadCis = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cs/cis", () => ({ loadCis }));

const claimMessage = vi.hoisted(() => vi.fn());
const findOrganizationIdByChatwootAccountId = vi.hoisted(() => vi.fn());
const recordReply = vi.hoisted(() => vi.fn(async () => undefined));
const completeClaim = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/cs/db", () => ({ claimMessage, completeClaim, findOrganizationIdByChatwootAccountId, recordReply }));

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
const CLAIM = { organizationId: ORG_ID, conversationId: "999", messageId: "123" };
const HANDOFF_RECORD = { ...CLAIM, action: "handoff", retrievedChunkIds: [] };

beforeEach(() => {
  afterQueue.length = 0;
  captureException.mockClear();
  handleInbound.mockReset();
  handleInbound.mockResolvedValue(DEFAULT_DECISION);
  loadCis.mockReset();
  loadCis.mockResolvedValue({ organizationId: ORG_ID, chatwoot: CHATWOOT_CONFIG, csEnabled: true });
  claimMessage.mockReset();
  claimMessage.mockResolvedValue("claimed");
  findOrganizationIdByChatwootAccountId.mockReset();
  findOrganizationIdByChatwootAccountId.mockResolvedValue(ORG_ID);
  recordReply.mockClear();
  completeClaim.mockClear();
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
afterEach(() => {
  expect(afterQueue).toHaveLength(0); // every test drains its post-response work
});

describe("POST /api/webhooks/chatwoot -- answer first, pipeline after", () => {
  it("answers 200 after the claim, before any pipeline work runs", async () => {
    const res = await post(makePayload());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, accepted: true });
    expect(claimMessage).toHaveBeenCalledTimes(1);
    expect(loadCis).not.toHaveBeenCalled();
    expect(handleInbound).not.toHaveBeenCalled();
    await runAfter();
    expect(handleInbound).toHaveBeenCalledTimes(1);
    expect(sendReply).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", "hi there");
    expect(completeClaim).toHaveBeenCalledWith(CLAIM);
    expect(sendReply.mock.invocationCallOrder[0]).toBeLessThan(completeClaim.mock.invocationCallOrder[0]);
  });

  it("duplicate delivery: no post-response work queued", async () => {
    claimMessage.mockResolvedValueOnce("duplicate");
    expect(await (await post(makePayload())).json()).toEqual({ ok: true, deduped: true });
    expect(afterQueue).toHaveLength(0);
  });

  it("claim error: 502, nothing queued (Chatwoot opens the conversation on a failed bot call)", async () => {
    claimMessage.mockResolvedValueOnce("error");
    expect((await post(makePayload())).status).toBe(502);
    expect(afterQueue).toHaveLength(0);
  });

  it("a pipeline throw is reported and swallowed -- the claim stays unfinished for the sweep", async () => {
    handleInbound.mockRejectedValueOnce(new Error("boom"));
    await post(makePayload());
    await runAfter();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(sendReply).not.toHaveBeenCalled();
    expect(completeClaim).not.toHaveBeenCalled();
  });

  it("delivery failure: reported, claim left unfinished for the sweep", async () => {
    sendReply.mockRejectedValueOnce(new Error("chatwoot_api_500"));
    await post(makePayload());
    await runAfter();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(completeClaim).not.toHaveBeenCalled();
  });

  it("decision with nothing deliverable (auto_sent, empty text): reported, left for the sweep", async () => {
    handleInbound.mockResolvedValueOnce({ ...DEFAULT_DECISION, replyText: "" });
    await post(makePayload());
    await runAfter();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(completeClaim).not.toHaveBeenCalled();
  });

  it("completion write fails after delivery: reported, not swallowed", async () => {
    completeClaim.mockRejectedValueOnce(new Error("cs_complete_claim: db down"));
    await post(makePayload());
    await runAfter();
    expect(sendReply).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("suppressed: nothing sent, claim completed", async () => {
    handleInbound.mockResolvedValueOnce({ ...DEFAULT_DECISION, action: "suppressed", replyText: undefined });
    await post(makePayload());
    await runAfter();
    expect(sendReply).not.toHaveBeenCalled();
    expect(completeClaim).toHaveBeenCalledWith(CLAIM);
  });

  it("credit exhausted: handoff + the claim is recorded as finished", async () => {
    reserveCsCredit.mockResolvedValueOnce({ metered: true, allowed: false });
    await post(makePayload());
    await runAfter();
    expect(handleInbound).not.toHaveBeenCalled();
    expect(handoffToHuman).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999");
    expect(recordReply).toHaveBeenCalledWith(HANDOFF_RECORD);
    expect(completeClaim).toHaveBeenCalledWith(CLAIM);
  });
});

describe("POST /api/webhooks/chatwoot -- system-mode gate (T27)", () => {
  it("blocked: no handleInbound, no credit reserved, one private note + handoff, finished claim", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    expect((await post(makePayload())).status).toBe(200);
    await runAfter();
    expect(handleInbound).not.toHaveBeenCalled();
    expect(reserveCsCredit).not.toHaveBeenCalled();
    expect(sendPrivateDraft).toHaveBeenCalledTimes(1);
    expect(sendPrivateDraft).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", expect.stringContaining("emergency_stop"));
    expect(handoffToHuman).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999");
    expect(recordReply).toHaveBeenCalledWith(HANDOFF_RECORD);
    expect(completeClaim).toHaveBeenCalledWith(CLAIM);
  });

  it("blocked: the note is sent BEFORE the handoff (agent sees why when the conversation opens)", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "maintenance" });
    await post(makePayload());
    await runAfter();
    expect(sendPrivateDraft.mock.invocationCallOrder[0]).toBeLessThan(handoffToHuman.mock.invocationCallOrder[0]);
  });

  it("unreadable mode (gate says unavailable) is treated as blocked", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "unavailable", reason: "supabase_not_configured" });
    await post(makePayload());
    await runAfter();
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it("blocked, note fails: best-effort, the handoff still completes the claim", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "read_only" });
    sendPrivateDraft.mockRejectedValueOnce(new Error("chatwoot_api_500"));
    await post(makePayload());
    await runAfter();
    expect(handoffToHuman).toHaveBeenCalledTimes(1);
    expect(completeClaim).toHaveBeenCalledWith(CLAIM);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("blocked, handoff fails: decision recorded, claim left unfinished for the sweep", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "read_only" });
    handoffToHuman.mockRejectedValueOnce(new Error("chatwoot_api_500"));
    await post(makePayload());
    await runAfter();
    expect(recordReply).toHaveBeenCalledWith(HANDOFF_RECORD);
    expect(completeClaim).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("blocked with no Chatwoot config yet: no API calls attempted", async () => {
    loadCis.mockResolvedValue({ organizationId: ORG_ID, csEnabled: true }); // no .chatwoot
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    await post(makePayload());
    await runAfter();
    expect(sendPrivateDraft).not.toHaveBeenCalled();
    expect(handoffToHuman).not.toHaveBeenCalled();
    expect(completeClaim).toHaveBeenCalledWith(CLAIM);
  });

  it("gates on the resolved organizationId", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    await post(makePayload());
    await runAfter();
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(fakeDb, ORG_ID);
  });
});
