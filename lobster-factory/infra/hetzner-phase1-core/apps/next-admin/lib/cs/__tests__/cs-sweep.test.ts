// lib/cs/sweep.ts: a claim the webhook pipeline never finished is handed to a human exactly once,
// closed only after the handoff went through, and the AI is never re-run.
import { beforeEach, describe, expect, it, vi } from "vitest";

const listUnfinishedClaims = vi.hoisted(() => vi.fn());
const completeClaim = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/cs/db", () => ({ listUnfinishedClaims, completeClaim }));

const loadCis = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cs/cis", () => ({ loadCis }));

const handoffToHuman = vi.hoisted(() => vi.fn(async () => undefined));
const sendPrivateDraft = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/cs/chatwoot-client", () => ({ handoffToHuman, sendPrivateDraft }));

const handleInbound = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cs/orchestrator", () => ({ handleInbound }));

const { sweepUnfinishedClaims, CS_SWEEP_STALE_MS } = await import("../sweep");

const ORG = "55555555-5555-4555-8555-555555555555";
const CONFIG = { accountId: 2, baseUrl: "https://chatwoot.example" };
const CLAIM = { organizationId: ORG, conversationId: "6", messageId: "77" };

beforeEach(() => {
  vi.clearAllMocks();
  listUnfinishedClaims.mockResolvedValue([CLAIM]);
  completeClaim.mockResolvedValue(true);
  loadCis.mockResolvedValue({ organizationId: ORG, chatwoot: CONFIG });
});

describe("sweepUnfinishedClaims", () => {
  it("asks only for claims older than the stale window", async () => {
    listUnfinishedClaims.mockResolvedValue([]);
    expect(await sweepUnfinishedClaims()).toEqual({ handedOff: 0, failed: 0 });
    expect(listUnfinishedClaims).toHaveBeenCalledWith(CS_SWEEP_STALE_MS);
  });

  it("handoff, then note, then close -- and never re-runs the AI", async () => {
    expect(await sweepUnfinishedClaims()).toEqual({ handedOff: 1, failed: 0 });
    expect(handoffToHuman).toHaveBeenCalledWith(ORG, CONFIG, "6");
    expect(sendPrivateDraft).toHaveBeenCalledWith(ORG, CONFIG, "6", expect.any(String));
    expect(handoffToHuman.mock.invocationCallOrder[0]).toBeLessThan(sendPrivateDraft.mock.invocationCallOrder[0]);
    expect(sendPrivateDraft.mock.invocationCallOrder[0]).toBeLessThan(completeClaim.mock.invocationCallOrder[0]);
    expect(completeClaim).toHaveBeenCalledWith(CLAIM);
    expect(handleInbound).not.toHaveBeenCalled();
  });

  it("handoff fails: no note, claim stays open for the next tick", async () => {
    handoffToHuman.mockRejectedValueOnce(new Error("chatwoot_api_500"));
    expect(await sweepUnfinishedClaims()).toEqual({ handedOff: 0, failed: 1 });
    expect(sendPrivateDraft).not.toHaveBeenCalled();
    expect(completeClaim).not.toHaveBeenCalled();
  });

  it("note fails: claim stays open; the retry repeats only the idempotent handoff before the note", async () => {
    sendPrivateDraft.mockRejectedValueOnce(new Error("chatwoot_api_500"));
    expect(await sweepUnfinishedClaims()).toEqual({ handedOff: 0, failed: 1 });
    expect(completeClaim).not.toHaveBeenCalled();
    expect(await sweepUnfinishedClaims()).toEqual({ handedOff: 1, failed: 0 });
    expect(sendPrivateDraft).toHaveBeenCalledTimes(2); // first attempt failed, so one note posted in total
  });

  it("claim list unreadable: throws instead of reporting nothing to do", async () => {
    listUnfinishedClaims.mockRejectedValueOnce(new Error("cs_unfinished_claims: column does not exist"));
    await expect(sweepUnfinishedClaims()).rejects.toThrow(/cs_unfinished_claims/);
  });

  it("completion write fails after the handoff: counted as failed, not as already closed", async () => {
    completeClaim.mockRejectedValueOnce(new Error("cs_complete_claim: db down"));
    expect(await sweepUnfinishedClaims()).toEqual({ handedOff: 0, failed: 1 });
  });

  it("pipeline finished in the meantime: close finds nothing, not counted", async () => {
    completeClaim.mockResolvedValueOnce(false);
    expect(await sweepUnfinishedClaims()).toEqual({ handedOff: 0, failed: 0 });
  });

  it("no Chatwoot config: nothing to call, claim still closed", async () => {
    loadCis.mockResolvedValue({ organizationId: ORG });
    expect(await sweepUnfinishedClaims()).toEqual({ handedOff: 1, failed: 0 });
    expect(handoffToHuman).not.toHaveBeenCalled();
  });
});
