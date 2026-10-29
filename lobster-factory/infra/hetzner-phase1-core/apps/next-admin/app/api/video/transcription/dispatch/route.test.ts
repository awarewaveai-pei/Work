import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "123e4567-e89b-42d3-a456-426614174001";
const SOURCE_ID = "123e4567-e89b-42d3-a456-426614174003";
const SHA = "a".repeat(64);

const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
const runOpenAiJob = vi.hoisted(() => vi.fn());
const dispatchToHost = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));
// Grant plumbing is lib/entitlements' own tests; here the paid branch just has to run inside withFeature.
const withFeature = vi.hoisted(() => vi.fn((_key: string, handler: (req: Request, grant: unknown, run: unknown) => Promise<Response>) => (req: Request, run: unknown) => handler(req, {}, run)));
vi.mock("@/lib/entitlements/grant", () => ({ withFeature, thenRun: (_r: Request, _g: unknown, run: () => Promise<Response>) => run() }));
vi.mock("@/lib/content/video/transcription", async (orig) => ({ ...(await orig<object>()), dispatchToHost }));
vi.mock("@/lib/content/video/transcription-openai", () => ({ runOpenAiJob }));

import { POST } from "./route";

let orgMetadata: Record<string, unknown>;
let inserted: Record<string, unknown>[];
function db() {
  return {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: () => chain,
        maybeSingle: async () => table === "media_assets"
          ? { data: { id: SOURCE_ID, organization_id: ORG, object_url: "https://pub.example.r2.dev/a.mp4", checksum_sha256: SHA, mime_type: "video/mp4", byte_size: 1000 } }
          : { data: { metadata: orgMetadata } },
        insert: (row: Record<string, unknown>) => { inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: row.id } }) }) }; },
      };
      return chain;
    },
  };
}

const request = (engine: string) => new NextRequest("http://localhost/api/video/transcription/dispatch", {
  method: "POST",
  headers: { "content-type": "application/json", "x-ops-claims-role": "operator", "x-ops-user-kind": "staff" },
  body: JSON.stringify({ sourceAssetId: SOURCE_ID, engine }),
});

beforeEach(() => {
  vi.stubEnv("R2_VIDEO_PUBLIC_BASE", "https://pub.example.r2.dev");
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("MEDIA_TRANSCRIBE_WORKER_URL", "http://video-whisper-worker:8421");
  vi.stubEnv("MEDIA_TRANSCRIBE_WORKER_TOKEN", "t");
  vi.stubEnv("MEDIA_TRANSCRIBE_CALLBACK_BASE_URL", "http://next-admin:3000");
  orgMetadata = {};
  inserted = [];
  runOpenAiJob.mockReset();
  dispatchToHost.mockReset().mockResolvedValue(true);
  getSupabaseWriteClient.mockReturnValue(db());
});

describe("transcription dispatch", () => {
  it("refuses OpenAI for a client that keeps audio in-house, and sends nothing out", async () => {
    orgMetadata = { client_config: { audioExternalAiAllowed: false } };
    const res = await POST(request("openai"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "client_keeps_audio_in_house" });
    expect(runOpenAiJob).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it("sends to OpenAI when the client allows it", async () => {
    const res = await POST(request("openai"));
    expect(res.status).toBe(202);
    expect(runOpenAiJob).toHaveBeenCalledOnce();
    expect(withFeature).toHaveBeenCalledWith("video.transcribe", expect.anything(), expect.anything());
    expect(inserted[0]).toMatchObject({ model: "whisper-1", result_json: { engine: "openai" } });
  });

  it("host engine goes to the internal worker over plain http", async () => {
    orgMetadata = { client_config: { audioExternalAiAllowed: false } };
    const res = await POST(request("host"));
    expect(res.status).toBe(202);
    expect(dispatchToHost).toHaveBeenCalledOnce();
    expect(runOpenAiJob).not.toHaveBeenCalled();
  });
});
