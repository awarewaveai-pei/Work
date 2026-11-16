// @vitest-environment jsdom
//
// 「主題 → 完整腳本」(card U3.5), mounted for real: one press runs the 手動生成 `script` task once (no angles call), the
// script lands in the same state the angle flow uses (the result card with 送去做影片), the price shows before the press,
// and a failed call leaves the form with the topic still typed.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScriptForge from "../ScriptForge";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SCRIPT = { title: "新手畫畫三步", hook: "你也能畫", core_idea: "x", scenes: [{ time: "0-5秒", visual: "手拿鉛筆", dialogue: "先畫一條線", subtitle: "第一步" }, { time: "5-10秒", visual: "陰影", dialogue: "再加陰影", subtitle: "第二步" }], cta: "追蹤我" };
const SCORE = { total: 8, hook: 8, clarity: 8, cta: 8, notes: [] };

let container: HTMLDivElement;
let root: Root;
let calls: { module: string; task: string; fields: Record<string, string> }[];

async function mount(scriptStatus: number) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
    if (url === "/api/tools/script-forge") {
      const req = JSON.parse(init?.body ?? "{}");
      calls.push(req);
      if (req.task === "script" && scriptStatus !== 200) return new Response("boom", { status: scriptStatus });
      return new Response(JSON.stringify(req.task === "script" ? SCRIPT : SCORE), { status: 200 });
    }
    if (url.startsWith("/api/content/sites")) return new Response(JSON.stringify({ ok: true, sites: [] }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<ScriptForge onSendToVideo={async () => true} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
}

function type(el: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function fillTopicAndPress() {
  const topic = container.querySelector("textarea") as HTMLTextAreaElement;
  await act(async () => { type(topic, "新手如何開始學畫畫"); });
  const button = container.querySelector('[data-testid="one-click"]') as HTMLButtonElement;
  await act(async () => { button.click(); await new Promise((r) => setTimeout(r, 20)); });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("主題 → 完整腳本", () => {
  it("is disabled until a topic is typed and shows the price in NT$ before the press", async () => {
    await mount(200);
    const button = container.querySelector('[data-testid="one-click"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const note = [...container.querySelectorAll("div")].find((d) => d.textContent?.startsWith("只需主題") && !d.querySelector("div"))?.textContent ?? "";
    expect(note).toMatch(/約 NT\$\d+\.\d／次/);
    expect(note.replace(/NT\$/g, "")).not.toContain("$");
  });

  it("runs the module's script task once, with no angles call, and the script lands in the result card", async () => {
    await mount(200);
    await fillTopicAndPress();
    expect(calls.filter((c) => c.module === "manual" && c.task === "script")).toHaveLength(1);
    expect(calls.some((c) => c.task === "angles")).toBe(false);
    expect(calls.find((c) => c.task === "script")!.fields.topic).toBe("新手如何開始學畫畫");
    expect(container.textContent).toContain("新手畫畫三步");
    expect(container.textContent).toContain("送去做影片");
  });

  it("a failed call stays on the form with the reason shown and the topic still typed", async () => {
    await mount(500);
    await fillTopicAndPress();
    expect(container.textContent).toContain("腳本生成失敗（500）");
    expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe("新手如何開始學畫畫");
    expect(container.querySelector('[data-testid="one-click"]')).not.toBeNull(); // still the form, not the result card
  });
});
