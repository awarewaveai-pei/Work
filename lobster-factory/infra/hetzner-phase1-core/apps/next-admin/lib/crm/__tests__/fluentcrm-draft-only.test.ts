// 系統不得自行寄信 (N10 M1): createNewsletter sends only the content fields plus the constant draft status, and an answer
// naming any other status is a failure, never a ready draft.
import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgePost = vi.hoisted(() => vi.fn());
vi.mock("@/lib/payments/woo", () => ({ bridgePost, isBridgeConfigured: () => true }));

const { createNewsletter } = await import("@/lib/crm/fluentcrm");

beforeEach(() => bridgePost.mockReset());

describe("createNewsletter -- the system never sends mail by itself", () => {
  it("sends draft whatever the caller smuggles in, to the site it named", async () => {
    bridgePost.mockResolvedValueOnce({ ok: true, value: { status: "committed", campaign_id: 7, campaign_status: "draft" } });
    const spec = { title: "t", subject: "s", body_html: "<p>b</p>", status: "publish", scheduled_at: "2026-11-20 09:00:00", send_now: true };
    const r = await createNewsletter(spec as never, { clientId: "3" });
    expect(r.ok).toBe(true);
    const [path, payload, opts] = bridgePost.mock.calls[0];
    expect(path).toBe("/newsletter");
    expect(payload).toEqual({ title: "t", subject: "s", body_html: "<p>b</p>", status: "draft" });
    expect(opts).toMatchObject({ clientId: "3" });
  });

  it("an answer with any status but draft is a failure", async () => {
    for (const status of ["scheduled", "pending", "working", undefined]) {
      bridgePost.mockResolvedValueOnce({ ok: true, value: { status: "committed", campaign_id: 8, campaign_status: status } });
      const r = await createNewsletter({ title: "t", subject: "s", body_html: "<p>b</p>" });
      expect(r).toEqual({ ok: false, error: `unexpected_non_draft_status:${String(status)}` });
    }
  });
});
