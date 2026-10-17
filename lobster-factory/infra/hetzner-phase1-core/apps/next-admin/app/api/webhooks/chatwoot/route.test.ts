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
type HoldingClaim = { kind: "claimed"; claimId: string } | { kind: "recent" } | { kind: "error"; error: unknown };
const claimCrisisHolding = vi.hoisted(() => vi.fn(async (..._args: unknown[]): Promise<HoldingClaim> => ({ kind: "claimed", claimId: "claim-1" })));
const releaseCrisisHolding = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => true));
const confirmCrisisHolding = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => true));
vi.mock("@/lib/cs/db", () => ({
  claimCrisisHolding,
  claimMessage,
  completeClaim,
  confirmCrisisHolding,
  findOrganizationIdByChatwootAccountId,
  recordReply,
  releaseCrisisHolding,
}));

const handoffToHuman = vi.hoisted(() => vi.fn(async () => undefined));
const sendPrivateDraft = vi.hoisted(() => vi.fn(async () => undefined));
const sendReply = vi.hoisted(() => vi.fn(async (..._args: unknown[]): Promise<void> => undefined));
const updateContactName = vi.hoisted(() => vi.fn(async () => undefined));
const getContactName = vi.hoisted(() => vi.fn(async (): Promise<string | undefined> => "John Doe"));
type Msg = { id: number; messageType: number; private: boolean; content: string };
const listMessages = vi.hoisted(() => vi.fn(async (..._args: unknown[]): Promise<Msg[]> => []));
const verifyWebhookToken = vi.hoisted(() => vi.fn(() => true));
const loadWebhookSecret = vi.hoisted(() => vi.fn(async () => "secret"));
vi.mock("@/lib/cs/chatwoot-client", () => ({
  handoffToHuman,
  sendPrivateDraft,
  sendReply,
  updateContactName,
  getContactName,
  listMessages,
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

const sendText = vi.hoisted(() => vi.fn(async (_text: string) => ({ kind: "sent" as const })));
vi.mock("@/lib/ops-inbox/notify/telegram", () => ({ buildOperatorTelegramNotifier: () => ({ sendText }) }));

const { POST } = await import("./route");
const { handoffAckText } = await import("@/lib/cs/handoff-ack");

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
  claimCrisisHolding.mockReset();
  claimCrisisHolding.mockResolvedValue({ kind: "claimed", claimId: "claim-1" });
  releaseCrisisHolding.mockClear();
  confirmCrisisHolding.mockClear();
  handoffToHuman.mockClear();
  handoffToHuman.mockResolvedValue(undefined);
  sendPrivateDraft.mockClear();
  sendPrivateDraft.mockResolvedValue(undefined);
  sendReply.mockClear();
  sendReply.mockResolvedValue(undefined);
  updateContactName.mockClear();
  updateContactName.mockResolvedValue(undefined);
  getContactName.mockClear();
  getContactName.mockResolvedValue("John Doe");
  listMessages.mockReset();
  listMessages.mockResolvedValue([]);
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

describe("POST /api/webhooks/chatwoot -- handoff acknowledgement + name question", () => {
  const HANDOFF = { ...DEFAULT_DECISION, action: "handoff" as const, replyText: undefined };
  const JOHN = { type: "contact", id: 77, name: "John Doe" };
  const QUESTION = "已收到您的訊息，我們會盡快回覆您 🙏\n請問怎麼稱呼您呢？";

  it("handoff, placeholder name: after the handoff, one message carrying the name question", async () => {
    handleInbound.mockResolvedValueOnce(HANDOFF);
    await post(makePayload({ sender: JOHN }));
    await runAfter();
    expect(listMessages).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", { after: 123 });
    expect(sendReply).toHaveBeenCalledTimes(1);
    expect(sendReply).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", QUESTION);
    expect(handoffToHuman.mock.invocationCallOrder[0]).toBeLessThan(sendReply.mock.invocationCallOrder[0]);
    expect(completeClaim).toHaveBeenCalledWith(CLAIM);
  });

  it("handoff, real name: acknowledgement only", async () => {
    handleInbound.mockResolvedValueOnce(HANDOFF);
    await post(makePayload({ sender: { type: "contact", id: 77, name: "林小美" } }));
    await runAfter();
    expect(sendReply.mock.calls[0][3]).not.toContain("稱呼");
  });

  it("a public reply already followed this message (another pipeline acknowledged): not sent twice", async () => {
    handleInbound.mockResolvedValueOnce(HANDOFF);
    listMessages.mockResolvedValueOnce([{ id: 130, messageType: 1, private: false, content: QUESTION }]);
    await post(makePayload({ sender: JOHN }));
    await runAfter();
    expect(sendReply).not.toHaveBeenCalled();
    expect(completeClaim).toHaveBeenCalledWith(CLAIM);
  });

  it("a public template already followed this message: not acknowledged again", async () => {
    handleInbound.mockResolvedValueOnce(HANDOFF);
    listMessages.mockResolvedValueOnce([{ id: 130, messageType: 3, private: false, content: "template" }]);
    await post(makePayload({ sender: JOHN }));
    await runAfter();
    expect(sendReply).not.toHaveBeenCalled();
  });

  it("the dedupe read fails (bot token refused on GET): the acknowledgement is still sent", async () => {
    handleInbound.mockResolvedValueOnce(HANDOFF);
    listMessages.mockRejectedValueOnce(new Error("chatwoot_api_401"));
    await post(makePayload({ sender: JOHN }));
    await runAfter();
    expect(sendReply).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", QUESTION);
    expect(completeClaim).toHaveBeenCalledWith(CLAIM);
  });

  it("draft: the private draft before it does not suppress the acknowledgement", async () => {
    handleInbound.mockResolvedValueOnce({ ...DEFAULT_DECISION, action: "draft", replyText: "draft text" });
    listMessages.mockResolvedValueOnce([{ id: 130, messageType: 1, private: true, content: "draft text" }]);
    await post(makePayload({ sender: JOHN }));
    await runAfter();
    expect(sendReply).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", QUESTION);
  });

  it("credit-exhausted handoff acknowledges too", async () => {
    reserveCsCredit.mockResolvedValueOnce({ metered: true, allowed: false });
    await post(makePayload({ sender: JOHN }));
    await runAfter();
    expect(sendReply).toHaveBeenCalledTimes(1);
  });

  it("system mode blocked: no acknowledgement (T27: no automatic reply)", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    await post(makePayload({ sender: JOHN }));
    await runAfter();
    expect(handoffToHuman).toHaveBeenCalledTimes(1);
    expect(sendReply).not.toHaveBeenCalled();
  });

  it("acknowledgement fails: reported, the handoff still completes the claim", async () => {
    handleInbound.mockResolvedValueOnce(HANDOFF);
    sendReply.mockRejectedValueOnce(new Error("chatwoot_api_500"));
    await post(makePayload({ sender: JOHN }));
    await runAfter();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(completeClaim).toHaveBeenCalledWith(CLAIM);
  });

  const answer = (content: string, sender: Record<string, unknown> = JOHN) =>
    makePayload({ id: 510, content, sender, conversation: { id: 999, status: "open", contact_inbox: { source_id: "c1" } } });
  const asked = (...extra: Msg[]) => listMessages.mockResolvedValueOnce([
    { id: 500, messageType: 0, private: false, content: "課程問題" },
    { id: 501, messageType: 1, private: false, content: QUESTION },
    ...extra,
  ]);

  it("reply right after the question: name written, no claim, no AI", async () => {
    asked({ id: 502, messageType: 2, private: false, content: "Conversation was marked open" });
    expect(await (await post(answer("我叫小美"))).json()).toMatchObject({ ignored: true, reason: "human_owns_thread" });
    await runAfter();
    expect(listMessages).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", { before: 510 });
    expect(getContactName).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, 77);
    expect(updateContactName).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, 77, "小美");
    expect(claimMessage).not.toHaveBeenCalled();
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it("a private note after the question does not count as someone speaking", async () => {
    asked({ id: 505, messageType: 1, private: true, content: "內部備註" });
    await post(answer("小美"));
    await runAfter();
    expect(updateContactName).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, 77, "小美");
  });

  it.each([
    ["an agent spoke after the question", { id: 505, messageType: 1, private: false, content: "請問您想問哪一堂課？" }],
    ["a public template after the question", { id: 505, messageType: 3, private: false, content: "template" }],
    ["the customer already replied once", { id: 505, messageType: 0, private: false, content: "等一下" }],
  ])("%s: name untouched", async (_label, extra) => {
    asked(extra as Msg);
    await post(answer("小美"));
    await runAfter();
    expect(updateContactName).not.toHaveBeenCalled();
  });

  it("the previous message is a different outgoing text (not our question): name untouched", async () => {
    listMessages.mockResolvedValueOnce([{ id: 501, messageType: 1, private: false, content: "已收到您的訊息，我們會盡快回覆您 🙏" }]);
    await post(answer("小美"));
    await runAfter();
    expect(updateContactName).not.toHaveBeenCalled();
  });

  it("a reply that is not a name: no Chatwoot calls at all", async () => {
    await post(answer("請問課程什麼時候開始？"));
    await runAfter();
    expect(listMessages).not.toHaveBeenCalled();
    expect(updateContactName).not.toHaveBeenCalled();
  });

  it("an agent renamed the contact after the webhook was sent: the real name is never overwritten", async () => {
    asked();
    getContactName.mockResolvedValueOnce("林小美");
    await post(answer("小美"));
    await runAfter();
    expect(updateContactName).not.toHaveBeenCalled();
  });

  it("bot token refused on GET: name capture stops without raising", async () => {
    listMessages.mockRejectedValueOnce(new Error("chatwoot_api_401"));
    await post(answer("小美"));
    await runAfter();
    expect(captureException).not.toHaveBeenCalled();
    expect(updateContactName).not.toHaveBeenCalled();
  });

  it("contact already has a real name: nothing queued", async () => {
    await post(answer("小美", { type: "contact", id: 77, name: "林小美" }));
    expect(afterQueue).toHaveLength(0);
  });

  it("system mode blocked: no contact write", async () => {
    asked();
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "read_only" });
    await post(answer("小美"));
    await runAfter();
    expect(updateContactName).not.toHaveBeenCalled();
  });
});

// Operator decision 2026-10-16: a crisis message gets the help lines, still asks the name, and pages
// the operator on Telegram (first, before any Chatwoot call) without the customer's words.
describe("POST /api/webhooks/chatwoot -- crisis message", () => {
  const HANDOFF = { ...DEFAULT_DECISION, action: "handoff" as const, replyText: undefined, handoffReason: "crisis" };
  const JOHN = { type: "contact", id: 77, name: "John Doe" };
  const TEXT = "我最近一直想傷害自己";
  const CIS = { organizationId: ORG_ID, chatwoot: CHATWOOT_CONFIG, csEnabled: true };
  beforeEach(() => sendText.mockClear());

  it("handoff: one page with the conversation link and none of the customer's words, then the help-line acknowledgement", async () => {
    handleInbound.mockResolvedValueOnce(HANDOFF);
    await post(makePayload({ content: TEXT, sender: JOHN }));
    await runAfter();
    expect(sendText).toHaveBeenCalledTimes(1);
    const page = sendText.mock.calls[0][0];
    expect(page).toContain("https://chatwoot.example/app/accounts/42/conversations/999");
    expect(page).not.toContain(TEXT);
    expect(sendReply).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", handoffAckText(CIS, true, TEXT));
  });

  it("the handoff fails: the operator was already paged", async () => {
    handleInbound.mockResolvedValueOnce(HANDOFF);
    handoffToHuman.mockRejectedValueOnce(new Error("chatwoot down"));
    await post(makePayload({ content: TEXT, sender: JOHN }));
    await runAfter();
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it("the tenant config cannot be read: still one page, without the link", async () => {
    handleInbound.mockResolvedValueOnce(HANDOFF);
    loadCis.mockRejectedValue(new Error("db down"));
    await post(makePayload({ content: TEXT, sender: JOHN }));
    await runAfter();
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0]).toContain("#999");
  });

  it("a template after the message does not stand in for the help lines", async () => {
    handleInbound.mockResolvedValueOnce(HANDOFF);
    listMessages.mockResolvedValueOnce([{ id: 130, messageType: 3, private: false, content: "template" }]);
    await post(makePayload({ content: TEXT, sender: JOHN }));
    await runAfter();
    expect(sendReply).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", handoffAckText(CIS, true, TEXT));
  });

  describe("a human already owns the thread", () => {
    const MEI = { type: "contact", id: 77, name: "林小美" };
    const owned = (content: string, sender: Record<string, unknown> = MEI) => makePayload({ content, sender, conversation: { id: 999, status: "open" } });
    // The operator-approved wording (WORKLOG 2026-10-17 續3), pinned so it cannot drift.
    const HOLDING_ZH = [
      "系統已收到您的訊息，工作人員會親自回覆您。",
      "如果您現在有立即的危險，請馬上撥打緊急電話：台灣 119、澳洲 000。",
      "24 小時求助專線：台灣 1925 安心專線、1995 生命線；澳洲 Lifeline 13 11 14。",
    ].join("\n");

    it("one page first, then the help lines once; no AI, no credit, no claim of the message", async () => {
      expect(await (await post(owned(TEXT))).json()).toMatchObject({ ignored: true, reason: "human_owns_thread" });
      await runAfter();
      expect(sendText).toHaveBeenCalledTimes(1);
      expect(claimCrisisHolding).toHaveBeenCalledWith(ORG_ID, "999", "self_harm", 1800, 120);
      expect(sendReply).toHaveBeenCalledTimes(1);
      expect(sendReply).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", HOLDING_ZH);
      expect(sendText.mock.invocationCallOrder[0]).toBeLessThan(sendReply.mock.invocationCallOrder[0]);
      expect(confirmCrisisHolding).toHaveBeenCalledWith(ORG_ID, "999", "self_harm", "claim-1");
      expect(sendReply.mock.invocationCallOrder[0]).toBeLessThan(confirmCrisisHolding.mock.invocationCallOrder[0]);
      expect(sendReply.mock.calls[0][3]).not.toContain("看到");
      expect(handleInbound).not.toHaveBeenCalled();
      expect(reserveCsCredit).not.toHaveBeenCalled();
      expect(claimMessage).not.toHaveBeenCalled();
    });

    it("inside the window (already sent): no reply, still one page", async () => {
      claimCrisisHolding.mockResolvedValueOnce({ kind: "recent" });
      await post(owned(TEXT));
      await runAfter();
      expect(sendReply).not.toHaveBeenCalled();
      expect(sendText).toHaveBeenCalledTimes(1);
    });

    it("an English message gets the English help lines", async () => {
      await post(owned("I want to end my life", { type: "contact", id: 77, name: "Mia" }));
      await runAfter();
      expect(sendReply.mock.calls[0][3]).toBe(
        "Your message has been received, and a staff member will reply to you personally.\n" +
          "If you are in immediate danger, please call emergency services now: Taiwan 119, Australia 000.\n" +
          "24-hour support lines: Lifeline 13 11 14 (Australia), 1925 or 1995 (Taiwan).",
      );
    });

    it("the send fails: reported, and the window is given back", async () => {
      sendReply.mockRejectedValueOnce(new Error("chatwoot down"));
      await post(owned(TEXT));
      await runAfter();
      expect(releaseCrisisHolding).toHaveBeenCalledWith(ORG_ID, "999", "self_harm", "claim-1");
      expect(confirmCrisisHolding).not.toHaveBeenCalled();
      expect(captureException).toHaveBeenCalled();
    });

    it("the window cannot be read (DB error): reported, the help lines still go out", async () => {
      claimCrisisHolding.mockResolvedValueOnce({ kind: "error", error: new Error("db down") });
      await post(owned(TEXT));
      await runAfter();
      expect(sendReply).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", HOLDING_ZH);
      expect(captureException).toHaveBeenCalled();
    });

    it("system mode blocked: no reply and no window used (T27), still one page", async () => {
      checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "maintenance" });
      await post(owned(TEXT));
      await runAfter();
      expect(claimCrisisHolding).not.toHaveBeenCalled();
      expect(sendReply).not.toHaveBeenCalled();
      expect(sendText).toHaveBeenCalledTimes(1);
    });

    it("an ordinary message, or an agent writing the words: nothing", async () => {
      await post(owned("請問下週有課嗎"));
      await post(owned(TEXT, { type: "user", id: 5, name: "Agent" }));
      await runAfter();
      expect(claimCrisisHolding).not.toHaveBeenCalled();
      expect(sendReply).not.toHaveBeenCalled();
      expect(sendText).not.toHaveBeenCalled();
    });
  });

  it("the name reply after the crisis acknowledgement is captured", async () => {
    listMessages.mockResolvedValueOnce([{ id: 501, messageType: 1, private: false, content: handoffAckText(CIS, true, TEXT) }]);
    await post(makePayload({ id: 510, content: "小美", sender: JOHN, conversation: { id: 999, status: "open" } }));
    await runAfter();
    expect(updateContactName).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, 77, "小美");
  });

  it("no keyword, but the classifier said crisis: one page and the help-line acknowledgement", async () => {
    const quiet = "我覺得自己好像沒有存在的必要了";
    handleInbound.mockResolvedValueOnce(HANDOFF);
    await post(makePayload({ content: quiet, sender: JOHN }));
    await runAfter();
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.invocationCallOrder[0]).toBeLessThan(handoffToHuman.mock.invocationCallOrder[0]);
    expect(sendReply).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", handoffAckText(CIS, true, quiet, true));
  });

  it("an ordinary handoff pages nobody", async () => {
    handleInbound.mockResolvedValueOnce({ ...HANDOFF, handoffReason: "knowledge_gap" });
    await post(makePayload({ content: "想報名課程", sender: JOHN }));
    await runAfter();
    expect(sendText).not.toHaveBeenCalled();
  });
});

// Operator decisions 2026-10-17: a threat to hurt others pages the operator at once, also while a
// human owns the conversation, and the customer gets the approved sentence (once per window there).
describe("POST /api/webhooks/chatwoot -- threat to hurt others", () => {
  const JOHN = { type: "contact", id: 77, name: "John Doe" };
  const TEXT = "我要殺光所有的人";
  // The operator-approved wording (WORKLOG 2026-10-17 續13), pinned so it cannot drift.
  const REPLY_ZH = "系統已收到您的訊息。工作人員會親自回覆您。如果有人現在有立即危險，請撥打台灣119或澳洲000。";
  beforeEach(() => sendText.mockClear());

  it("a human owns the thread: one threat page first, then the approved reply in the threat window; no AI", async () => {
    await post(makePayload({ content: TEXT, sender: JOHN, conversation: { id: 999, status: "open" } }));
    await runAfter();
    expect(sendText).toHaveBeenCalledTimes(1);
    const page = sendText.mock.calls[0][0];
    expect(page).toContain("要傷害別人");
    expect(page).toContain("https://chatwoot.example/app/accounts/42/conversations/999");
    expect(page).not.toContain(TEXT);
    expect(claimCrisisHolding).toHaveBeenCalledWith(ORG_ID, "999", "threat", 1800, 120);
    expect(sendReply).toHaveBeenCalledTimes(1);
    expect(sendReply).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", REPLY_ZH);
    expect(sendText.mock.invocationCallOrder[0]).toBeLessThan(sendReply.mock.invocationCallOrder[0]);
    expect(confirmCrisisHolding).toHaveBeenCalledWith(ORG_ID, "999", "threat", "claim-1");
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it("a human owns the thread, threat window already used: no reply, still one page", async () => {
    claimCrisisHolding.mockResolvedValueOnce({ kind: "recent" });
    await post(makePayload({ content: TEXT, sender: JOHN, conversation: { id: 999, status: "open" } }));
    await runAfter();
    expect(sendReply).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it("the bot owns the thread: one threat page before the handoff, then the approved reply instead of the ordinary one, no name question", async () => {
    handleInbound.mockResolvedValueOnce({ ...DEFAULT_DECISION, action: "handoff" as const, replyText: undefined, handoffReason: "threat" });
    await post(makePayload({ content: TEXT, sender: JOHN }));
    await runAfter();
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0]).toContain("要傷害別人");
    expect(sendText.mock.invocationCallOrder[0]).toBeLessThan(handoffToHuman.mock.invocationCallOrder[0]);
    expect(sendReply).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", REPLY_ZH);
  });

  it("no keyword, but the classifier said threat: one threat page", async () => {
    handleInbound.mockResolvedValueOnce({ ...DEFAULT_DECISION, action: "handoff" as const, replyText: undefined, handoffReason: "threat" });
    await post(makePayload({ content: "你們等著瞧，我會讓你們後悔", sender: JOHN }));
    await runAfter();
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0]).toContain("要傷害別人");
    expect(sendReply).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", REPLY_ZH);
  });

  it("self-harm and a threat in one message: two pages, and only the help lines (self-harm window) while a human owns it", async () => {
    await post(makePayload({ content: "我要殺光所有的人然後自殺", sender: JOHN, conversation: { id: 999, status: "open" } }));
    await runAfter();
    expect(sendText).toHaveBeenCalledTimes(2);
    expect(sendText.mock.calls.map((c) => c[0]).join("\n")).toContain("自傷或自殺");
    expect(sendText.mock.calls.map((c) => c[0]).join("\n")).toContain("要傷害別人");
    expect(claimCrisisHolding).toHaveBeenCalledTimes(1);
    expect(claimCrisisHolding).toHaveBeenCalledWith(ORG_ID, "999", "self_harm", 1800, 120);
  });
});

describe("POST /api/webhooks/chatwoot -- free FAQ answers (no AI, no credit)", () => {
  const FAQ = [{ id: "courses", keywords: ["課程"], answer: "我們有四個療癒模組" }];
  const withFaq = () => loadCis.mockResolvedValue({ organizationId: ORG_ID, chatwoot: CHATWOOT_CONFIG, csEnabled: false, csFaq: FAQ });

  it("a matching message gets the written answer; no credit, no AI, no handoff", async () => {
    withFaq();
    await post(makePayload({ content: "請問有哪些課程？" }));
    await runAfter();
    expect(sendReply).toHaveBeenCalledWith(ORG_ID, CHATWOOT_CONFIG, "999", "我們有四個療癒模組");
    expect(recordReply).toHaveBeenCalledWith({ ...CLAIM, action: "auto_sent", intentKey: "faq:courses", retrievedChunkIds: [] });
    expect(completeClaim).toHaveBeenCalledWith(CLAIM);
    expect(reserveCsCredit).not.toHaveBeenCalled();
    expect(handleInbound).not.toHaveBeenCalled();
    expect(handoffToHuman).not.toHaveBeenCalled();
  });

  it("an entry marked handoff answers and then hands over", async () => {
    loadCis.mockResolvedValue({ organizationId: ORG_ID, chatwoot: CHATWOOT_CONFIG, csEnabled: false, csFaq: [{ ...FAQ[0], handoff: true }] });
    await post(makePayload({ content: "請問有哪些課程？" }));
    await runAfter();
    expect(sendReply.mock.invocationCallOrder[0]).toBeLessThan(handoffToHuman.mock.invocationCallOrder[0]);
    expect(recordReply).toHaveBeenCalledWith({ ...CLAIM, action: "handoff", intentKey: "faq:courses", retrievedChunkIds: [] });
    expect(handleInbound).not.toHaveBeenCalled();
    expect(completeClaim).toHaveBeenCalledWith(CLAIM);
  });

  it("no match: the normal path runs (here AI off -> handoff)", async () => {
    withFaq();
    handleInbound.mockResolvedValueOnce({ ...DEFAULT_DECISION, action: "handoff", replyText: undefined });
    await post(makePayload({ content: "你好" }));
    await runAfter();
    expect(reserveCsCredit).toHaveBeenCalledTimes(1);
    expect(handleInbound).toHaveBeenCalledTimes(1);
    expect(handoffToHuman).toHaveBeenCalledTimes(1);
  });

  it("system mode blocked: no automatic answer (T27)", async () => {
    withFaq();
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop" });
    await post(makePayload({ content: "請問有哪些課程？" }));
    await runAfter();
    expect(sendReply).not.toHaveBeenCalled();
    expect(handoffToHuman).toHaveBeenCalledTimes(1);
  });

  it("the answer could not be sent: reported, claim left for the sweep", async () => {
    withFaq();
    sendReply.mockRejectedValueOnce(new Error("chatwoot_api_500"));
    await post(makePayload({ content: "請問有哪些課程？" }));
    await runAfter();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(completeClaim).not.toHaveBeenCalled();
  });
});
