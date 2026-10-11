import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpressPage } from "../components/blocks/ExpressPage";
import { ApiError } from "./api";
import { docs } from "./blocks";

// A1 (2026-10-11 walk): 產出與表達 sent one GET per kind (~60) on load and tripped Cloudflare's 50-per-10-seconds rule.
// Here the real apiFetch runs against a stubbed fetch, so the requests counted are the ones a browser would send.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const kindsOf = (url: string) => decodeURIComponent(new URL(url, "http://x").searchParams.get("kinds") ?? "").split(",").filter(Boolean);

function stub(answer: (url: string) => Response | undefined = () => undefined) {
  const sent: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "GET") sent.push(url);
    const own = answer(url);
    if (own) return own;
    if (url.includes("/docs?kinds=")) return json({ docs: Object.fromEntries(kindsOf(url).map((kind) => [kind, []])) });
    if (url.endsWith("/api/projects/P")) return json({ project_id: "P", name: "續約" });
    if (url.endsWith("/route")) return json({ purpose: null, package: null, blocks: [], done: [] });
    if (url.endsWith("/express/formats")) return json({ formats: [] });
    return json([]);
  }));
  return sent;
}

describe("a page reads all its kinds in one request", () => {
  it("產出與表達 on load: one GET .../docs?kinds=..., never one per kind", async () => {
    const sent = stub();
    const host = document.createElement("div"); document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<ExpressPage projectId="P" />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const batches = sent.filter((url) => url.includes("/docs?kinds="));
    expect(sent.filter((url) => /\/docs\/[^/?]+$/.test(url))).toEqual([]);   // no per-kind GET left
    expect(batches).toHaveLength(1);
    expect(kindsOf(batches[0]).length).toBeGreaterThan(40);                // the page's record kinds plus the shell's, together
    expect(kindsOf(batches[0])).toContain("collab_contract.terms");      // BlockShell's own read joins the same request
    await act(async () => { root.unmount(); }); host.remove();
  });

  it("each caller gets its own list, and a kind the batch calls unknown is asked alone (optionalDocs still sees its 404)", async () => {
    const sent = stub((url) => {
      if (url.includes("/docs?kinds=")) return json({ detail: "DOC_KIND_UNKNOWN: 'teach.none'" }, 404);
      if (url.endsWith("/docs/teach.none")) return json({ detail: "DOC_KIND_UNKNOWN: 'teach.none'" }, 404);
      if (url.endsWith("/docs/sense.card")) return json([{ doc_id: "S1" }]);
      return undefined;
    });
    const [cards, again, unknown] = await Promise.allSettled([docs.list("P", "sense.card"), docs.list("P", "sense.card"), docs.list("P", "teach.none")]);
    expect(cards).toEqual({ status: "fulfilled", value: [{ doc_id: "S1" }] });
    expect(again.status === "fulfilled" && cards.status === "fulfilled" && again.value !== cards.value).toBe(true);   // not one shared array
    expect(unknown.status === "rejected" && unknown.reason instanceof ApiError && unknown.reason.status === 404).toBe(true);
    expect(sent.filter((url) => url.includes("/docs"))).toHaveLength(3);   // the batch, then the two kinds alone
  });
});
