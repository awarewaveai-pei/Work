// @vitest-environment jsdom
//
// K2j — the actual rendered/interactive collapse-cards behavior, not just the pure `groupByFolder`
// function (already covered in groupByFolder.test.ts). Critic finding 2026-09-17 (Major): a passing
// pure-function test + green tsc proves the grouping math is right and the types line up, not that
// the JSX built on top of it (header visibility, expand/collapse toggle, one extra nesting level for
// every per-row control) actually renders/behaves correctly in a DOM. Mounted the same way
// KnowledgeDetailModal.test.tsx already does for a sibling "use client" component in this exact
// directory — no login, no live server, no @testing-library/react dependency.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeTab } from "../ClientHubTabs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = { id: "o1", slug: "acme", name: "Acme", type: "client", status: "active" };

function sourceRow(id: string, title: string, folderId: string | null, cognitiveOsProjectId: string | null = null) {
  return {
    id,
    title,
    kind: "doc",
    isSensitive: false,
    canonicalUrl: "https://example.com",
    folderId,
    keywordMode: "inherit",
    chunks: 1,
    cognitiveOsProjectId,
    cognitiveOsImportedAt: cognitiveOsProjectId ? "2026-09-18T04:00:00+00:00" : null,
  };
}

let container: HTMLDivElement;
let root: Root;

async function mount(sources: ReturnType<typeof sourceRow>[], folders: Array<{ id: string; name: string; parentId: string | null }>) {
  vi.stubGlobal("fetch", async (url: string) => {
    const u = String(url);
    if (u.includes("cs-knowledge-folders")) {
      return { ok: true, json: async () => ({ ok: true, folders }) } as unknown as Response;
    }
    if (u.includes("cs-config")) {
      return { ok: true, json: async () => ({ ok: true, csEnabled: true, kbKeywordModeDefault: "fuzzy", knowledgeCount: sources.length, intents: [] }) } as unknown as Response;
    }
    if (u.includes("cs-knowledge")) {
      return { ok: true, json: async () => ({ ok: true, sources, total: sources.length, page: 1, pageSize: 50 }) } as unknown as Response;
    }
    throw new Error(`unexpected fetch: ${u}`);
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<KnowledgeTab org={ORG} />);
  });
  // Flush the microtask queue a second time: the initial render's effect kicks off three parallel
  // fetches (sources/folders/kb-config) whose combined Promise.all resolution + subsequent setState
  // can land after the first act() call's own microtask flush.
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("KnowledgeTab — K2j collapse-cards grouping", () => {
  it("renders one group header per folder, with document titles as the group's content", async () => {
    await mount(
      [sourceRow("s1", "退貨政策", "f1"), sourceRow("s2", "出貨時間", "f2")],
      [{ id: "f1", name: "客服文件", parentId: null }, { id: "f2", name: "物流文件", parentId: null }],
    );
    expect(container.textContent).toContain("客服文件");
    expect(container.textContent).toContain("物流文件");
  });

  it("a small group (<=3 items) starts expanded — its document titles are visible without any click", async () => {
    await mount(
      [sourceRow("s1", "退貨政策", "f1"), sourceRow("s2", "出貨時間", "f2")],
      [{ id: "f1", name: "客服文件", parentId: null }, { id: "f2", name: "物流文件", parentId: null }],
    );
    expect(container.textContent).toContain("退貨政策");
    expect(container.textContent).toContain("出貨時間");
  });

  it("a large group (>3 items) starts collapsed — its document titles are absent from the DOM until expanded", async () => {
    // A SECOND folder is required to actually exercise collapse: with only one group total,
    // showHeaders is false by design (a single-group tenant sees the old flat list, unchanged),
    // so item count alone would never collapse anything — this reproduces exactly that footgun
    // (first draft of this test used one folder only and passed for the wrong reason).
    await mount(
      [sourceRow("s1", "文件一", "f1"), sourceRow("s2", "文件二", "f1"), sourceRow("s3", "文件三", "f1"), sourceRow("s4", "文件四", "f1"), sourceRow("s5", "小資料夾文件", "f2")],
      [{ id: "f1", name: "大資料夾", parentId: null }, { id: "f2", name: "小資料夾", parentId: null }],
    );
    expect(container.textContent).toContain("大資料夾"); // the header itself is always visible
    expect(container.textContent).not.toContain("文件一"); // but its collapsed content is not

    // Not just `.includes("大資料夾")`: the folder-filter pill button (rendered earlier in the DOM,
    // for filtering the list) ALSO contains that text with no count suffix — matching on the count
    // parenthesis is what actually distinguishes the collapsible GROUP HEADER from the filter pill.
    const header = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("大資料夾（4）"));
    expect(header, "group header button not found").toBeTruthy();
    await act(async () => {
      header!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("文件一");
    expect(container.textContent).toContain("文件四");

    // Click again: toggles back closed (also proves the critic-flagged updater fix — deriving the
    // toggle from the state updater's own previous value, not a closed-over render-time variable —
    // actually applies on a real double-toggle, not just once).
    await act(async () => {
      header!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).not.toContain("文件一");
  });

  it("a single group (everything unfiled, or everything in one folder) renders as a flat list with no group header at all", async () => {
    await mount(
      [sourceRow("s1", "獨立文件一", null), sourceRow("s2", "獨立文件二", null)],
      [],
    );
    expect(container.textContent).toContain("獨立文件一");
    expect(container.textContent).toContain("獨立文件二");
    // No folder-icon header should exist when there's nothing to disambiguate between groups.
    expect(container.textContent).not.toContain("📁");
  });

  it("unfiled documents are grouped under 未分類 when they coexist with a real folder", async () => {
    await mount(
      [sourceRow("s1", "有資料夾的文件", "f1"), sourceRow("s2", "沒資料夾的文件", null)],
      [{ id: "f1", name: "客服文件", parentId: null }],
    );
    expect(container.textContent).toContain("未分類");
    expect(container.textContent).toContain("客服文件");
  });

  it("shows a Cognitive OS badge with a deep link only for sources actually sent there", async () => {
    await mount(
      [sourceRow("s1", "已送出的文件", null, "proj-abc"), sourceRow("s2", "尚未送出的文件", null)],
      [],
    );
    expect(container.textContent).toContain("已送 Cognitive OS");
    // Goes through the cross-tenant handoff route (app/api/cognitive-os/open/route.ts), not a
    // direct dashboard link, since 2026-09-18 — see that route's own header comment for why.
    const link = container.querySelector("a[href*='/api/cognitive-os/open']") as HTMLAnchorElement | null;
    expect(link, "deep link must exist for the sent source").not.toBeNull();
    expect(link!.href).toContain("project=proj-abc");
    // Only one badge — the second source (never sent) must not also render one.
    expect(container.querySelectorAll("a[href*='/api/cognitive-os/open']").length).toBe(1);
  });
});

describe("KnowledgeTab — 背景檔案", () => {
  /** Pick a folder so the per-folder toolbar (rename / delete / dossier / Cognitive OS) renders. */
  async function openFolder() {
    await mount([sourceRow("s1", "任命新聞", "f1")], [{ id: "f1", name: "Theo Farrell_202609200517", parentId: null }]);
    const pill = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Theo Farrell_2026"))!;
    await act(async () => pill.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  }

  it("offers the button on a folder, because the folder IS the dossier", async () => {
    await openFolder();
    expect([...container.querySelectorAll("button")].some((b) => b.textContent === "產生背景檔案")).toBe(true);
  });

  it("asks the server to build the dossier for THIS folder, and says what came back", async () => {
    await openFolder();
    const posted: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return { ok: true, json: async () => ({ ok: true, sourcesUsed: 7 }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ ok: true, sources: [], total: 0, page: 1, pageSize: 50, folders: [] }) } as unknown as Response;
    });

    const btn = [...container.querySelectorAll("button")].find((b) => b.textContent === "產生背景檔案")!;
    await act(async () => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => { await Promise.resolve(); });

    expect(posted[0]).toMatchObject({ action: "build_dossier", folderId: "f1" });
    expect(container.textContent).toContain("已用 7 份來源產出背景檔案");
  });

  it("shows the server's plain-language hint AND the raw error, not one or the other", async () => {
    await openFolder();
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return { ok: false, json: async () => ({ ok: false, error: "no_sources", hint: "這個資料夾裡沒有可用的文件內容" }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ ok: true, sources: [], total: 0, page: 1, pageSize: 50, folders: [] }) } as unknown as Response;
    });

    const btn = [...container.querySelectorAll("button")].find((b) => b.textContent === "產生背景檔案")!;
    await act(async () => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => { await Promise.resolve(); });

    // The hint is for the human; the raw code is what you search for when the hint runs out.
    expect(container.textContent).toContain("這個資料夾裡沒有可用的文件內容");
    expect(container.textContent).toContain("no_sources");
  });
});
