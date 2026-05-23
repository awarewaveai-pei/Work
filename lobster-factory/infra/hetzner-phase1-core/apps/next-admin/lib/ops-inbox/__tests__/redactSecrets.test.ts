import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { redactSecrets } from "../redactSecrets";

/**
 * 2026-05-23 Tier 3 audit C2: original redactSecrets only matched object KEYS, leaving
 * any secret embedded in VALUES (Sentry messages, breadcrumbs, stack frames) unredacted
 * in ops_incidents.raw_payload. These tests pin the value-aware behavior + the Errata
 * fixes (regex anchor for B64_BLOB, MAX_DEPTH=64, length truncation).
 *
 * See: agency-os/reports/audit/auto-repair-2026-05-23.md §Patch 2 + §Patch Errata
 *      agency-os/docs/operations/AUDIT_REGISTRY.md §Auto-Repair logic audit
 */
describe("redactSecrets — value-aware scrubbing (C2 fix)", () => {
  it("redacts Stripe live key embedded in a nested message value", () => {
    const input = {
      data: { event: { message: "crashed with sk_live_abc123def456ghi789jkl012mno345pqr" } },
    };
    const out = redactSecrets(input) as any;
    expect(out.data.event.message).toContain("[REDACTED:STRIPE_KEY]");
    expect(out.data.event.message).not.toContain("sk_live_abc");
  });

  it("redacts GitHub PAT inside array element", () => {
    const out = redactSecrets({
      logs: ["env GH_TOKEN=ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa other log line"],
    }) as any;
    expect(out.logs[0]).toContain("[REDACTED:GITHUB_PAT]");
  });

  it("redacts Slack bot token", () => {
    const out = redactSecrets({ msg: "bot=xoxb-1234567890-abcdefghijklmnop" }) as any;
    expect(out.msg).toContain("[REDACTED:SLACK_TOKEN]");
  });

  it("redacts AWS access key", () => {
    const out = redactSecrets({ note: "use AKIAIOSFODNN7EXAMPLE for upload" }) as any;
    expect(out.note).toContain("[REDACTED:AWS_ACCESS_KEY]");
  });

  it("redacts JWT", () => {
    const out = redactSecrets({
      header: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    }) as any;
    expect(out.header).toContain("[REDACTED:JWT]");
  });

  it("redacts PEM private key block (multiline)", () => {
    const block = [
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZWQy",
      "NTUxOQAAACDP3FSSjMjxUJM5OTb5/cYV+QgRz4U+TF6mAAAA",
      "-----END OPENSSH PRIVATE KEY-----",
    ].join("\n");
    const out = redactSecrets({ stderr: block }) as any;
    expect(out.stderr).toContain("[REDACTED:PRIVATE_KEY]");
    expect(out.stderr).not.toContain("b3BlbnNzaC1r");
  });

  it("redacts Trigger.dev tokens (tr_pat_, tr_prod_)", () => {
    const out = redactSecrets({
      env: { deploy: "tr_pat_aaaaaaaaaaaaaaaaaaaaaa", runtime: "tr_prod_bbbbbbbbbbbbbbbbbbbbbb" },
    }) as any;
    expect(out.env.deploy).toContain("[REDACTED:TRIGGER_TOKEN]");
    expect(out.env.runtime).toContain("[REDACTED:TRIGGER_TOKEN]");
  });

  it("truncates oversize string values", () => {
    const huge = "a".repeat(10_000);
    const out = redactSecrets({ msg: huge }) as any;
    expect(out.msg.length).toBeLessThan(5000);
    expect(out.msg).toContain("[TRUNCATED:");
  });

  it("respects MAX_DEPTH=64 (deep nesting beyond limit gets sentinel)", () => {
    let nested: any = "leaf";
    for (let i = 0; i < 80; i++) nested = { next: nested };
    const out = redactSecrets(nested) as any;
    const str = JSON.stringify(out);
    expect(str).toContain("DEPTH_LIMIT");
  });

  it("preserves legitimate deep nesting up to MAX_DEPTH (Sentry React stack frame case)", () => {
    // Errata EMaj-4: Sentry+React+Redux stack frames legitimately nest 20-40 deep.
    // Must not corrupt at depth 40.
    let nested: any = { value: "real data" };
    for (let i = 0; i < 40; i++) nested = { frame: nested };
    const out = redactSecrets(nested) as any;
    const str = JSON.stringify(out);
    expect(str).toContain("real data");
    expect(str).not.toContain("DEPTH_LIMIT");
  });

  it("still redacts via key patterns (regression for original behavior)", () => {
    const out = redactSecrets({ api_token: "abc", x_auth_key: "def", password: "p" }) as any;
    expect(out.api_token).toBe("[REDACTED]");
    expect(out.x_auth_key).toBe("[REDACTED]");
    expect(out.password).toBe("[REDACTED]");
  });

  it("does not corrupt plain non-secret text", () => {
    const out = redactSecrets({
      message: "user peijing logged in from device iPad",
      url: "https://app.aware-wave.com/dashboard",
    }) as any;
    expect(out.message).toBe("user peijing logged in from device iPad");
    expect(out.url).toBe("https://app.aware-wave.com/dashboard");
  });
});

describe("redactSecrets — EMaj-1 anchor (false-positive resistance)", () => {
  // These payloads represent real Sentry/PostHog data shapes the original B64_BLOB regex
  // would have eaten. Anchored mode (default) MUST NOT redact them.

  it("preserves Sentry minified JS in stack frame (default mode)", () => {
    const minifiedFrame =
      "function n(e){return e.split('').reverse().join('')}var t=document.querySelector('.btn');t.addEventListener('click',function(){alert('hi')})";
    const out = redactSecrets({ stack: minifiedFrame }) as any;
    expect(out.stack).toBe(minifiedFrame);
  });

  it("preserves PostHog screenshot data URI prefix (default mode)", () => {
    // Real PostHog $screenshot property: base64-encoded PNG, ~100KB. Test with truncated
    // representative blob — must remain intact (no [REDACTED:B64_BLOB]).
    const dataUri =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAhSURBVHhe7cExAQAAAMKg9U9tCF8gAAAAAAAAAAAAAACAdwMqAAGd9AHvAAAAAElFTkSuQmCC";
    const out = redactSecrets({ screenshot: dataUri }) as any;
    expect(out.screenshot).toBe(dataUri);
    expect(out.screenshot).not.toContain("REDACTED:B64_BLOB");
  });

  it("preserves long alphanumeric hash-like strings without key-prefix (default mode)", () => {
    const out = redactSecrets({ build_id: "a".repeat(100) }) as any;
    expect(out.build_id).toBe("a".repeat(100));
  });
});

describe("redactSecrets — OPS_AGGRESSIVE_REDACT opt-in (defense in depth)", () => {
  const originalEnv = process.env.OPS_AGGRESSIVE_REDACT;

  beforeEach(() => {
    process.env.OPS_AGGRESSIVE_REDACT = "true";
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.OPS_AGGRESSIVE_REDACT;
    else process.env.OPS_AGGRESSIVE_REDACT = originalEnv;
  });

  it("redacts long base64 blobs when aggressive mode is on", () => {
    const blob = "A".repeat(100) + "+".repeat(5) + "=";
    const out = redactSecrets({ raw: blob }) as any;
    expect(out.raw).toContain("[REDACTED:B64_BLOB]");
  });
});
