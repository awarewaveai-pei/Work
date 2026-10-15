import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../lib/api";
import { todayIso } from "../lib/projects";
import { formatTime } from "../lib/time";
import { DEMOS } from "../lib/toolsheets.generated";
import { AnalysisPage } from "./AnalysisPage";
import { ProjectList } from "./ProjectList";
import { ProjectPage } from "./ProjectPage";
import { BLOCKS, blockHref, isOpen } from "../lib/blocks";

vi.mock("../lib/api", async (original) => ({ ...(await original<typeof import("../lib/api")>()), apiFetch: vi.fn() }));
// the case list's two panels read their own endpoints and have their own tests (RemindersPanel, GovernParts)
vi.mock("./blocks/RemindersPanel", () => ({ RemindersPanel: () => null }));
vi.mock("./blocks/GovernParts", async (original) => ({ ...(await original<typeof import("./blocks/GovernParts")>()), NotTherapyNotice: () => null }));
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

describe("我的案子", () => {
  it("every project opens; created and last moved read to the minute; the latest result is one click; most recent first", async () => {
    vi.mocked(apiFetch).mockResolvedValue([OLD, EMPTY, NEW] as never);
    const { host, done: finish } = await mount(<ProjectList names={{ "systems.iceberg_model": "冰山模型" }} />);
    // none has 開案資料, so all are 我的分析 -- an empty one too (a direct analysis that failed or is still running): a case
    // is only what the server calls one (is_case), never guessed from emptiness (ENTRY_SLICE1 item 7, Codex review F1)
    expect(host.querySelector("#analyses h2 small")?.textContent).toBe(`3 個你自己的・${Object.keys(DEMOS).length} 個示範`);   // one row per tool with a demo (DEMOS)
    expect(host.querySelector("#cases h2 small")?.textContent).toBe("0 個");
    const demoRow = host.querySelector("tr.demo");   // the free 示範分析 is always the last row (N-78)
    expect([...host.querySelectorAll("tr.demo")].map((row) => row.querySelector("a")?.getAttribute("href"))).toEqual(Object.keys(DEMOS).map((method) => `/projects/demo/${method}`));   // each tool's default-domain demo
    expect(demoRow?.textContent).toContain("報表（示範，不花錢）");
    const rows = [...host.querySelectorAll("#analyses tbody tr:not(.demo)")];
    expect(rows.map((row) => row.querySelector("td a")?.getAttribute("href"))).toEqual(["/projects/P-NEW", "/projects/P-OLD", "/projects/P-EMPTY"]);
    expect(rows[2].textContent).toContain("還沒分析");
    const cells = [...rows[1].querySelectorAll("td")].map((cell) => cell.textContent);
    expect(cells.slice(1, 5)).toEqual(["工具：冰山模型", "報表（AI 草稿・尚未核准）（共 2 次分析）", formatTime(OLD.created_at), formatTime(OLD.updated_at)]);
    expect(cells[3]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(rows[1].querySelector("td:last-child a")?.getAttribute("href")).toBe("/projects/P-OLD/analyses/I-2");
    await finish();
  });

  it("a project with 開案資料 is a case, the rest are 我的分析; only an analysis offers 用這份結果開案 (ENTRY_SLICE1 item 7)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => (path === "/projects/erased" ? [] : [OLD, { ...NEW, is_case: true }]) as never);
    const { host, done: finish } = await mount(<ProjectList names={{ "systems.iceberg_model": "冰山模型" }} />);
    expect([...host.querySelectorAll("#cases tbody tr")].map((row) => row.querySelector("td a")?.getAttribute("href"))).toEqual(["/projects/P-NEW"]);
    expect([...host.querySelectorAll("#analyses tbody tr:not(.demo)")].map((row) => row.querySelector("td a")?.getAttribute("href"))).toEqual(["/projects/P-OLD"]);
    expect(host.querySelector("#cases input[type=checkbox]")).toBeNull();
    expect([...host.querySelectorAll("#analyses a")].some((link) => link.getAttribute("href") === "/projects/P-OLD/start")).toBe(true);
    await finish();
  });

  it("erases ticked analyses for good only after the page says what that means (ENTRY_SLICE1 item 8)", async () => {
    const deleted: string[] = [];
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (init?.method === "DELETE") { deleted.push(String(path)); return { project_id: "P-OLD", physical_cleanup: "pending" } as never; }   // 202
      return (path === "/projects/erased" ? [] : [OLD, NEW].filter((item) => !deleted.includes(`/projects/${item.project_id}?only=analysis`))) as never;
    });
    const { host, done: finish } = await mount(<ProjectList />);
    const button = [...host.querySelectorAll("#analyses button")].find((item) => item.textContent?.startsWith("永久刪除")) as HTMLButtonElement;
    expect(button.disabled).toBe(true);   // nothing ticked
    await act(async () => { (host.querySelector("#tick-P-OLD") as HTMLInputElement).click(); });
    await act(async () => { button.click(); });
    expect(deleted).toEqual([]);   // asked first, nothing deleted yet
    const confirm = host.querySelector("#erase-confirm")!;
    expect(confirm.textContent).toContain("冰山模型 2026-09-26");
    expect(confirm.textContent).toContain("刪了就回不來");
    expect(confirm.textContent).toContain("7 天");
    await act(async () => { ([...confirm.querySelectorAll("button")].find((item) => item.textContent === "確定永久刪除") as HTMLButtonElement).click(); });
    // ?only=analysis: one that became a case in another tab since the list loaded is refused by the server (Codex review F2)
    expect(deleted).toEqual(["/projects/P-OLD?only=analysis"]);
    expect(host.querySelector("#analyses [role=status]")?.textContent).toContain("有 1 個的內容已經刪掉");   // never claims more than happened (Codex review F4)
    expect([...host.querySelectorAll("#analyses tbody tr:not(.demo)")].map((row) => row.querySelector("td a")?.getAttribute("href"))).toEqual(["/projects/P-NEW"]);
    // a second batch does not hide the first one's cleanup (Codex review 2026-10-11 F3)
    await act(async () => { (host.querySelector("#tick-P-NEW") as HTMLInputElement).click(); });
    await act(async () => { button.click(); });
    await act(async () => { ([...host.querySelectorAll("#erase-confirm button")].find((item) => item.textContent === "確定永久刪除") as HTMLButtonElement).click(); });
    expect(host.querySelector("#analyses [role=status]")?.textContent).toContain("有 2 個的內容已經刪掉");
    await finish();
  });

  it("flags tasks due today separately from overdue or in-progress ones (M-72)", async () => {
    const dueToday = { ...OLD, tasks: { open: 2, overdue: 0, due_today: 1, next_due: "2026-09-28" } };
    vi.mocked(apiFetch).mockResolvedValue([dueToday] as never);
    const { host, done: finish } = await mount(<ProjectList names={{ "systems.iceberg_model": "冰山模型" }} />);
    expect(host.querySelector("tbody tr")?.textContent).toContain("1 個任務今天到期");
    await finish();
  });

  it("shows every block a case can use, not one fixed line (contract card 共用紀錄)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => (path === "/projects/erased" ? [] : [OLD]) as never);
    const { host, done: finish } = await mount(<ProjectList />);
    const slots = [...host.querySelectorAll(".journey span, .journey i")].map((node) => node.textContent);
    expect(slots).toHaveLength(BLOCKS.length);
    expect(slots[0]).toBe("1 外化");
    expect(host.querySelector(".journey")?.textContent).not.toContain("核准");
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
      if (path === "/projects/P-OLD/tasks") return [{ task_id: "T1", interpretation_id: "I-1", title: "補齊三項數據", owner: "帶領者", due: "2020-01-31", proof: "有基準值", target: "第 2 週前", when: "1 到 2 週", created_at: "2026-09-26T12:00:00Z", status: "not_started", done: false, done_at: null }] as never;
      if (path === "/projects/P-OLD/reruns") return [{ rerun_id: "R1", interpretation_id: "I-1", method_id: "systems.iceberg_model", due: "2020-04-30", scheduled_at: "2026-09-26T12:00:00Z", fulfilled_by: null, fulfilled_at: null }] as never;
      if (path === "/projects/P-OLD/history") return [] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" names={{ "systems.iceberg_model": "冰山模型" }} />);
    expect(host.querySelector(".crumbs")?.textContent).toBe("我的分析 › 冰山模型 2026-09-26");   // no is_case: an analysis, not a case
    expect(host.querySelector(".status")?.textContent).toContain(`建立 ${formatTime(OLD.created_at)}`);
    const rows = [...host.querySelector("table")!.querySelectorAll("tbody tr")];   // the only table on the page now: tasks render as cards
    expect(rows.map((row) => row.querySelector("td")?.textContent)).toEqual(analyses.map((item) => formatTime(item.requested_at)));
    expect(rows[0].querySelector("a.btn")?.getAttribute("href")).toBe("/projects/P-OLD/analyses/I-3");   // still running: its progress
    expect([rows[1].querySelector("a.btn")?.getAttribute("href"), rows[1].querySelector("a.btn")?.textContent]).toEqual(["/projects/P-OLD/analyses/I-2", "看原因 →"]);   // every analysis opens
    expect(rows[1].querySelector("details")?.textContent).toContain("INTERPRETATION_NOT_JSON");
    expect(rows[2].querySelector("a.btn")?.textContent).toBe("看結果 →");
    expect(rows[2].textContent).toContain("同意");
    expect(host.querySelector('a[href="/methods/systems.iceberg_model/run?project=P-OLD"]')?.textContent).toBe("在這份分析再用「冰山模型」分析一次");
    // tasks and a due rerun reminder show on the project page (⑦ 存成任務 / 到期重跑並比較)
    expect(host.textContent).toContain("補齊三項數據");
    expect(host.textContent).toContain("（逾期）");
    expect(host.querySelector('a[href="/projects/P-OLD/analyses/I-1?rerun=R1"]')).not.toBeNull();
    await finish();
  });

  it("a project that is not yours or is gone says so", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(404, "PROJECT_NOT_FOUND"));
    const { host, done: finish } = await mount(<ProjectPage projectId="P-X" />);
    expect(host.querySelector(".error")?.textContent).toContain("找不到這個案子或分析");
    await finish();
  });

  it("keeps the project visible and shows an inline error when a task status update fails", async () => {
    const analysis = done("I-1", "2026-09-26T11:42:11Z");
    const task = { task_id: "T1", interpretation_id: "I-1", title: "補資料", owner: "A", due: "2026-10-01", proof: "有紀錄", target: "完成", when: "本週", created_at: "2026-09-26T12:00:00Z", status: "not_started", done: false, done_at: null };
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [analysis] as never;
      if (path === "/projects/P-OLD/sources") return [] as never;
      if (path === "/projects/P-OLD/tasks") return [task] as never;
      if (path === "/projects/P-OLD/reruns") return [] as never;
      if (path === "/projects/P-OLD/history") return [] as never;
      if (path === "/projects/P-OLD/tasks/T1") throw new Error("toggle failed");
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    expect(host.querySelector('select')).toBeNull();   // status is visible buttons, never a dropdown
    const doneButton = [...host.querySelectorAll("button")].find((button) => button.textContent === "完成")!;
    await act(async () => { doneButton.click(); await Promise.resolve(); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("toggle failed");
    expect(host.textContent).toContain("補資料");
    expect(host.textContent).toContain("看結果 →");
    await finish();
  });

  it("updates a task's status with a visible button, and the new status shows after reload", async () => {
    const analysis = done("I-1", "2026-09-26T11:42:11Z");
    let task = { task_id: "T1", interpretation_id: "I-1", title: "補資料", owner: "A", due: "2026-10-01", proof: "有紀錄", target: "完成", when: "本週", created_at: "2026-09-26T12:00:00Z", status: "not_started", done: false, done_at: null };
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [analysis] as never;
      if (path === "/projects/P-OLD/sources") return [] as never;
      if (path === "/projects/P-OLD/tasks") return [task] as never;
      if (path === "/projects/P-OLD/reruns") return [] as never;
      if (path === "/projects/P-OLD/history") return [] as never;
      if (path === "/projects/P-OLD/tasks/T1" && init?.method === "POST") { task = { ...task, ...JSON.parse(String(init.body)) }; return task as never; }
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    const progressButton = [...host.querySelectorAll("button")].find((button) => button.textContent === "進行中")!;
    await act(async () => { progressButton.click(); await Promise.resolve(); });
    expect(vi.mocked(apiFetch).mock.calls.some(([p, i]) => p === "/projects/P-OLD/tasks/T1" && i?.method === "POST" && JSON.parse(String(i!.body)).status === "in_progress")).toBe(true);
    const refreshed = [...host.querySelectorAll("button")].find((button) => button.textContent === "進行中")!;
    expect(refreshed.getAttribute("aria-pressed")).toBe("true");
    await finish();
  });

  it("an owner or due date the plan left blank can be filled in later (N-84)", async () => {
    const analysis = done("I-1", "2026-09-26T11:42:11Z");
    let task = { task_id: "T1", interpretation_id: "I-1", title: "補資料", owner: "", due: "", proof: "有紀錄", target: "完成", when: "本週", created_at: "2026-09-26T12:00:00Z", status: "not_started", done: false, done_at: null };
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [analysis] as never;
      if (path === "/projects/P-OLD/sources") return [] as never;
      if (path === "/projects/P-OLD/tasks") return [task] as never;
      if (path === "/projects/P-OLD/reruns") return [] as never;
      if (path === "/projects/P-OLD/history") return [] as never;
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
      if (path === "/projects/P-OLD/history") return [] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    const input = host.querySelector('input[aria-label="分析名稱"]') as HTMLInputElement;
    const renameButton = () => [...host.querySelectorAll("button")].find((button) => button.textContent === "重新命名")!;
    await act(async () => { type(input, "New Name"); });
    await act(async () => { renameButton().click(); await Promise.resolve(); });
    expect(host.querySelector("h1")?.textContent).toBe("New Name");
    await act(async () => { type(input, "Taken"); });
    await act(async () => { renameButton().click(); await Promise.resolve(); });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("已經有案子或分析在用");
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
      if (path === "/projects/P-OLD/history") return [] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    await act(async () => { [...host.querySelectorAll("button")].find((button) => button.textContent === "刪除分析")!.click(); await Promise.resolve(); });
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
      if (path === "/projects/P-OLD/history") return [] as never;
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

  it("puts the case's 14 slots and its intake on the case page (one link per open block)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [] as never;
      if (path === "/projects/P-OLD/sources") return [] as never;
      if (path === "/projects/P-OLD/tasks") return [] as never;
      if (path === "/projects/P-OLD/reruns") return [] as never;
      if (path === "/projects/P-OLD/history") return [] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    const links = [...host.querySelectorAll(".journey a")].map((link) => link.getAttribute("href"));
    expect(links).toEqual(BLOCKS.filter(isOpen).map((block) => blockHref("P-OLD", block)));
    expect(links).toContain("/me/teach");   // 課程 is yours, not the case's: never /projects/P-OLD/teach (no such page)
    expect(host.querySelector('a[href="/projects/P-OLD/start"]')).not.toBeNull();
    await finish();
  });

  it("writes a task journal entry with a number and shows it afterward", async () => {
    const analysis = done("I-1", "2026-09-26T11:42:11Z");
    let task = { task_id: "T1", interpretation_id: null as string | null, title: "補資料", owner: "A", due: "2026-10-01", proof: "有紀錄", target: "完成", when: "本週", created_at: "2026-09-26T12:00:00Z", status: "not_started", done: false, done_at: null, notes: [] as Array<Record<string, unknown>>, next_check: null };
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [analysis] as never;
      if (path === "/projects/P-OLD/sources") return [] as never;
      if (path === "/projects/P-OLD/tasks") return [task] as never;
      if (path === "/projects/P-OLD/reruns") return [] as never;
      if (path === "/projects/P-OLD/history") return [] as never;
      if (path === "/projects/P-OLD/tasks/T1/notes" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        task = { ...task, notes: [...task.notes, { note_id: "N1", happened: body.happened, thoughts: "", adjustment: "", blocker: "", numbers: body.numbers, next_check: body.next_check ?? null, at: "2026-09-27T09:00:00Z" }] };
        return task as never;
      }
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    const summary = [...host.querySelectorAll("summary")].find((element) => element.textContent === "寫一筆紀錄")!;
    await act(async () => { summary.click(); });
    await act(async () => { type(host.querySelector('textarea[aria-label="實際狀況：補資料"]') as HTMLTextAreaElement, "第一週訪談 5 人"); });
    await act(async () => { [...host.querySelectorAll("button")].find((button) => button.textContent === "加一個實際數字")!.click(); });
    await act(async () => { type(host.querySelector('input[aria-label="數字名稱 1：補資料"]') as HTMLInputElement, "訪談人數"); });
    await act(async () => { type(host.querySelector('input[aria-label="數值 1：補資料"]') as HTMLInputElement, "5"); });
    await act(async () => { [...host.querySelectorAll("button")].find((button) => button.textContent === "存這筆紀錄")!.click(); await Promise.resolve(); });
    const posted = vi.mocked(apiFetch).mock.calls.find(([p, i]) => p === "/projects/P-OLD/tasks/T1/notes" && i?.method === "POST");
    expect(JSON.parse(String(posted?.[1]?.body))).toMatchObject({ happened: "第一週訪談 5 人", numbers: [{ name: "訪談人數", value: 5, unit: "" }] });
    expect(host.textContent).toContain("第一週訪談 5 人");
    await finish();
  });

  it("adds a task from a card, nested under its parent (從這張卡新增任務)", async () => {
    const analysis = done("I-1", "2026-09-26T11:42:11Z");
    const parentTask = { task_id: "T1", interpretation_id: "I-1", title: "父任務", owner: "A", due: "2026-10-01", proof: "", target: "", when: "", created_at: "2026-09-26T12:00:00Z", status: "not_started", done: false, done_at: null, notes: [], next_check: null, parent_task_id: null, kind: "task" };
    let tasksList: unknown[] = [parentTask];
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [analysis] as never;
      if (path === "/projects/P-OLD/sources") return [] as never;
      if (path === "/projects/P-OLD/tasks" && init?.method === "POST") {
        const child = { task_id: "T2", interpretation_id: "I-1", title: "子任務", owner: "", due: "2026-11-01", proof: "", target: "", when: "", created_at: "2026-09-27T09:00:00Z", status: "not_started", done: false, done_at: null, notes: [], next_check: null, parent_task_id: "T1", kind: "task" };
        tasksList = [parentTask, child];
        return tasksList as never;
      }
      if (path === "/projects/P-OLD/tasks") return tasksList as never;
      if (path === "/projects/P-OLD/reruns") return [] as never;
      if (path === "/projects/P-OLD/history") return [] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    await act(async () => { [...host.querySelectorAll("button")].find((button) => button.textContent === "從這張卡新增任務")!.click(); });
    await act(async () => { type(host.querySelector('input[aria-label="新任務標題：父任務"]') as HTMLInputElement, "子任務"); });
    await act(async () => { type(host.querySelector('input[aria-label="新任務期限：父任務"]') as HTMLInputElement, "2026-11-01"); });
    await act(async () => { [...host.querySelectorAll("button")].find((button) => button.textContent === "新增任務")!.click(); await Promise.resolve(); });
    const posted = vi.mocked(apiFetch).mock.calls.find(([p, i]) => p === "/projects/P-OLD/tasks" && i?.method === "POST");
    expect(JSON.parse(String(posted?.[1]?.body))).toMatchObject({ parent_task_id: "T1", kind: "task", tasks: [{ title: "子任務", due: "2026-11-01" }] });
    expect(host.querySelectorAll(".tcard.child").length).toBe(1);
    expect(host.querySelector(".tcard.child")?.textContent).toContain("子任務");
    await finish();
  });

  it("adds a plan-change child with a note in one action (調整方案)", async () => {
    const analysis = done("I-1", "2026-09-26T11:42:11Z");
    const parentTask = { task_id: "T1", interpretation_id: "I-1", title: "父任務", owner: "A", due: "2026-10-01", proof: "", target: "", when: "", created_at: "2026-09-26T12:00:00Z", status: "not_started", done: false, done_at: null, notes: [], next_check: null, parent_task_id: null, kind: "task" };
    let tasksList: unknown[] = [parentTask];
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [analysis] as never;
      if (path === "/projects/P-OLD/sources") return [] as never;
      if (path === "/projects/P-OLD/tasks" && init?.method === "POST") {
        const child = { task_id: "T2", interpretation_id: "I-1", title: "調整方案 A", owner: "", due: todayIso(), proof: "", target: "", when: "", created_at: "2026-09-27T09:00:00Z", status: "not_started", done: false, done_at: null, notes: [], next_check: null, parent_task_id: "T1", kind: "plan_change" };
        tasksList = [parentTask, child];
        return tasksList as never;
      }
      if (path === "/projects/P-OLD/tasks") return tasksList as never;
      if (path === "/projects/P-OLD/tasks/T2/notes" && init?.method === "POST") return (tasksList as Array<Record<string, unknown>>)[1] as never;
      if (path === "/projects/P-OLD/reruns") return [] as never;
      if (path === "/projects/P-OLD/history") return [] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    await act(async () => { [...host.querySelectorAll("button")].find((button) => button.textContent === "調整方案")!.click(); });
    await act(async () => { type(host.querySelector('input[aria-label="調整方案標題：父任務"]') as HTMLInputElement, "調整方案 A"); });
    await act(async () => { type(host.querySelector('textarea[aria-label="調整方案說明：父任務"]') as HTMLTextAreaElement, "原本的做法卡住了"); });
    await act(async () => { [...host.querySelectorAll("button")].find((button) => button.textContent === "新增調整方案")!.click(); await Promise.resolve(); });
    const posted = vi.mocked(apiFetch).mock.calls.find(([p, i]) => p === "/projects/P-OLD/tasks" && i?.method === "POST");
    expect(JSON.parse(String(posted?.[1]?.body))).toMatchObject({ parent_task_id: "T1", kind: "plan_change", tasks: [{ title: "調整方案 A", due: todayIso() }] });
    const noted = vi.mocked(apiFetch).mock.calls.find(([p, i]) => p === "/projects/P-OLD/tasks/T2/notes" && i?.method === "POST");
    expect(JSON.parse(String(noted?.[1]?.body))).toMatchObject({ adjustment: "原本的做法卡住了" });
    await finish();
  });

  it("reruns now: reuses an open reminder without scheduling a new one (現在重跑並比較)", async () => {
    const analysis = done("I-1", "2026-09-26T11:42:11Z");
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", { value: { ...originalLocation, assign }, writable: true, configurable: true });
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [analysis] as never;
      if (path === "/projects/P-OLD/sources") return [] as never;
      if (path === "/projects/P-OLD/tasks") return [] as never;
      if (path === "/projects/P-OLD/reruns") return [{ rerun_id: "R1", interpretation_id: "I-1", method_id: "systems.iceberg_model", due: "2030-01-01", scheduled_at: "2026-09-26T12:00:00Z", fulfilled_by: null, fulfilled_at: null }] as never;
      if (path === "/projects/P-OLD/history") return [] as never;
      if (path === "/interpretations/I-1/rerun") throw new Error("should not schedule a new one when an open reminder already exists");
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    const rerunButton = [...host.querySelectorAll("button")].find((button) => button.textContent === "現在重跑並比較 →")!;
    await act(async () => { rerunButton.click(); await Promise.resolve(); });
    expect(assign).toHaveBeenCalledWith("/projects/P-OLD/analyses/I-1?rerun=R1");
    await finish();
    Object.defineProperty(window, "location", { value: originalLocation, writable: true, configurable: true });
  });

  it("reruns now: schedules one due today when there is no open reminder yet", async () => {
    const analysis = done("I-1", "2026-09-26T11:42:11Z");
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", { value: { ...originalLocation, assign }, writable: true, configurable: true });
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [analysis] as never;
      if (path === "/projects/P-OLD/sources") return [] as never;
      if (path === "/projects/P-OLD/tasks") return [] as never;
      if (path === "/projects/P-OLD/reruns") return [] as never;
      if (path === "/projects/P-OLD/history") return [] as never;
      if (path === "/interpretations/I-1/rerun" && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ due: todayIso() });
        return { rerun_id: "R2", interpretation_id: "I-1", method_id: "systems.iceberg_model", due: todayIso(), scheduled_at: "2026-09-27T09:00:00Z", fulfilled_by: null, fulfilled_at: null } as never;
      }
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    const rerunButton = [...host.querySelectorAll("button")].find((button) => button.textContent === "現在重跑並比較 →")!;
    await act(async () => { rerunButton.click(); await Promise.resolve(); });
    expect(assign).toHaveBeenCalledWith("/projects/P-OLD/analyses/I-1?rerun=R2");
    await finish();
    Object.defineProperty(window, "location", { value: originalLocation, writable: true, configurable: true });
  });

  it("shows the project's history newest first, from raw events, sources and fulfilled reruns", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/projects/P-OLD") return OLD as never;
      if (path === "/projects/P-OLD/analyses") return [] as never;
      if (path === "/projects/P-OLD/sources") return [{ source_id: "S1", title: "客戶訪談", created_at: "2026-09-26T09:00:00Z" }] as never;
      if (path === "/projects/P-OLD/tasks") return [{ task_id: "T1", interpretation_id: "I-1", title: "補資料", owner: "A", due: "2026-10-01", proof: "", target: "", when: "", created_at: "2026-09-26T10:00:00Z", status: "done", done: true, done_at: "2026-09-27T09:00:00Z", notes: [], next_check: null }] as never;
      if (path === "/projects/P-OLD/reruns") return [{ rerun_id: "R1", interpretation_id: "I-1", method_id: "systems.iceberg_model", due: "2026-09-20", scheduled_at: "2026-09-15T09:00:00Z", fulfilled_by: "I-2", fulfilled_at: "2026-09-28T09:00:00Z" }] as never;
      if (path === "/projects/P-OLD/history") return [
        { event_id: "E1", event_type: "ProjectRenamed", occurred_at: "2026-09-26T08:00:00Z", payload: { name: "冰山模型 2026-09-26" } },
        { event_id: "E2", event_type: "TaskCreated", occurred_at: "2026-09-26T10:00:00Z", payload: { task_id: "T1", title: "補資料", kind: "task" } },
        { event_id: "E3", event_type: "TaskDone", occurred_at: "2026-09-27T09:00:00Z", payload: { task_id: "T1", done: true } },
      ] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done: finish } = await mount(<ProjectPage projectId="P-OLD" />);
    const historyCard = [...host.querySelectorAll(".card")].find((card) => card.querySelector("h2")?.textContent?.startsWith("歷程"))!;
    const lines = [...historyCard.querySelectorAll("li")].map((item) => item.textContent);
    expect(lines[0]).toContain("重跑完成");            // 2026-09-28, the newest
    expect(lines[1]).toContain("補資料：標記完成");     // 2026-09-27
    expect(lines[2]).toContain("新增任務：補資料");     // 2026-09-26T10:00
    expect(lines[3]).toContain("新增來源：客戶訪談");   // 2026-09-26T09:00
    expect(lines[4]).toContain("改名為「冰山模型 2026-09-26」");   // 2026-09-26T08:00, the oldest
    await finish();
  });

  it("an analysis opened under the wrong project is refused, not shown", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ interpretation_id: "I-1", status: "DONE", project_id: "P-OTHER", method_id: "systems.iceberg_model" } as never);
    const { host, done: finish } = await mount(<AnalysisPage projectId="P-OLD" analysisId="I-1" />);
    expect(host.querySelector(".error")?.textContent).toBe("這次分析不在這裡。");
    await finish();
  });
});
