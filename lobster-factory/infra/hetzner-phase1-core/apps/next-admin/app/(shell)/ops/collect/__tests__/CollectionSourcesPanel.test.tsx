// @vitest-environment jsdom

// The two things the operator asked for, asserted against the rendered DOM rather than the source:
// the source picker is not a dropdown, and both selections take more than one item.
//
// Rendered with react-dom directly — there is no @testing-library here, and adding a dependency to
// assert on four elements would be the larger change. `fetch` is stubbed, so nothing leaves the
// process and no knowledge base is touched.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionSourcesPanel } from "../CollectionSourcesPanel";

// React 19 refuses act() unless the environment declares itself. Without it every interaction below
// would still run, but state updates outside act would be flushed unpredictably and the assertions
// would pass or fail by timing.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOGUE = [
  { id: "collect/http-html", title: "網頁", kind: "web", summary: "單頁", entry: "url", available: true, missing: [] },
  { id: "collect/sitemap", title: "Sitemap", kind: "sitemap", summary: "整站", entry: "url", available: true, missing: [] },
  {
    id: "collect/extract-provider",
    title: "JS 渲染網頁",
    kind: "rendered",
    summary: "外部供應商",
    entry: "url",
    available: false,
    missing: ["FIRECRAWL_API_KEY"],
    metered: true,
  },
];

const SOURCES = [
  { id: "s1", blockId: "collect/http-html", entry: "https://a.example/faq", options: {}, status: "approved", label: null, proposedBy: null, approvedBy: "ops", lastRunAt: null, lastStatus: null },
  { id: "s2", blockId: "collect/sitemap", entry: "https://b.example/sitemap.xml", options: {}, status: "approved", label: null, proposedBy: null, approvedBy: "ops", lastRunAt: null, lastStatus: null },
];

/** Every POST the panel made, in order. */
let posted: Array<Record<string, unknown>>;
let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  posted = [];
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      posted.push(JSON.parse(String(init.body)));
      return { json: async () => ({ ok: true, result: null }) } as unknown as Response;
    }
    return { json: async () => ({ ok: true, catalogue: CATALOGUE, sources: SOURCES }) } as unknown as Response;
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<CollectionSourcesPanel slug="acme" />);
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** Checkboxes belonging to the source-type picker (the left column). */
function typeBoxes(): HTMLInputElement[] {
  return [...container.querySelectorAll("[data-panel=catalogue] input[type=checkbox]")] as HTMLInputElement[];
}

function buttonByText(text: string): HTMLButtonElement {
  const hit = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  if (!hit) throw new Error(`no button containing "${text}" — found: ${[...container.querySelectorAll("button")].map((b) => b.textContent).join(" | ")}`);
  return hit as HTMLButtonElement;
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/**
 * Tick a checkbox the way a person does. Setting `.checked` by hand and firing a synthetic event
 * does NOT work: React tracks the previous value on the node and skips onChange when it sees the
 * DOM already holding the new one. A real click lets jsdom toggle it, which React then observes.
 */
async function check(box: HTMLInputElement) {
  await click(box);
}

describe("the source picker", () => {
  it("is not a dropdown", () => {
    // The type picker specifically: a per-source <select> option field may still exist elsewhere.
    const selects = [...container.querySelectorAll("[data-panel=catalogue] select")];
    expect(selects).toEqual([]);
    expect(typeBoxes()).toHaveLength(CATALOGUE.length);
  });

  it("shows every source at once, including the ones that need a key", () => {
    const text = container.textContent ?? "";
    for (const c of CATALOGUE) expect(text).toContain(c.title);
    // Unavailable is shown with the reason, not hidden — the whole point of the catalogue.
    expect(text).toContain("FIRECRAWL_API_KEY");
  });

  it("adds one source per ticked type, from one entry", async () => {
    const boxes = typeBoxes();
    await check(boxes[0]);
    await check(boxes[1]);

    const input = container.querySelector("input[type=text], input:not([type])") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "https://shop.example/faq");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(buttonByText("加入").textContent).toContain("2 個來源");
    await click(buttonByText("加入"));

    expect(posted).toHaveLength(2);
    expect(posted.map((p) => p.blockId).sort()).toEqual(["collect/http-html", "collect/sitemap"]);
    for (const p of posted) expect(p.entry).toBe("https://shop.example/faq");
  });
});

describe("the arrangement the operator asked for", () => {
  it("keeps the catalogue on one side and everything you act on together on the other", () => {
    const catalogue = container.querySelector("[data-panel=catalogue]")!;
    const sources = container.querySelector("[data-panel=sources]")!;
    const form = container.querySelector("[data-panel=form]")!;
    expect([catalogue, sources, form].every(Boolean)).toBe(true);

    // The source list and the entry form share a column; the catalogue does not.
    expect(sources.parentElement).toBe(form.parentElement);
    expect(catalogue.parentElement).not.toBe(form.parentElement);

    // …and the list (with the run buttons) sits ABOVE the form, so ticking a source, filling it in
    // and pressing 正式抓取 are visible at once. A tall catalogue used to push the buttons off screen.
    expect(sources.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says what to do instead of showing an entry box that does nothing", () => {
    const form = container.querySelector("[data-panel=form]")!;
    expect(form.textContent).toContain("先在左邊勾");
    expect(form.querySelector("input")).toBeNull();
  });
});

describe("the run", () => {
  it("covers every approved source when nothing is ticked", async () => {
    await click(buttonByText("正式抓取"));
    expect(posted).toHaveLength(1);
    expect(posted[0].action).toBe("run");
    // undefined, not [] — an empty array would read as "run nothing" on the server.
    expect(posted[0].sourceIds).toBeUndefined();
  });

  it("covers only the ticked sources", async () => {
    const rowBoxes = [...container.querySelectorAll("[data-panel=sources] input[type=checkbox]")] as HTMLInputElement[];
    expect(rowBoxes.length, "approved rows are not tickable").toBe(SOURCES.length);

    await check(rowBoxes[1]);
    expect(container.textContent).toContain("只跑勾選的 1 個");

    await click(buttonByText("正式抓取"));
    expect(posted[0].sourceIds).toEqual(["s2"]);
  });
});
