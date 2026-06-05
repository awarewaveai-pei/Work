import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyIngestSource } from "../verifyIngestToken";

// M2 per-source ingest verification matrix (auto-repair audit 2026-05-23 §M2).
// Covers: per-source primary, dual-accept legacy fallback, deploy-safe no-secret
// fallback, cross-source isolation (the core blast-radius property), and the
// failure reasons used for migration-window observability.

const LEGACY = "legacy-shared-token-AAAAAAAAAAAAAAAAAAAA";
const SENTRY_TOK = "sentry-per-source-token-BBBBBBBBBBBBBBBB";
const GRAFANA_TOK = "grafana-per-source-token-CCCCCCCCCCCCCC";

const ENV_KEYS = [
  "OPS_INBOX_INGEST_TOKEN",
  "OPS_INBOX_DUAL_ACCEPT_LEGACY",
  "OPS_INBOX_SENTRY_TOKEN",
  "OPS_INBOX_GRAFANA_TOKEN",
  "OPS_INBOX_NETDATA_TOKEN",
  "OPS_INBOX_UPTIME_KUMA_TOKEN",
  "OPS_INBOX_POSTHOG_TOKEN",
] as const;

function reqWith(bearer?: string): Request {
  const headers: Record<string, string> = {};
  if (bearer !== undefined) headers["authorization"] = `Bearer ${bearer}`;
  return new Request("http://localhost/api/webhooks/x", { method: "POST", headers });
}

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("verifyIngestSource — per-source token primary", () => {
  it("correct per-source token → ok", () => {
    process.env.OPS_INBOX_SENTRY_TOKEN = SENTRY_TOK;
    expect(verifyIngestSource(reqWith(SENTRY_TOK), "sentry")).toEqual({ ok: true });
  });

  it("wrong token (per-source set) → fail bad_bearer", () => {
    process.env.OPS_INBOX_SENTRY_TOKEN = SENTRY_TOK;
    expect(verifyIngestSource(reqWith("nope"), "sentry")).toEqual({ ok: false, reason: "bad_bearer" });
  });

  it("no Authorization header → fail bad_bearer", () => {
    process.env.OPS_INBOX_SENTRY_TOKEN = SENTRY_TOK;
    expect(verifyIngestSource(reqWith(undefined), "sentry")).toEqual({ ok: false, reason: "bad_bearer" });
  });
});

describe("verifyIngestSource — cross-source isolation (blast-radius property)", () => {
  it("sentry token does NOT authenticate the grafana source", () => {
    process.env.OPS_INBOX_SENTRY_TOKEN = SENTRY_TOK;
    process.env.OPS_INBOX_GRAFANA_TOKEN = GRAFANA_TOK;
    // A leaked sentry token must be useless against grafana.
    expect(verifyIngestSource(reqWith(SENTRY_TOK), "grafana")).toEqual({ ok: false, reason: "bad_bearer" });
    // ...and grafana's own token still works for grafana.
    expect(verifyIngestSource(reqWith(GRAFANA_TOK), "grafana")).toEqual({ ok: true });
  });
});

describe("verifyIngestSource — dual-accept legacy migration window", () => {
  it("per-source set + dual-accept ON + legacy token → ok", () => {
    process.env.OPS_INBOX_SENTRY_TOKEN = SENTRY_TOK;
    process.env.OPS_INBOX_INGEST_TOKEN = LEGACY;
    process.env.OPS_INBOX_DUAL_ACCEPT_LEGACY = "true";
    expect(verifyIngestSource(reqWith(LEGACY), "sentry")).toEqual({ ok: true });
  });

  it("per-source set + dual-accept OFF + legacy token → fail (legacy no longer accepted)", () => {
    process.env.OPS_INBOX_SENTRY_TOKEN = SENTRY_TOK;
    process.env.OPS_INBOX_INGEST_TOKEN = LEGACY;
    // flag unset → off
    expect(verifyIngestSource(reqWith(LEGACY), "sentry")).toEqual({ ok: false, reason: "bad_bearer" });
  });

  it("per-source set + dual-accept ON, but per-source token still wins", () => {
    process.env.OPS_INBOX_SENTRY_TOKEN = SENTRY_TOK;
    process.env.OPS_INBOX_INGEST_TOKEN = LEGACY;
    process.env.OPS_INBOX_DUAL_ACCEPT_LEGACY = "true";
    expect(verifyIngestSource(reqWith(SENTRY_TOK), "sentry")).toEqual({ ok: true });
  });
});

describe("verifyIngestSource — deploy-safe fallback (per-source not yet provisioned)", () => {
  it("per-source UNSET + correct legacy → ok (identical to legacy behaviour)", () => {
    process.env.OPS_INBOX_INGEST_TOKEN = LEGACY;
    expect(verifyIngestSource(reqWith(LEGACY), "netdata")).toEqual({ ok: true });
  });

  it("per-source UNSET + wrong legacy → fail bad_bearer", () => {
    process.env.OPS_INBOX_INGEST_TOKEN = LEGACY;
    expect(verifyIngestSource(reqWith("nope"), "netdata")).toEqual({ ok: false, reason: "bad_bearer" });
  });

  it("per-source UNSET + no legacy configured → fail no_secret_configured", () => {
    expect(verifyIngestSource(reqWith("anything"), "posthog")).toEqual({
      ok: false,
      reason: "no_secret_configured",
    });
  });

  it("no Authorization header at all → fail bad_bearer (before any secret lookup)", () => {
    process.env.OPS_INBOX_INGEST_TOKEN = LEGACY;
    expect(verifyIngestSource(reqWith(undefined), "uptime_kuma")).toEqual({ ok: false, reason: "bad_bearer" });
  });
});
