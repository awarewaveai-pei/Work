import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api";
import { TeachPage, type Lesson, type PracticeCase } from "./TeachPage";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

const LESSONS: Lesson[] = [
  { id: "draft-lesson", subject: "自我理解", version: 1, state: "draft", minutes: 5, title: "先把自己看清楚", text: "先把看到的事情和自己的解讀分開。", example: "先寫看到的情況，再寫自己的猜測。", teaches: ["分開觀察和解讀"] },
  { id: "reviewed-lesson", subject: "自我理解", version: 1, state: "reviewed", minutes: 5, title: "把下一步寫清楚", text: "先寫一個看得到的情況。", example: "再寫下一個小動作。", teaches: ["寫下一個小動作"] },
];
const CASE: PracticeCase = { id: "weather", version: 2, title: "台灣的公開天氣公告", text: "只討論公告的時間、地點和查找步驟。", place: "台灣", source: { kind: "publisher", name: "中央氣象署", checked_on: "尚未查核" } };
const CASE_TWO: PracticeCase = { ...CASE, id: "notice", title: "台灣大學的公開活動公告", source: { ...CASE.source, name: "國立臺灣大學" } };

const doc = <C,>(kind: string, content: C, author: "user" | "ai" = "user") => ({ doc_id: `${kind}-1`, kind, version: 1, content, author, block: "TEACH", at: "2026-10-04T00:00:00Z" });

async function openPage(config: { lessons?: Lesson[]; runs?: any[]; aars?: any[]; completions?: any[]; preferences?: any[]; opponents?: any[]; feedback?: any[] } = {}) {
  const writes: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
  vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    if (method !== "GET") writes.push({ path, method, body });
    if (path === "/me/docs/teach.run" && method !== "GET") return { ...doc("teach.run", body?.content, "user"), notices: [] } as never;
    if (path === "/me/docs/teach.aar" && method !== "GET") return { ...doc("teach.aar", body?.content, "user"), notices: [] } as never;
    if (path === "/me/docs/teach.completion_preference" && method !== "GET") return { ...doc("teach.completion_preference", body?.content, "user"), notices: [] } as never;
    if (path === "/blocks/teach/lessons") return (config.lessons ?? LESSONS) as never;
    if (path === "/blocks/teach/practice-cases") return { cases: [CASE, CASE_TWO], place: "台灣", fallback: false, message: "" } as never;
    if (path === "/me/docs/teach.run") return (config.runs ?? []) as never;
    if (path === "/me/docs/teach.aar") return (config.aars ?? []) as never;
    if (path === "/me/docs/teach.completion") return (config.completions ?? []) as never;
    if (path === "/me/docs/teach.completion_preference") return (config.preferences ?? []) as never;
    if (path === "/me/docs/teach.opponent") return (config.opponents ?? []) as never;
    if (path === "/me/docs/teach.feedback") return (config.feedback ?? []) as never;
    if (path === "/me/ai/TEACH/opponent") return { saved: doc("teach.opponent", { challenge: "請先指出你看見的資料。", question: "還缺哪個反例？" }, "ai") } as never;
    if (path === "/me/ai/TEACH/feedback_on_moves") return { saved: doc("teach.feedback", { move_feedback: [{ move: "提出反例", feedback: "你已經寫出一個反例。" }] }, "ai") } as never;
    throw new Error(`unexpected ${method} ${path}`);
  });
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<TeachPage />); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return { host, writes, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}

describe("TEACH page", () => {
  it("shows draft status only for draft lessons, offers five roles, and never uses a dropdown", async () => {
    const { host, done } = await openPage();
    expect(host.querySelector(".teach-lesson .tag")?.textContent).toBe("草稿");
    const reviewedButton = [...host.querySelectorAll('[aria-label="課程"] button')].find((item) => item.textContent?.includes("把下一步寫清楚")) as HTMLButtonElement;
    await act(async () => { reviewedButton.click(); });
    expect(host.querySelector(".teach-lesson")?.textContent).toContain("把下一步寫清楚");
    expect(host.querySelector(".teach-lesson")?.textContent).not.toContain("草稿");
    expect(host.querySelectorAll('[aria-label="練習角色"] button')).toHaveLength(5);
    expect(host.querySelector("select")).toBeNull();
    await done();
  });

  it("shows a checked case, keeps the person's words beside the AI, and keeps the controls visible", async () => {
    const opponent = doc("teach.opponent", { challenge: "請先指出你看見的資料。" }, "ai");
    const { host, done } = await openPage({ opponents: [opponent] });
    expect(host.textContent).toContain("中央氣象署");
    expect(host.textContent).toContain("查核狀態：尚未查核");
    expect(host.textContent).not.toContain("查核日期：尚未查核");
    expect(host.textContent).toContain("你可以跳過、重來、換案例。");
    expect(host.textContent).toContain("你寫的");
    expect(host.textContent).toContain("AI 寫的");
    await done();
  });

  it("does not render score, rank, progress or streak language", async () => {
    const { host, done } = await openPage();
    for (const word of ["分數", "排名", "進度", "百分比", "連勝", "streak"]) expect(host.textContent).not.toContain(word);
    await done();
  });

  it("creates a new run when the lesson version changes and keeps separate lesson runs", async () => {
    const lessons: Lesson[] = [
      { ...LESSONS[0], id: "lesson-a", version: 2, title: "新版課" },
      { ...LESSONS[1], id: "lesson-b", version: 1, title: "另一堂課" },
    ];
    const oldRun = doc("teach.run", { lesson: "lesson-a", lesson_version: 1, practice_case: CASE.id, role: "提出者", notes: "舊版" });
    const { host, writes, done } = await openPage({ lessons, runs: [oldRun] });
    await act(async () => { (host.querySelector("#teach-notes") as HTMLTextAreaElement).value = "新版練習"; host.querySelector("#teach-notes")?.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { [...host.querySelectorAll('[aria-label="課程"] button')].find((item) => item.textContent?.includes("新版課"))?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    const save = [...host.querySelectorAll("button")].find((item) => item.textContent?.includes("存這次練習")) as HTMLButtonElement;
    await act(async () => { save.click(); });
    expect(writes.some((write) => write.path === "/me/docs/teach.run" && write.method === "POST")).toBe(true);
    await done();
  });
});
