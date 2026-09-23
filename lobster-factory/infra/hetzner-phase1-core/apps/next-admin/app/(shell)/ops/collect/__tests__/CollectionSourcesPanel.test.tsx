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
import { CollectionSourcesPanel, explainReason } from "../CollectionSourcesPanel";

// React 19 refuses act() unless the environment declares itself. Without it every interaction below
// would still run, but state updates outside act would be flushed unpredictably and the assertions
// would pass or fail by timing.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOGUE = [
  { id: "collect/http-html", title: "網頁", kind: "web", summary: "單頁", entry: "url", available: true, missing: [] },
  { id: "collect/sitemap", title: "Sitemap", kind: "sitemap", summary: "整站", entry: "url", available: true, missing: [] },
  {
    // The entity dossier is the one source with multiselect options, and multiselect is rendered as
    // visible checkboxes rather than a native <select> (house convention). Present in the fixture so
    // that rendering is exercised at all — a dropdown-shaped regression would otherwise ship unseen.
    id: "collect/entity-dossier",
    title: "背景調查",
    kind: "web",
    summary: "人／公司／事件",
    entry: "query",
    available: true,
    missing: [],
    metered: true,
    options: [
      { key: "kind", label: "對象類型", type: "select", default: "person", choices: [
        { value: "person", label: "人" },
        { value: "company", label: "公司" },
      ] },
      { key: "angles", label: "要查哪些角度", type: "multiselect", choices: [
        { value: "identity", label: "身分" },
        { value: "news", label: "新聞" },
        { value: "legal", label: "訴訟" },
      ] },
    ],
  },
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
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      posted.push(body);
      // action:"run" no longer waits for the crawl (2026-09-12: see CollectionSourcesPanel.tsx's
      // pollRun comment) — it hands back a runKey immediately, which the GET branch below answers.
      if (body.action === "run") return { json: async () => ({ ok: true, queued: true, runKey: "manual-test" }) } as unknown as Response;
      return { json: async () => ({ ok: true, result: null }) } as unknown as Response;
    }
    // The one poll a test needs resolves "done" straight away, so tests don't wait out real
    // setTimeout intervals or leave a poll loop running past the component's unmount.
    if (typeof url === "string" && url.includes("runKey=")) {
      return { json: async () => ({ ok: true, status: "done", result: null }) } as unknown as Response;
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

  it("polls through a running state and renders the report once the job is actually done", async () => {
    // The whole point of this fix (WORKLOG 2026-09-12): a run's result is no longer in the POST
    // response — it only shows up after one or more polls of GET ?runKey=. This exercises that
    // real sequence rather than a mock that answers "done" on the very first call.
    let pollCalls = 0;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return { json: async () => ({ ok: true, queued: true, runKey: "manual-poll-test" }) } as unknown as Response;
      }
      if (typeof url === "string" && url.includes("runKey=")) {
        pollCalls++;
        if (pollCalls === 1) return { json: async () => ({ ok: true, status: "running" }) } as unknown as Response;
        return {
          json: async () => ({
            ok: true,
            status: "done",
            result: {
              runKey: "manual-poll-test",
              sources: 2,
              dryRun: false,
              report: { fetched: 3, dirty: [], quarantined: [], disallowed: [], gone: [], stoppedBy: "frontier_empty" },
              sink: { written: 3, skipped: 0 },
              incidentRaised: false,
              errors: [],
            },
          }),
        } as unknown as Response;
      }
      return { json: async () => ({ ok: true, catalogue: CATALOGUE, sources: SOURCES }) } as unknown as Response;
    });

    await click(buttonByText("正式抓取"));
    // The first poll answers "running", which sleeps 2s before polling again — advance real time
    // rather than fake timers, since fake timers and this file's manual microtask-driven `act()`
    // calls don't compose cleanly here.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2100));
    });

    expect(pollCalls).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toContain("manual-poll-test");
    expect(container.textContent).toContain("2 個來源");
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

describe("send to Cognitive OS", () => {
  it("polls through to a done result and shows the project + a deep link to pick a method", async () => {
    let pollCalls = 0;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("cognitive-os-import")) {
        if (init?.method === "POST") {
          return { json: async () => ({ ok: true, queued: true, runKey: "cogos-poll-test" }) } as unknown as Response;
        }
        pollCalls++;
        if (pollCalls === 1) return { json: async () => ({ ok: true, status: "running" }) } as unknown as Response;
        return {
          json: async () => ({
            ok: true,
            status: "done",
            result: {
              organizationId: "org-1",
              projectId: "proj-abc",
              totalCandidates: 3,
              imported: 2,
              alreadyImported: 1,
              rejected: [],
              errors: [],
            },
          }),
        } as unknown as Response;
      }
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return { json: async () => ({ ok: true, queued: true, runKey: "manual-test" }) } as unknown as Response;
      }
      return { json: async () => ({ ok: true, catalogue: CATALOGUE, sources: SOURCES }) } as unknown as Response;
    });

    // The bridges are frozen by default (plan P0, 2026-09-23); this test covers the switched-on path.
    await act(async () => {
      root.render(<CollectionSourcesPanel slug="acme" researchBridgesEnabled />);
    });
    await click(buttonByText("送去 Cognitive OS 分析"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2100));
    });

    expect(pollCalls).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toContain("proj-abc");
    expect(container.textContent).toContain("新匯入 2");
    expect(container.textContent).toContain("已匯入過 1");
    // Goes through the cross-tenant handoff route (app/api/cognitive-os/open/route.ts), not a
    // direct dashboard link, since 2026-09-18 — see that route's own header comment for why.
    const link = container.querySelector("a[href*='/api/cognitive-os/open']") as HTMLAnchorElement | null;
    expect(link, "deep link to the Cognitive OS project must exist").not.toBeNull();
    expect(link!.href).toContain("project=proj-abc");
  });

  it("shows rejected sources with their reason, never a silent quiet-send", async () => {
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("cognitive-os-import")) {
        if (init?.method === "POST") return { json: async () => ({ ok: true, queued: true, runKey: "cogos-reject-test" }) } as unknown as Response;
        return {
          json: async () => ({
            ok: true,
            status: "done",
            result: {
              organizationId: "org-1",
              projectId: "proj-abc",
              totalCandidates: 1,
              imported: 0,
              alreadyImported: 0,
              rejected: [{ sourceId: "s9", title: "Untitled Draft", issues: ["MISSING_AUTHORS"] }],
              errors: [],
            },
          }),
        } as unknown as Response;
      }
      if (init?.method === "POST") return { json: async () => ({ ok: true, queued: true, runKey: "manual-test" }) } as unknown as Response;
      return { json: async () => ({ ok: true, catalogue: CATALOGUE, sources: SOURCES }) } as unknown as Response;
    });

    // The bridges are frozen by default (plan P0, 2026-09-23); this test covers the switched-on path.
    await act(async () => {
      root.render(<CollectionSourcesPanel slug="acme" researchBridgesEnabled />);
    });
    await click(buttonByText("送去 Cognitive OS 分析"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(container.textContent).toContain("Untitled Draft");
    expect(container.textContent).toContain("MISSING_AUTHORS");
  });
});

describe("research bridges frozen (the default since 2026-09-23)", () => {
  it("renders neither 送去 button and says where that work moved", () => {
    const labels = [...container.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(labels.some((t) => t.includes("送去 Cognitive OS")), labels.join(" | ")).toBe(false);
    expect(labels.some((t) => t.includes("送去 HCI")), labels.join(" | ")).toBe(false);
    const note = container.querySelector("[data-panel=research-bridges-frozen]");
    expect(note, "the freeze must be explained, not silent").not.toBeNull();
    expect(note!.textContent).toContain("Cognitive OS");
  });
});

describe("a refusal is explained, not printed", () => {
  it("turns the exact string the operator hit into an instruction", () => {
    // This is the real reason from a live run on 2026-09-11.
    const said = explainReason("all_strategies_failed:ProviderCallError: provider_perplexity_http_401");
    expect(said).toContain("PERPLEXITY_API_KEY");
    expect(said).toContain("換一把");
  });

  it("separates out of credit, rate limited, and rejected — they need different actions", () => {
    expect(explainReason("provider_firecrawl_http_402")).toContain("餘額不足");
    expect(explainReason("provider_firecrawl_http_429")).toContain("限流");
    expect(explainReason("provider_firecrawl_http_403")).toContain("FIRECRAWL_API_KEY");
  });

  it("explains the quality-gate refusals an operator will actually meet", () => {
    expect(explainReason("too_short")).toContain("JS 渲染");
    expect(explainReason("soft_404")).toContain("找不到頁面");
    expect(explainReason("injection_ignore_previous")).toContain("擋下");
    expect(explainReason("disallowed")).toContain("robots.txt");
  });

  it("says nothing rather than inventing an explanation it does not have", () => {
    // A vague "something went wrong" would hide the one string that could be searched for.
    expect(explainReason("some_reason_nobody_mapped")).toBeNull();
  });
});

describe("choice options render as visible buttons, never a dropdown", () => {
  function pickDossier() {
    const box = [...container.querySelectorAll("[data-panel=catalogue] input[type=checkbox]")].find(
      (b) => (b as HTMLInputElement).closest("label")?.textContent?.includes("背景調查"),
    ) as HTMLInputElement;
    return box;
  }

  it("renders every choice as a button and no <select> in the option form", async () => {
    await act(async () => pickDossier().click());

    const fieldset = [...container.querySelectorAll("fieldset")].find((f) => f.textContent?.includes("要查哪些角度"));
    expect(fieldset, "the dossier option fieldset never rendered").toBeTruthy();
    expect(fieldset!.querySelector("select"), "a dropdown came back").toBeNull();
    const labels = [...fieldset!.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(labels.some((l) => l.includes("身分"))).toBe(true);
    expect(labels.some((l) => l.includes("訴訟"))).toBe(true);
    // Unticked multiselect choices show an empty box, so "how many are on" is readable at a glance.
    expect(labels.filter((l) => l.startsWith("☐")).length).toBe(3);
  });

  it("ticks several angles at once and stores them in the declared order", async () => {
    await act(async () => pickDossier().click());
    const fieldset = [...container.querySelectorAll("fieldset")].find((f) => f.textContent?.includes("要查哪些角度"))!;
    const byLabel = (t: string) =>
      [...fieldset.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(t)) as HTMLButtonElement;

    // Clicked out of order on purpose: the stored string must follow the DECLARED order, so two
    // operators who tick the same boxes produce the same row.
    await act(async () => byLabel("訴訟").click());
    await act(async () => byLabel("身分").click());

    // Same selector the other tests use: `input[type=text]` alone also matches inputs React has
    // not finished owning, and jsdom then refuses the native value setter.
    const entryBox = container.querySelector("input[type=text], input:not([type])") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(entryBox, "Theo Farrell");
      entryBox.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(buttonByText("加入"));

    const body = posted.find((p) => p.blockId === "collect/entity-dossier");
    expect((body?.options as Record<string, unknown>)?.angles).toBe("identity,legal");
  });
});
