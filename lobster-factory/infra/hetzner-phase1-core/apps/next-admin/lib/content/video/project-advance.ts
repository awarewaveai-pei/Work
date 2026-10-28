/**
 * V6.1: what the "④ 後自動" schedule does for one video project each firing (VIDEO_TOOL_REDESIGN §1).
 * render finished -> QA (editorial, rights; technical and caption were recorded at finalize) -> Release per ratio -> social drafts.
 * Anything that does not pass STOPS the project at that step: autonomy goes back to guided, last_error says why, the
 * schedule run fails (the sweep raises the incident). Nothing is pushed through. The state is read from the database each
 * time, so a firing that dies half way is simply run again.
 */
import { RATIO_LABEL } from "./platform-ratio";

export interface AdvanceProject { id: string; organizationId: string; title: string; updatedAtMs: number }
export interface RatioRow { id: string; ratio: string; checksum: string }
export type RenderState = { state: "none" | "running" | "done" } | { state: "error"; error: string };
export type Stage = "create" | "produce" | "review" | "release" | "measure";

export interface AdvanceDeps {
  /** Finishes the project's render when one is still running (finalizeVideoJob); "none" = no job row for it. */
  renderState(projectId: string): Promise<RenderState>;
  rows(projectId: string): Promise<RatioRow[]>;
  /** Runs the editorial/rights checks for the row, then lists what stands against its Release (Chinese, one per reason); [] = all four passed. */
  qaProblems(row: RatioRow): Promise<string[]>;
  /** Approves the row's Release; already approved = nothing to do. */
  release(row: RatioRow): Promise<void>;
  /** Social drafts for the brand's connected channels, once per project; returns a one-line note. */
  drafts(project: AdvanceProject, rows: RatioRow[]): Promise<string>;
  update(projectId: string, patch: { lifecycleStage?: Stage; autonomy?: "guided"; lastError?: string | null }): Promise<void>;
  now(): number;
}
export type AdvanceOutcome = { projectId: string; result: "waiting" | "done" | "stopped"; note: string };

/** A project whose render never shows up (job gone, nothing recorded) is stopped after this long instead of waiting forever. */
export const WAIT_LIMIT_MS = 2 * 60 * 60 * 1000;

export async function advanceProject(deps: AdvanceDeps, p: AdvanceProject): Promise<AdvanceOutcome> {
  const stop = async (stage: Stage, why: string): Promise<AdvanceOutcome> => {
    await deps.update(p.id, { lifecycleStage: stage, autonomy: "guided", lastError: why.slice(0, 1000) });
    return { projectId: p.id, result: "stopped", note: why };
  };
  try {
    const render = await deps.renderState(p.id);
    if (render.state === "running") return { projectId: p.id, result: "waiting", note: "影片還在生成" };
    if (render.state === "error") return await stop("produce", `影片生成失敗：${render.error}`);
    const rows = await deps.rows(p.id);
    if (rows.length === 0) {
      if (render.state === "done") return await stop("produce", "影片做好了，但沒有記到這個專案；到進階頁「生成記錄」找");
      if (deps.now() - p.updatedAtMs > WAIT_LIMIT_MS) return await stop("produce", "超過 2 小時找不到這個專案的影片");
      return { projectId: p.id, result: "waiting", note: "還沒有成片" };
    }
    const problems: string[] = [];
    for (const r of rows) for (const why of await deps.qaProblems(r)) problems.push(`${RATIO_LABEL[r.ratio] ?? r.ratio}：${why}`);
    if (problems.length) return await stop("review", problems.join("；"));
    for (const r of rows) await deps.release(r);
    await deps.update(p.id, { lifecycleStage: "release", lastError: null });
    const note = await deps.drafts(p, rows);
    await deps.update(p.id, { lifecycleStage: "measure", lastError: null });
    return { projectId: p.id, result: "done", note };
  } catch (e) {
    return stop("review", e instanceof Error ? e.message : String(e));
  }
}
