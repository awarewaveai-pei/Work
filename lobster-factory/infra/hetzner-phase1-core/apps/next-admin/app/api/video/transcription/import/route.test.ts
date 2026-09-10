import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_A = "123e4567-e89b-42d3-a456-426614174001";
const ORG_B = "123e4567-e89b-42d3-a456-426614174002";
const SOURCE_ID = "123e4567-e89b-42d3-a456-426614174003";

const maybeSingle = vi.hoisted(() => vi.fn());
const insert = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
const putDesignObject = vi.hoisted(() => vi.fn());
const deleteDesignObject = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));
vi.mock("@/lib/storage/r2", () => ({ putDesignObject, deleteDesignObject }));

import { POST } from "./route";

const transcript = {
  media: "C:\\private\\input.mp4",
  model: "large-v3",
  backend: "cuda/float16",
  language: "zh",
  language_probability: 0.98,
  audio_duration_sec: 4,
  segments: [
    { id: 0, start: 0.1, end: 1.25, text: " 第一段 ", avg_logprob: -0.12, no_speech_prob: 0.01 },
    { id: 1, start: 1.5, end: 3.8, text: "第二段", avg_logprob: -0.2, no_speech_prob: 0.03 },
  ],
};

function request(
  body: unknown,
  role = "operator",
  userKind = "staff",
  orgId?: string,
): NextRequest {
  return new NextRequest("http://localhost/api/video/transcription/import", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ops-claims-role": role,
      "x-ops-user-kind": userKind,
      ...(orgId ? { "x-ops-org-id": orgId } : {}),
    },
    body: JSON.stringify(body),
  });
}

function configureDatabase(sourceOverrides: Record<string, unknown> = {}, insertError: { message: string } | null = null) {
  maybeSingle.mockResolvedValue({
    data: {
      id: SOURCE_ID,
      organization_id: ORG_A,
      object_key: "video/source/16x9.mp4",
      object_url: "https://video.example/source.mp4",
      mime_type: "video/mp4",
      checksum_sha256: "source-sha",
      version: 2,
      ...sourceOverrides,
    },
    error: null,
  });
  insert.mockImplementation((rows: Array<Record<string, unknown>>) => ({
    select: async () => ({
      data: insertError ? null : rows.map((row, index) => ({
        id: `123e4567-e89b-42d3-a456-42661417401${index}`,
        object_url: row.object_url,
        mime_type: row.mime_type,
        checksum_sha256: row.checksum_sha256,
        metadata: row.metadata,
      })),
      error: insertError,
    }),
  }));
  from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle }) }),
    insert,
  });
  getSupabaseWriteClient.mockReturnValue({ from });
}

beforeEach(() => {
  vi.clearAllMocks();
  configureDatabase();
  putDesignObject.mockImplementation(async (key: string, body: Buffer) => ({
    ok: true,
    objectKey: key,
    publicUrl: `https://assets.example/${key}`,
    byteSize: body.byteLength,
    checksumSha256: `sha-${key.split(".").pop()}`,
  }));
  deleteDesignObject.mockResolvedValue({ ok: true });
});

describe("POST /api/video/transcription/import", () => {
  it("persists a tenant-bound canonical transcript and deterministic SRT/VTT renditions", async () => {
    const response = await POST(request({ sourceAssetId: SOURCE_ID, transcript }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      reviewState: "needs_review",
      sourceAssetId: SOURCE_ID,
      sourceIdentityComplete: true,
      artifacts: {
        transcript: { mime_type: "application/json" },
        srt: { mime_type: "application/x-subrip" },
        vtt: { mime_type: "text/vtt" },
      },
    });

    expect(putDesignObject).toHaveBeenCalledTimes(3);
    const jsonCall = putDesignObject.mock.calls.find((call) => call[2].startsWith("application/json"));
    const srtCall = putDesignObject.mock.calls.find((call) => call[2].startsWith("application/x-subrip"));
    const vttCall = putDesignObject.mock.calls.find((call) => call[2].startsWith("text/vtt"));
    const document = JSON.parse((jsonCall?.[1] as Buffer).toString("utf8"));
    expect(document).toMatchObject({
      organizationId: ORG_A,
      sourceAsset: { id: SOURCE_ID, version: 2, checksumSha256: "source-sha" },
      engine: { capabilityId: "media.transcribe_local", model: "large-v3", backend: "cuda/float16" },
      state: "needs_review",
    });
    expect(document.segments[0]).toMatchObject({ id: "seg_000001", startMs: 100, endMs: 1250, text: "第一段" });
    expect(JSON.stringify(document)).not.toContain("C:\\private");
    expect((srtCall?.[1] as Buffer).toString("utf8")).toContain("00:00:00,100 --> 00:00:01,250");
    expect((vttCall?.[1] as Buffer).toString("utf8")).toContain("WEBVTT\n\nseg_000001\n00:00:00.100 --> 00:00:01.250");

    const rows = insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.organization_id === ORG_A)).toBe(true);
    expect(rows.map((row) => (row.metadata as Record<string, unknown>).format)).toEqual(["json", "srt", "vtt"]);
    expect((rows[1].metadata as Record<string, unknown>).transcriptDocumentSha256).toBe("sha-json");
  });

  it("rejects viewers before reading media assets", async () => {
    const response = await POST(request({ sourceAssetId: SOURCE_ID, transcript }, "viewer"));
    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a client bound to a different organization before uploading", async () => {
    const response = await POST(request({ sourceAssetId: SOURCE_ID, transcript }, "operator", "client", ORG_B));
    expect(response.status).toBe(403);
    expect(putDesignObject).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("accepts a client bound to the source organization", async () => {
    const response = await POST(request({ sourceAssetId: SOURCE_ID, transcript }, "operator", "client", ORG_A));
    expect(response.status).toBe(201);
  });

  it("rejects overlapping transcript segments before uploading", async () => {
    const response = await POST(request({
      sourceAssetId: SOURCE_ID,
      transcript: { ...transcript, segments: [{ start: 0, end: 2, text: "a" }, { start: 1, end: 3, text: "b" }] },
    }));
    expect(response.status).toBe(422);
    expect(putDesignObject).not.toHaveBeenCalled();
  });

  it("rejects non-media source assets", async () => {
    configureDatabase({ mime_type: "image/png" });
    const response = await POST(request({ sourceAssetId: SOURCE_ID, transcript }));
    expect(response.status).toBe(422);
    expect(putDesignObject).not.toHaveBeenCalled();
  });

  it("removes prior uploads when a later R2 upload fails", async () => {
    putDesignObject
      .mockResolvedValueOnce({ ok: true, objectKey: "captions/a.json", publicUrl: "https://assets.example/a.json", byteSize: 10, checksumSha256: "sha-json" })
      .mockResolvedValueOnce({ ok: false, error: "r2_network_error" });
    const response = await POST(request({ sourceAssetId: SOURCE_ID, transcript }));
    expect(response.status).toBe(502);
    expect(deleteDesignObject).toHaveBeenCalledWith("captions/a.json");
    expect(insert).not.toHaveBeenCalled();
  });

  it("removes all uploaded artifacts when the atomic media_assets insert fails", async () => {
    configureDatabase({}, { message: "database unavailable" });
    const response = await POST(request({ sourceAssetId: SOURCE_ID, transcript }));
    expect(response.status).toBe(502);
    expect(deleteDesignObject).toHaveBeenCalledTimes(3);
  });

  it("records incomplete source identity without claiming approval", async () => {
    configureDatabase({ checksum_sha256: null });
    const response = await POST(request({ sourceAssetId: SOURCE_ID, transcript }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ reviewState: "needs_review", sourceIdentityComplete: false });
    const rows = insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect((rows[0].metadata as Record<string, unknown>).sourceIdentityIncomplete).toBe(true);
  });
});
