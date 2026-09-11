import { describe, expect, it } from "vitest";
import { verifyWebhookToken } from "@/lib/cs/chatwoot-client";

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
