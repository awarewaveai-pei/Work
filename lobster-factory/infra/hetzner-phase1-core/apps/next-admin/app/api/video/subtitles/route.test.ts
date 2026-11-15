// Card VD.10: a video's subtitle file downloads from our own origin as an attachment. The url comes only from the row's
// metadata (never the request), must be one of our bucket objects, and another org is refused before any read.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ rows: [] as Row[], log: { updates: [] as Array<{ table: string; id: unknown; patch: Row }>, inserts: [] as Array<{ table: string; row: Row }>, reads: 0 } }));
vi.mock("@/lib/supabase-server", async () => {
  const { fakeDb } = await import("@/lib/content/video/__tests__/fake-db");
  return { getSupabaseWriteClient: () => fakeDb(() => ({ media_assets: state.rows }), state.log) };
});
const fetched = vi.hoisted(() => [] as string[]);
vi.stubGlobal("fetch", async (url: string) => { fetched.push(url); return new Response("1\n00:00:00,000 --> 00:00:01,000\n嗨\n"); });

import { GET } from "./route";

const ORG = "123e4567-e89b-42d3-a456-426614174001", OTHER = "123e4567-e89b-42d3-a456-426614174009";
const VIDEO = "123e4567-e89b-42d3-a456-426614174002", BARE = "123e4567-e89b-42d3-a456-426614174003", EVIL = "123e4567-e89b-42d3-a456-426614174004";
const staff = { "x-ops-claims-role": "owner", "x-ops-user-kind": "staff" };
const get = (q: string, headers: Record<string, string> = staff) => GET(new NextRequest(`http://localhost/api/video/subtitles?${q}`, { headers }));

beforeEach(() => {
  vi.stubEnv("R2_VIDEO_PUBLIC_BASE", "https://videos.example");
  fetched.length = 0;
  Object.assign(state.log, { reads: 0 });
  state.rows = [
    { id: VIDEO, organization_id: ORG, metadata: { title: "春季新品", captionFiles: { srt: "https://videos.example/video/subtitles/o/a.srt", vtt: "https://videos.example/video/subtitles/o/a.vtt", cues: 1 } } },
    { id: BARE, organization_id: ORG, metadata: {} },
    { id: EVIL, organization_id: ORG, metadata: { captionFiles: { srt: "https://evil.example/x.srt" } } },
  ];
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/video/subtitles", () => {
  it("streams the row's own SRT as an attachment", async () => {
    const res = await get(`organizationId=${ORG}&assetId=${VIDEO}&format=srt`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="subtitles\.srt"; filename\*=UTF-8''/);
    expect(res.headers.get("content-type")).toMatch(/^application\/x-subrip/);
    expect(await res.text()).toContain("嗨");
    expect(fetched).toEqual(["https://videos.example/video/subtitles/o/a.srt"]);
  });
  it("no subtitles, a url outside our buckets, or a bad format: refused, nothing fetched", async () => {
    expect((await get(`organizationId=${ORG}&assetId=${BARE}&format=srt`)).status).toBe(404);
    expect((await get(`organizationId=${ORG}&assetId=${EVIL}&format=srt`)).status).toBe(404);
    expect((await get(`organizationId=${ORG}&assetId=${VIDEO}&format=exe`)).status).toBe(400);
    expect(fetched).toEqual([]);
  });
  it("a customer of another org is refused before any database read", async () => {
    const res = await get(`organizationId=${OTHER}&assetId=${VIDEO}&format=srt`, { "x-ops-user-kind": "client", "x-ops-org-id": ORG });
    expect(res.status).toBe(403);
    expect(state.log.reads).toBe(0);
  });
});
