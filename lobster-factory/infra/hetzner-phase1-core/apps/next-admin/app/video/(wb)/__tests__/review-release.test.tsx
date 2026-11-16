// @vitest-environment jsdom
// video-unify-plan-20261116 §4 U6: 審片與發布 as one workbench page. (1) two channels on different platforms = two own texts,
// each saved as its own draft; (2) opened from a cut it lists that one video; (3) an older project (made by the old pipeline,
// source=manual) is opened by its project id: its video plays and can be approved.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReviewRelease from "../review-release/ReviewRelease";

const ORG = "39ad4149-5044-4077-8d9a-b6b916de0e21", CUT = "a3de2011-1e4a-4624-a1e2-93eacb930757", OTHER = "b4ef3122-2f5b-4735-b2f3-a4fdc0a41868", PROJECT = "c5f04233-3a6c-4846-83a4-b50ed1b52979";
const video = (id: string, title: string) => ({ id, object_url: `https://r2.example/video/${id}/9x16.mp4`, checksum_sha256: "a".repeat(64), created_at: "2026-11-15T05:17:00Z", asset_domain: "workbench_render", metadata: { title, ratio: "9x16" } });
const PASSED = ["technical", "caption", "editorial", "rights"].map((kind) => ({ kind, status: "passed", candidateChecksum: "a".repeat(64) }));
const ACCOUNTS = [{ id: "acc-yt", platform: "youtube", label: "頻道甲", status: "active" }, { id: "acc-ig", platform: "instagram", label: "頻道乙", status: "active" }];

type Call = { url: string; body?: unknown };
function stubServer(assets: unknown[], released: string[] = []) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const ok = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (u.startsWith("/api/video/assets")) return ok({ items: u.includes("projectId=" + PROJECT) ? assets.filter((a) => (a as { id: string }).id === CUT) : assets });
    if (u.startsWith("/api/video/social-channels")) return ok({ accounts: ACCOUNTS });
    if (u.startsWith("/api/content/sites")) return ok({ sites: [] });
    if (u.startsWith("/api/video/qa/")) return ok(init?.method === "POST" ? { ok: true } : { items: PASSED });
    if (u.startsWith("/api/video/release")) return ok(init?.method === "POST" ? { ok: true, release: { id: "rel-1" } } : { items: released.map((id) => ({ id: "rel-" + id, candidate_asset_id: id, candidate_checksum: "a".repeat(64) })) });
    if (u.startsWith("/api/video/cover")) return ok({ covers: {} });
    if (u.startsWith("/api/video/social-drafts")) return ok({ ok: true, drafts: [{}, {}] });
    throw new Error("unexpected " + u);
  }));
  return calls;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ReviewRelease", () => {
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
    expect(saved.items).toEqual([{ accountId: "acc-yt", text: "給 YouTube 的長文案" }, { accountId: "acc-ig", text: "給 IG 的短文案" }]);
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
    fireEvent.click(await screen.findByText("繼續到 Release →"));
    const play = await screen.findByText("播放");
    expect(play.getAttribute("href")).toBe(`https://r2.example/video/${CUT}/9x16.mp4`);
    const approve = await screen.findByText("核准這個比例發布");
    await waitFor(() => expect((approve as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(approve);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/video/release" && (c.body as { candidateAssetId: string }).candidateAssetId === CUT)).toBe(true));
  });

  it("without an organization or a video it says what to do and asks nothing", () => {
    const calls = stubServer([]);
    render(<ReviewRelease organizationId={undefined} section="qa" />);
    expect(screen.getByText(/請從一支成片或一個專案打開/)).toBeTruthy();
    expect(calls).toEqual([]);
  });
});
