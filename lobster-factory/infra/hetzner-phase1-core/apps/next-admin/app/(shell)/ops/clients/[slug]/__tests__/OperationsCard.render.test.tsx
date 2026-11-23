// @vitest-environment jsdom
//
// 誰在操作 card mounted for real (react-dom, no @testing-library; SiteWatchCard.render.test.tsx convention): two visible
// buttons per product, no select; a click posts the choice and the page shows what the server answered.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperationsData } from "@/lib/entitlements/operations";
import { OperationsCard } from "../OperationsCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const data = (canEdit = true): OperationsData => ({
  canEdit, error: null,
  products: [
    { key: "content", name: "內容行銷", operatedBy: "customer", updatedAt: null, updatedBy: null },
    { key: "video", name: "影片製作", operatedBy: "awarewave", updatedAt: "2026-11-23T00:00:00Z", updatedBy: "ops:owner:u1" },
  ],
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});
function mount(d: OperationsData) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<OperationsCard slug="soulful-expression" data={d} />));
  return host;
}
const row = (el: HTMLElement, name: string) => [...el.querySelectorAll("div")].find((d) => d.firstElementChild?.textContent === name)!;
const btn = (r: HTMLElement, label: string) => [...r.querySelectorAll("button")].find((b) => b.textContent === label)!;
const isActive = (b: HTMLButtonElement) => b.style.fontWeight === "600";

describe("OperationsCard", () => {
  it("each product shows both choices as buttons, the stored one active; no dropdown", () => {
    const el = mount(data());
    expect(el.querySelector("select")).toBeNull();
    const content = row(el, "內容行銷");
    expect(isActive(btn(content, "客戶自己操作"))).toBe(true);
    expect(isActive(btn(content, "AwareWave 代操"))).toBe(false);
    expect(isActive(btn(row(el, "影片製作"), "AwareWave 代操"))).toBe(true);
  });

  it("clicking 代操 posts it and shows the server's answer; a refusal shows a message and keeps the old state", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, product: "content", operatedBy: "awarewave" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount(data());
    await act(async () => btn(row(el, "內容行銷"), "AwareWave 代操").click());
    expect(fetchMock).toHaveBeenCalledWith("/api/ops/clients/soulful-expression/operations",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ product: "content", operatedBy: "awarewave" }) }));
    expect(isActive(btn(row(el, "內容行銷"), "AwareWave 代操"))).toBe(true);

    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ ok: false, error: "forbidden_role" }), { status: 403 }));
    await act(async () => btn(row(el, "內容行銷"), "客戶自己操作").click());
    expect(isActive(btn(row(el, "內容行銷"), "AwareWave 代操"))).toBe(true);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain("擁有者或管理員");
  });

  it("someone who may not edit sees the state with every button disabled", () => {
    const el = mount(data(false));
    expect([...el.querySelectorAll("button")].every((b) => b.disabled)).toBe(true);
  });
});
