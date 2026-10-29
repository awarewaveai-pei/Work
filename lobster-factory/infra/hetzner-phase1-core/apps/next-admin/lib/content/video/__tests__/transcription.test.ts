import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const completeImport = vi.hoisted(() => vi.fn());
vi.mock("@/app/api/video/transcription/import/route", () => ({ POST: completeImport }));
vi.mock("../caption-qa-persistence", () => ({ persistAutomaticCaptionQa: vi.fn() }));
vi.mock("@/lib/ai/log-ai-call", () => ({ logImageCost: vi.fn() }));

import { openAiToTranscript, runOpenAiJob, workerBaseUrl } from "../transcription";

describe("openAiToTranscript", () => {
  it("drops empty segments and clamps overlap and overrun, which the import route rejects", () => {
    const t = openAiToTranscript({ language: "chinese", duration: 10, segments: [
      { id: 0, start: 0, end: 4.2, text: " 第一句 " },
      { id: 1, start: 4.0, end: 6, text: "第二句" },
      { id: 2, start: 6, end: 7, text: "  " },
      { id: 3, start: 7, end: 10.4, text: "第三句" },
    ] });
    expect(t.segments.map((s) => [s.start, s.end, s.text])).toEqual([[0, 4.2, "第一句"], [4.2, 6, "第二句"], [7, 10, "第三句"]]);
    expect(t).toMatchObject({ model: "whisper-1", backend: "openai", audio_duration_sec: 10 });
  });
});

describe("workerBaseUrl", () => {
  it("allows https anywhere but plain http only to a docker service name", () => {
    expect(workerBaseUrl("https://video-whisper.aware-wave.com/")).toBe("https://video-whisper.aware-wave.com");
    expect(workerBaseUrl("http://video-whisper-worker:8421")).toBe("http://video-whisper-worker:8421");
    expect(workerBaseUrl("http://evil.example.com")).toBeNull();
  });
});

describe("runOpenAiJob", () => {
  const updates: Record<string, unknown>[] = [];
  const db = { from: () => ({ update: (row: Record<string, unknown>) => { updates.push(row); return { eq: () => ({ eq: async () => ({}) }) }; } }) };
  const TEN_ZERO_BYTES_SHA = createHash("sha256").update(new Uint8Array(10)).digest("hex");
  const job = { id: "j1", organization_id: "o1", source_asset_id: "a1", source_checksum_sha256: TEN_ZERO_BYTES_SHA, sourceUrl: "https://pub.example/a.mp4", callbackSecret: "s".repeat(40) };
  beforeEach(() => { updates.length = 0; });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("falls back to the host worker with the same job when OpenAI fails", async () => {
    vi.stubEnv("MEDIA_TRANSCRIBE_WORKER_URL", "http://video-whisper-worker:8421");
    vi.stubEnv("MEDIA_TRANSCRIBE_WORKER_TOKEN", "t");
    vi.stubEnv("MEDIA_TRANSCRIBE_CALLBACK_BASE_URL", "http://next-admin:3000");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
      calls.push(url);
      if (url.startsWith("https://pub.example")) return new Response(new Uint8Array(10), { status: 200 });
      if (url.includes("api.openai.com")) return new Response("{}", { status: 429 });
      expect(JSON.parse(init!.body!)).toMatchObject({ job_id: "j1", callback_secret: job.callbackSecret });
      return new Response("{}", { status: 200 });
    }));
    await runOpenAiJob(db as never, job, "sk", "http://localhost/x");
    expect(calls.at(-1)).toBe("http://video-whisper-worker:8421/v1/jobs");
    expect(updates.at(-1)).toMatchObject({ model: "large-v3", result_json: { engine: "host", fallbackFrom: "openai", openAiError: "openai_http_429" } });
  });

  it("never sends bytes that differ from the recorded checksum to OpenAI", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); return new Response(new Uint8Array(11), { status: 200 }); }));
    await runOpenAiJob(db as never, job, "sk", "http://localhost/x");
    expect(calls.some((u) => u.includes("api.openai.com"))).toBe(false);
    expect(updates.at(-1)).toMatchObject({ result_json: { openAiError: "source_checksum_mismatch" } });
  });

  it("marks the job failed when OpenAI fails and no host worker is configured", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("api.openai.com") ? new Response("{}", { status: 500 }) : new Response(new Uint8Array(10), { status: 200 })));
    await runOpenAiJob(db as never, job, "sk", "http://localhost/x");
    expect(updates.at(-1)).toMatchObject({ status: "failed", error_code: "openai_failed_no_fallback" });
  });
});
