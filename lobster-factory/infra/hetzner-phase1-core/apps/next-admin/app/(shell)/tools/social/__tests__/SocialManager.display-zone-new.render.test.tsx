// @vitest-environment jsdom
//
// critic 2026-11-13 M2: a week column is drawn in the person's display zone, but the composer reads its date and time
// in the organisation's. 新增 on a column must open the composer at that column's noon, converted.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Account, Brand } from "../model";

beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-14T04:00:00Z")); });   // Wed 12:00 Taipei, Tue 21:00 LA
afterAll(() => vi.useRealTimers());

const brand: Brand = { id: "b1", slug: "b", name: "品牌", default_timezone: "America/Los_Angeles", role: "owner" };
const account: Account = { id: "a1", platform: "bluesky", label: "x", status: "connected", postiz_integration_id: "i1", picture: null, handle: null, chatwoot_inbox_id: null };
const one = {
  id: "one", state: "scheduled", body: "一則", scheduled_at: "2026-10-20T02:00:00.000Z", list_id: null, list_position: null, first_comment: null, link_url: null, link_utm: false,
  notes: null, source_url: null, published_at: null, deleted_at: null, version: 1, created_at: "2026-10-13T00:00:00.000Z", repeat: null, repeat_of: null, origin_slot: null,
  auto_mode: "brand", comments: [], tags: [], targets: [], media: [],
};

vi.mock("../api", async (orig) => {
  const real = await orig<typeof import("../api")>();
  return { ...real, api: {
    brands: async () => ({ brands: [brand], total: 1 }),
    posts: async () => ({ posts: [one], wordpress: [], undatedTruncated: false, tags: [] }),
    accounts: async () => ({ accounts: [account] }), trash: async () => ({ posts: [], deletions: {} }), media: async () => ({ media: [] }),
    prefs: async () => ({ displayTz: "Asia/Taipei" }), setDisplayTz: async (z: string) => ({ displayTz: z }),
  } };
});
const { default: SocialManager } = await import("../SocialManager");
afterEach(() => cleanup());

describe("新增 on a week column in the display zone", () => {
  it("opens the composer at that column's noon in the organisation's zone", async () => {
    window.history.replaceState(null, "", "/tools/social");
    const go = vi.fn();
    render(<SocialManager go={go} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "台灣" }).getAttribute("aria-pressed")).toBe("true"));
    const friday = await waitFor(() => { const el = document.querySelector('.sm-day[data-date="2026-10-16"]'); expect(el).toBeTruthy(); return el as HTMLElement; });
    fireEvent.click(within(friday).getByRole("button", { name: /新增/ }));
    const href = new URL(go.mock.calls[0][0] as string, "http://x");
    expect(href.searchParams.get("date")).toBe("2026-10-15");   // Fri 12:00 Taipei = Thu 21:00 Los Angeles
    expect(href.searchParams.get("time")).toBe("21:00");
  });
});
