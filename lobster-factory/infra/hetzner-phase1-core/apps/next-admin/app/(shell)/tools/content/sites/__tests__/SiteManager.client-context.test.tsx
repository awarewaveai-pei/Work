// @vitest-environment jsdom
//
// 網站頁只列目前客戶的網站（K9）：有客戶才抓、抓的網址帶 organizationId、未選客戶不抓且顯示「請先選客戶」、新增帶目前客戶。
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SiteManager from "../SiteManager";

const ctx = vi.hoisted(() => ({ org: null as string | null, status: "unselected" }));
vi.mock("@/lib/client-context/use-client-context", () => ({ useClientContext: () => ({ org: ctx.org, status: ctx.status }) }));

const ORG = "11111111-1111-4111-8111-111111111111";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SiteManager current client", () => {
  it("staff, no client picked -> no fetch, 請先選客戶, add button disabled", () => {
    ctx.org = null; ctx.status = "unselected";
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    render(<SiteManager />);
    expect(screen.getByText("請先選客戶")).toBeTruthy();
    expect((screen.getByRole("button", { name: "+ 新增網站" }) as HTMLButtonElement).disabled).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("client picked -> list fetch carries organizationId; add POST carries the same org", async () => {
    ctx.org = ORG; ctx.status = "ok";
    const calls: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : null });
      return new Response(JSON.stringify({ ok: true, sites: [] }));
    }));
    render(<SiteManager />);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe(`/api/content/sites?includeInactive=1&organizationId=${ORG}`);

    await screen.findByText(/尚無 WordPress 網站連線/);
    fireEvent.click(screen.getByRole("button", { name: "+ 新增網站" }));
    fireEvent.change(screen.getByPlaceholderText("例：soulful.com.tw"), { target: { value: "n" } });
    fireEvent.change(screen.getByPlaceholderText("https://example.com"), { target: { value: "https://x.example.com" } });
    fireEvent.change(screen.getByPlaceholderText("例：admin"), { target: { value: "u" } });
    fireEvent.change(screen.getByPlaceholderText("xxxx xxxx xxxx xxxx xxxx xxxx"), { target: { value: "t" } });
    fireEvent.click(screen.getByRole("button", { name: "新增網站" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ organizationId: ORG, url: "https://x.example.com" });
  });
});
