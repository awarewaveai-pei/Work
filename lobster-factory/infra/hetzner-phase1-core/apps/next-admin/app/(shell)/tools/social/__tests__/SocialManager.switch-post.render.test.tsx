// @vitest-environment jsdom
//
// Opening post B right after post A, both at the same version, left A's text in the editor under B's id (the editor
// remounts on `${id}:${version}` and the manager kept A until B arrived; GAP_REPORT.md 2026-10-16 B1). A save would
// have written A's text into B. The manager now hands the editor a loaded post only while its id is the one on the
// route (C19: the composer is its own page, compose/<id>; going from A's page to B's keeps the same component).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Account, Brand } from "../model";

beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-14T04:00:00Z")); });   // Wed 12:00 Taipei
afterAll(() => vi.useRealTimers());

const brand: Brand = { id: "b1", slug: "b", name: "品牌", default_timezone: "Asia/Taipei", role: "owner" };
const account: Account = { id: "a1", platform: "bluesky", label: "x.bsky.social", status: "connected", postiz_integration_id: "i1", picture: null, handle: null, chatwoot_inbox_id: null };
const at = (h: number) => new Date(`2026-10-15T${String(h).padStart(2, "0")}:00:00+08:00`).toISOString();   // the pinned Thursday, Taipei (module load runs before beforeAll)
const post = (id: string, body: string, hour: number) => ({
  id, state: "scheduled", body, scheduled_at: at(hour), list_id: null, list_position: null, first_comment: null, link_url: null, link_utm: false,
  notes: null, source_url: null, published_at: null, deleted_at: null, version: 1,
  targets: [{ id: `${id}-t`, account_id: "a1", custom_body: null, format: "post", state: "pending", postiz_post_id: null, release_url: null, error: null }], media: [],
});
const posts = [post("p-a", "第一則的文字", 10), post("p-b", "第二則的文字", 14)];

vi.mock("../api", async (orig) => {
  const real = await orig<typeof import("../api")>();
  const api = {
    brands: async () => ({ brands: [brand] }),
    posts: async () => ({ posts, wordpress: [], undatedTruncated: false }),
    accounts: async () => ({ accounts: [account], connecting: null, justConnected: null, connectFailed: null }),
    get: async (_b: string, id: string) => ({ post: posts.find((p) => p.id === id) }),
    media: async () => ({ media: [] }),
    lists: async () => ({ lists: [] }),
    texts: async () => ({ texts: [] }),
    tags: async () => ({ tags: [] }),
    autoRules: async () => ({ rules: [] }),
    settings: async () => ({ requireReview: false }),
    create: async () => ({ post: { id: "new-post", version: 1 } }),
    setState: async () => ({ post: { id: "new-post", version: 2 } }),
  };
  return { ...real, api };
});
const { default: SocialManager } = await import("../SocialManager");
const { default: Editor } = await import("../Editor");
const { default: Footer } = await import("../compose/Footer");
const { default: Library } = await import("../library/Library");
const { WeekView } = await import("../Calendar");

afterEach(() => cleanup());

describe("social manager -- switching between two posts", () => {
  it("the editor shows the post that was opened last, even at an equal version", async () => {
    const { rerender } = render(<SocialManager route={{ kind: "compose", postId: "p-a" }} />);
    await waitFor(() => expect((screen.getByLabelText("貼文內容") as HTMLTextAreaElement).value).toBe("第一則的文字"));
    rerender(<SocialManager route={{ kind: "compose", postId: "p-b" }} />);
    await waitFor(() => expect((screen.getByLabelText("貼文內容") as HTMLTextAreaElement).value).toBe("第二則的文字"));
  });
});

describe("social manager -- the four reported UI defects", () => {
  it("opens an accessible publish confirmation with channels and cancels on Escape", () => {
    const onCancel = vi.fn();
    render(<Footer tags={null} hint={null} when="現在就發" whenDisabled onWhen={vi.fn()} picker={null}
      act="now" can={{ draft: true, library: true, review: true, schedule: true, repeat: true, now: true, keep: true }}
      busy={false} menuOpen={false} onMenu={vi.fn()} onAct={vi.fn()} onMain={vi.fn()} confirmNow
      onConfirm={vi.fn()} onCancel={onCancel} confirmChannels={[account, { ...account, id: "a2", platform: "facebook", label: "Facebook 粉絲專頁" }]} />);

    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Facebook 粉絲專頁")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "取消" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("attaches a clicked media item immediately when the library is opened from a composer", async () => {
    const attach = vi.fn();
    const ctx = {
      brand, accounts: [account], posts: [], media: [{ id: "m1", kind: "image", file_name: "watercolor-01.jpg", postiz_path: "/watercolor.jpg", used: 1 }],
      today: "2026-10-14", canAttach: true, attach, attachMany: vi.fn(), mediaAdded: vi.fn(), select: vi.fn(), reload: vi.fn(),
      say: vi.fn(), setView: vi.fn(), logFilter: "all", openNeeds: vi.fn(), listId: undefined,
    } as any;
    render(<Library ctx={ctx} />);
    fireEvent.click(screen.getByRole("button", { name: "圖片和影片" }));
    fireEvent.click(screen.getByRole("button", { name: /watercolor-01\.jpg/ }));
    expect(attach).toHaveBeenCalledWith("m1");
    expect(screen.queryByRole("button", { name: /用這些寫新貼文/ })).toBeNull();
  });

  it("renders one release link per published target that has a URL", () => {
    const published = {
      ...post("published", "已發佈的貼文", 12), state: "published", published_at: at(12),
      tags: [],
      targets: [
        { ...post("published", "", 12).targets[0], account_id: "a1", release_url: "https://bsky.app/profile/post" },
        { ...post("published", "", 12).targets[0], id: "published-fb", account_id: "a2", release_url: "https://facebook.com/post" },
        { ...post("published", "", 12).targets[0], id: "published-no-link", account_id: "a3", release_url: null },
      ],
    };
    render(<WeekView posts={[published as any]} accounts={[account, { ...account, id: "a2", platform: "facebook", label: "Facebook" }, { ...account, id: "a3", platform: "instagram", label: "Instagram" }]}
      media={[]} tags={[]} tz="Asia/Taipei" today="2026-10-14" canWrite onOpen={vi.fn()} onCopy={vi.fn()} onDelete={vi.fn()}
      weekStart="2026-10-12" onNew={vi.fn()} onMove={vi.fn()} bestTimes={() => []} onBestTime={vi.fn()} />);
    expect(screen.getByRole("link", { name: "在 Bluesky 查看貼文" }).getAttribute("href")).toBe("https://bsky.app/profile/post");
    expect(screen.getByRole("link", { name: "在 Facebook 查看貼文" }).getAttribute("href")).toBe("https://facebook.com/post");
    expect(screen.getAllByRole("link", { name: /查看貼文/ })).toHaveLength(2);
  });

  it("returns the plan date with schedule success so the manager can navigate to that week", async () => {
    const onSaved = vi.fn();
    render(<Editor brand={brand} accounts={[account]} media={[]} post={null} defaults={{ date: "2026-10-15", time: "12:00" }} today="2026-10-14"
      onSaved={onSaved} onMediaAdded={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("貼文內容")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("貼文內容"), { target: { value: "安排好的貼文" } });
    fireEvent.click(screen.getByRole("button", { name: "設定行程" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("new-post", expect.stringContaining("已排在"), { date: "2026-10-15" }));
  });

  it("shows only real published target links in the published post view", async () => {
    const published = {
      ...post("published-view", "已發佈的貼文", 12), state: "published", published_at: at(12),
      targets: [{ ...post("published-view", "", 12).targets[0], release_url: "https://bsky.app/profile/post" },
        { id: "published-view-no-link", account_id: "a2", custom_body: null, format: "post", state: "published", postiz_post_id: null, release_url: null, error: null }],
    };
    render(<Editor brand={brand} accounts={[account, { ...account, id: "a2", platform: "facebook", label: "Facebook" }]} media={[]} post={published as any}
      defaults={{ date: "2026-10-15", time: "12:00" }} today="2026-10-14" onSaved={vi.fn()} onMediaAdded={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("link", { name: "在 Bluesky 查看貼文" })).toBeTruthy());
    expect(screen.getAllByRole("link", { name: /查看貼文/ })).toHaveLength(1);
  });
});
