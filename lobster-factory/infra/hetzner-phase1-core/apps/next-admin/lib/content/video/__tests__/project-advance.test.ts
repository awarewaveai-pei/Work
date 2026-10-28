// V6.1: all four QA passed -> Releases and drafts; any failed QA -> stops at review with the reason and nothing released.
import { describe, expect, it, vi } from "vitest";
import { advanceProject, type AdvanceDeps } from "../project-advance";

const p = { id: "p1", organizationId: "o1", title: "t", updatedAtMs: 0 };
const rows = [{ id: "a169", ratio: "16x9", checksum: "c1" }, { id: "a45", ratio: "4x5", checksum: "c2" }];
function deps(over: Partial<AdvanceDeps> = {}) {
  const d = {
    renderState: vi.fn(async () => ({ state: "done" as const })), rows: vi.fn(async () => rows), qaProblems: vi.fn(async () => [] as string[]),
    release: vi.fn(async () => {}), drafts: vi.fn(async () => "2 個草稿"), update: vi.fn(async () => {}), now: () => 1000,
  };
  return { ...d, ...over } as typeof d;
}

describe("advanceProject", () => {
  it("everything passed -> a Release per ratio, the drafts, stage measure", async () => {
    const d = deps();
    expect(await advanceProject(d, p)).toMatchObject({ result: "done", note: "2 個草稿" });
    expect(d.release).toHaveBeenCalledTimes(2);
    expect(d.update).toHaveBeenLastCalledWith("p1", { lifecycleStage: "measure", lastError: null });
  });

  it("one failed check -> stops at review with the reason, autonomy back to guided, nothing released or drafted", async () => {
    const d = deps({ qaProblems: vi.fn(async (r) => (r.ratio === "4x5" ? ["字幕 QA未通過：沒有字幕片段"] : [])) });
    const out = await advanceProject(d, p);
    expect(out).toMatchObject({ result: "stopped", note: "直式 4:5：字幕 QA未通過：沒有字幕片段" });
    expect(d.update).toHaveBeenCalledWith("p1", { lifecycleStage: "review", autonomy: "guided", lastError: "直式 4:5：字幕 QA未通過：沒有字幕片段" });
    expect(d.release).not.toHaveBeenCalled();
    expect(d.drafts).not.toHaveBeenCalled();
  });

  it("a render still running waits; a failed render stops; a step that throws stops instead of retrying every firing", async () => {
    expect((await advanceProject(deps({ renderState: vi.fn(async () => ({ state: "running" as const })) }), p)).result).toBe("waiting");
    expect((await advanceProject(deps({ renderState: vi.fn(async () => ({ state: "error" as const, error: "boom" })) }), p)).note).toBe("影片生成失敗：boom");
    const d = deps({ drafts: vi.fn(async () => { throw new Error("文案超過平台上限"); }) });
    expect(await advanceProject(d, p)).toMatchObject({ result: "stopped", note: "文案超過平台上限" });
    expect(d.update).toHaveBeenCalledWith("p1", expect.objectContaining({ autonomy: "guided" }));
  });
});
