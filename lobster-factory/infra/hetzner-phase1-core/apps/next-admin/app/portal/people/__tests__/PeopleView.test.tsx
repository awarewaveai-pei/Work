// @vitest-environment jsdom
//
// U19: 成員授權 draws from GET /portal/api/people. The manager sees the list and the invite / 重寄 / 刪除 controls (none on
// their own row); an authorized person sees only the explanation -- no list, no input, no button (absent, not hidden).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PeopleView } from "../PeopleView";

const reply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("成員授權", () => {
  it("manager: the unit's accounts with 重寄 and 刪除 on others, the invite form with product buttons", async () => {
    vi.stubGlobal("fetch", reply({ ok: true, role: "manager", products: [{ key: "content", name: "內容行銷" }], accounts: [
      { userId: "u1", email: "boss@unit.test", verified: true, lastSignInAt: null, self: true },
      { userId: "u2", email: "mate@unit.test", verified: false, lastSignInAt: null, self: false }] }));
    render(<PeopleView />);
    await screen.findByText("mate@unit.test");
    expect(screen.getByText("boss@unit.test（你）")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "重寄" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "刪除" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "內容行銷" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("textbox", { name: "同事的 email" })).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("authorized person: the explanation only, no list and no control", async () => {
    vi.stubGlobal("fetch", reply({ ok: true, role: "member" }));
    render(<PeopleView />);
    await screen.findByText(/成員由單位的管理者授權/);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
