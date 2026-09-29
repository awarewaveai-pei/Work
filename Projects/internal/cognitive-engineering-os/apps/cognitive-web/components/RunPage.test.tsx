import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../lib/api";
import { RunPage } from "./RunPage";

vi.mock("../lib/api", async (original) => ({ ...(await original<typeof import("../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.resetAllMocks(); window.history.replaceState(null, "", "/"); sessionStorage.clear(); });

const FORM = { display: { name_zh: "冰山模型", name_en: "Iceberg Model" }, form: { fields: [{ key: "events", kind: "list", label: "① 事件：發生了什麼？" }] } };
const posts = (path: string) => vi.mocked(apiFetch).mock.calls.filter(([called, init]) => called === path && init?.method === "POST");
async function mount(element: React.ReactElement) {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}
async function run(host: HTMLElement) {
  await act(async () => { host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(); });
  expect(posts("/methods/systems.iceberg_model/interpret")).toHaveLength(0);   // 花錢前先講: nothing runs until 確認執行
  expect(host.textContent).toContain("要花多少");
  await act(async () => { [...host.querySelectorAll("button")].find((button) => button.textContent === "確認執行")!.click(); });
}

describe("run page", () => {
  it("makes no project on opening; 執行分析 makes a new one named after the tool and the minute, and the address becomes the analysis's own", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/methods/systems.iceberg_model/form") return FORM as never;
      if (path === "/projects" && init?.method === "POST") return { project_id: "P-NEW", name: JSON.parse(String(init.body)).name, created_at: "2026-09-26T15:51:00Z" } as never;
      if (path === "/projects") return [{ project_id: "P-OLD", name: "冰山模型 2026-09-26", created_at: "2026-09-26T09:53:16Z" }] as never;
      if (path === "/methods/systems.iceberg_model/interpret") return { interpretation_id: "INTERP-1", status: "PENDING" } as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done } = await mount(<RunPage methodId="systems.iceberg_model" lesson={null} />);
    expect(host.textContent).not.toContain("Project ID");
    expect(posts("/projects")).toHaveLength(0);   // opening the page makes nothing
    expect(host.textContent).toContain("存到：新專案");
    expect(host.querySelector(".top a.howto")?.getAttribute("href")).toBe("/methods/systems.iceberg_model");   // no lesson: the tool page
    await run(host);
    expect(posts("/projects")).toHaveLength(1);
    expect(JSON.parse(String(posts("/projects")[0][1]?.body)).name).toMatch(/^冰山模型 \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(JSON.parse(String(posts("/methods/systems.iceberg_model/interpret")[0][1]?.body)).project_id).toBe("P-NEW");   // not the old project
    expect(window.location.pathname).toBe("/projects/P-NEW/analyses/INTERP-1");
    expect(host.querySelector(".crumbs a[href='/projects/P-NEW']")?.textContent).toMatch(/^冰山模型 /);
    await done();
  });

  it("#demo=<domain> fills that lesson domain's example; plain #demo the default one (N-55)", async () => {
    const form = { ...FORM, form: { ...FORM.form, example: { input: { events: ["預設例子"] }, sets: { partner: { input: { events: ["畫廊的例子"] } } } } } };
    vi.mocked(apiFetch).mockImplementation(async (path) => (String(path).endsWith("/form") ? form : String(path) === "/projects" ? [] : {}) as never);
    window.history.replaceState(null, "", "/methods/systems.iceberg_model/run#demo=partner");
    const first = await mount(<RunPage methodId="systems.iceberg_model" lesson={null} />);
    expect(first.host.querySelector<HTMLTextAreaElement>("#f-events")!.value).toBe("畫廊的例子");   // the field, not the 懶人填寫 box
    await first.done();
    window.history.replaceState(null, "", "/methods/systems.iceberg_model/run#demo");
    const second = await mount(<RunPage methodId="systems.iceberg_model" lesson={null} />);
    expect(second.host.querySelector<HTMLTextAreaElement>("#f-events")!.value).toBe("預設例子");
    await second.done();
    window.history.replaceState(null, "", "/");
  });

  it("from a project page (?project=): the analysis goes into that project, no new one", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/methods/systems.iceberg_model/form") return FORM as never;
      if (path === "/projects") return [{ project_id: "P1", name: "團體反思", created_at: "2026-09-26T09:53:16Z" }] as never;
      if (path === "/methods/systems.iceberg_model/interpret") return { interpretation_id: "INTERP-2", status: "PENDING" } as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done } = await mount(<RunPage methodId="systems.iceberg_model" lesson={null} projectId="P1" />);
    expect(host.querySelector("#input a[href='/projects/P1']")?.textContent).toBe("團體反思");
    await run(host);
    expect(posts("/projects")).toHaveLength(0);
    expect(JSON.parse(String(posts("/methods/systems.iceberg_model/interpret")[0][1]?.body)).project_id).toBe("P1");
    expect(window.location.pathname).toBe("/projects/P1/analyses/INTERP-2");
    await done();
  });

  it("two new projects in the same minute: the second is named … (2), not refused", async () => {
    let first = true;
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/methods/systems.iceberg_model/form") return FORM as never;
      if (path === "/projects" && init?.method === "POST") { if (first) { first = false; throw new ApiError(409, "PROJECT_NAME_ALREADY_EXISTS_IN_WORKSPACE"); } return { project_id: "P-2", name: JSON.parse(String(init.body)).name, created_at: "2026-09-26T15:51:00Z" } as never; }
      if (path === "/projects") return [] as never;
      if (path === "/methods/systems.iceberg_model/interpret") return { interpretation_id: "INTERP-3", status: "PENDING" } as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done } = await mount(<RunPage methodId="systems.iceberg_model" lesson={null} />);
    await run(host);
    const names = posts("/projects").map(([, init]) => JSON.parse(String(init?.body)).name as string);
    expect(names).toHaveLength(2);
    expect(names[1]).toBe(`${names[0]} (2)`);
    expect(JSON.parse(String(posts("/methods/systems.iceberg_model/interpret")[0][1]?.body)).project_id).toBe("P-2");
    await done();
  });

  it("opened in a new tab by ⑧, takes the hand-over from localStorage into its own session, and ignores a stale one (operator 2026-09-29)", async () => {
    const ONE_FIELD = { display: { name_zh: "冰山模型", name_en: "Iceberg Model" }, form: { fields: [{ key: "events", kind: "list", label: "① 事件：發生了什麼？" }] } };
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/methods/systems.iceberg_model/form") return ONE_FIELD as never;
      if (path === "/projects") return [] as never;
      throw new Error(`unexpected: ${path}`);
    });
    localStorage.setItem("cos:prefill:systems.iceberg_model", JSON.stringify({ values: { events: "新分頁帶來的" }, needs: [], from: { name: "冰山模型", approved: false }, at: Date.now() }));
    const fresh = await mount(<RunPage methodId="systems.iceberg_model" lesson={null} />);
    expect(fresh.host.querySelector<HTMLTextAreaElement>("#f-events")?.value).toBe("新分頁帶來的");
    expect(localStorage.getItem("cos:prefill:systems.iceberg_model")).toBeNull();   // taken once
    expect(sessionStorage.getItem("cos:prefill:systems.iceberg_model")).not.toBeNull();   // kept for a reload until a run launches (N-22)
    await fresh.done();
    sessionStorage.clear();
    localStorage.setItem("cos:prefill:systems.iceberg_model", JSON.stringify({ values: { events: "昨天的" }, needs: [], from: { name: "冰山模型" }, at: Date.now() - 11 * 60 * 1000 }));
    const stale = await mount(<RunPage methodId="systems.iceberg_model" lesson={null} />);
    expect(stale.host.querySelector<HTMLTextAreaElement>("#f-events")?.value ?? "").not.toBe("昨天的");
    expect(localStorage.getItem("cos:prefill:systems.iceberg_model")).toBeNull();
    await stale.done();
  });

  it("carries a next-step prefill once, coerced to the field kind, marks what it still needs, and clears it only after a run launches", async () => {
    const TWO_FIELDS = { display: { name_zh: "冰山模型", name_en: "Iceberg Model" }, form: { fields: [{ key: "events", kind: "list", label: "① 事件：發生了什麼？" }, { key: "patterns", kind: "list", label: "② 模式：以前發生過嗎？" }] } };
    sessionStorage.setItem("cos:prefill:systems.iceberg_model", JSON.stringify({ values: { events: "一句話", bogus: "x" }, needs: ["patterns", "bogus"], from: { name: "冰山模型", approved: true } }));
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === "/methods/systems.iceberg_model/form") return TWO_FIELDS as never;
      if (path === "/projects" && init?.method === "POST") return { project_id: "P-NEW", name: JSON.parse(String(init.body)).name, created_at: "2026-09-26T15:51:00Z" } as never;
      if (path === "/projects") return [] as never;
      if (path === "/methods/systems.iceberg_model/interpret") return { interpretation_id: "INTERP-5", status: "PENDING" } as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done } = await mount(<RunPage methodId="systems.iceberg_model" lesson={null} />);
    expect(host.querySelector<HTMLTextAreaElement>("#f-events")?.value).toBe("一句話");   // a plain string coerced into the list field (N-21)
    expect(host.textContent).toContain("從「冰山模型分析」帶入 1 格");   // only the real field is counted; "bogus" is not (N-13)
    expect(host.textContent).toContain("引用自已核准的版本");   // N-45
    expect(host.querySelector<HTMLTextAreaElement>("#f-patterns")?.closest(".field")?.className).toContain("need");
    expect(host.querySelector<HTMLTextAreaElement>("#f-events")?.closest(".field")?.className).not.toContain("need");
    expect(sessionStorage.getItem("cos:prefill:systems.iceberg_model")).not.toBeNull();   // still there: no run launched yet
    await run(host);
    expect(sessionStorage.getItem("cos:prefill:systems.iceberg_model")).toBeNull();   // cleared only once the run actually launches (N-22)
    await done();
  });

  it("a saved analysis opens with its result, its project in the crumbs, its time, its judgment, and the fields refilled", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/methods/systems.iceberg_model/form") return FORM as never;
      if (path === "/projects") return [{ project_id: "P1", name: "團體反思", created_at: "2026-09-26T09:53:16Z" }] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const saved = {
      interpretation_id: "INTERP-9", status: "DONE" as const, project_id: "P1", method_id: "systems.iceberg_model", created_at: "2026-09-26T15:52:42Z",
      record: { events: ["第 6 次只有 2 位分享"] }, manifest: [{ id: "r/events/0", kind: "record", path: "r/events/0", value: "第 6 次只有 2 位分享" }],
      gate_results: [{ gate_id: "citation_integrity", status: "PASS" }], judgment: { stance: "partial" as const, text: "人數對，原因不確定" },
      result: { interpretation_id: "INTERP-9", method_id: "systems.iceberg_model", findings: [{ id: "F1", title: "分享變少", text: "分享變少了。", citations: ["r/events/0"], confidence: { level: "mid", reason: "一句" } }], visual: { kind: "layered", bindings: { levels: [{ label: "事件", path: "r/events" }] } }, next_methods: [], provenance: {}, model: "m", usage: {} },
    };
    const { host, done } = await mount(<RunPage methodId="systems.iceberg_model" lesson={null} projectId="P1" analysis={saved} />);
    expect(host.querySelector('[data-section="1"]')).not.toBeNull();
    expect(host.querySelector(".crumbs a[href='/projects/P1']")?.textContent).toBe("團體反思");
    expect(host.querySelector('[data-section="0"] .sub')?.textContent).toMatch(/^工具：冰山模型 Iceberg Model・專案「團體反思」・2026-09-2\d \d{2}:52$/);
    expect(host.querySelector<HTMLTextAreaElement>("#f-events")?.value).toBe("第 6 次只有 2 位分享");
    expect(host.querySelector(".judgment-button[aria-pressed='true']")?.textContent).toBe("部分同意");
    expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="你的判斷"]')?.value).toBe("人數對，原因不確定");
    expect(posts("/projects")).toHaveLength(0);
    await done();
  });

  it("a saved analysis that failed says why and that its fields were not kept", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/methods/systems.iceberg_model/form") return FORM as never;
      if (path === "/projects") return [{ project_id: "P1", name: "團體反思", created_at: "2026-09-26T09:53:16Z" }] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const failure = { interpretation_id: "INTERP-8", status: "FAILED" as const, project_id: "P1", method_id: "systems.iceberg_model", error: "AI_PROVIDER_UNAVAILABLE" };
    const { host, done } = await mount(<RunPage methodId="systems.iceberg_model" lesson={null} projectId="P1" analysis={failure} />);
    expect(host.querySelector("#input .error")?.textContent).toBe("這次分析沒有完成：AI 服務這次沒有給出可用的回答；再執行一次即可。這次填的內容沒有存下來（只有分析完成才會存），要再分析請重新填格子。");
    expect(host.querySelector<HTMLTextAreaElement>("#f-events")?.value).toBe("");
    expect(host.querySelector('[data-section="1"]')).toBeNull();
    expect(host.querySelector(".status .pill")?.textContent).toBe("上次分析沒有完成");
    await done();
  });

  it("a tool with a lesson: the header and the reading line open it in a new tab (mock run page header)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === "/methods/systems.iceberg_model/form") return { display: { name_zh: "冰山模型", name_en: "Iceberg Model" }, form: { fields: [] } } as never;
      if (path === "/projects") return [{ project_id: "P1", name: "團體反思", created_at: "2026-09-26T09:53:16Z" }] as never;
      throw new Error(`unexpected: ${path}`);
    });
    const { host, done } = await mount(<RunPage methodId="systems.iceberg_model" lesson="/learn/systems.iceberg_model" />);
    const howto = host.querySelector(".top a.howto")!;
    expect([howto.getAttribute("href"), howto.getAttribute("target"), howto.textContent]).toEqual(["/learn/systems.iceberg_model", "_blank", "怎麼用？先上 5 分鐘的課 ↗"]);
    expect(host.querySelector('.how a[href="/learn/systems.iceberg_model#panel-read"]')?.getAttribute("target")).toBe("_blank");
    expect(host.querySelector(".crumbs")?.textContent).toBe("我的專案 › 冰山模型分析");
    expect(host.querySelector(".sub")?.textContent).toBe("工具：冰山模型 Iceberg Model");
    await done();
  });
});
