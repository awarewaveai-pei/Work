import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { mintDoorLink } from "../door-link";

const ACCOUNT = { userId: "user-1", organizationId: "org-1" };

function db(over: { user?: object | null; getErr?: object | null; linkUser?: string; hashed?: string | null; linkErr?: object | null } = {}) {
  const user = over.user === undefined
    ? { id: ACCOUNT.userId, email: "a@b.tw", email_confirmed_at: "2026-10-25T00:00:00Z", app_metadata: { user_kind: "client", org_id: ACCOUNT.organizationId } }
    : over.user;
  const generateLink = vi.fn(async () => ({
    data: { properties: { hashed_token: over.hashed === undefined ? "tok/+=" : over.hashed }, user: { id: over.linkUser ?? ACCOUNT.userId } },
    error: over.linkErr ?? null,
  }));
  const getUserById = vi.fn(async () => ({ data: { user }, error: over.getErr ?? null }));
  return { client: { auth: { admin: { generateLink, getUserById } } } as unknown as SupabaseClient, generateLink };
}

describe("mintDoorLink (the one place a door sign-in link is minted)", () => {
  it("mints a recovery link onto the door's /login/wp, token url-encoded", async () => {
    const { client, generateLink } = db();
    expect(await mintDoorLink(client, ACCOUNT, "tarot.aware-wave.com")).toEqual({ ok: true, url: "https://tarot.aware-wave.com/login/wp#token_hash=tok%2F%2B%3D&type=recovery" });
    expect(generateLink).toHaveBeenCalledWith({ type: "recovery", email: "a@b.tw" });
  });

  it("next is appended encoded; absent next adds nothing", async () => {
    expect(await mintDoorLink(db().client, ACCOUNT, "tarot.aware-wave.com", "/works")).toEqual(
      { ok: true, url: "https://tarot.aware-wave.com/login/wp#token_hash=tok%2F%2B%3D&type=recovery&next=%2Fworks" });
    const plain = await mintDoorLink(db().client, ACCOUNT, "tarot.aware-wave.com");
    expect(plain.ok && plain.url).not.toContain("next=");
  });

  it("auth lookup failing or returning no email -> 503 auth_lookup_failed", async () => {
    expect(await mintDoorLink(db({ getErr: { message: "x" } }).client, ACCOUNT, "h")).toEqual({ ok: false, status: 503, error: "auth_lookup_failed" });
    expect(await mintDoorLink(db({ user: null }).client, ACCOUNT, "h")).toEqual({ ok: false, status: 503, error: "auth_lookup_failed" });
  });

  it("an account that is no longer this organization's client -> 403 not_this_account, no link made", async () => {
    for (const app_metadata of [{ user_kind: "staff", org_id: "org-1" }, { user_kind: "client", org_id: "org-2" }, {}]) {
      const { client, generateLink } = db({ user: { id: "user-1", email: "a@b.tw", email_confirmed_at: "2026-10-25T00:00:00Z", app_metadata } });
      expect(await mintDoorLink(client, ACCOUNT, "h")).toEqual({ ok: false, status: 403, error: "not_this_account" });
      expect(generateLink).not.toHaveBeenCalled();
    }
  });

  it("an email never confirmed -> 403 email_unverified, no link made", async () => {
    const { client, generateLink } = db({ user: { id: "user-1", email: "a@b.tw", email_confirmed_at: null, app_metadata: { user_kind: "client", org_id: "org-1" } } });
    expect(await mintDoorLink(client, ACCOUNT, "h")).toEqual({ ok: false, status: 403, error: "email_unverified" });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("generateLink failing, tokenless, or resolving another user -> 503 link_failed", async () => {
    expect(await mintDoorLink(db({ linkErr: { message: "x" } }).client, ACCOUNT, "h")).toEqual({ ok: false, status: 503, error: "link_failed" });
    expect(await mintDoorLink(db({ hashed: null }).client, ACCOUNT, "h")).toEqual({ ok: false, status: 503, error: "link_failed" });
    expect(await mintDoorLink(db({ linkUser: "user-2" }).client, ACCOUNT, "h")).toEqual({ ok: false, status: 503, error: "link_failed" });
  });
});
