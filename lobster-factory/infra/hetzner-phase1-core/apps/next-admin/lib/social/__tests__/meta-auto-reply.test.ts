import { afterEach, describe, expect, it, vi } from "vitest";

const ports = vi.hoisted(() => ({
  listAutoRules: vi.fn(),
  findEnabledMetaAsset: vi.fn(),
  findPostIdByMetaId: vi.fn(),
  claimAutoRuleEvent: vi.fn(),
  completeAutoRuleEvent: vi.fn(),
  recordAutoRuleHit: vi.fn(),
}));

vi.mock("../store", () => ports);
vi.mock("@/lib/entitlements/can", () => ({ can: vi.fn(async () => ({ allowed: true })) }));

import { processMetaWebhook } from "../meta-auto-reply";

afterEach(() => vi.clearAllMocks());

describe("C27 Meta auto-reply execution", () => {
  const env = {
    META_AUTO_REPLY_ENABLED: "true",
    META_AUTO_REPLY_OPERATOR_APPROVED: "true",
    META_PAGE_TOKEN_page_a: "secret-token-a",
    META_PAGE_TOKEN_page_b: "secret-token-b",
    META_GRAPH_API_VERSION: "v24.0",
  };

  it("replies only after a matching rule and records an atomic hit", async () => {
    ports.findEnabledMetaAsset.mockResolvedValue({ kind: "facebook_page", externalId: "page_a", organizationId: "org-1", pageExternalId: null });
    ports.listAutoRules.mockResolvedValue([{ id: "rule-1", post_id: null, name: "報名", trigger: "comment", keywords: ["報名"], platforms: ["facebook"], action: "reply", reply: "請私訊我們", active: true, hits: 0 }]);
    ports.claimAutoRuleEvent.mockResolvedValue(true);
    ports.completeAutoRuleEvent.mockResolvedValue(undefined);
    ports.recordAutoRuleHit.mockResolvedValue(1);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "reply-1" }), { status: 200 }));
    const result = await processMetaWebhook({
      object: "page",
      entry: [{ id: "page_a", changes: [{ field: "feed", value: { item: "comment", comment_id: "comment-1", message: "我要報名", from: { id: "person-1" } } }] }],
    }, env);
    expect(result).toMatchObject({ enabled: true, received: 1, matched: 1, replied: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(ports.recordAutoRuleHit).toHaveBeenCalledWith("org-1", "rule-1", "meta:webhook", expect.objectContaining({ event_id: "facebook:comment:comment-1" }));
  });

  it("uses each page's own brand rules and token, and skips an unknown page", async () => {
    ports.findEnabledMetaAsset.mockImplementation(async (_kind: string, id: string) => id === "page_a"
      ? { kind: "facebook_page", externalId: "page_a", organizationId: "org-a", pageExternalId: null }
      : id === "page_b" ? { kind: "facebook_page", externalId: "page_b", organizationId: "org-b", pageExternalId: null } : null);
    ports.listAutoRules.mockImplementation(async (org: string) => [{ id: `rule-${org}`, post_id: null, name: org, trigger: "comment", keywords: ["hello"], platforms: ["facebook"], action: "reply", reply: org, active: true, hits: 0 }]);
    ports.claimAutoRuleEvent.mockResolvedValue(true); ports.completeAutoRuleEvent.mockResolvedValue(undefined); ports.recordAutoRuleHit.mockResolvedValue(1);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "reply" }), { status: 200 }));
    const event = (page: string) => ({ object: "page", entry: [{ id: page, changes: [{ field: "feed", value: { item: "comment", comment_id: `comment-${page}`, message: "hello", from: { id: "person" } } }] }] });
    await processMetaWebhook(event("page_a"), env); await processMetaWebhook(event("page_b"), env); await processMetaWebhook(event("unknown"), env);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/comment-page_a/comments");
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe("Bearer secret-token-a");
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBe("Bearer secret-token-b");
  });

  it("replies to an Instagram DM through the linked Page token", async () => {
    ports.findEnabledMetaAsset.mockResolvedValue({ kind: "instagram_account", externalId: "ig-1", organizationId: "org-1", pageExternalId: "page_a" });
    ports.listAutoRules.mockResolvedValue([{ id: "dm-rule", post_id: null, name: "dm", trigger: "dm", keywords: ["hello"], platforms: ["instagram"], action: "dm", reply: "hi", active: true, hits: 0 }]);
    ports.claimAutoRuleEvent.mockResolvedValue(true); ports.completeAutoRuleEvent.mockResolvedValue(undefined); ports.recordAutoRuleHit.mockResolvedValue(1);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "reply" }), { status: 200 }));
    const result = await processMetaWebhook({ object: "instagram", entry: [{ id: "ig-1", messaging: [{ sender: { id: "person" }, recipient: { id: "ig-1" }, message: { mid: "mid-1", text: "hello" } }] }] }, env);
    expect(result).toMatchObject({ matched: 1, replied: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/page_a/messages");
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe("Bearer secret-token-a");
  });

  it("acknowledges an Instagram comment but never auto-replies on the Advanced Access-only path", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await processMetaWebhook({ object: "instagram", entry: [{ id: "ig-1", changes: [{ field: "comments", value: { id: "comment-ig", text: "hello", from: { id: "person" } } }] }] }, env);
    expect(result).toMatchObject({ received: 1, skipped: 1, replied: 0 });
    expect(ports.findEnabledMetaAsset).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a missing Page token as a failed claimed event", async () => {
    ports.findEnabledMetaAsset.mockResolvedValue({ kind: "facebook_page", externalId: "page-missing", organizationId: "org-1", pageExternalId: null });
    ports.listAutoRules.mockResolvedValue([{ id: "missing-token-rule", post_id: null, name: "brand", trigger: "comment", keywords: ["hello"], platforms: ["facebook"], action: "reply", reply: "reply", active: true, hits: 0 }]);
    ports.claimAutoRuleEvent.mockResolvedValue(true); ports.completeAutoRuleEvent.mockResolvedValue(undefined);
    const result = await processMetaWebhook({ object: "page", entry: [{ id: "page-missing", changes: [{ field: "feed", value: { item: "comment", comment_id: "comment-missing-token", message: "hello", from: { id: "person" } } }] }] }, env);
    expect(result).toMatchObject({ matched: 1, replied: 0, failed: 1 });
    expect(ports.completeAutoRuleEvent).toHaveBeenCalledWith("org-1", "facebook:comment:comment-missing-token", "failed", expect.stringContaining("META_PAGE_TOKEN_page-missing"));
  });

  it("maps a known Meta media id to the post uuid so its rule wins", async () => {
    ports.listAutoRules.mockImplementation(async (_brand: string, postId?: string) => postId
      ? [{ id: "post-rule", post_id: "post-1", name: "post", trigger: "comment", keywords: ["hello"], platforms: ["facebook"], action: "reply", reply: "post reply", active: true, hits: 0 }]
      : [{ id: "brand-rule", post_id: null, name: "brand", trigger: "comment", keywords: ["hello"], platforms: ["facebook"], action: "reply", reply: "brand reply", active: true, hits: 0 }]);
    ports.findEnabledMetaAsset.mockResolvedValue({ kind: "facebook_page", externalId: "page_a", organizationId: "org-1", pageExternalId: null });
    ports.findPostIdByMetaId.mockResolvedValue("post-1");
    ports.claimAutoRuleEvent.mockResolvedValue(true);
    ports.completeAutoRuleEvent.mockResolvedValue(undefined);
    ports.recordAutoRuleHit.mockResolvedValue(1);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "reply-1" }), { status: 200 }));
    await processMetaWebhook({ object: "page", entry: [{ id: "page_a", changes: [{ field: "feed", value: { item: "comment", comment_id: "comment-known", post_id: "page_a_media-1", message: "hello", from: { id: "person-1" } } }] }] }, env);
    expect(ports.findPostIdByMetaId).toHaveBeenCalledWith("org-1", "facebook", "page_a_media-1");
    expect(ports.recordAutoRuleHit).toHaveBeenCalledWith("org-1", "post-rule", "meta:webhook", expect.anything());
  });

  it("does not send a Meta redelivery when the hit audit write fails", async () => {
    ports.findEnabledMetaAsset.mockResolvedValue({ kind: "facebook_page", externalId: "page_a", organizationId: "org-1", pageExternalId: null });
    ports.listAutoRules.mockResolvedValue([{ id: "rule-1", post_id: null, name: "brand", trigger: "comment", keywords: ["hello"], platforms: ["facebook"], action: "reply", reply: "reply", active: true, hits: 0 }]);
    ports.claimAutoRuleEvent.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    ports.completeAutoRuleEvent.mockResolvedValue(undefined);
    ports.recordAutoRuleHit.mockRejectedValue(new Error("audit unavailable"));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "reply-1" }), { status: 200 }));
    const payload = { object: "page", entry: [{ id: "page_a", changes: [{ field: "feed", value: { item: "comment", comment_id: "comment-redelivered", message: "hello", from: { id: "person-1" } } }] }] };
    await processMetaWebhook(payload, env);
    const result = await processMetaWebhook(payload, env);
    expect(result).toMatchObject({ received: 1, matched: 0, replied: 0, skipped: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("marks a failed send terminal so a retry cannot send twice", async () => {
    ports.findEnabledMetaAsset.mockResolvedValue({ kind: "facebook_page", externalId: "page_a", organizationId: "org-1", pageExternalId: null });
    ports.listAutoRules.mockResolvedValue([{ id: "rule-1", post_id: null, name: "brand", trigger: "comment", keywords: ["hello"], platforms: ["facebook"], action: "reply", reply: "reply", active: true, hits: 0 }]);
    ports.claimAutoRuleEvent.mockResolvedValue(true);
    ports.completeAutoRuleEvent.mockResolvedValue(undefined);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Meta unavailable"));
    const result = await processMetaWebhook({ object: "page", entry: [{ id: "page_a", changes: [{ field: "feed", value: { item: "comment", comment_id: "comment-failed", message: "hello", from: { id: "person-1" } } }] }] }, env);
    expect(result).toMatchObject({ received: 1, matched: 1, replied: 0, failed: 1 });
    expect(ports.completeAutoRuleEvent).toHaveBeenCalledWith("org-1", "facebook:comment:comment-failed", "failed", "Meta unavailable");
  });

  it("keeps a sent reply counted as replied when its result write fails", async () => {
    ports.findEnabledMetaAsset.mockResolvedValue({ kind: "facebook_page", externalId: "page_a", organizationId: "org-1", pageExternalId: null });
    ports.listAutoRules.mockResolvedValue([{ id: "rule-1", post_id: null, name: "brand", trigger: "comment", keywords: ["hello"], platforms: ["facebook"], action: "reply", reply: "reply", active: true, hits: 0 }]);
    ports.claimAutoRuleEvent.mockResolvedValue(true);
    ports.completeAutoRuleEvent.mockRejectedValue(new Error("db blip"));
    ports.recordAutoRuleHit.mockResolvedValue(1);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "reply-1" }), { status: 200 }));
    const result = await processMetaWebhook({ object: "page", entry: [{ id: "page_a", changes: [{ field: "feed", value: { item: "comment", comment_id: "comment-sent", message: "hello", from: { id: "person-1" } } }] }] }, env);
    expect(result).toMatchObject({ matched: 1, replied: 1, failed: 0 });
    expect(ports.completeAutoRuleEvent).not.toHaveBeenCalledWith("org-1", "facebook:comment:comment-sent", "failed", expect.anything());
  });

  it("stays a no-op before both switches are enabled", async () => {
    const result = await processMetaWebhook({ object: "page", entry: [] }, { META_AUTO_REPLY_ENABLED: "true" });
    expect(result).toEqual({ enabled: false, received: 0, matched: 0, replied: 0, skipped: 0, failed: 0 });
    expect(ports.listAutoRules).not.toHaveBeenCalled();
  });
});
