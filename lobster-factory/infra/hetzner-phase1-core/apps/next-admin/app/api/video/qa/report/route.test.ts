import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/video/qa/report", () => {
  it("retires browser QA writes", async () => {
    const response = await POST();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "qa_report_browser_write_retired" });
  });
});
