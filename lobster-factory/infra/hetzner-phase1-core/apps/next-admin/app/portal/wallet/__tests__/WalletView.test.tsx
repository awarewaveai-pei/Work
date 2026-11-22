// @vitest-environment jsdom
//
// U10: the 點數與合約 page draws from GET /portal/api/account only. The member response must leave NO purchase button and
// no contract / ledger section on the page (not hidden: absent); the manager sees three visible tab buttons and the top-up link.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WalletView } from "../WalletView";

const SHOP = "https://shop.example.test/shop/";
const MEMBER = { ok: true, role: "member", balance: 1240, frozen: false, next_period_end: "2026-12-10T00:00:00Z" };
const MANAGER = {
  ...MEMBER, role: "manager",
  contracts: [{ product_key: "content", plan_key: "p", status: "active", current_period_end: "2026-12-10T00:00:00Z" }],
  grants: [],
  ledger: [{ at: "2026-11-22T02:31:00Z", units: -3, entry_type: "debit" }, { at: "2026-11-20T01:02:00Z", units: 500, entry_type: "grant" }],
};

const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
beforeEach(() => { vi.stubGlobal("fetch", reply(MANAGER)); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("點數與合約", () => {
  it("manager: balance in NT$, a top-up link to the shop, three visible tab buttons showing contracts and the ledger", async () => {
    render(<WalletView topUpUrl={SHOP} />);
    await screen.findByText("點數餘額");
    expect(screen.getByText(/NT\$1,240/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /儲值/ }).getAttribute("href")).toBe(SHOP);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["點數", "合約", "紀錄"]);
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "合約" }));
    expect(screen.getByText("內容行銷")).toBeTruthy();
    expect(screen.getByText("有效")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "紀錄" }));
    expect(screen.getByText("扣點")).toBeTruthy();
    expect(screen.getByText("+500")).toBeTruthy();
  });

  it("member: balance and end date only -- no purchase button, no tabs, no contract or ledger section", async () => {
    vi.stubGlobal("fetch", reply(MEMBER));
    const { container } = render(<WalletView topUpUrl={SHOP} />);
    await screen.findByText("點數餘額");
    expect(screen.getByText(/本期到：/)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/儲值/)).toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(container.querySelector("table")).toBeNull();
    expect(container.innerHTML).not.toContain(SHOP);
    expect(screen.queryByText("合約")).toBeNull();
    expect(screen.queryByText("紀錄")).toBeNull();
  });

  it("a failed read says so and the 重新整理 button reads again", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify(MEMBER), { status: 200 }));
    vi.stubGlobal("fetch", f);
    render(<WalletView topUpUrl={SHOP} />);
    await screen.findByText(/讀取失敗/);
    fireEvent.click(screen.getByRole("button", { name: "重新整理" }));
    await waitFor(() => expect(screen.getByText("點數餘額")).toBeTruthy());
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("no fixed pixel width on the layout (phone width does not scroll sideways)", () => {
    const src = readFileSync(path.join(__dirname, "..", "WalletView.tsx"), "utf8");
    expect(src).not.toMatch(/\b(?:min)?[wW]idth:\s*\d{3,}/);
    expect(src).toMatch(/maxWidth: 720/);
  });
});
