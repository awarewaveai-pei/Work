import { afterEach, describe, expect, it, vi } from "vitest";

const ports = vi.hoisted(() => ({
  listAutoRules: vi.fn(),
  autoRuleEventHandled: vi.fn(),
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
    ports.autoRuleEventHandled.mockResolvedValue(false);
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

  it("stays a no-op before both switches are enabled", async () => {
    const result = await processMetaWebhook({ object: "page", entry: [] }, { META_AUTO_REPLY_ENABLED: "true" });
    expect(result).toEqual({ enabled: false, received: 0, matched: 0, replied: 0, skipped: 0, failed: 0 });
    expect(ports.listAutoRules).not.toHaveBeenCalled();
  });
});
