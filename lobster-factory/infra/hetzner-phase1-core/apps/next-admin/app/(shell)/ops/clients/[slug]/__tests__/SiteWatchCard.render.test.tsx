// @vitest-environment jsdom
//
// 網站巡檢 card, mounted for real (same convention as KnowledgeDetailModal.test.tsx: react-dom, no
// @testing-library). Covers what tsc cannot: the banners the operator relies on, the optimistic-
// version PATCH and its 409 path, the two-click baseline accept, and plan R8 — strings written by a
// client's website must render as text, never as markup.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SiteWatchOverview } from "@/lib/site-watch/console";
import { SiteWatchCard } from "../SiteWatchCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PAGE_ID = "aaaaaaaaaaaaaaaa";
const HOSTILE = '<img src=x onerror="window.__pwned=1">';

function overview(over: Partial<SiteWatchOverview> = {}): SiteWatchOverview {
  return {
    globallyEnabled: false,
    storageConfigured: true,
    target: { enabled: true, frequency: "daily", hour_utc: 22, version: 3, updated_by: "system:default", updated_at: "2026-09-23T00:00:00Z", last_completed_run_key: null },
    defaults: { enabled: true, frequency: "daily", hour_utc: 22 },
    watchedPages: [{ pageId: PAGE_ID, url: "https://shop.example.com" }],
    pageStates: [],
    recent: [
      {
        id: "11111111-1111-1111-1111-111111111111", run_key: "k", page_id: PAGE_ID, page_url: "https://shop.example.com",
        ok: true, http_status: 200, failure_code: null, console_error_count: 1, page_error_count: 0,
        errors_sample: [HOSTILE], timing_ms: 900, visual_status: "diff", visual_note: "與基準圖差異 9.0%",
        diff_ratio: 0.09, evidence_key: "site-watch/o/p/evidence/x.jpg", diff_key: "site-watch/o/p/evidence/x-diff.jpg",
        skipped_buckets: 0, created_at: new Date().toISOString(),
      },
    ],
    ...over,
  };
}

type Call = { url: string; method: string; body: unknown };
let container: HTMLDivElement;
let root: Root;
let calls: Call[];

function stubFetch(responder: (c: Call) => { status: number; body: unknown }) {
  calls = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const c = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(c);
    const r = responder(c);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response;
  });
}

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<SiteWatchCard slug="shop-a" />));
}

function button(text: string): HTMLButtonElement {
  const b = [...container.querySelectorAll("button")].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`button "${text}" not found in: ${container.textContent}`);
  return b as HTMLButtonElement;
}

async function click(el: HTMLElement) {
  await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("SiteWatchCard", () => {
  it("says plainly when the global kill switch is off, and renders hostile page text as text", async () => {
    stubFetch(() => ({ status: 200, body: { ok: true, overview: overview() } }));
    await mount();
    expect(container.textContent).toContain("SITE_WATCH_ENABLED 未開");
    // The hostile JS-error sample is present as literal text inside <details>, and no <img> exists
    // other than none at all (no image is opened yet).
    expect(container.textContent).toContain(HOSTILE);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect((window as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("warns when there is no private bucket or no usable site URL", async () => {
    stubFetch(() => ({ status: 200, body: { ok: true, overview: overview({ storageConfigured: false, watchedPages: [] }) } }));
    await mount();
    expect(container.textContent).toContain("R2_SITE_WATCH_BUCKET");
    expect(container.textContent).toContain("沒有可巡檢的網址");
  });

  it("save is disabled until something changes; PATCH carries the row version; hourly hides the hour input", async () => {
    stubFetch((c) =>
      c.method === "PATCH"
        ? { status: 200, body: { ok: true, overview: overview({ target: { ...overview().target!, frequency: "hourly", version: 4 } }) } }
        : { status: 200, body: { ok: true, overview: overview() } },
    );
    await mount();
    expect(button("儲存").disabled).toBe(true);
    expect(container.querySelector('input[type="number"]')).not.toBeNull();
    await click(button("每小時"));
    expect(container.querySelector('input[type="number"]')).toBeNull();
    expect(button("儲存").disabled).toBe(false);
    await click(button("儲存"));
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe("/api/ops/clients/shop-a/site-watch");
    expect(patch.body).toEqual({ expectedVersion: 3, enabled: true, frequency: "hourly", hourUtc: 22 });
    expect(container.textContent).toContain("已儲存");
  });

  it("a target that does not exist yet is created with expectedVersion 0", async () => {
    stubFetch(() => ({ status: 200, body: { ok: true, overview: overview({ target: null }) } }));
    await mount();
    await click(button("每 6 小時"));
    await click(button("儲存"));
    expect(calls.find((c) => c.method === "PATCH")!.body).toMatchObject({ expectedVersion: 0, frequency: "every_6h" });
  });

  it("409 reloads the card and tells the operator someone else just changed it", async () => {
    stubFetch((c) => (c.method === "PATCH" ? { status: 409, body: { ok: false, error: "version_conflict" } } : { status: 200, body: { ok: true, overview: overview() } }));
    await mount();
    await click(button("每小時"));
    await click(button("儲存"));
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(2);
    expect(container.textContent).toContain("別人剛改過");
  });

  it("accepting a new baseline takes two clicks; only the second one calls the API", async () => {
    stubFetch((c) => (c.url.endsWith("/accept-baseline") ? { status: 200, body: { ok: true } } : { status: 200, body: { ok: true, overview: overview() } }));
    await mount();
    await click(button("接受為新基準"));
    expect(calls.some((c) => c.url.endsWith("/accept-baseline"))).toBe(false);
    await click(button("再按一次確認"));
    const post = calls.find((c) => c.url.endsWith("/accept-baseline"))!;
    expect(post.method).toBe("POST");
    expect(post.body).toEqual({ pageId: PAGE_ID });
  });

  it("a later failed load (no visual verdict) does not hide the accept button of an earlier diff", async () => {
    const diffRow = overview().recent[0];
    const failedLoad = {
      ...diffRow, id: "22222222-2222-2222-2222-222222222222", ok: false, http_status: 503, failure_code: "http_5xx",
      visual_status: null, visual_note: null, diff_ratio: null, diff_key: null, created_at: new Date().toISOString(),
    };
    stubFetch(() => ({ status: 200, body: { ok: true, overview: overview({ recent: [failedLoad, { ...diffRow, created_at: "2026-09-20T00:00:00Z" }] }) } }));
    await mount();
    expect(button("接受為新基準")).toBeTruthy();
  });

  it("evidence images load only on demand, through the authenticated route by row id", async () => {
    stubFetch(() => ({ status: 200, body: { ok: true, overview: overview() } }));
    await mount();
    await click(button("差異"));
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/api/ops/clients/shop-a/site-watch/image?result=11111111-1111-1111-1111-111111111111&which=diff");
    await click(button("差異"));
    expect(container.querySelector("img")).toBeNull();
  });
});
