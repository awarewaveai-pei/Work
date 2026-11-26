// @vitest-environment jsdom
//
// U19: on the desktop workspace, 成員 sits next to 點數與合約 -- for the unit's manager only, by the same role the account
// API answered (no second lookup).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreditsLine } from "../CreditsLine";

const reply = (role: "manager" | "member") => vi.fn(async () => new Response(
  JSON.stringify({ ok: true, role, balance: 120, frozen: false, next_period_end: null }), { status: 200, headers: { "content-type": "application/json" } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("工作台 credits line", () => {
  it("manager: 成員 links to /portal/people beside 點數與合約", async () => {
    vi.stubGlobal("fetch", reply("manager"));
    render(<CreditsLine />);
    expect((await screen.findByRole("link", { name: "成員" })).getAttribute("href")).toBe("/portal/people");
    expect(screen.getByRole("link", { name: "點數與合約" })).toBeTruthy();
  });

  it("authorized person: no 成員 link", async () => {
    vi.stubGlobal("fetch", reply("member"));
    render(<CreditsLine />);
    await screen.findByText("120");
    expect(screen.queryByRole("link", { name: "成員" })).toBeNull();
  });
});
