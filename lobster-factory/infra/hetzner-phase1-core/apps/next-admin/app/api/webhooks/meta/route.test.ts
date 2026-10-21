import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const processMock = vi.hoisted(() => vi.fn(async () => ({ enabled: false, received: 0, matched: 0, replied: 0, skipped: 0, failed: 0 })));
vi.mock("@/lib/social/meta-auto-reply", () => ({ processMetaWebhook: processMock }));

import { GET, POST } from "./route";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.clearAllMocks();
});

describe("Meta webhook route", () => {
  it("answers Meta's verification challenge only with the configured token", async () => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-me";
    const ok = await GET(new Request("https://example.test/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=123"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("123");
    const bad = await GET(new Request("https://example.test/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=no&hub.challenge=123"));
    expect(bad.status).toBe(403);
  });

  it("rejects unsigned deliveries before JSON processing", async () => {
    process.env.META_APP_SECRET = "app-secret";
    const response = await POST(new Request("https://example.test/api/webhooks/meta", { method: "POST", body: "{}" }));
    expect(response.status).toBe(403);
    expect(processMock).not.toHaveBeenCalled();
  });

  it("passes a signed raw body to the execution service", async () => {
    process.env.META_APP_SECRET = "app-secret";
    const body = JSON.stringify({ object: "page", entry: [] });
    const signature = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    const response = await POST(new Request("https://example.test/api/webhooks/meta", {
      method: "POST", body, headers: { "x-hub-signature-256": signature },
    }));
    expect(response.status).toBe(200);
    expect(processMock).toHaveBeenCalledWith({ object: "page", entry: [] });
  });
});
