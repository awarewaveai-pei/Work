// @vitest-environment jsdom
//
// B19 (2026-11-18 live run): organisation zone UTC, display zone 台灣. The list drew a post at 12:00 and the editor's
// picker opened it at 04:00 (the organisation's wall clock): choosing 12:00 there saved 20:00 Taipei. A one-off time is
// read and typed in the display zone everywhere; only a repeat series keeps the organisation's zone.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Account, Brand } from "../model";

beforeAll(() => { Element.prototype.scrollIntoView = () => {}; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-18T00:00:00Z")); });
afterAll(() => vi.useRealTimers());

let brand: Brand = { id: "b1", slug: "b", name: "Soulful", default_timezone: "UTC", role: "owner" };
let displayTz = "Asia/Taipei";
const account: Account = { id: "a1", platform: "bluesky", label: "x.bsky.social", status: "connected", postiz_integration_id: "i1", picture: null, handle: null, chatwoot_inbox_id: null };
const post = (id: string, scheduledAt: string, repeat: unknown = null) => ({
  id, state: "scheduled", body: "一則", scheduled_at: scheduledAt, list_id: null, list_position: null, first_comment: null, link_url: null, link_utm: false,
  notes: null, source_url: null, published_at: null, deleted_at: null, version: 1, repeat, repeat_of: null, origin_slot: null, auto_mode: "brand", comments: [], tags: [], media: [],
  targets: [{ id: `${id}-t`, account_id: "a1", custom_body: null, format: "post", state: "pending", postiz_post_id: null, release_url: null, error: null }],
});
const posts = [post("p1", "2026-11-19T04:00:00.000Z"), post("p-rpt", "2026-11-19T04:00:00.000Z", { freq: "day", end: "never" }), post("p-fall", "2026-11-01T09:30:00.000Z")];
const setState = vi.fn(async (_b: string, _id: string, version: number) => ({ post: { id: "p1", version: version + 1 } }));

vi.mock("../api", async (orig) => {
  const real = await orig<typeof import("../api")>();
  return { ...real, api: {
    brands: async () => ({ brands: [brand], total: 1 }),
    posts: async () => ({ posts, wordpress: [], undatedTruncated: false, tags: [] }),
    accounts: async () => ({ accounts: [account], connecting: null, justConnected: null, connectFailed: null }),
    get: async (_b: string, id: string) => ({ post: posts.find((p) => p.id === id) }),
    media: async () => ({ media: [] }), lists: async () => ({ lists: [] }), texts: async () => ({ texts: [] }), tags: async () => ({ tags: [] }),
    autoRules: async () => ({ rules: [] }), settings: async () => ({ requireReview: false }), trash: async () => ({ posts: [], deletions: {} }),
    save: async (_b: string, _id: string, version: number, _i?: unknown) => ({ post: { id: "p1", version } }),
    prefs: async () => ({ displayTz }), setDisplayTz: async (z: string) => ({ displayTz: z }),
    setState: (...a: [string, string, number]) => setState(...a),
  } };
});
const { default: SocialManager } = await import("../SocialManager");
afterEach(() => { cleanup(); setState.mockClear(); window.history.replaceState(null, "", "/"); });

async function openEditor(id: string) {
  render(<SocialManager route={{ kind: "compose", postId: id }} />);
  await waitFor(() => expect((screen.getByLabelText("貼文內容") as HTMLTextAreaElement).value).toBe("一則"));
}

describe("editor time picker follows the display zone", () => {
  it("a post the list draws at 12:00 (Taipei) opens at 12:00 in the picker, and a change saves the right instant", async () => {
    await openEditor("p1");
    // the stored display zone arrives after the editor mounts: the label settles on the Taipei reading
    await waitFor(() => expect(screen.getByRole("button", { name: /設定發佈時間/ }).getAttribute("aria-label")).toContain("12:00"));   // was 04:00: the organisation's UTC wall clock
    const when = screen.getByRole("button", { name: /設定發佈時間/ });
    fireEvent.click(when);
    const dlg = await screen.findByRole("dialog", { name: "設定發佈時間" });
    expect(within(dlg).getByRole("button", { name: "12:00" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(dlg).getByText(/台灣/)).toBeTruthy();   // names the zone it reads in
    fireEvent.click(within(dlg).getByRole("button", { name: "13:00" }));
    fireEvent.click(within(dlg).getByRole("button", { name: "好" }));
    fireEvent.click(screen.getByRole("button", { name: "設定行程" }));
    await waitFor(() => expect(setState).toHaveBeenCalled());
    const body = (setState.mock.calls.at(-1) as unknown as [string, string, number, { action: string; scheduledAt: string }])[3];
    expect(body).toMatchObject({ action: "schedule", scheduledAt: "2026-11-19T05:00:00.000Z" });   // 13:00 Taipei
  });

  it("a repeat post keeps the organisation's zone and says so", async () => {
    await openEditor("p-rpt");
    const when = await screen.findByRole("button", { name: /設定發佈時間/ });
    expect(when.getAttribute("aria-label")).toContain("04:00");
    fireEvent.click(when);
    const dlg = await screen.findByRole("dialog", { name: "設定發佈時間" });
    expect(within(dlg).getByRole("button", { name: "04:00" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(dlg).getByText(/這個週期用 UTC/)).toBeTruthy();
  });

  // Codex review 2026-11-19 F2: org Los Angeles, display UTC; 09:30Z on 2026-11-01 is the SECOND 01:30 of the fall-back
  it("keeps the exact instant across a DST fall-back when the zones differ", async () => {
    vi.setSystemTime(new Date("2026-10-25T00:00:00Z"));
    brand = { ...brand, default_timezone: "America/Los_Angeles" }; displayTz = "UTC";
    try {
      await openEditor("p-fall");
      await waitFor(() => expect(screen.getByRole("button", { name: /設定發佈時間/ }).getAttribute("aria-label")).toContain("09:30"));
      fireEvent.click(screen.getByRole("button", { name: /設定發佈時間/ }));
      const dlg = await screen.findByRole("dialog", { name: "設定發佈時間" });
      fireEvent.click(within(dlg).getByRole("button", { name: "好" }));   // nothing changed: the instant must not move
      fireEvent.click(screen.getByRole("button", { name: "設定行程" }));
      await waitFor(() => expect(setState).toHaveBeenCalled());
      expect((setState.mock.calls.at(-1) as unknown as [string, string, number, { scheduledAt: string }])[3].scheduledAt).toBe("2026-11-01T09:30:00.000Z");
    } finally {
      brand = { ...brand, default_timezone: "UTC" }; displayTz = "Asia/Taipei"; vi.setSystemTime(new Date("2026-11-18T00:00:00Z"));
    }
  });

  // Codex review 2026-11-19 F3: a hand-typed ?date= must not crash the composer
  it("ignores a malformed date or time in the address", async () => {
    window.history.replaceState(null, "", "/tools/social/compose/new?date=bad&time=xx");
    render(<SocialManager route={{ kind: "compose", postId: null }} />);
    await waitFor(() => expect(screen.getByLabelText("貼文內容")).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("button", { name: /設定發佈時間/ }).getAttribute("aria-label")).toMatch(/\d\d:\d\d/));
  });
});
