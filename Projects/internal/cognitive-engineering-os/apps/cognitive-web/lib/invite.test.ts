import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./api";
import { inviteToken, joinAsMember, joinAsNew } from "./invite";
import { middleware } from "../middleware";
import { NextRequest } from "next/server";

vi.mock("./api", async (original) => ({ ...(await original<typeof import("./api")>()), apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe("邀請連結 (2026-10-13: the link sent a visitor to the login page)", () => {
  it("reads the token from the fragment", () => {
    expect(inviteToken("#abc_DEF-1")).toBe("abc_DEF-1");
    expect(inviteToken("")).toBe("");
  });

  it("a first-time visitor: whoever was signed in here is signed out first, and the link's answer signs the new account in", async () => {
    const calls: Array<[string, unknown]> = [];
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      calls.push([String(path), init?.body ? JSON.parse(String(init.body)) : null]);
      return (String(path) === "/invites/accept" ? { group_id: "G1", identity_id: "I1", review_state: "confirmed" } : {}) as never;
    });
    expect(await joinAsNew("T", "小美", "a@example.com", "correct-horse-battery")).toEqual({ group_id: "G1", identity_id: "I1", review_state: "confirmed" });
    expect(calls).toEqual([
      ["/auth/logout", null],
      ["/invites/accept", { token: "T", display_name: "小美", email: "a@example.com", password: "correct-horse-battery" }],
    ]);
  });

  it("an address in several workspaces: login refuses before the invitation is touched, and the chosen workspace logs in", async () => {
    const calls: Array<[string, unknown]> = [];
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push([String(path), body]);
      if (String(path) === "/auth/login" && !body.tenant_id) throw new ApiError(409, { code: "LOGIN_CHOOSE_WORKSPACE", workspaces: [{ tenant_id: "W1", name: "甲" }] });
      return { group_id: "G1", identity_id: "I2", review_state: "confirmed" } as never;
    });
    await expect(joinAsMember("T", "b@example.com", "pw")).rejects.toBeInstanceOf(ApiError);
    expect(calls.map(([path]) => path)).toEqual(["/auth/login"]);
    await joinAsMember("T", "b@example.com", "pw", "W1");
    expect(calls.slice(1)).toEqual([["/auth/login", { email: "b@example.com", password: "pw", tenant_id: "W1" }], ["/invites/accept", { token: "T" }]]);
  });

  it("someone with an account: signs in first, then the link joins that account (no new account)", async () => {
    const calls: Array<[string, unknown]> = [];
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      calls.push([String(path), JSON.parse(String(init?.body))]);
      return { group_id: "G1", identity_id: "I2", review_state: "confirmed" } as never;
    });
    await joinAsMember("T", "b@example.com", "pw");
    expect(calls).toEqual([["/auth/login", { email: "b@example.com", password: "pw" }], ["/invites/accept", { token: "T" }]]);
  });

  it("the invite page opens without a session; other pages still go to login", async () => {
    const at = (path: string) => middleware(new NextRequest(new URL(`https://cognitive.aware-wave.com${path}`)));
    expect((await at("/invite")).headers.get("location")).toBeNull();
    expect((await at("/projects")).headers.get("location")).toBe("https://cognitive.aware-wave.com/login");
  });
});
