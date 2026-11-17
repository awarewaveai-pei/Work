import { beforeEach, expect, it, vi } from "vitest";
import { fakeDb } from "@/lib/content/video/__tests__/fake-db";
const client = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: client }));
import { POST } from "./route";

const org = "123e4567-e89b-42d3-a456-426614174001";
const mine = "123e4567-e89b-42d3-a456-426614174002";
const theirs = "123e4567-e89b-42d3-a456-426614174003";
const call = (token = "test-only") => POST(new Request("http://localhost/api/internal/video/workbench/storage", {
  method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
  body: JSON.stringify({ organizationId: org, assetIds: [mine, theirs], objectUrls: ["https://ours.test/theirs.png"] }),
}));
beforeEach(() => {
  vi.stubEnv("VW_INTERNAL_TOKEN", "test-only");
  client.mockReturnValue(fakeDb(() => ({ media_assets: [
    { id: mine, organization_id: org, is_current: true, object_url: "https://ours.test/mine.png", checksum_sha256: "a" },
    { id: theirs, organization_id: "other", is_current: true, object_url: "https://ours.test/theirs.png", checksum_sha256: "b" },
  ] })));
});
it("returns only this organization's assets for both id and object URL lookups", async () => {
  const r = await call();
  expect(r.status).toBe(200);
  expect((await r.json()).items).toEqual([{ assetId: mine, objectUrl: "https://ours.test/mine.png", checksumSha256: "a" }]);
});
it("rejects an invalid internal token", async () => {
  expect((await call("wrong")).status).toBe(401);
});
