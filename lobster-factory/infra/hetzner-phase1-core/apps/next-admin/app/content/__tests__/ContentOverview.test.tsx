// @vitest-environment jsdom
// U16: the content door's home -- three numbers that link to their pages; a failed read shows "—", never 0.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const A = "11111111-1111-4111-8111-111111111111";
vi.mock("next/navigation", () => ({
  usePathname: () => "/content",
  useSearchParams: () => new URLSearchParams(`org=${A}`),
}));
vi.mock("@/lib/client-context/use-client-context", () => ({
  useClientContext: () => ({ org: A, site: null, status: "ok" }),
}));

import { ContentOverview } from "../ContentOverview";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const card = (label: string) => screen.getByText(label, { selector: ".card-label" }).closest("a")!;
const value = (label: string) => card(label).querySelector(".card-value")!.textContent;

describe("ContentOverview", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("shows the three numbers, each linking to its page with the current client, and the 寫文章 button", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/content/drafts")) return json({ ok: true, drafts: [{}, {}] });
      if (url.startsWith("/api/content/topics/overview")) return json({ ok: true, overview: { month: "2026-11-01", rows: [{ siteId: "s1", pending: 3 }, { siteId: "s2", pending: 4 }] } });
      return json({ ok: true, topics: [{ site_id: "s1", status: "scheduled" }, { site_id: "s2", status: "published" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ContentOverview />);
    await waitFor(() => expect(value("已排程")).toBe("1"));
    expect(value("待核准題目")).toBe("7");
    expect(value("草稿")).toBe("2");
    expect(card("待核准題目").getAttribute("href")).toBe(`/topics?org=${A}`);
    expect(card("草稿").getAttribute("href")).toBe(`/drafts?org=${A}`);
    expect(card("已排程").getAttribute("href")).toBe(`/topics?org=${A}`);
    expect(screen.getByRole("link", { name: "寫文章" }).getAttribute("href")).toBe(`/write?org=${A}`);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContain("/api/content/topics?siteId=s1&month=2026-11");
  });

  it("shows — for a number whose read failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/content/drafts") ? json({ ok: true, drafts: [] }) : json({ ok: false }, 500)));
    render(<ContentOverview />);
    await waitFor(() => expect(value("草稿")).toBe("0"));
    expect(value("待核准題目")).toBe("—");
    expect(value("已排程")).toBe("—");
  });
});
