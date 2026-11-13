// @vitest-environment jsdom
//
// The display zone (2026-11-13) changes only what the page SHOWS. Invariant: a post's send instant (UTC in the
// database) and a series' computed instants are the same in every display zone, and switching saves nothing but the
// person's own choice (api.setDisplayTz), never a post.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Account, Brand } from "../model";

beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-14T04:00:00Z")); });   // Wed 12:00 Taipei
afterAll(() => vi.useRealTimers());

const brand: Brand = { id: "b1", slug: "b", name: "品牌", default_timezone: "Asia/Taipei", role: "owner" };
const account: Account = { id: "a1", platform: "bluesky", label: "x.bsky.social", status: "connected", postiz_integration_id: "i1", picture: null, handle: null, chatwoot_inbox_id: null };
const post = (id: string, body: string, scheduledAt: string | null, extra: Record<string, unknown> = {}) => ({
  id, state: scheduledAt ? "scheduled" : "draft", body, scheduled_at: scheduledAt, list_id: null, list_position: null, first_comment: null, link_url: null, link_utm: false,
  notes: null, source_url: null, published_at: null, deleted_at: null, version: 1, created_at: "2026-10-13T23:30:00.000Z",
  repeat: null, repeat_of: null, origin_slot: null, auto_mode: "brand", comments: [], tags: [],
  targets: [{ id: `${id}-t`, account_id: "a1", custom_body: null, format: "post", state: "pending", postiz_post_id: null, release_url: null, error: null }], media: [],
  ...extra,
});
// Thu 00:30 in Taipei = Wed 16:30 UTC: a weekly Thursday series made on the UTC wall clock would land a day off
const SERIES_AT = "2026-10-14T16:30:00.000Z";
const posts = [
  post("one", "單次貼文", "2026-10-15T02:00:00.000Z"),
  post("series", "每週四", SERIES_AT, { repeat: { freq: "week", days: [4], end: "never" } }),
  post("draft", "草稿一則", null),
];
const before = JSON.stringify(posts);

const calls = vi.hoisted(() => ({ setDisplayTz: vi.fn(), setState: vi.fn(), create: vi.fn(), save: vi.fn() }));
vi.mock("../api", async (orig) => {
  const real = await orig<typeof import("../api")>();
  const api = {
    brands: async () => ({ brands: [brand], total: 1 }),
    posts: async () => ({ posts, wordpress: [], undatedTruncated: false, tags: [] }),
    accounts: async () => ({ accounts: [account] }),
    trash: async () => ({ posts: [], deletions: {} }),
    media: async () => ({ media: [] }),
    prefs: async () => ({ displayTz: "org" }),
    setDisplayTz: async (z: string) => { calls.setDisplayTz(z); return { displayTz: z }; },
    setState: calls.setState, create: calls.create, save: calls.save,
  };
  return { ...real, api };
});
const { default: SocialManager } = await import("../SocialManager");

afterEach(() => cleanup());

describe("display time zone", () => {
  it("switching to UTC moves what is shown by 8 hours and nothing else", async () => {
    window.history.replaceState(null, "", "/tools/social?view=list");
    render(<SocialManager />);
    // the organisation's zone (Taipei): 02:00Z = 10:00, the series template Thu 00:30, its next one a week later
    expect(await screen.findByText("10/15 10:00")).toBeTruthy();
    expect(screen.getByText("10/15 00:30")).toBeTruthy();
    expect(screen.getByText("10/22 00:30")).toBeTruthy();
    expect(screen.getAllByText("10/14 07:30").length).toBeGreaterThan(0);   // 建立時間 23:30Z in Taipei

    fireEvent.click(screen.getByRole("button", { name: "UTC" }));
    await waitFor(() => expect(screen.getByText("10/15 02:00")).toBeTruthy());
    expect(screen.getByText("10/14 16:30")).toBeTruthy();            // the template, same instant
    expect(screen.getByText("10/21 16:30")).toBeTruthy();            // the occurrence, same instant (Taipei's Thursday)
    expect(screen.queryByText("10/15 16:30")).toBeNull();            // not a Thursday on the UTC wall clock
    expect(screen.getAllByText("10/13 23:30").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "UTC" }).getAttribute("aria-pressed")).toBe("true");

    expect(calls.setDisplayTz).toHaveBeenCalledWith("UTC");
    for (const write of [calls.setState, calls.create, calls.save]) expect(write).not.toHaveBeenCalled();
    expect(JSON.stringify(posts)).toBe(before);                      // every scheduled_at still the same UTC instant

    fireEvent.click(screen.getByRole("button", { name: "台灣" }));
    await waitFor(() => expect(screen.getByText("10/15 10:00")).toBeTruthy());
    expect(screen.getByText("10/22 00:30")).toBeTruthy();
  });
});
