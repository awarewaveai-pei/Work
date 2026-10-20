import { beforeEach, describe, expect, it, vi } from "vitest";

const getSecret = vi.hoisted(() => vi.fn(async (name: string) => name.endsWith(":user_token") ? "user-token" : null));
vi.mock("@/lib/secret-vault", () => ({ getSecret }));
import { verifyWebhookToken } from "@/lib/cs/chatwoot-client";
import { getInboxUnreadCount } from "@/lib/cs/chatwoot-client";

beforeEach(() => {
  vi.unstubAllGlobals();
  getSecret.mockReset();
  getSecret.mockImplementation(async (name: string) => name.endsWith(":user_token") ? "user-token" : null);
});

// Replaces the original HMAC-signature test suite (2026-09-11) — that scheme checked
// X-Chatwoot-Signature/X-Chatwoot-Timestamp headers Chatwoot's inbox-webhook/AgentBot delivery path
// never actually sends (confirmed by reading the deployed Chatwoot image's own
// Webhooks::Trigger#perform_request, and by every real delivery 401'ing once this went live). The
// real auth mechanism is a shared token in the webhook URL's query string.
describe("verifyWebhookToken", () => {
  const token = "1wddWu78HQJnRUBGzk837aWk";

  it("accepts a matching token", () => {
    expect(verifyWebhookToken(token, token)).toBe(true);
  });

  it("rejects a wrong token", () => {
    expect(verifyWebhookToken("wrong-token-value", token)).toBe(false);
  });

  it("rejects when the provided token is null (query param absent)", () => {
    expect(verifyWebhookToken(null, token)).toBe(false);
  });

  it("rejects when no expected token is configured for the org", () => {
    expect(verifyWebhookToken(token, undefined)).toBe(false);
  });

  it("never throws on a garbage token of different length", () => {
    expect(() => verifyWebhookToken("short", token)).not.toThrow();
    expect(verifyWebhookToken("short", token)).toBe(false);
  });
});

describe("getInboxUnreadCount", () => {
  it("sums unread counts across paginated read-only conversation requests", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { meta: { all_count: 3 }, payload: [{ unread_count: 2 }, { unread_count: 0 }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { meta: { all_count: 3 }, payload: [{ unread_count: 3 }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getInboxUnreadCount("org-1", { accountId: 42, baseUrl: "https://chatwoot.example" }, 7)).resolves.toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => (init as RequestInit).method === "GET")).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain("inbox_id=7");
    expect(String(fetchMock.mock.calls[0][0])).toContain("status=all");
  });

  it("fails closed when no vault token is available", async () => {
    getSecret.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getInboxUnreadCount("org-1", { accountId: 42, baseUrl: "https://chatwoot.example" }, 7)).rejects.toThrow("chatwoot_api_token_missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
