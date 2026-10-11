import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../lib/api";
import { caseName, HomeStart } from "./HomeStart";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../lib/api", async (original) => ({ ...(await original<typeof import("../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

async function mount() {
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<HomeStart />); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}
function type(element: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
const SENTENCE = "合夥人第三次改合約，要不要繼續";

describe("home: two doors (ENTRY_SLICE1_CHECKLIST.md items 2 and 6)", () => {
  it("陪我思考 opens a case at once -- no tool run -- and carries the sentence into 開案", async () => {
    const posted: unknown[] = [];
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (init?.method === "POST") { posted.push(JSON.parse(String(init.body))); return { project_id: "P9", name: SENTENCE, created_at: "2026-10-11T00:00:00Z" } as never; }
      return [] as never;
    });
    const { host, done } = await mount();
    await act(async () => { type(host.querySelector("#home-q") as HTMLTextAreaElement, SENTENCE); });
    expect(host.querySelector("#door-analyze a")?.getAttribute("href")).toBe(`/analyze?q=${encodeURIComponent(SENTENCE)}`);
    await act(async () => { (host.querySelector("#door-think button") as HTMLButtonElement).click(); });
    expect(posted).toEqual([{ name: SENTENCE, purpose: SENTENCE, data_classification: "Confidential" }]);
    expect(push).toHaveBeenCalledWith(`/projects/P9/start?q=${encodeURIComponent(SENTENCE)}`);
    await done();
  });

  it("繼續上次的案子 shows the case touched last, never a saved analysis; none, nothing", async () => {
    const at = (day: string) => `2026-10-${day}T00:00:00Z`;
    vi.mocked(apiFetch).mockResolvedValue([
      { project_id: "A", name: "分析", created_at: at("09"), updated_at: at("10"), is_case: false, analysis_count: 1 },
      { project_id: "C1", name: "舊案子", created_at: at("01"), updated_at: at("02"), is_case: true },
      { project_id: "C2", name: "新案子", created_at: at("03"), updated_at: at("08"), is_case: true },
    ] as never);
    const { host, done } = await mount();
    expect(host.querySelector("#continue a")?.getAttribute("href")).toBe("/projects/C2");
    await done();
    vi.mocked(apiFetch).mockResolvedValue([] as never);
    const empty = await mount();
    expect(empty.host.querySelector("#continue")).toBeNull();
    await empty.done();
    // a case opened from 陪我思考 but left before 開案資料 was saved is still the case to continue (Codex review F5)
    vi.mocked(apiFetch).mockResolvedValue([
      { project_id: "C2", name: "新案子", created_at: at("03"), updated_at: at("08"), is_case: true, analysis_count: 0 },
      { project_id: "U", name: "剛開的", created_at: at("11"), updated_at: at("11"), is_case: false, analysis_count: 0 },
    ] as never);
    const opening = await mount();
    expect(opening.host.querySelector("#continue a")?.getAttribute("href")).toBe("/projects/U");
    await opening.done();
  });

  it("a case's name is the sentence's first line, cut short; without one, the minute", () => {
    expect(caseName("  第一行\n第二行", new Date())).toBe("第一行");
    expect(caseName("字".repeat(50), new Date())).toBe(`${"字".repeat(40)}…`);
    expect(caseName("", new Date("2026-10-11T01:02:00Z"))).toMatch(/^新的案子 2026-10-11 \d{2}:02$/);
  });
});
