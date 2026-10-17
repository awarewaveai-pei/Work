// C8 through the shared action path: a rejection's reason goes into the notes before the state change (one version
// chain), a submission notifies the approvers, and the brand's review setting reaches the rule table.
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ savePost: vi.fn(), setState: vi.fn() }));
const review = vi.hoisted(() => ({ requiresReview: vi.fn(), notifyReview: vi.fn() }));
vi.mock("../store", async (orig) => ({ ...(await orig<typeof import("../store")>()), ...store }));
vi.mock("../review", () => review);
vi.mock("../withdraw", () => ({ withdrawQueued: vi.fn() }));

import { applyAction } from "../actions";
import type { PostRow } from "../store";

const post = (extra: Partial<PostRow> = {}): PostRow => ({
  id: "p1", state: "review", body: "hi", scheduled_at: "2026-10-20T01:00:00Z", list_id: null, list_position: null, first_comment: null,
  link_url: null, link_utm: false, notes: "keep this", source_url: null, published_at: null, deleted_at: null, version: 3,
  targets: [{ id: "t", account_id: "a", custom_body: null, format: "post", state: "pending", postiz_post_id: null, release_url: null, error: null }],
  media: [], repeat: null, repeat_of: null, origin_slot: null, auto_mode: "brand", comments: [], tags: [], ...extra,
});

beforeEach(() => {
  Object.values(store).forEach((f) => f.mockReset());
  Object.values(review).forEach((f) => f.mockReset());
  review.requiresReview.mockResolvedValue(false);
  store.savePost.mockResolvedValue({ id: "p1", version: 4 });
  store.setState.mockResolvedValue({ id: "p1", version: 5 });
});

describe("applyAction (C8)", () => {
  it("reject: the reason is appended to the notes, then the state changes on the new version", async () => {
    await applyAction("b", post(), "reject", "owner", { reason: " tone " }, "ops:owner", { reason: "tone" });
    expect(store.savePost).toHaveBeenCalledWith("b", "p1", 3, { notes: "keep this\n退回：tone" }, null, null, "ops:owner");
    expect(store.setState).toHaveBeenCalledWith("b", "p1", 4, expect.objectContaining({ state: "draft" }), "ops:owner", "reject", { reason: "tone" });
  });

  it("submit notifies the approvers; with review on an editor cannot schedule a draft", async () => {
    await applyAction("b", post({ state: "draft" }), "submit", "editor", {}, "ops:operator", {});
    expect(review.notifyReview).toHaveBeenCalledWith("b", "p1", "hi");
    review.requiresReview.mockResolvedValue(true);
    await expect(applyAction("b", post({ state: "draft" }), "schedule", "editor", { scheduledAt: "2099-01-01T00:00:00Z" }, "ops:operator", {}))
      .rejects.toThrow(/needs review/);
    expect(store.setState).toHaveBeenCalledTimes(1);
  });
});
