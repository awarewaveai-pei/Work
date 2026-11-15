// Step ① of the direct upload: who may get a presigned PUT, for which types, under which org prefix (real ops-role / tenant-guard).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./upload-url/route";

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";

const call = (body: unknown, headers: Record<string, string> = { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" }) =>
  POST(new Request("http://localhost/api/tools/designs/upload-url", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  }));

beforeEach(() => {
  vi.stubEnv("POD_DESIGNS_ENABLED", "true");
  vi.stubEnv("OPS_ALLOW_SIMULATED_ROLE_FALLBACK", "false");
  vi.stubEnv("R2_ACCOUNT_ID", "acct123");
  vi.stubEnv("R2_S3_ACCESS_KEY_ID", "test-key-id");
  vi.stubEnv("R2_S3_SECRET_ACCESS_KEY", "test-secret");
});

describe("POST /api/tools/designs/upload-url", () => {
  it("401 without an identity", async () => {
    expect((await call({ kind: "image", mime: "image/png", organizationId: ORG_A }, {})).status).toBe(401);
  });

  it("400 for a body that is not an object", async () => {
    for (const b of [null, 7, "x"]) expect((await call(b)).status, String(b)).toBe(400);
  });

  it("400 for a mime / ext off the allowlist", async () => {
    for (const b of [
      { kind: "image", mime: "image/gif" }, { kind: "image", mime: "image/svg+xml" }, { kind: "image", mime: "video/mp4" },
      { kind: "source", ext: ".exe" }, { kind: "source", ext: "html" }, { kind: "other", mime: "image/png" },
    ]) {
      expect((await call({ ...b, organizationId: ORG_A })).status, JSON.stringify(b)).toBe(400);
    }
  });

  it("key sits under uploads/pending/<requester org>/ -- a customer cannot name another org", async () => {
    const res = await call({ kind: "image", mime: "image/png", organizationId: ORG_B }, { "x-ops-user-kind": "client", "x-ops-org-id": ORG_A });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.key).toMatch(new RegExp(`^uploads/pending/${ORG_A}/[0-9a-f-]{36}\\.png$`));
    expect(new URL(j.putUrl).pathname).toBe(`/lobster-designs/${j.key}`);

    const src = await (await call({ kind: "source", ext: ".psd", organizationId: ORG_B })).json();
    expect(src.key).toMatch(new RegExp(`^uploads/pending/${ORG_B}/[0-9a-f-]{36}\\.psd$`));
    expect(src.contentType).toBe("application/octet-stream");
  });
});
