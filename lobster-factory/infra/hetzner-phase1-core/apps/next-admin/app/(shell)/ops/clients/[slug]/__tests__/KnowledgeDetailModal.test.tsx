// @vitest-environment jsdom
//
// K2g content-viewer modal — the thing this whole change exists for: click a KB row, actually see
// the stored text. Rendered with react-dom directly (matches CollectionSourcesPanel.test.tsx's own
// convention — no @testing-library in this repo).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDetailModal } from "../KnowledgeDetailModal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function mount(sourceId: string, onClose: () => void = () => {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<KnowledgeDetailModal slug="acme" sourceId={sourceId} onClose={onClose} />);
  });
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("KnowledgeDetailModal", () => {
  it("shows the real body text once loaded, not a placeholder", async () => {
    vi.stubGlobal("fetch", async () =>
      ({
        ok: true,
        json: async () => ({
          ok: true,
          detail: {
            id: "s1", title: "退貨政策", kind: "doc", isSensitive: false, status: "active", version: 1,
            docFamilyId: "f1", canonicalUrl: null, body: "七天內可退貨，商品須完整未拆封。",
            language: "zh", epistemicType: "SOURCE_FACT", authorshipState: "HUMAN_ORIGINAL",
            locked: null, author: null, publishedAt: null, venue: null, doi: null,
            createdAt: "2026-09-17T00:00:00Z",
          },
          versions: [{ id: "s1", version: 1, status: "active", createdAt: "2026-09-17T00:00:00Z" }],
        }),
      }) as unknown as Response,
    );
    await mount("s1");
    expect(container.textContent).toContain("七天內可退貨");
    expect(container.textContent).toContain("退貨政策");
  });

  it("tells a pre-migration document (body === null) apart from an empty one", async () => {
    vi.stubGlobal("fetch", async () =>
      ({
        ok: true,
        json: async () => ({
          ok: true,
          detail: {
            id: "s2", title: "舊文件", kind: "doc", isSensitive: false, status: "active", version: 1,
            docFamilyId: "f2", canonicalUrl: null, body: null, language: null, epistemicType: null,
            authorshipState: null, locked: null, author: null, publishedAt: null, venue: null,
            doi: null, createdAt: "2026-01-01T00:00:00Z",
          },
          versions: [],
        }),
      }) as unknown as Response,
    );
    await mount("s2");
    expect(container.textContent).toContain("尚未存有原文");
  });

  it("shows a 404 as a real error, not a blank or crashed modal", async () => {
    vi.stubGlobal("fetch", async () =>
      ({ ok: false, status: 404, json: async () => ({ ok: false, error: "not_found" }) }) as unknown as Response,
    );
    await mount("gone");
    expect(container.textContent).toContain("找不到這份文件");
  });

  it("clicking a different version switches which one is displayed", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      calls++;
      // Exact match, not .includes — "sourceId=s1" is a PREFIX of "sourceId=s1v2", so a substring
      // check here would silently pass while always serving the v1 response regardless of which
      // version was actually requested.
      const wantsV1 = new URL(url, "http://x").searchParams.get("sourceId") === "s1";
      return {
        ok: true,
        json: async () => ({
          ok: true,
          detail: {
            id: wantsV1 ? "s1" : "s1v2", title: "政策", kind: "doc", isSensitive: false, status: wantsV1 ? "archived" : "active",
            version: wantsV1 ? 1 : 2, docFamilyId: "f1", canonicalUrl: null, body: wantsV1 ? "舊版內容" : "新版內容",
            language: null, epistemicType: null, authorshipState: null, locked: null, author: null,
            publishedAt: null, venue: null, doi: null, createdAt: "2026-09-17T00:00:00Z",
          },
          versions: [
            { id: "s1v2", version: 2, status: "active", createdAt: "2026-09-17T00:00:00Z" },
            { id: "s1", version: 1, status: "archived", createdAt: "2026-09-01T00:00:00Z" },
          ],
        }),
      } as unknown as Response;
    });
    await mount("s1");
    expect(container.textContent).toContain("舊版內容");

    const v2Button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("第 2 版"));
    expect(v2Button, "version switcher button for v2 not found").toBeTruthy();
    await act(async () => {
      v2Button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("新版內容");
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("clicking the backdrop calls onClose; clicking inside the panel does not", async () => {
    vi.stubGlobal("fetch", async () =>
      ({
        ok: true,
        json: async () => ({
          ok: true,
          detail: {
            id: "s1", title: "t", kind: "doc", isSensitive: false, status: "active", version: 1,
            docFamilyId: "f1", canonicalUrl: null, body: "x", language: null, epistemicType: null,
            authorshipState: null, locked: null, author: null, publishedAt: null, venue: null,
            doi: null, createdAt: "2026-09-17T00:00:00Z",
          },
          versions: [],
        }),
      }) as unknown as Response,
    );
    let closed = 0;
    await mount("s1", () => { closed++; });

    const panelTitle = [...container.querySelectorAll("span")].find((s) => s.textContent === "t")!;
    await act(async () => {
      panelTitle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(closed).toBe(0);

    const backdrop = container.firstElementChild as HTMLElement;
    await act(async () => {
      backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(closed).toBe(1);
  });
});
