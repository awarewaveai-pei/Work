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
// the React-controlled-input way to type: set the value through the native setter, then fire the event React listens for
function setValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// A controlled <input>/<textarea>'s onChange only fires on the native value setter, not a plain `.value =` assignment.
function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
const done = (id: string, at: string) => ({ interpretation_id: id, method_id: "systems.iceberg_model", status: "DONE", requested_at: at, finished_at: at, error: null, judgment: null });
const OLD = { project_id: "P-OLD", name: "冰山模型 2026-09-26", created_at: "2026-09-26T09:53:16Z", updated_at: "2026-09-26T15:52:42Z", analysis_count: 2, methods: ["systems.iceberg_model"], latest_analysis: done("I-2", "2026-09-26T15:52:42Z") };
const NEW = { project_id: "P-NEW", name: "冰山模型 2026-09-27 00:10", created_at: "2026-09-26T16:10:00Z", updated_at: "2026-09-26T16:11:00Z", analysis_count: 1, methods: ["systems.iceberg_model"], latest_analysis: done("I-3", "2026-09-26T16:11:00Z") };
const EMPTY = { project_id: "P-EMPTY", name: "蒐集資料", created_at: "2026-09-26T14:10:06Z", updated_at: "2026-09-26T14:10:30Z", analysis_count: 0, methods: [], latest_analysis: null };

describe("我的專案", () => {
  it("every project opens; created and last moved read to the minute; the latest result is one click; most recent first", async () => {
    vi.mocked(apiFetch).mockResolvedValue([OLD, EMPTY, NEW] as never);
    const { host, done: finish } = await mount(<ProjectList names={{ "systems.iceberg_model": "冰山模型" }} />);
    expect(host.querySelector("h2 small")?.textContent).toBe("3 個你自己的・1 個示範");
    const demoRow = host.querySelector("tr.demo");   // the free 示範專案 is always the last row (N-78)
    expect(demoRow?.querySelector("a")?.getAttribute("href")).toBe("/projects/demo/iceberg");
    expect(demoRow?.textContent).toContain("報表（示範，不花錢）");
    const rows = [...host.querySelectorAll("tbody tr:not(.demo)")];
    expect(rows.map((row) => row.querySelector("td a")?.getAttribute("href"))).toEqual(["/projects/P-NEW", "/projects/P-OLD", "/projects/P-EMPTY"]);
    const cells = [...rows[1].querySelectorAll("td")].map((cell) => cell.textContent);
    expect(cells.slice(1, 5)).toEqual(["工具：冰山模型", "報表（AI 草稿・尚未核准）（共 2 次分析）", formatTime(OLD.created_at), formatTime(OLD.updated_at)]);
    expect(cells[3]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(rows[1].querySelector("td:last-child a")?.getAttribute("href")).toBe("/projects/P-OLD/analyses/I-2");
    expect(rows[2].querySelector("td:last-child a")?.getAttribute("href")).toBe("/projects/P-EMPTY");   // nothing to show yet: the project
    expect(rows[2].textContent).toContain("還沒分析");
    await finish();
  });

  it("flags tasks due today separately from overdue or in-progress ones (M-72)", async () => {
    const dueToday = { ...OLD, tasks: { open: 2, overdue: 0, due_today: 1, next_due: "2026-09-28" } };
    vi.mocked(apiFetch).mockResolvedValue([dueToday] as never);
    const { host, done: finish } = await mount(<ProjectList names={{ "systems.iceberg_model": "冰山模型" }} />);
    expect(host.querySelector("tbody tr")?.textContent).toContain("1 個任務今天到期");
    await finish();
  });

  it("shows the six-step journey every project walks (N-79)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => (path === "/projects/erased" ? [] : [OLD]) as never);
    const { host, done: finish } = await mount(<ProjectList />);
    expect([...host.querySelectorAll(".journey span")].map((span) => span.textContent)).toEqual(["建立", "蒐集", "彙整", "分析", "報表", "核准"]);
    await finish();
  });

  it("groups 已抹除 projects at the bottom, and shows nothing when there are none (N-66)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/projects") return [OLD] as never;
      if (path === "/projects/erased") return [{ project_id: "P-GONE", erased_at: "2026-09-27T10:00:00Z", erased_by_identity_id: "U1", sources: 2, blobs_unlinked: 1, artifacts_deleted: 3, events_deleted: 5 }] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectList />);
    expect(host.querySelector("#erased")?.textContent).toContain("P-GONE");
    await finish();

    vi.mocked(apiFetch).mockImplementation(async (path) => (path === "/projects/erased" ? [] : [OLD]) as never);
    const { host: emptyHost, done: finishEmpty } = await mount(<ProjectList />);
    expect(emptyHost.querySelector("#erased")).toBeNull();
    await finishEmpty();
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

  it("keeps the project visible and shows an inline error when a task toggle fails", async () => {
    const analysis = done("I-1", "2026-09-26T11:42:11Z");
    const task = { task_id: "T1", interpretation_id: "I-1", title: "補資料", owner: "A", due: "2026-10-01", proof: "有紀錄", target: "完成", when: "本週", created_at: "2026-09-26T12:00:00Z", done: false, done_at: null };
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [analysis] as never;
      if (path === "/projects/P-OLD/sources") return [] as never;
      if (path === "/projects/P-OLD/tasks") return [task] as never;
      if (path === "/projects/P-OLD/reruns") return [] as never;
      if (path === "/projects/P-OLD/tasks/T1") throw new Error("toggle failed");
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    const checkbox = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => { checkbox.click(); await Promise.resolve(); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("toggle failed");
    expect(host.textContent).toContain("補資料");
    expect(host.textContent).toContain("看結果 →");
    await finish();
  });

  it("an owner or due date the plan left blank can be filled in later (N-84)", async () => {
    const analysis = done("I-1", "2026-09-26T11:42:11Z");
    let task = { task_id: "T1", interpretation_id: "I-1", title: "補資料", owner: "", due: "", proof: "有紀錄", target: "完成", when: "本週", created_at: "2026-09-26T12:00:00Z", done: false, done_at: null };
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [analysis] as never;
      if (path === "/projects/P-OLD/sources") return [] as never;
      if (path === "/projects/P-OLD/tasks") return [task] as never;
      if (path === "/projects/P-OLD/reruns") return [] as never;
      if (path === "/projects/P-OLD/tasks/T1" && init?.method === "POST") { task = { ...task, ...JSON.parse(String(init.body)) }; return task as never; }
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    const ownerInput = host.querySelector('input[aria-label="負責人：補資料"]') as HTMLInputElement;
    expect(ownerInput).not.toBeNull();   // an empty owner is an editable input, not bare "（待填）" text
    expect(host.querySelector('input[aria-label="期限：補資料"]')).not.toBeNull();
    await act(async () => { ownerInput.focus(); setValue(ownerInput, "A"); });
    await act(async () => { ownerInput.blur(); await Promise.resolve(); });
    expect(vi.mocked(apiFetch).mock.calls.some(([p, i]) => p === "/projects/P-OLD/tasks/T1" && i?.method === "POST" && JSON.parse(String(i!.body)).owner === "A")).toBe(true);
    await finish();
  });

  it("renames a project from its own page; a taken name shows the reason, not a raw code (N-83)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/projects/P-OLD" && init?.method === "PATCH") {
        const { name } = JSON.parse(String(init.body));
        if (name === "Taken") throw new ApiError(409, "PROJECT_NAME_ALREADY_EXISTS_IN_WORKSPACE");
        return { ...OLD, name } as never;
      }
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [] as never;
      if (path === "/projects/P-OLD/sources") return [] as never;
      if (path === "/projects/P-OLD/tasks") return [] as never;
      if (path === "/projects/P-OLD/reruns") return [] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    const input = host.querySelector('input[aria-label="專案名稱"]') as HTMLInputElement;
    const renameButton = () => [...host.querySelectorAll("button")].find((button) => button.textContent === "重新命名")!;
    await act(async () => { type(input, "New Name"); });
    await act(async () => { renameButton().click(); await Promise.resolve(); });
    expect(host.querySelector("h1")?.textContent).toBe("New Name");
    await act(async () => { type(input, "Taken"); });
    await act(async () => { renameButton().click(); await Promise.resolve(); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("已經有專案在用");
    expect(host.querySelector("h1")?.textContent).toBe("New Name");   // the failed rename did not overwrite the shown name
    await finish();
  });

  it("deletes a project from its own page after confirmation (N-65)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    // jsdom's real location.assign is not configurable enough for vi.spyOn -- replace the whole object instead.
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", { value: { ...originalLocation, assign }, writable: true, configurable: true });
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/projects/P-OLD" && init?.method === "DELETE") return { project_id: "P-OLD", erased: {} } as never;
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [] as never;
      if (path === "/projects/P-OLD/sources") return [] as never;
      if (path === "/projects/P-OLD/tasks") return [] as never;
      if (path === "/projects/P-OLD/reruns") return [] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    await act(async () => { [...host.querySelectorAll("button")].find((button) => button.textContent === "刪除專案")!.click(); await Promise.resolve(); });
    expect(window.confirm).toHaveBeenCalled();
    expect(vi.mocked(apiFetch).mock.calls.some(([path, init]) => path === "/projects/P-OLD" && init?.method === "DELETE")).toBe(true);
    expect(assign).toHaveBeenCalledWith("/projects");
    await finish();
    Object.defineProperty(window, "location", { value: originalLocation, writable: true, configurable: true });
  });

  it("lists sources with a link to their content, and adds a new one by pasting text (N-85)", async () => {
    const sources = [{ source_id: "S1", title: "客戶訪談", created_at: "2026-09-26T10:00:00Z" }];
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/projects/P-OLD/sources" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return { source_id: "S2", title: body.title, created_at: "2026-09-26T12:00:00Z" } as never;
      }
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [] as never;
      if (path === "/projects/P-OLD/sources") return sources as never;
      if (path === "/projects/P-OLD/tasks") return [] as never;
      if (path === "/projects/P-OLD/reruns") return [] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    const sourcesCard = host.querySelector("#sources")!;
    expect(sourcesCard.querySelector("li")?.textContent).toContain("客戶訪談");
    expect(sourcesCard.querySelector("a")?.getAttribute("href")).toBe("/api/projects/P-OLD/sources/S1/content");
    await act(async () => { (sourcesCard.querySelector("summary") as HTMLElement).click(); });
    await act(async () => { type(sourcesCard.querySelector('input[aria-label="來源標題"]') as HTMLInputElement, "新的來源"); });
    await act(async () => { type(sourcesCard.querySelector('textarea[aria-label="來源內容"]') as HTMLTextAreaElement, "內容文字"); });
    await act(async () => { [...sourcesCard.querySelectorAll("button")].find((button) => button.textContent === "新增來源")!.click(); await Promise.resolve(); });
    const posted = vi.mocked(apiFetch).mock.calls.find(([path, init]) => path === "/projects/P-OLD/sources" && init?.method === "POST");
    expect(JSON.parse(String(posted?.[1]?.body))).toMatchObject({ title: "新的來源", content: "內容文字", data_classification: "Confidential" });
    expect(sourcesCard.textContent).toContain("新的來源");
    await finish();
  });

  it("marks the journey's 核准 step done once the latest analysis is approved (N-79)", async () => {
    const approved = { ...done("I-1", "2026-09-26T11:42:11Z"), approval: { decision: "approve", at: "2026-09-26T12:00:00Z", by_name: "A" } };
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [approved] as never;
      if (path === "/projects/P-OLD/sources") return [{ source_id: "S1", title: "x", created_at: "2026-09-26T10:00:00Z" }] as never;
      if (path === "/projects/P-OLD/tasks") return [] as never;
      if (path === "/projects/P-OLD/reruns") return [] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    const steps = [...host.querySelectorAll(".journey span")];
    expect(steps.map((span) => span.textContent)).toEqual(["建立", "蒐集", "彙整", "分析", "報表", "核准"]);
    expect(steps.map((span) => span.className)).toEqual(["done", "done", "", "", "done", "done"]);
    await finish();
  });

  it("an analysis opened under the wrong project is refused, not shown", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ interpretation_id: "I-1", status: "DONE", project_id: "P-OTHER", method_id: "systems.iceberg_model" } as never);
    const { host, done: finish } = await mount(<AnalysisPage projectId="P-OLD" analysisId="I-1" />);
    expect(host.querySelector(".error")?.textContent).toBe("這次分析不在這個專案裡。");
    await finish();
  });
});
