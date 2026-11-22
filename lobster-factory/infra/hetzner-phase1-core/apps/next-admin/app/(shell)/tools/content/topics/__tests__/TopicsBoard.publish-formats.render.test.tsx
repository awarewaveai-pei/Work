// @vitest-environment jsdom
//
// Live-test fixes A (2026-11-20): 「發布」 says it is reading at once and confirms inside the topic's card (no
// window.confirm; 8 s without the draft's setting = nothing opens, nothing is sent); a format button saves at once.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OverviewData } from "@/lib/content/topics/overview-load";
import { PUBLISH_READ_TIMEOUT_MS, TopicsBoard } from "../TopicsBoard";
import { stubContext } from "./client-context-stub";

vi.mock("../AutoContentOverview", () => ({ FlowCells: () => null }));

const overview = { organizationId: "o1", rows: [{ siteId: "s1", organizationId: "o1" }], cells: {}, actual: {}, spendNote: null } as unknown as OverviewData;
const topic = (over: Record<string, unknown>) => ({
  id: "t1", organization_id: "o1", site_id: "s1", title: "感恩的心理學", keyword: "感恩", angle: null, status: "proposed",
  formats: ["article", "social"], scheduled_for: "2026-11-25T01:00:00Z", source: "manual", source_ref: {}, artifacts: {},
  review: null, last_error: null, version: 3, ...over,
});
const reviewed = topic({ status: "reviewed", formats: ["article", "video"], review: { pass: true, checks: [] },
  artifacts: { social: { youtube_post_id: "yt-1" }, article: { wp_post_id: 5 } } });

type Call = { url: string; init?: RequestInit };
/** Routes the page's calls; `privacy` answers the read 「發布」 makes (the topics GET without folders=1). */
function stubFetch(topics: unknown[], opts: { privacy?: () => Promise<Response>; patch?: () => Response } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (url.startsWith("/api/content/topics?") && url.includes("folders=1")) return json({ ok: true, topics, folders: [] });
    if (url.startsWith("/api/content/topics?")) return opts.privacy ? opts.privacy() : json({ ok: true, youtubePrivacy: { t1: "unlisted" } });
    if (init?.method === "PATCH") return opts.patch ? opts.patch() : json({ ok: true });
    return json({ ok: true });
  }));
  return calls;
}
const reads = (calls: Call[]) => calls.filter((c) => c.url.startsWith("/api/content/topics?") && !c.url.includes("folders=1"));
const posts = (calls: Call[]) => calls.filter((c) => c.url.endsWith("/publish"));
async function openTopic() {
  // the rail's current site (ADR 020); its row is the sites API's, contentDefaults included
  render(<TopicsBoard overview={overview} />, { wrapper: stubContext({ sites: [{ id: "s1", name: "s1", organization_id: "o1", contentDefaults: {} } as never] }).wrap });
  fireEvent.click(await screen.findByText("感恩的心理學"));
}
const detailPublish = () => within(document.querySelector("aside")!).getByRole("button", { name: /發布|讀取草稿設定/ });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("TopicsBoard 發布", () => {
  it("shows 讀取草稿設定… at once and cannot be pressed twice; the in-page confirmation names the steps and the draft's privacy; 取消 sends nothing", async () => {
    let answer!: (r: Response) => void;
    const calls = stubFetch([reviewed], { privacy: () => new Promise((r) => { answer = r; }) });
    await openTopic();
    fireEvent.click(detailPublish());
    const reading = detailPublish();
    expect(reading.textContent).toBe("讀取草稿設定…");
    expect((reading as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(reading);
    expect(reads(calls)).toHaveLength(1);

    await act(async () => { answer(new Response(JSON.stringify({ ok: true, youtubePrivacy: { t1: "unlisted" } }))); });
    const box = await screen.findByRole("region", { name: "確定發布" });
    const steps = within(box).getAllByRole("listitem").map((li) => li.textContent);
    expect(steps).toEqual(["YouTube（這則草稿：不公開）", "網站文章（WordPress 草稿改成公開）"]);
    // the site is 公開 by default, the draft 不公開: the reminder carries the link to fix the draft
    expect(within(box).getByRole("link", { name: "到社群草稿修改" })).toBeTruthy();

    fireEvent.click(within(box).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("region", { name: "確定發布" })).toBeNull();
    expect(posts(calls)).toHaveLength(0);
    expect(detailPublish().textContent).toBe("發布");
  });

  it("確定發布 posts once with the topic's version", async () => {
    const calls = stubFetch([reviewed]);
    await openTopic();
    fireEvent.click(detailPublish());
    const box = await screen.findByRole("region", { name: "確定發布" });
    fireEvent.click(within(box).getByRole("button", { name: "確定發布" }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(JSON.parse(posts(calls)[0].init!.body as string)).toEqual({ version: 3 });
  });

  it("no answer in 8 s: says to press again, opens no confirmation, sends nothing", async () => {
    const calls = stubFetch([reviewed]);
    await openTopic();
    vi.useFakeTimers();
    // the read hangs until the page gives up (abort)
    vi.mocked(fetch).mockImplementationOnce((_u, init) => new Promise((_r, reject) => {
      (init as RequestInit).signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    fireEvent.click(detailPublish());
    await act(async () => { vi.advanceTimersByTime(PUBLISH_READ_TIMEOUT_MS + 1); });
    vi.useRealTimers();
    expect(await screen.findByText("讀不到草稿設定，請再按一次。")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "確定發布" })).toBeNull();
    expect(posts(calls)).toHaveLength(0);
    expect((detailPublish() as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("TopicsBoard formats", () => {
  const group = () => within(screen.getByRole("group", { name: /要做的格式/ }));

  it("shows which formats are on (aria-pressed); one click saves the new set with the version; no 儲存格式 button", async () => {
    const calls = stubFetch([topic({})]);
    await openTopic();
    expect(group().getByRole("button", { name: /文章/ }).getAttribute("aria-pressed")).toBe("true");
    expect(group().getByRole("button", { name: /影片/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("button", { name: "儲存格式" })).toBeNull();
    fireEvent.click(group().getByRole("button", { name: /影片/ }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.init?.method === "PATCH")!;
    expect(patch.url).toBe("/api/content/topics/t1");
    expect(JSON.parse(patch.init!.body as string)).toEqual({ action: "formats", version: 3, formats: ["article", "social", "video"] });
  });

  it("a failed save goes back to the stored formats and says why", async () => {
    stubFetch([topic({})], { patch: () => new Response(JSON.stringify({ ok: false, error: "已經開始製作，格式不能改" }), { status: 400 }) });
    await openTopic();
    fireEvent.click(group().getByRole("button", { name: /影片/ }));
    expect(await screen.findByText("已經開始製作，格式不能改")).toBeTruthy();
    await waitFor(() => expect(group().getByRole("button", { name: /影片/ }).getAttribute("aria-pressed")).toBe("false"));
  });

  it("the last format cannot be taken off", async () => {
    const calls = stubFetch([topic({ formats: ["article"] })]);
    await openTopic();
    fireEvent.click(group().getByRole("button", { name: /文章/ }));
    expect(await screen.findByText("至少要選一種格式。")).toBeTruthy();
    expect(calls.some((c) => c.init?.method === "PATCH")).toBe(false);
    expect(group().getByRole("button", { name: /文章/ }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("TopicsBoard 發布 after the draft changed", () => {
  it("確定發布 re-reads the draft; a changed privacy refreshes the confirmation instead of sending", async () => {
    let n = 0;
    const calls = stubFetch([reviewed], { privacy: async () => new Response(JSON.stringify({ ok: true, youtubePrivacy: { t1: n++ === 0 ? "unlisted" : "public" } })) });
    await openTopic();
    fireEvent.click(detailPublish());
    const box = await screen.findByRole("region", { name: "確定發布" });
    fireEvent.click(within(box).getByRole("button", { name: "確定發布" }));
    expect(await screen.findByText("YouTube 草稿的設定剛改過，下面已更新，請再確認一次。")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "確定發布" })).getAllByRole("listitem")[0].textContent).toBe("YouTube（這則草稿：公開）");
    expect(posts(calls)).toHaveLength(0);
  });
});
