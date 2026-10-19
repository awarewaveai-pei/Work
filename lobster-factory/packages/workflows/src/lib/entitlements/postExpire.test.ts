import { afterEach, describe, expect, it, vi } from "vitest";
import { postExpire } from "./postExpire";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("entitlements-expire heartbeat", () => {
  it("posts the dedicated token to the global endpoint and returns its count", async () => {
    vi.stubEnv("SCHEDULE_INGEST_TOKEN", "test-only-token");
    vi.stubEnv("AWAREWAVE_WEBHOOK_BASE_URL", "https://example.test/");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, expired: 1501 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await postExpire()).toEqual({ ok: true, expired: 1501 });
    expect(fetcher).toHaveBeenCalledWith("https://example.test/api/internal/entitlements/expire", expect.objectContaining({
      method: "POST", headers: { Authorization: "Bearer test-only-token" },
    }));
  });

  it("fails on missing token, HTTP error or malformed success", async () => {
    vi.stubEnv("SCHEDULE_INGEST_TOKEN", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(postExpire()).rejects.toThrow("SCHEDULE_INGEST_TOKEN");
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("SCHEDULE_INGEST_TOKEN", "test-only-token");
    fetcher.mockResolvedValue(new Response("failed", { status: 500 }));
    await expect(postExpire()).rejects.toThrow("500");
    fetcher.mockResolvedValue(Response.json({ ok: true, expired: -1 }));
    await expect(postExpire()).rejects.toThrow("invalid");
  });
});
