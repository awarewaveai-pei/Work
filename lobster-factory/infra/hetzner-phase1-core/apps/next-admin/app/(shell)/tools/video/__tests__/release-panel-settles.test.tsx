// @vitest-environment jsdom
// 2026-11-15 acceptance: /release for a video with covers froze the tab. The panel must settle: a bounded number of
// renders and requests after it loads one video with two covers and its subtitle files, then none at all.
import { Profiler } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReleaseDeliveryPanel from "../ReleaseDeliveryPanel";

const ORG = "39ad4149-5044-4077-8d9a-b6b916de0e21", VIDEO = "a3de2011-1e4a-4624-a1e2-93eacb930757";
const asset = { id: VIDEO, object_url: "https://r2.example/video/workbench/o/v.mp4", checksum_sha256: "a".repeat(64), created_at: "2026-11-15T05:17:00Z", asset_domain: "workbench_render",
  metadata: { title: "封面測試", script: "第一行\n第二行", ratio: "9x16", captionFiles: { srt: "https://r2.example/video/subtitles/o/v.srt", vtt: "https://r2.example/video/subtitles/o/v.vtt", cues: 2 } } };
const covers = [
  { id: "35c5034e-22f0-4e9b-8289-57581dbeb543", url: "https://r2.example/c0.jpg", kind: "auto", chosen: true },
  { id: "54116e85-bd46-417b-bf8c-65a1adae0935", url: "https://r2.example/c1.jpg", kind: "auto", chosen: false },
];
const answer = (url: string): unknown => {
  if (url.startsWith("/api/video/assets")) return { items: [asset] };
  if (url.startsWith("/api/video/social-channels")) return { accounts: [] };
  if (url.startsWith("/api/content/sites")) return { sites: [] };
  if (url.startsWith("/api/video/qa/editorial-rights")) return { ok: true };
  if (url.startsWith("/api/video/qa/reports")) return { items: ["technical", "caption", "editorial", "rights"].map((kind) => ({ kind, status: "passed", candidateChecksum: asset.checksum_sha256 })) };
  if (url.startsWith("/api/video/release")) return { items: [] };
  if (url.startsWith("/api/video/cover")) return { covers: { [VIDEO]: covers } };
  throw new Error("unexpected " + url);
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ReleaseDeliveryPanel settles (no render/request loop)", () => {
  it("one video with two covers and subtitle files: bounded renders and requests, then quiet", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(String(url)); return new Response(JSON.stringify(answer(String(url))), { status: 200 }); }));
    let renders = 0;
    render(<Profiler id="p" onRender={() => { renders++; }}>
      <ReleaseDeliveryPanel organizationLocked initialOrganizationId={ORG} initialCandidateAssetId={VIDEO} />
    </Profiler>);
    await waitFor(() => expect(screen.getAllByRole("img").length).toBe(2), { timeout: 3000 });
    expect(screen.getByText("下載 SRT")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 800));
    const settled = { renders, calls: calls.length };
    await new Promise((r) => setTimeout(r, 800));
    expect({ renders, calls: calls.length }, "still rendering or fetching after load").toEqual(settled);
    expect(settled.calls).toBeLessThanOrEqual(12);
    expect(settled.renders).toBeLessThanOrEqual(30);
  });
});
