import { describe, it, expect } from "vitest";
import { buildAuthorizeUrl, buildRfc2822Message, GMAIL_SCOPE, signState, toBase64Url, verifyState } from "../google-oauth";

describe("signState / verifyState", () => {
  const secret = "test-secret-value";
  const connectorId = "aaaaaaaa-0000-4000-8000-00000000000a";

  it("round-trips a signed state", () => {
    const signed = signState({ connectorId, nonce: "abc123", ts: Date.now() }, secret);
    const verified = verifyState(signed, secret);
    expect(verified).not.toBeNull();
    expect(verified?.connectorId).toBe(connectorId);
    expect(verified?.nonce).toBe("abc123");
  });

  it("rejects a state signed with a different secret (tamper/forgery guard)", () => {
    const signed = signState({ connectorId, nonce: "abc123", ts: Date.now() }, secret);
    expect(verifyState(signed, "wrong-secret")).toBeNull();
  });

  it("rejects a state whose payload was tampered with (signature no longer matches)", () => {
    const signed = signState({ connectorId, nonce: "abc123", ts: Date.now() }, secret);
    const [payload, sig] = signed.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ connectorId: "bbbbbbbb-0000-4000-8000-00000000000b", nonce: "abc123", ts: Date.now() })).toString("base64url");
    expect(verifyState(`${tamperedPayload}.${sig}`, secret)).toBeNull();
  });

  it("rejects malformed state strings", () => {
    expect(verifyState("not-a-valid-state", secret)).toBeNull();
    expect(verifyState("", secret)).toBeNull();
    expect(verifyState("a.b.c", secret)).toBeNull();
  });

  it("rejects an expired state (older than 10 minutes)", () => {
    const elevenMinAgo = Date.now() - 11 * 60 * 1000;
    const signed = signState({ connectorId, nonce: "abc123", ts: elevenMinAgo }, secret);
    expect(verifyState(signed, secret)).toBeNull();
  });

  it("accepts a state right at the boundary (just under 10 minutes old)", () => {
    const nineMinAgo = Date.now() - 9 * 60 * 1000;
    const signed = signState({ connectorId, nonce: "abc123", ts: nineMinAgo }, secret);
    expect(verifyState(signed, secret)).not.toBeNull();
  });
});

describe("buildAuthorizeUrl", () => {
  it("includes gmail.compose scope, offline access, and forced consent (so refresh_token is always issued)", () => {
    const url = buildAuthorizeUrl({ clientId: "cid", redirectUri: "https://app.aware-wave.com/x", state: "s1" });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(parsed.searchParams.get("scope")).toBe(GMAIL_SCOPE);
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    expect(parsed.searchParams.get("prompt")).toBe("consent");
    expect(parsed.searchParams.get("client_id")).toBe("cid");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://app.aware-wave.com/x");
    expect(parsed.searchParams.get("state")).toBe("s1");
  });

  it("never requests gmail.send or any broader scope than compose", () => {
    const url = buildAuthorizeUrl({ clientId: "cid", redirectUri: "https://x", state: "s" });
    expect(url).not.toContain("gmail.send");
    expect(url).not.toContain("gmail.modify");
  });
});

describe("buildRfc2822Message", () => {
  it("omits the Subject header entirely when subject is null (deliberate cold-email design, not a bug)", () => {
    const msg = buildRfc2822Message({ from: "a@x.com", to: "b@y.com", subject: null, bodyText: "hello" });
    expect(msg).not.toContain("Subject:");
    expect(msg).toContain("From: a@x.com");
    expect(msg).toContain("To: b@y.com");
  });

  it("RFC 2047 base64-encodes a non-ASCII subject", () => {
    const msg = buildRfc2822Message({ from: "a@x.com", to: "b@y.com", subject: "你好", bodyText: "body" });
    const expected = `Subject: =?UTF-8?B?${Buffer.from("你好", "utf8").toString("base64")}?=`;
    expect(msg).toContain(expected);
  });

  it("declares Content-Transfer-Encoding: base64 and base64-encodes the body (RFC 2045 §6.1 default is 7bit — required for non-ASCII, e.g. Traditional Chinese cold-email copy)", () => {
    const msg = buildRfc2822Message({ from: "a@x.com", to: "b@y.com", subject: null, bodyText: "你好，這是一封冷信。" });
    expect(msg).toContain("Content-Transfer-Encoding: base64");
    const [, encodedBody] = msg.split("\r\n\r\n");
    const decoded = Buffer.from(encodedBody.replace(/\r\n/g, ""), "base64").toString("utf8");
    expect(decoded).toBe("你好，這是一封冷信。");
  });

  it("separates headers from body with exactly one blank line (RFC 2822 shape) and round-trips ASCII body content through the base64 encoding", () => {
    const msg = buildRfc2822Message({ from: "a@x.com", to: "b@y.com", subject: "hi", bodyText: "line1\nline2" });
    const parts = msg.split("\r\n\r\n");
    expect(parts.length).toBe(2);
    const decoded = Buffer.from(parts[1].replace(/\r\n/g, ""), "base64").toString("utf8");
    expect(decoded).toBe("line1\nline2");
  });

  it("wraps the base64 body at 76 chars per line per RFC 2045", () => {
    const longBody = "a".repeat(200);
    const msg = buildRfc2822Message({ from: "a@x.com", to: "b@y.com", subject: null, bodyText: longBody });
    const [, encodedBody] = msg.split("\r\n\r\n");
    const lines = encodedBody.split("\r\n");
    for (const line of lines.slice(0, -1)) expect(line.length).toBe(76);
    expect(lines.length).toBeGreaterThan(1);
  });

  it("includes a Date header (RFC 5322 required field)", () => {
    const msg = buildRfc2822Message({ from: "a@x.com", to: "b@y.com", subject: null, bodyText: "hi" });
    expect(msg).toMatch(/^Date: /m);
  });
});

describe("toBase64Url", () => {
  it("produces URL-safe base64 (no +, /, or = padding) as Gmail API requires for `raw`", () => {
    const encoded = toBase64Url("hello + / test ==");
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("round-trips UTF-8 content losslessly", () => {
    const original = "測試 email 內容 émoji 🎉";
    const encoded = toBase64Url(original);
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    expect(decoded).toBe(original);
  });
});
