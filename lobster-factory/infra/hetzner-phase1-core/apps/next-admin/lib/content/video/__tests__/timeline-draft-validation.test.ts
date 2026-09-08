import { describe, expect, it, vi } from "vitest";
import { validateTimelineDraft } from "../timeline-draft-validation";

const structuralOnlyResponse = {
  ok: true,
  stage: "structural_only",
  readyForRender: false,
  timeline: { timelineId: "tl_x", organizationId: "org-original", trackCount: 1, outputProfiles: ["vertical_9_16"] },
  pendingChecks: ["renderer_feasibility"],
};

describe("validateTimelineDraft", () => {
  it("does not call the network for invalid JSON", async () => {
    const fetcher = vi.fn();
    await expect(validateTimelineDraft("{", fetcher)).resolves.toMatchObject({ ok: false, error: expect.stringContaining("未送出") });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves valid Timeline JSON text inside the only preflight envelope", async () => {
    const raw = '{\n  "organizationId" : "org-original",\n  "displayName" : "A \\u4e16\\u754c"\n}';
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(structuralOnlyResponse), { status: 200 }));
    await expect(validateTimelineDraft(raw, fetcher)).resolves.toMatchObject({ ok: true });
    expect(fetcher).toHaveBeenCalledWith("/api/video/timeline/validate", expect.objectContaining({ method: "POST", body: `{"timeline":${raw}}` }));
  });

  it("fails closed when a success response is not structural-only", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...structuralOnlyResponse, readyForRender: true }), { status: 200 }));
    await expect(validateTimelineDraft("{}", fetcher)).resolves.toMatchObject({ ok: false, error: expect.stringContaining("structural-only") });
  });

  it.each([400, 403])("returns server rejection %i without a second request", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status }));
    await expect(validateTimelineDraft("{}", fetcher)).resolves.toMatchObject({ ok: false, status, error: "forbidden" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
