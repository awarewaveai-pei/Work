import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroupsPage, ONCE } from "./GroupsPage";
import { byText, click, field, mount, serve, type, type Call } from "./JudgmentTestKit";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const MINE = { group_id: "G1", name: "第三位合夥人", purpose: "decision", status: "open", my_role: "convener", my_review_state: "confirmed" };

describe("我的群組", () => {
  it("makes a group from a name and a purpose chosen by buttons", async () => {
    const list: unknown[] = [];
    const calls = serve({ "GET /groups": () => list, "POST /groups": (call: Call) => { list.push({ ...MINE, ...call.body }); return list[0]; }, "/groups/G1/invites": [] });
    const { host, done } = await mount(<GroupsPage />);
    const make = () => byText(host, "button", "開這個群組") as HTMLButtonElement;
    expect(make().disabled).toBe(true);
    await type(field(host, "group-name"), "讀書會");
    await click(byText(host.querySelector('[aria-label="這個群組要做什麼"]')!, "button", "上課"));
    await click(make());
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ name: "讀書會", purpose: "class" });
    expect(host.querySelector("select")).toBeNull();
    await done();
  });

  it("shows an invitation link once with a copy button, and takes an open one back", async () => {
    const calls = serve({ "GET /groups": [MINE], "GET /groups/G1/invites": [{ invite_id: "V1", role: "participant", created_at: "2026-10-08", expires_at: "2026-10-15T00:00:00Z" }],
      "POST /groups/G1/invites": { invite_id: "V2", token: "tok-secret", expires_at: "2026-10-15" }, "DELETE /groups/G1/invites/V1": { revoked: true } });
    const { host, done } = await mount(<GroupsPage />);
    await click(byText(host, "button", "做一個邀請連結"));
    expect(host.textContent).toContain(ONCE);
    expect((host.querySelector('[aria-label="邀請連結"]') as HTMLInputElement).value).toContain("#tok-secret");
    expect(byText(host, "button", "複製連結")).toBeDefined();
    await click(byText(host, "button", "收回"));
    expect(calls.some((call) => call.method === "DELETE" && call.path === "/groups/G1/invites/V1")).toBe(true);
    await done();
  });
});
