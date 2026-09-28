import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../lib/api";
import { formatTime } from "../lib/time";
import { AnalysisPage } from "./AnalysisPage";
import { ProjectList } from "./ProjectList";
import { ProjectPage } from "./ProjectPage";

vi.mock("../lib/api", async (original) => ({ ...(await original<typeof import("../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

async function mount(element: React.ReactElement) {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}
const done = (id: string, at: string) => ({ interpretation_id: id, method_id: "systems.iceberg_model", status: "DONE", requested_at: at, finished_at: at, error: null, judgment: null });
const OLD = { project_id: "P-OLD", name: "冰山模型 2026-09-26", created_at: "2026-09-26T09:53:16Z", updated_at: "2026-09-26T15:52:42Z", analysis_count: 2, methods: ["systems.iceberg_model"], latest_analysis: done("I-2", "2026-09-26T15:52:42Z") };
const NEW = { project_id: "P-NEW", name: "冰山模型 2026-09-27 00:10", created_at: "2026-09-26T16:10:00Z", updated_at: "2026-09-26T16:11:00Z", analysis_count: 1, methods: ["systems.iceberg_model"], latest_analysis: done("I-3", "2026-09-26T16:11:00Z") };
const EMPTY = { project_id: "P-EMPTY", name: "蒐集資料", created_at: "2026-09-26T14:10:06Z", updated_at: "2026-09-26T14:10:30Z", analysis_count: 0, methods: [], latest_analysis: null };

describe("我的專案", () => {
  it("every project opens; created and last moved read to the minute; the latest result is one click; most recent first", async () => {
    vi.mocked(apiFetch).mockResolvedValue([OLD, EMPTY, NEW] as never);
    const { host, done: finish } = await mount(<ProjectList names={{ "systems.iceberg_model": "冰山模型" }} />);
    expect(host.querySelector("h2 small")?.textContent).toBe("3 個");
    const rows = [...host.querySelectorAll("tbody tr")];
    expect(rows.map((row) => row.querySelector("td a")?.getAttribute("href"))).toEqual(["/projects/P-NEW", "/projects/P-OLD", "/projects/P-EMPTY"]);
    const cells = [...rows[1].querySelectorAll("td")].map((cell) => cell.textContent);
    expect(cells.slice(1, 5)).toEqual(["工具：冰山模型", "報表（AI 草稿・尚未核准）（共 2 次分析）", formatTime(OLD.created_at), formatTime(OLD.updated_at)]);
    expect(cells[3]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(rows[1].querySelector("td:last-child a")?.getAttribute("href")).toBe("/projects/P-OLD/analyses/I-2");
    expect(rows[2].querySelector("td:last-child a")?.getAttribute("href")).toBe("/projects/P-EMPTY");   // nothing to show yet: the project
    expect(rows[2].textContent).toContain("還沒分析");
    await finish();
  });
});

describe("one project", () => {
  it("lists its analyses newest first, each opening its own result; a failed one says why; run again in this project", async () => {
    const analyses = [
      { interpretation_id: "I-3", method_id: "systems.iceberg_model", status: "PENDING", requested_at: "2026-09-26T16:20:00Z", finished_at: null, error: null, judgment: null },
      { interpretation_id: "I-2", method_id: "systems.iceberg_model", status: "FAILED", requested_at: "2026-09-26T15:51:37Z", finished_at: "2026-09-26T15:52:00Z", error: "INTERPRETATION_NOT_JSON", judgment: null },
      { ...done("I-1", "2026-09-26T11:42:11Z"), judgment: "agree" },
    ];
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/projects/P-OLD") return { ...OLD, analysis_count: 3 } as never;
      if (path === "/projects/P-OLD/analyses") return analyses as never;
      if (path === "/projects/P-OLD/sources") return [] as never;
      if (path === "/projects/P-OLD/tasks") return [{ task_id: "T1", interpretation_id: "I-1", title: "補齊三項數據", owner: "帶領者", due: "2020-01-31", proof: "有基準值", target: "第 2 週前", when: "1 到 2 週", created_at: "2026-09-26T12:00:00Z", done: false, done_at: null }] as never;
      if (path === "/projects/P-OLD/reruns") return [{ rerun_id: "R1", interpretation_id: "I-1", method_id: "systems.iceberg_model", due: "2020-04-30", scheduled_at: "2026-09-26T12:00:00Z", fulfilled_by: null, fulfilled_at: null }] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" names={{ "systems.iceberg_model": "冰山模型" }} />);
    expect(host.querySelector(".crumbs")?.textContent).toBe("我的專案 › 冰山模型 2026-09-26");
    expect(host.querySelector(".status")?.textContent).toContain(`建立 ${formatTime(OLD.created_at)}`);
    const rows = [...host.querySelector("table")!.querySelectorAll("tbody tr")];   // the analyses table (tasks have their own)
    expect(rows.map((row) => row.querySelector("td")?.textContent)).toEqual(analyses.map((item) => formatTime(item.requested_at)));
    expect(rows[0].querySelector("a.btn")?.getAttribute("href")).toBe("/projects/P-OLD/analyses/I-3");   // still running: its progress
    expect([rows[1].querySelector("a.btn")?.getAttribute("href"), rows[1].querySelector("a.btn")?.textContent]).toEqual(["/projects/P-OLD/analyses/I-2", "看原因 →"]);   // every analysis opens
    expect(rows[1].querySelector("details")?.textContent).toContain("INTERPRETATION_NOT_JSON");
    expect(rows[2].querySelector("a.btn")?.textContent).toBe("看結果 →");
    expect(rows[2].textContent).toContain("同意");
    expect(host.querySelector('a[href="/methods/systems.iceberg_model/run?project=P-OLD"]')?.textContent).toBe("在這個專案再用「冰山模型」分析一次");
    // tasks and a due rerun reminder show on the project page (⑦ 存成任務 / 到期重跑並比較)
    expect(host.textContent).toContain("補齊三項數據");
    expect(host.textContent).toContain("（逾期）");
    expect(host.querySelector('a[href="/projects/P-OLD/analyses/I-1?rerun=R1"]')).not.toBeNull();
    await finish();
  });

  it("a project that is not yours or is gone says so", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(404, "PROJECT_NOT_FOUND"));
    const { host, done: finish } = await mount(<ProjectPage projectId="P-X" />);
    expect(host.querySelector(".error")?.textContent).toContain("找不到這個專案");
    await finish();
  });

  it("an analysis opened under the wrong project is refused, not shown", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ interpretation_id: "I-1", status: "DONE", project_id: "P-OTHER", method_id: "systems.iceberg_model" } as never);
    const { host, done: finish } = await mount(<AnalysisPage projectId="P-OLD" analysisId="I-1" />);
    expect(host.querySelector(".error")?.textContent).toBe("這次分析不在這個專案裡。");
    await finish();
  });
});
