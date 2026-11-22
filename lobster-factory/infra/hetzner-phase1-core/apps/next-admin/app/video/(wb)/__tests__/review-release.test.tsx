// @vitest-environment jsdom
// video-unify-plan-20261116 §4 U6: 審片與發布 as one workbench page. (1) two channels on different platforms = two own texts,
// each saved as its own draft; (2) opened from a cut it lists that one video; (3) an older project (made by the old pipeline,
// source=manual) is opened by its project id: its video plays and can be approved.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReviewRelease from "../review-release/ReviewRelease";

// K11: the page compares the link's organizationId with the workbench's own client (capabilities.mainSystem).
const workbench = vi.hoisted(() => ({ loadCapabilities: async (): Promise<unknown> => ({ mainSystem: { organizationId: "39ad4149-5044-4077-8d9a-b6b916de0e21" } }) }));
vi.mock("../workbench", () => ({ useWorkbench: () => workbench }));

const ORG = "39ad4149-5044-4077-8d9a-b6b916de0e21", CUT = "a3de2011-1e4a-4624-a1e2-93eacb930757", OTHER = "b4ef3122-2f5b-4735-b2f3-a4fdc0a41868", PROJECT = "c5f04233-3a6c-4846-83a4-b50ed1b52979";
const video = (id: string, title: string) => ({ id, object_url: `https://r2.example/video/${id}/9x16.mp4`, checksum_sha256: "a".repeat(64), created_at: "2026-11-15T05:17:00Z", asset_domain: "workbench_render", metadata: { title, ratio: "9x16" } });
// B1: one video made in several ratios = the primary row plus ratio rows that point back at it (variantOf)
const ratioRow = (id: string, ratio: string, variantOf?: string) => ({ id, object_url: `https://r2.example/video/${CUT}/${ratio}.mp4`, checksum_sha256: "a".repeat(64), created_at: "2026-11-15T05:17:00Z", asset_domain: "workbench_render", metadata: { title: "三比例", ratio, ...(variantOf ? { variantOf } : {}) } });
const PASSED = ["technical", "caption", "editorial", "rights"].map((kind) => ({ kind, status: "passed", candidateChecksum: "a".repeat(64) }));
const ACCOUNTS = [{ id: "acc-yt", platform: "youtube", label: "頻道甲", status: "active" }, { id: "acc-ig", platform: "instagram", label: "頻道乙", status: "active" }];

type Call = { url: string; body?: unknown };
function stubServer(assets: unknown[], released: string[] = [], reports = PASSED, accounts: unknown[] = ACCOUNTS) {
  const calls: Call[] = [];
  let saved = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const ok = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (u.startsWith("/api/video/assets")) return ok({ items: u.includes("projectId=" + PROJECT) ? assets.filter((a) => (a as { id: string }).id === CUT) : assets });
    if (u.startsWith("/api/video/social-channels")) return ok({ accounts });
    if (u.startsWith("/api/content/sites")) return ok({ sites: [] });
    if (u.startsWith("/api/video/qa/")) return ok(init?.method === "POST" ? { ok: true } : { items: reports });
    if (u.startsWith("/api/video/release")) return ok(init?.method === "POST" ? { ok: true, release: { id: "rel-1" } } : { items: released.map((id) => ({ id: "rel-" + id, candidate_asset_id: id, candidate_checksum: "a".repeat(64) })) });
    if (u.startsWith("/api/video/cover")) return ok({ covers: {} });
    if (u.startsWith("/api/video/draft-outcome")) return ok({ drafts: saved ? [{ id: "d1" }, { id: "d2" }] : [], articles: [], socialUrl: "https://social.example/" });
    if (u.startsWith("/api/video/social-drafts")) { saved = true; return ok({ ok: true, drafts: [{}, {}] }); }
    throw new Error("unexpected " + u);
  }));
  return calls;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ReviewRelease", () => {
  it("does not offer continue until all four reports pass on the selected checksum", async () => {
    stubServer([video(CUT, "第一集")], [], PASSED.map((q) => q.kind === "rights" ? { ...q, candidateChecksum: "old" } : q));
    render(<ReviewRelease organizationId={ORG} assetId={CUT} section="qa" />);
    const button = await screen.findByText("繼續到發布 →");
    await screen.findAllByText(/第一集/);
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
  it("two channels on different platforms: each keeps its own text and is saved as its own draft", async () => {
    const calls = stubServer([video(CUT, "第一集")], [CUT]);
    render(<ReviewRelease organizationId={ORG} assetId={CUT} section="release" />);
    const yt = await screen.findByLabelText(/頻道甲/), ig = await screen.findByLabelText(/頻道乙/);
    fireEvent.click(yt); fireEvent.click(ig);
    const [ytText, igText] = [await screen.findByLabelText("頻道甲 的文案"), await screen.findByLabelText("頻道乙 的文案")];
    fireEvent.change(ytText, { target: { value: "給 YouTube 的長文案" } });
    fireEvent.change(igText, { target: { value: "給 IG 的短文案" } });
    fireEvent.click(screen.getByText("存成社群草稿"));
    await waitFor(() => expect(calls.some((c) => c.url.startsWith("/api/video/social-drafts"))).toBe(true));
    const saved = calls.find((c) => c.url.startsWith("/api/video/social-drafts"))!.body as { items: { accountId: string; text: string }[] };
    // only 9:16 is approved here, so both channels carry it (B1: the row's ratio is sent with the text)
    expect(saved.items).toEqual([{ accountId: "acc-yt", text: "給 YouTube 的長文案", ratio: "9x16" }, { accountId: "acc-ig", text: "給 IG 的短文案", ratio: "9x16" }]);
    expect(await screen.findByText("完成：已建 2 個社群草稿")).toBeTruthy();
    expect(screen.getByText("查看社群草稿").getAttribute("href")).toBe("https://social.example/");
  });

  it("B1 three ratios approved: each channel starts on its platform's ratio, the ratio can be changed, and the draft carries that row's ratio", async () => {
    const V45 = "d6a05344-7b57-4e87-a5c4-b6c1d62a8a7a", V916 = "e7b16455-8c68-4f98-b6d5-c7d2e73b9b8b";
    const calls = stubServer([ratioRow(CUT, "16x9"), ratioRow(V45, "4x5", CUT), ratioRow(V916, "9x16", CUT)], [CUT, V45, V916]);
    render(<ReviewRelease organizationId={ORG} assetId={CUT} section="release" />);
    const ytRow = (await screen.findByText("頻道甲（youtube）")).closest("tr")!, igRow = screen.getByText("頻道乙（instagram）").closest("tr")!;
    await waitFor(() => expect(within(ytRow).getAllByRole("button")).toHaveLength(3));
    const on = (row: HTMLElement) => within(row).getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent);
    expect(on(ytRow)).toEqual(["橫式 16:9"]);
    expect(on(igRow)).toEqual(["直式 4:5"]);
    fireEvent.click(within(igRow).getByText("直式 9:16"));
    expect(on(igRow)).toEqual(["直式 9:16"]);
    expect(on(ytRow)).toEqual(["橫式 16:9"]);   // one channel's pick does not move another's
    fireEvent.click(within(ytRow).getByRole("checkbox")); fireEvent.click(within(igRow).getByRole("checkbox"));
    fireEvent.click(await screen.findByText("存成社群草稿"));
    await waitFor(() => expect(calls.some((c) => c.url.startsWith("/api/video/social-drafts"))).toBe(true));
    const saved = calls.find((c) => c.url.startsWith("/api/video/social-drafts"))!.body as { items: { accountId: string; ratio?: string }[] };
    expect(saved.items.map((i) => [i.accountId, i.ratio])).toEqual([["acc-yt", "16x9"], ["acc-ig", "9x16"]]);
  });

  it("B1 workbench project: every ratio is its own cut (no variantOf); opened from any one of them the page lists the newest cut of each ratio, with one shared choice", async () => {
    const P = "f8c27566-9d79-4aa9-87e6-d8e3f84cacac", W45 = "d6a05344-7b57-4e87-a5c4-b6c1d62a8a7a", W916 = "e7b16455-8c68-4f98-b6d5-c7d2e73b9b8b", OLD45 = "a9d49788-bf9b-4cb1-a9f8-fa05b6dd1d1d", ELSE = "b0e5a899-c0ac-4dc2-bab9-0b16c7ee2e2e";
    const cut = (id: string, ratio: string, at: string, project: string | null = P) => ({ ...ratioRow(id, ratio), created_at: at, media_project_id: project, mime_type: "video/mp4" });
    const assets = [cut(W916, "9x16", "2026-11-19T03:00:00Z"), cut(W45, "4x5", "2026-11-19T02:00:00Z"), cut(CUT, "16x9", "2026-11-19T01:00:00Z"), cut(OLD45, "4x5", "2026-11-18T02:00:00Z"), cut(ELSE, "1x1", "2026-11-19T04:00:00Z", "other-project")];
    for (const opened of [CUT, W45, W916]) {
      cleanup();
      stubServer(assets, [CUT, W45, W916]);
      render(<ReviewRelease organizationId={ORG} assetId={opened} section="release" />);
      const yt = (await screen.findByText("頻道甲（youtube）")).closest("tr")!, ig = screen.getByText("頻道乙（instagram）").closest("tr")!;
      await waitFor(() => expect(within(yt).getAllByRole("button")).toHaveLength(3));
      const on = (row: HTMLElement) => within(row).getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent);
      expect(on(yt)).toEqual(["橫式 16:9"]);   // the same default whichever cut was opened
      expect(on(ig)).toEqual(["直式 4:5"]);
      expect(within(yt).queryByText("方形 1:1")).toBeNull();   // another project's cut is not this video's ratio
      expect(screen.getAllByText("播放")).toHaveLength(3);   // the older 4:5 cut of this project is not listed again
    }
  });

  it("B1 an older video with only 16:9 approved: every channel can only take 16:9", async () => {
    const four = ["youtube", "instagram", "facebook", "tiktok"].map((p) => ({ id: "acc-" + p, platform: p, label: "頻道-" + p, status: "active" }));
    const calls = stubServer([ratioRow(CUT, "16x9")], [CUT], PASSED, four);
    render(<ReviewRelease organizationId={ORG} assetId={CUT} section="release" />);
    for (const a of four) {
      const row = (await screen.findByText(`${a.label}（${a.platform}）`)).closest("tr")!;
      const buttons = within(row).getAllByRole("button");
      expect(buttons.map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([["橫式 16:9", "true"]]);
    }
    fireEvent.click(screen.getByLabelText(/頻道-tiktok/));
    fireEvent.click(await screen.findByText("存成社群草稿"));
    await waitFor(() => expect(calls.some((c) => c.url.startsWith("/api/video/social-drafts"))).toBe(true));
    expect((calls.find((c) => c.url.startsWith("/api/video/social-drafts"))!.body as { items: { ratio?: string }[] }).items[0].ratio).toBe("16x9");
  });

  it("opened from a cut it lists that one video, not the client's others", async () => {
    stubServer([video(CUT, "第一集"), video(OTHER, "別的影片")]);
    render(<ReviewRelease organizationId={ORG} assetId={CUT} section="qa" />);
    await screen.findAllByText(/第一集/);
    expect(screen.queryByText(/別的影片/)).toBeNull();
  });

  it("an older project: its video is listed, plays, and can be approved", async () => {
    const calls = stubServer([video(CUT, "舊專案影片"), video(OTHER, "別的影片")]);
    render(<ReviewRelease organizationId={ORG} projectId={PROJECT} section="qa" />);
    await screen.findAllByText(/舊專案影片/);
    expect(screen.queryByText(/別的影片/)).toBeNull();
    fireEvent.click(await screen.findByText("繼續到發布 →"));
    const play = await screen.findByText("播放");
    expect(play.getAttribute("href")).toBe(`https://r2.example/video/${CUT}/9x16.mp4`);
    const approve = await screen.findByText("核准這個比例發布");
    await waitFor(() => expect((approve as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(approve);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/video/release" && (c.body as { candidateAssetId: string }).candidateAssetId === CUT)).toBe(true));
  });

  it("K11 another client's video: says to switch first and loads nothing", async () => {
    const calls = stubServer([video(CUT, "第一集")]);
    render(<ReviewRelease organizationId={OTHER} assetId={CUT} section="qa" />);
    expect(await screen.findByText(/這支影片屬於另一個客戶，請先/)).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("K11 a workbench not connected to the main system loads nothing", async () => {
    const before = workbench.loadCapabilities;
    workbench.loadCapabilities = async () => ({ mainSystem: null });
    try {
      const calls = stubServer([video(CUT, "第一集")]);
      render(<ReviewRelease organizationId={ORG} assetId={CUT} section="qa" />);
      expect(await screen.findByText(/沒有連上主系統/)).toBeTruthy();
      expect(calls).toEqual([]);
    } finally { workbench.loadCapabilities = before; }
  });

  it("without an organization or a video it says what to do and asks nothing", () => {
    const calls = stubServer([]);
    render(<ReviewRelease organizationId={undefined} section="qa" />);
    expect(screen.getByText(/請從一支成片或一個專案打開/)).toBeTruthy();
    expect(calls).toEqual([]);
  });
});
