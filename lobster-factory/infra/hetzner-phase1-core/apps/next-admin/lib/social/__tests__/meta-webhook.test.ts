import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  autoReplyReady,
  getMetaSocialConfig,
  parseMetaWebhookPayload,
  replyToMetaEvent,
  verifyMetaSignature,
} from "../meta-webhook";

afterEach(() => vi.restoreAllMocks());

describe("Meta auto-reply webhook", () => {
  it("accepts Meta's raw-body HMAC signature and rejects a changed body", () => {
    const body = JSON.stringify({ object: "page", entry: [] });
    const signature = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    expect(verifyMetaSignature(body, signature, "app-secret")).toBe(true);
    expect(verifyMetaSignature(`${body} `, signature, "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, "sha1=bad", "app-secret")).toBe(false);
  });

  it("normalises Facebook comments and Instagram direct messages, while ignoring echoes", () => {
    const events = parseMetaWebhookPayload({
      object: "page",
      entry: [{
        id: "page-1",
        changes: [{ field: "feed", value: { item: "comment", comment_id: "c-1", message: "我要報名", from: { id: "person-1" } } }],
        messaging: [{ sender: { id: "person-2" }, recipient: { id: "page-1" }, message: { mid: "m-1", text: "你好" } },
          { sender: { id: "page-1" }, recipient: { id: "person-2" }, message: { mid: "m-echo", text: "回覆", is_echo: true } }],
      }],
    });
    expect(events).toEqual([
      expect.objectContaining({ eventId: "facebook:comment:c-1", kind: "comment", platform: "facebook", text: "我要報名", targetId: "c-1" }),
      expect.objectContaining({ eventId: "facebook:dm:m-1", kind: "dm", platform: "facebook", text: "你好", senderId: "person-2" }),
    ]);
  });

  it("requires both the deployment switch and Meta review switch", () => {
    expect(autoReplyReady({})).toBe(false);
    expect(autoReplyReady({ META_AUTO_REPLY_ENABLED: "true" })).toBe(false);
    expect(autoReplyReady({ META_AUTO_REPLY_ENABLED: "true", META_AUTO_REPLY_REVIEW_APPROVED: "true" })).toBe(true);
  });

  it("fails closed without an account binding and sends replies with the token in Authorization only", async () => {
    expect(() => getMetaSocialConfig({ META_SOCIAL_ACCESS_TOKEN: "token" })).toThrow("META_SOCIAL_ORGANIZATION_ID");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "reply-1" }), { status: 200 }));
    await replyToMetaEvent({
      eventId: "instagram:comment:c-1", kind: "comment", platform: "instagram", channelId: "ig-1", senderId: "person-1", targetId: "c-1", text: "hi",
    }, "歡迎", {
      META_SOCIAL_ACCESS_TOKEN: "secret-token",
      META_SOCIAL_ORGANIZATION_ID: "org-1",
      META_GRAPH_API_VERSION: "v24.0",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v24.0/c-1/replies");
    expect(String(url)).not.toContain("secret-token");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
  });
});
