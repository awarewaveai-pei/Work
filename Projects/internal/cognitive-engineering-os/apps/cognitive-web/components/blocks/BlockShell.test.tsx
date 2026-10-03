import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api";
import type { Route } from "../../lib/blocks";
import { BlockShell } from "./BlockShell";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

const ROUTE: Route = {
  purpose: "自我理解", package: "自我理解", done: ["SENSE"],
  blocks: [
    { code: "SENSE", why: { from: "package", package: "自我理解" }, open: true, done: true },
    { code: "VERIFY", why: { from: "proposal", by: "SENSE", text: "卡片裡有別人的說法" }, open: false, done: false },
    { code: "THINK", why: { from: "package", package: "自我理解" }, open: true, done: false },
  ],
};

async function shell(code: "SENSE" | "THINK" | "MAP", path: Route) {
  vi.mocked(apiFetch).mockImplementation(async (url: string) => (url.endsWith("/route") ? path : url.endsWith("/proposals") ? [] : { project_id: "P1", name: "續約" }) as never);
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<BlockShell projectId="P1" code={code}><p>內容</p></BlockShell>); });
  return { host, done: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}

describe("每一塊的頁面：現在在哪一塊、為什麼、下一塊", () => {
  it("says where I am in my route, why the block is there, and the next open block (a block not open yet is skipped and named)", async () => {
    const { host, done } = await shell("SENSE", ROUTE);
    const where = host.querySelector(".card")!.textContent!;
    expect(where).toContain("這個案子的第 1 塊，共 3 塊");
    expect(where).toContain("「自我理解」套件排了這一塊");
    expect(host.querySelector(".card a[href='/projects/P1/think']")?.textContent).toBe("4 共思考");
    expect(where).toContain("「查證主張」第 2 步才開放，先跳過");
    expect(host.querySelector(".tabnext a")?.textContent).toBe("下一塊：共思考 →");   // the bottom button: the same route
    await done();
  });

  it("a block added by an accepted proposal says who proposed it; the last block says so", async () => {
    const { host, done } = await shell("THINK", { ...ROUTE, blocks: [ROUTE.blocks[0], { ...ROUTE.blocks[1], code: "THINK", open: true }] });
    const where = host.querySelector(".card")!.textContent!;
    expect(where).toContain("「外化」提議加，你同意了：卡片裡有別人的說法");
    expect(where).toContain("這是這個案子的最後一塊");
    expect(host.querySelector(".tabnext a")?.getAttribute("href")).toBe("/projects/P1");
    await done();
  });

  it("a block outside the route says I opened it myself; no route yet points to the intake", async () => {
    let page = await shell("MAP", ROUTE);
    expect(page.host.querySelector(".card")!.textContent).toContain("不在這個案子的組合裡，是你自己打開的");
    await page.done();
    page = await shell("MAP", { purpose: null, package: null, blocks: [], done: [] });
    expect(page.host.querySelector(".card a[href='/projects/P1/start']")?.textContent).toBe("開案資料");
    await page.done();
  });

  it("says the true thing when nothing open comes next, and when I skipped every block at intake", async () => {
    let page = await shell("SENSE", { ...ROUTE, blocks: ROUTE.blocks.slice(0, 2) });
    const where = page.host.querySelector(".card")!.textContent!;
    expect(where).toContain("後面的「查證主張」第 2 步才開放，現在沒有可以接著走的積木");
    expect(where).not.toContain("最後一塊");
    await page.done();
    page = await shell("MAP", { ...ROUTE, blocks: [] });
    expect(page.host.querySelector(".card")!.textContent).toContain("把這個案子的積木都跳過了");
    await page.done();
  });

  it("answering a proposal reloads the route (加 puts the block in it)", async () => {
    const proposal = { type: "proposal", doc_id: "D1", kind: "assembler.proposal.map", by: "MAP", propose: "DECIDE", why: "要比較選項", open: true };
    let routes = 0;
    vi.mocked(apiFetch).mockImplementation(async (url: string) => (url.endsWith("/route") ? (routes += 1, ROUTE) : url.endsWith("/proposals") ? (routes > 1 ? [] : [proposal]) : url.includes("/docs/") ? { doc_id: "A1", notices: [] } : { project_id: "P1", name: "續約" }) as never);
    const host = document.createElement("div"); document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<BlockShell projectId="P1" code="SENSE"><p>內容</p></BlockShell>); });
    expect(routes).toBe(1);
    const add = [...host.querySelectorAll("button")].find((button) => button.textContent === "加")!;
    await act(async () => { add.click(); });
    expect(routes).toBe(2);
    await act(async () => { root.unmount(); }); host.remove();
  });

  it("the slots mark what I did with ✓ (not colour alone) and light the next block", async () => {
    const { host, done } = await shell("THINK", ROUTE);
    const slots = host.querySelector("nav.journey")!;
    expect(slots.querySelector(".done")?.textContent).toBe("✓ 1 外化");
    expect(slots.querySelector(".done")?.getAttribute("title")).toBe("做過");
    expect(slots.querySelector("[aria-current='page']")?.textContent).toBe("4 共思考");
    await done();
  });
});
