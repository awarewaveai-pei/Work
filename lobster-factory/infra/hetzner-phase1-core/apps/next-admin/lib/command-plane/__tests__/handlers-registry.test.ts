// handlers/index.ts: the Phase 1 handler registry. Its own header comment is the
// invariant worth pinning -- "Handler keys MUST match policyEngine RISK_TABLE keys" --
// a key present here with no RISK_TABLE entry would 404 through the router's own
// "no_handler_registered" path even though policyEngine never intended to allow it,
// and a RISK_TABLE key with no handler here would silently never dispatch.
import { describe, expect, it } from "vitest";
import { phase1Handlers } from "../handlers/index";
import { KNOWN_COMMANDS } from "../policyEngine";

describe("phase1Handlers", () => {
  it("every registered key is a function", () => {
    for (const [key, handler] of Object.entries(phase1Handlers)) {
      expect(typeof handler, `handler for ${key} is not a function`).toBe("function");
    }
  });

  it("every handler key exists in policyEngine's RISK_TABLE (KNOWN_COMMANDS)", () => {
    for (const key of Object.keys(phase1Handlers)) {
      expect(KNOWN_COMMANDS, `handler key ${key} has no matching RISK_TABLE entry`).toContain(key);
    }
  });

  it("/help reuses the same handler as /start (both are the welcome message)", () => {
    expect(phase1Handlers["/help"]).toBe(phase1Handlers["/start"]);
  });

  it("includes the always-safe read-only commands", () => {
    for (const cmd of ["/status", "/health", "/daily_review", "/weekly_review", "/list_failed_runs"]) {
      expect(phase1Handlers).toHaveProperty(cmd);
    }
  });

  it("registers /normal_mode even though policyEngine hard-blocks it from telegram -- reachable only via the approval API, per its own comment", () => {
    expect(phase1Handlers).toHaveProperty("/normal_mode");
  });
});
