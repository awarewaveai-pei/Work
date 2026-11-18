// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OneClickDraftDialog from "../script-forge/OneClickDraftDialog";
import type { AutoDraftRequest } from "../../../(shell)/tools/video/ScriptForge";
import type { Workbench } from "../workbench";
const handoff = { title: "完成腳本", script: { scenes: [{ visual: "畫面一", dialogue: "旁白一" }, { visual: "畫面二", dialogue: "旁白二" }] } };
function setup(generate = vi.fn(async (budget) => { budget.spentTwd = 5; return handoff; })) {
  const create = vi.fn(async (_payload: Parameters<Workbench["spine"]["create"]>[0]) => ({ projectId: "p", episodeId: "e" })), close = vi.fn();
  const workbench = { loadCapabilities: async () => ({ mainSystem: { organizationId: "org" }, remotionTemplates: [] }), spine: { create },
    request: vi.fn(async () => ({ totalTwd: 50, scriptUpperTwd: 20, perRatioTwd: 1, fill: { twd: 2, perPictureTwd: 1 }, voices: [{ provider: "edge", voice: "tw", label: "繁中配音", available: true }], sites: [{ id: "site", name: "網站" }] })),
  } as unknown as Workbench;
  const request: AutoDraftRequest = { topic: "主題", platform: "reels", sceneCount: 2, plan: { model: "claude-haiku-5-5", fields: { topic: "主題" }, siteId: "", lang: "繁體中文", sceneCount: 2, customScenes: 2 }, generate };
  render(<OneClickDraftDialog request={request} workbench={workbench} close={close} />);
  return { create, close, generate };
}
afterEach(() => { cleanup(); localStorage.clear(); });
describe("one click to drafts", () => {
  it("quotes before generation; hands actual script cost and the optional website to the U5 runner", async () => {
    const { create, generate, close } = setup();
    await screen.findByText(/整趟最多 NT\$50.00/); expect(generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("同時建一篇網站草稿文章並嵌入"));
    fireEvent.click(screen.getByText("16:9"));
    await waitFor(() => expect((screen.getByText("確認，開始到草稿") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText("確認，開始到草稿"));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const payload = create.mock.calls[0][0];
    expect(payload.shots).toHaveLength(2);
    expect(payload.autoRun).toMatchObject({ until: "drafts", spentTwd: 5, baseSpentTwd: 5, budgetTwd: 50, embedSiteId: "site", ratios: ["9:16", "16:9"] });
    expect(payload.autoRun).not.toHaveProperty("autonomy", "full_auto"); expect(close).toHaveBeenCalled();
  });
  it("cancel makes no paid call; a failed stage keeps its run id and spending on retry", async () => {
    let attempts = 0, id;
    const generate = vi.fn(async (budget) => { attempts++; if (attempts === 1) { id = budget.runId; budget.spentTwd = 2; throw Error("評分失敗"); } expect(budget.runId).toBe(id); expect(budget.spentTwd).toBe(2); budget.spentTwd = 4; return handoff; });
    const { create } = setup(generate);
    await screen.findByText(/整趟最多/); fireEvent.click(screen.getByText("確認，開始到草稿"));
    await screen.findByText("評分失敗"); expect(create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("確認，開始到草稿")); await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  });
  it("a closed dialog's paid run resumes with the same run id (server cache = free), then is forgotten once handed off", async () => {
    let first = "";
    setup(vi.fn(async (budget) => { first = budget.runId; throw Error("評分失敗"); }));
    await screen.findByText(/整趟最多/); fireEvent.click(screen.getByText("確認，開始到草稿"));
    await screen.findByText("評分失敗"); cleanup();
    const resumed = setup(vi.fn(async (budget) => { expect(budget.runId).toBe(first); return handoff; }));
    await screen.findByText(/整趟最多/); fireEvent.click(await screen.findByText("續接上一趟"));
    await waitFor(() => expect(resumed.create).toHaveBeenCalledTimes(1));
    expect(resumed.create.mock.calls[0][0].autoRun).toMatchObject({ runId: first }); cleanup();
    setup(); await screen.findByText(/整趟最多/);
    expect(screen.queryByText("續接上一趟")).toBeNull(); expect(screen.getByText("確認，開始到草稿")).toBeTruthy();
  });
  it("cancels before generating anything", async () => {
    const { create, close, generate } = setup(); await screen.findByText(/整趟最多/);
    fireEvent.click(screen.getByText("取消")); expect(close).toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
  });
});
