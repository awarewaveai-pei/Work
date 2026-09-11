import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { verifyChatwootSignature } from "@/lib/cs/chatwoot-client";

function sign(secret: string, timestamp: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")}`;
}

describe("verifyChatwootSignature", () => {
  const secret = "test-webhook-secret";
  const timestamp = "1700000000";
  const rawBody = JSON.stringify({ event: "message_created", id: 1 });

  it("accepts a correctly-signed payload", () => {
    const sig = sign(secret, timestamp, rawBody);
    expect(verifyChatwootSignature(rawBody, sig, timestamp, secret)).toBe(true);
  });

  it("rejects a tampered body (signature no longer matches)", () => {
    const sig = sign(secret, timestamp, rawBody);
    const tampered = JSON.stringify({ event: "message_created", id: 2 });
    expect(verifyChatwootSignature(tampered, sig, timestamp, secret)).toBe(false);
  });

  it("rejects when the timestamp used to verify differs from the one signed", () => {
    const sig = sign(secret, timestamp, rawBody);
    expect(verifyChatwootSignature(rawBody, sig, "1700000001", secret)).toBe(false);
  });

  it("rejects when the secret is wrong", () => {
    const sig = sign(secret, timestamp, rawBody);
    expect(verifyChatwootSignature(rawBody, sig, timestamp, "wrong-secret")).toBe(false);
  });

  it("accepts a signature with no sha256= prefix (bare hex)", () => {
    const bare = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
    expect(verifyChatwootSignature(rawBody, bare, timestamp, secret)).toBe(true);
  });

  it("rejects when any of secret/signature/timestamp is missing", () => {
    const sig = sign(secret, timestamp, rawBody);
    expect(verifyChatwootSignature(rawBody, null, timestamp, secret)).toBe(false);
    expect(verifyChatwootSignature(rawBody, sig, null, secret)).toBe(false);
    expect(verifyChatwootSignature(rawBody, sig, timestamp, undefined)).toBe(false);
  });

  it("never throws on a garbage signature header of different length", () => {
    expect(() => verifyChatwootSignature(rawBody, "not-a-real-signature", timestamp, secret)).not.toThrow();
    expect(verifyChatwootSignature(rawBody, "not-a-real-signature", timestamp, secret)).toBe(false);
  });
});
