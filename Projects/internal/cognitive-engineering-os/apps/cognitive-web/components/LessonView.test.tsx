import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LessonView } from "./LessonView";
import { LESSONS } from "../lib/lessons.generated";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// the shape of an exported lesson (mockkit.export_lesson): chips, tab row, panels, [data-tab-go], [data-note], a fold
const HTML = `
<div class="btns" id="start"><a class="btn primary" href="/methods/x/run">開始 →</a><button type="button" class="btn" data-note="還在做">看結果 →</button></div>
<div class="chips" role="tablist"><button class="chip on" role="tab" aria-selected="true" data-set="a" id="chip-a">A</button><button class="chip" role="tab" aria-selected="false" data-set="b" id="chip-b">B</button></div>
<div class="tabs" role="tablist"><button class="tab" type="button" role="tab" id="tab-learn" aria-controls="panel-learn" aria-selected="true" tabindex="0">認識</button><button class="tab" type="button" role="tab" id="tab-read" aria-controls="panel-read" aria-selected="false" tabindex="-1">看懂</button><button class="tab" type="button" role="tab" id="tab-sources" aria-controls="panel-sources" aria-selected="false" tabindex="-1">來源</button></div>
<section class="tabpanel" id="panel-learn" role="tabpanel"><p><span class="ex" data-set="a">例 A</span><span class="ex" data-set="b" hidden>例 B</span></p><a href="#q2" id="to-q2">第二題</a><div class="tabnext"><button type="button" class="btn" data-tab-go="read">下一個分頁</button></div></section>
<section class="tabpanel" id="panel-read" role="tabpanel" hidden><details><summary>題</summary><p id="q2">答</p></details><span class="ex" data-set="a">讀 A</span><span class="ex" data-set="b" hidden>讀 B</span></section>
<section class="tabpanel" id="panel-sources" role="tabpanel" hidden><ol class="src"><li id="src-1">來源</li></ol></section>`;

let host: HTMLDivElement | null = null;
let root: Root | null = null;
async function mount(hash = "", html = HTML) {
  window.history.replaceState(null, "", `/learn/x${hash}`);
  host = document.createElement("div"); document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<LessonView html={html} />); });
  return host;
}
const shown = (box: HTMLElement) => Array.from(box.querySelectorAll<HTMLElement>('[role="tabpanel"]')).filter((p) => !p.hidden).map((p) => p.id);
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); };

afterEach(async () => { await act(async () => { root?.unmount(); }); host?.remove(); host = root = null; });

describe("LessonView", () => {
  it("a tab click shows its panel only and moves aria-selected and the roving tabindex", async () => {
    const box = await mount();
    expect(shown(box)).toEqual(["panel-learn"]);
    await click(box.querySelector("#tab-sources"));
    expect(shown(box)).toEqual(["panel-sources"]);
    expect(box.querySelector("#tab-sources")!.getAttribute("aria-selected")).toBe("true");
    expect((box.querySelector("#tab-learn") as HTMLElement).tabIndex).toBe(-1);
  });

  it("the next-tab button, the arrow keys and the address pick a tab", async () => {
    const box = await mount("#src-1");
    expect(shown(box)).toEqual(["panel-sources"]);
    await click(box.querySelector("#tab-learn"));
    await click(box.querySelector("[data-tab-go]"));
    expect(shown(box)).toEqual(["panel-read"]);
    expect(document.activeElement?.id).toBe("tab-read");
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(shown(box)).toEqual(["panel-sources"]);
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })); });
    expect(shown(box)).toEqual(["panel-learn"]);
    await act(async () => { window.location.hash = "#panel-read"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(shown(box)).toEqual(["panel-read"]);
  });

  it("a domain chip switches every example group", async () => {
    const box = await mount();
    await click(box.querySelector("#chip-b"));
    expect(Array.from(box.querySelectorAll<HTMLElement>(".ex")).filter((e) => !e.hidden).map((e) => e.textContent)).toEqual(["例 B", "讀 B"]);
    expect(box.querySelector("#chip-a")!.classList.contains("on")).toBe(false);
    expect(box.querySelector("#chip-b")!.getAttribute("aria-selected")).toBe("true");
  });

  it("a link into a hidden panel opens that tab and the fold its target sits in", async () => {
    const box = await mount();
    await click(box.querySelector("#to-q2"));
    expect(shown(box)).toEqual(["panel-read"]);
    expect((box.querySelector("details") as HTMLDetailsElement).open).toBe(true);
  });

  it("a page the web does not have yet says so under its row, once", async () => {
    const box = await mount();
    await click(box.querySelector("[data-note]"));
    await click(box.querySelector("[data-note]"));
    const notes = box.querySelectorAll(".mocknote");
    expect(notes.length).toBe(1);
    expect(notes[0].previousElementSibling!.id).toBe("start");
    expect(notes[0].textContent).toBe("還在做");
  });

  it("listeners go with the component (client navigation remounts it)", async () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    await mount();
    await act(async () => { root!.unmount(); });
    root = null;
    const handler = added.mock.calls.find(([type]) => type === "hashchange")?.[1];
    expect(handler).toBeTypeOf("function");
    expect(removed.mock.calls.some(([type, fn]) => type === "hashchange" && fn === handler)).toBe(true);
    added.mockRestore(); removed.mockRestore();
  });

  it("every exported lesson has a tab row, its panels and no mock link", () => {
    for (const [id, lesson] of Object.entries(LESSONS)) {
      expect(lesson.html, id).toContain('role="tablist" aria-label="課程內容"');
      expect(lesson.html, id).not.toContain("claude.ai/artifact");
      expect(lesson.html, id).not.toContain("示意稿");
      expect(lesson.title.length, id).toBeGreaterThan(0);
    }
    expect(Object.keys(LESSONS).sort()).toEqual(["life-decision-v1", "systems.iceberg_model"]);
  });
});
