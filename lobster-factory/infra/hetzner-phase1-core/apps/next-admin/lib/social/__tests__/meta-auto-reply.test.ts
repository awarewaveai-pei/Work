import { afterEach, describe, expect, it, vi } from "vitest";

const ports = vi.hoisted(() => ({
  listAutoRules: vi.fn(),
  findPostIdByMetaId: vi.fn(),
  claimAutoRuleEvent: vi.fn(),
  completeAutoRuleEvent: vi.fn(),
  recordAutoRuleHit: vi.fn(),
}));

vi.mock("../store", () => ports);

import { processMetaWebhook } from "../meta-auto-reply";

afterEach(() => vi.clearAllMocks());

describe("C27 Meta auto-reply execution", () => {
  const env = {
    META_AUTO_REPLY_ENABLED: "true",
    META_AUTO_REPLY_REVIEW_APPROVED: "true",
    META_SOCIAL_ACCESS_TOKEN: "secret-token",
    META_SOCIAL_ORGANIZATION_ID: "org-1",
    META_GRAPH_API_VERSION: "v24.0",
  };

  it("replies only after a matching rule and records an atomic hit", async () => {
    ports.listAutoRules.mockResolvedValue([{ id: "rule-1", post_id: null, name: "報名", trigger: "comment", keywords: ["報名"], platforms: ["instagram"], action: "reply", reply: "請私訊我們", active: true, hits: 0 }]);
    ports.claimAutoRuleEvent.mockResolvedValue(true);
    ports.completeAutoRuleEvent.mockResolvedValue(undefined);
    ports.recordAutoRuleHit.mockResolvedValue(1);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "reply-1" }), { status: 200 }));
    const result = await processMetaWebhook({
      object: "instagram",
      entry: [{ id: "ig-1", changes: [{ field: "comments", value: { id: "comment-1", text: "我要報名", from: { id: "person-1" } } }] }],
    }, env);
    expect(result).toMatchObject({ enabled: true, received: 1, matched: 1, replied: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(ports.recordAutoRuleHit).toHaveBeenCalledWith("org-1", "rule-1", "meta:webhook", expect.objectContaining({ event_id: "instagram:comment:comment-1" }));
  });

  it("maps a known Meta media id to the post uuid so its rule wins", async () => {
    ports.listAutoRules.mockImplementation(async (_brand: string, postId?: string) => postId
      ? [{ id: "post-rule", post_id: "post-1", name: "post", trigger: "comment", keywords: ["hello"], platforms: ["instagram"], action: "reply", reply: "post reply", active: true, hits: 0 }]
      : [{ id: "brand-rule", post_id: null, name: "brand", trigger: "comment", keywords: ["hello"], platforms: ["instagram"], action: "reply", reply: "brand reply", active: true, hits: 0 }]);
    ports.findPostIdByMetaId.mockResolvedValue("post-1");
    ports.claimAutoRuleEvent.mockResolvedValue(true);
    ports.completeAutoRuleEvent.mockResolvedValue(undefined);
    ports.recordAutoRuleHit.mockResolvedValue(1);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "reply-1" }), { status: 200 }));
    await processMetaWebhook({ object: "instagram", entry: [{ id: "ig-1", changes: [{ field: "comments", value: { id: "comment-known", media_id: "media-1", text: "hello", from: { id: "person-1" } } }] }] }, env);
    expect(ports.findPostIdByMetaId).toHaveBeenCalledWith("org-1", "instagram", "media-1");
    expect(ports.recordAutoRuleHit).toHaveBeenCalledWith("org-1", "post-rule", "meta:webhook", expect.anything());
  });

  it("does not send a Meta redelivery when the hit audit write fails", async () => {
    ports.listAutoRules.mockResolvedValue([{ id: "rule-1", post_id: null, name: "brand", trigger: "comment", keywords: ["hello"], platforms: ["instagram"], action: "reply", reply: "reply", active: true, hits: 0 }]);
    ports.claimAutoRuleEvent.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    ports.completeAutoRuleEvent.mockResolvedValue(undefined);
    ports.recordAutoRuleHit.mockRejectedValue(new Error("audit unavailable"));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "reply-1" }), { status: 200 }));
    const payload = { object: "instagram", entry: [{ id: "ig-1", changes: [{ field: "comments", value: { id: "comment-redelivered", media_id: "media-1", text: "hello", from: { id: "person-1" } } }] }] };
    await processMetaWebhook(payload, env);
    const result = await processMetaWebhook(payload, env);
    expect(result).toMatchObject({ received: 1, matched: 0, replied: 0, skipped: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("marks a failed send terminal so a retry cannot send twice", async () => {
    ports.listAutoRules.mockResolvedValue([{ id: "rule-1", post_id: null, name: "brand", trigger: "comment", keywords: ["hello"], platforms: ["instagram"], action: "reply", reply: "reply", active: true, hits: 0 }]);
    ports.claimAutoRuleEvent.mockResolvedValue(true);
    ports.completeAutoRuleEvent.mockResolvedValue(undefined);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Meta unavailable"));
    const result = await processMetaWebhook({ object: "instagram", entry: [{ id: "ig-1", changes: [{ field: "comments", value: { id: "comment-failed", text: "hello", from: { id: "person-1" } } }] }] }, env);
    expect(result).toMatchObject({ received: 1, matched: 1, replied: 0, failed: 1 });
    expect(ports.completeAutoRuleEvent).toHaveBeenCalledWith("org-1", "instagram:comment:comment-failed", "failed", "Meta unavailable");
  });

  it("stays a no-op before both switches are enabled", async () => {
    const result = await processMetaWebhook({ object: "page", entry: [] }, { META_AUTO_REPLY_ENABLED: "true" });
    expect(result).toEqual({ enabled: false, received: 0, matched: 0, replied: 0, skipped: 0, failed: 0 });
    expect(ports.listAutoRules).not.toHaveBeenCalled();
  });
});
