// Card SF-H acceptance (SITE-FLOW-COMPLETION-PLAN.md §3 SF-H row + brief items 1-8): the real engine with the real
// step registry, a fake host gate (scripted SSH transport behind the real gate-client) and an in-memory PostgREST fake.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const modeGate = vi.hoisted(() => ({ allowed: true, mode: "normal" }));
vi.mock("@/lib/system-modes/production-change-gate", () => ({
  checkProductionChangeAllowed: vi.fn(async () => ({ allowed: modeGate.allowed, mode: modeGate.mode })),
}));

import { executeStep, getSiteFlowStatus, nextEnvironmentStatus, planStep, pollRun, SITE_STEP_DEFINITIONS, type EngineDeps } from "../engine";
import { createSiteGateClient, gateTargetOf, type GateTransport } from "../gate-client";
import { HOST_STEPS, sitePanels } from "../steps";
import { parseWpInstallInput, pluginArgs, pluginBatches } from "../steps/wp-install";
import { UNDER_CONSTRUCTION_MARK } from "../steps/open";
import { writeTick } from "../steps/manual-checks";
import { resolveSiteFlowPlugins, ownReleasePlugins } from "@/lib/wp-plugin-stack-catalog";
import type { EnvironmentRow, SiteRow, SiteStepKey } from "../types";

type Row = Record<string, unknown>;
const T0 = Date.parse("2026-11-22T10:00:00Z");

function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = structuredClone(seed);
  let seq = 0;
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" = "select";
    let patch: Row = {};
    let inserted: Row = {};
    let order: { col: string; asc: boolean } | null = null;
    let lim = Infinity;
    const matching = () => {
      const m = rows.filter((r) => filters.every((f) => f(r)));
      if (order) {
        const { col, asc } = order;
        m.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
      }
      return m.slice(0, lim);
    };
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), q),
      order: (col: string, o?: { ascending?: boolean }) => ((order = { col, asc: o?.ascending !== false }), q),
      limit: (n: number) => ((lim = n), q),
      insert: (row: Row) => ((op = "insert"), (inserted = row), q),
      update: (p: Row) => ((op = "update"), (patch = p), q),
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        void Promise.resolve().then(() => {
          if (op === "insert") {
            // started_at strictly increasing, so "newest first" is well defined
            rows.push({ started_at: new Date(T0 + ++seq * 1000).toISOString(), ended_at: null, error_summary: null, output_payload: {}, ...inserted });
            return resolve({ error: null });
          }
          if (op === "update") {
            const m = matching();
            for (const r of m) Object.assign(r, structuredClone(patch));
            return resolve({ data: m.map((r) => ({ id: r.id })), error: null });
          }
          resolve({ data: structuredClone(matching()), error: null });
        });
      },
    };
    return q;
  };
  return { db: { from } as unknown as SupabaseClient, tables };
}

const ORG = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const SITE_ID = "6f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";
const ENV_ID = "7a1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";
const SLUG = "acme-example-com";
const DOMAIN = "acme.example.com";
const PASSWORD = "Zq8PwOnlyOnce4u9XyAbCdEf";
const NEW_PASSWORD = "Rr7SecondPw0nce9XyAbCdEf";

const site = (meta: Row = {}): SiteRow => ({ id: SITE_ID, organization_id: ORG, workspace_id: "ws", project_id: "pj", name: "Acme", primary_domain: DOMAIN, locale: "zh_TW", metadata: meta });
const env = (meta: Row = {}): EnvironmentRow => ({
  id: ENV_ID,
  site_id: SITE_ID,
  organization_id: ORG,
  environment_type: "production",
  hosting_provider: "ks-aw-01-docker",
  base_url: `https://${DOMAIN}`,
  wp_root_path: null,
  status: "pending",
  metadata: { host_slug: SLUG, ingress: "host-vhost", plugin_packs: ["base"], ...meta },
});

const KEYS: SiteStepKey[] = ["preflight", "create", "wp_install", "vhost", "mainwp", "bridge", "open"];
const catalogRows = () => KEYS.map((k) => ({ id: `cat-${k}`, action_key: `site.${k}`, enabled: true }));
const seed = (envStatus = "pending", siteMeta: Row = {}) => ({
  ops_action_catalog: catalogRows(),
  environments: [{ id: ENV_ID, status: envStatus }],
  sites: [{ id: SITE_ID, organization_id: ORG, metadata: siteMeta, updated_at: "2026-11-22T00:00:00Z" }],
});

/** A host preflight answer (aw-hosting-gate.sh site_preflight). */
function preflightJson(over: Row = {}): Row {
  return {
    slug: SLUG,
    domain: DOMAIN,
    registry: { domain: DOMAIN, ingress: "host-vhost", port: 8101, vhost_file: "", created_at: "x" },
    registry_error: "",
    vhost_occupants: [],
    vhost_occupants_error: "",
    certs: [{ dir: "/etc/letsencrypt/live/example.com", not_after: "2027-01-01T00:00:00Z" }],
    volumes: {},
    wp_container: "running|healthy",
    db_container: "running|healthy",
    retired: false,
    env_file: true,
    create_plan: "reused",
    create_refusal: "",
    ...over,
  };
}

type Reply = { code: number; stdout?: string; stderr?: string } | Error;

/** The scripted host: handler per command; every call recorded with its stdin. */
function host(handler: (command: string) => Reply) {
  const calls: Array<{ command: string; stdin: string | undefined }> = [];
  const transport: GateTransport = {
    exec: async (command, stdin) => {
      calls.push({ command, stdin });
      const r = handler(command);
      if (r instanceof Error) throw r;
      return { code: r.code, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
  };
  return { transport, calls };
}
const json = (o: Row): Reply => ({ code: 0, stdout: `${JSON.stringify(o)}\n` });

function deps(db: SupabaseClient, transport: GateTransport, now = T0 + 60_000): EngineDeps {
  return { db, steps: SITE_STEP_DEFINITIONS, gateFor: (e) => createSiteGateClient(gateTargetOf(e), transport), now: () => now, panels: sitePanels };
}

const actor = { role: "owner" as const, userId: "u-1" };
const INPUT = { mode: "install", admin_email: "Ops@Aware-Wave.com" };

async function planThenExecute(d: EngineDeps, e: EnvironmentRow, s: SiteRow, step: SiteStepKey, input: unknown = undefined) {
  const p = await planStep(d, { site: s, environment: e, step, input });
  expect(p.status, JSON.stringify(p.body)).toBe(200);
  return executeStep(d, { site: s, environment: e, step, planHash: p.body.planHash, actor, input });
}

/** A host where WordPress install / plugins behave as scripted. */
function wpHost(opts: { install?: () => Reply; plugins?: (args: string[]) => Reply; preflight?: Row; engineUrl?: (url: string) => Reply } = {}) {
  return host((cmd) => {
    if (cmd.startsWith("site-preflight ")) return json(preflightJson(opts.preflight));
    if (cmd.startsWith(`site-wp ${SLUG} install `)) {
      return opts.install ? opts.install() : json({ state: "installed", url: `https://${DOMAIN}`, admin_user: "ops@aware-wave.com", admin_password: PASSWORD });
    }
    if (cmd.startsWith(`site-wp ${SLUG} plugins `)) {
      const args = cmd.split(" ").slice(3);
      return opts.plugins ? opts.plugins(args) : json({ state: "ok", plugins: args.join(" "), kept: "", db_export: "/root/sites/x/pre-plugins.sql.gz" });
    }
    if (cmd === `site-wp ${SLUG} reset-admin-password`) return json({ state: "ok", admin_user: "ops@aware-wave.com", admin_password: NEW_PASSWORD });
    if (cmd.startsWith(`site-wp ${SLUG} set-oracle-engine-url `)) {
      const url = cmd.split(" ")[3];
      return opts.engineUrl ? opts.engineUrl(url) : json({ state: "ok", server_engine_url: url });
    }
    return { code: 126, stderr: `unexpected ${cmd}` };
  });
}

const runsOf = (t: Record<string, Row[]>) => t.ops_action_runs ?? [];

/** Polls a pending run until it is no longer running (each poll = at most one changing gate call). */
async function pollToEnd(d: EngineDeps, runId: string, max = 10): Promise<number> {
  for (let i = 1; i <= max; i++) {
    const p = await pollRun(d, { site: site(), environment: env(), step: "wp_install", runId });
    if ((p.body.run as Row).status !== "running") return i;
  }
  return max + 1;
}
const consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];

beforeEach(() => {
  modeGate.allowed = true;
  for (const m of ["log", "info", "warn", "error", "debug"] as const) consoleSpies.push(vi.spyOn(console, m));
});
afterEach(() => {
  while (consoleSpies.length) consoleSpies.pop()!.mockRestore();
  vi.unstubAllGlobals();
});
const consoleText = () => consoleSpies.map((s) => JSON.stringify(s.mock.calls)).join("\n");

// ── registry ─────────────────────────────────────────────────────────────────

describe("step registry", () => {
  it("registers the five host steps and SF-I's mainwp and bridge", () => {
    expect(Object.keys(HOST_STEPS).sort()).toEqual(["bridge", "create", "mainwp", "open", "preflight", "vhost", "wp_install"]);
    expect(SITE_STEP_DEFINITIONS.mainwp?.requires).toEqual(["vhost"]);
    expect(SITE_STEP_DEFINITIONS.bridge?.requires).toEqual(["vhost"]);
  });
});

// ── item 1: gate-client matches the gate ─────────────────────────────────────

describe("item 1: gate-client speaks the gate's current grammar", () => {
  it("docker wp() sends no stdin, and install carries the operator email (<=60) and the locale", async () => {
    const h = wpHost();
    const gate = createSiteGateClient(gateTargetOf(env()), h.transport);
    await gate.wp("install", ["ops@aware-wave.com", "zh_TW"]);
    expect(h.calls[0]).toEqual({ command: `site-wp ${SLUG} install ops@aware-wave.com zh_TW`, stdin: undefined });
    // the signature has no stdin parameter at all
    expect(gate.wp.length).toBeLessThanOrEqual(2);
  });

  it("create sends the environment's ingress; a host refusal of product-gateway reaches the operator", async () => {
    const h = host((cmd) =>
      cmd.startsWith("site-preflight") ? json(preflightJson({ registry: null, create_plan: "new" }))
        : cmd.startsWith("site-create") ? { code: 126, stderr: `aw-hosting-gate: ingress=product-gateway for ${SLUG} is not allowed on this host (AW_SITE_GATEWAY_SLUGS in /etc/default/aw-hosting-gate.local)` }
          : { code: 126 },
    );
    const { db } = fakeDb(seed());
    const e = env({ ingress: "product-gateway" });
    const r = await planThenExecute(deps(db, h.transport), e, site(), "create");
    expect(h.calls.find((c) => c.command.startsWith("site-create"))?.command).toBe(`site-create ${SLUG} ${DOMAIN} product-gateway`);
    expect(r.body.ok).toBe(false);
    const exec = (r.body.stages as Row[]).find((s) => s.stage === "execute");
    expect(String(exec?.detail)).toMatch(/主機沒有允許這個站使用產品閘道.*AW_SITE_GATEWAY_SLUGS/);
  });

  it("an unknown ingress is never guessed: create refuses before the host", async () => {
    const h = host(() => json({}));
    const gate = createSiteGateClient(gateTargetOf(env({ ingress: "public" })), h.transport);
    expect(await gate.create()).toMatchObject({ ok: false, error: "invalid_argument" });
    expect(h.calls).toHaveLength(0);
  });
});

// ── item 2 + password: install outlives the request; the password shows once ──

describe("item 2: WordPress install is sent, then followed by polls", () => {
  it("execute answers 202 with the password in reveal only; polls install the plugins and finish the run", async () => {
    let pluginCalls = 0;
    const h = wpHost({
      plugins: (args) => (++pluginCalls === 1 ? new Error("gate_timeout_90000ms") : json({ state: "ok", plugins: args.join(" "), kept: "" })),
    });
    const { db, tables } = fakeDb(seed("provisioning"));
    const d = deps(db, h.transport);
    const r = await planThenExecute(d, env(), site(), "wp_install", INPUT);
    expect(r.status).toBe(202);
    expect(r.body.reveal).toEqual({ 管理員帳號: "ops@aware-wave.com", 管理員密碼: PASSWORD });
    const run = runsOf(tables)[0];
    expect(run.status).toBe("running");
    expect((run.metadata as Row).awaiting_host).toBe(true);

    // poll 1: the first plugin call outlives the SSH timeout -> still running
    const p1 = await pollRun(d, { site: site(), environment: env(), step: "wp_install", runId: String(run.id) });
    expect((p1.body.run as Row).status).toBe("running");
    expect(p1.body.poll).toMatchObject({ pending: true });
    // poll 2: converges
    const p2 = await pollRun(d, { site: site(), environment: env(), step: "wp_install", runId: String(run.id) });
    expect((p2.body.run as Row).status).toBe("completed");

    // the password is in no stored row and no log line
    expect(JSON.stringify(tables)).not.toContain(PASSWORD);
    expect(consoleText()).not.toContain(PASSWORD);
    // install was never sent stdin; Kadence (a theme) is never a plugin argument
    expect(h.calls.every((c) => c.stdin === undefined)).toBe(true);
    expect(h.calls.filter((c) => c.command.includes(" plugins ")).every((c) => !c.command.split(" ").includes("kadence"))).toBe(true);
  });

  it("the gate's own slug-lock refusal during a poll means 'still working' at the same place, not failed", async () => {
    let n = 0;
    const h = wpHost({
      plugins: (args) => (++n === 1 ? { code: 3, stderr: `aw-hosting-gate: another create/vhost/wp/teardown of ${SLUG} is running` } : json({ state: "ok", plugins: args.join(" "), kept: "" })),
    });
    const { db, tables } = fakeDb(seed("provisioning"));
    const d = deps(db, h.transport);
    await planThenExecute(d, env(), site(), "wp_install", INPUT);
    const runId = String(runsOf(tables)[0].id);
    const p = await pollRun(d, { site: site(), environment: env(), step: "wp_install", runId });
    expect((p.body.run as Row).status).toBe("running");
    expect(await pollToEnd(d, runId)).toBeLessThanOrEqual(2);
    expect(runsOf(tables)[0].status).toBe("completed");
  });

  it("each poll makes at most one changing gate call (no request carries several 90 s calls)", async () => {
    const h = wpHost();
    const { db, tables } = fakeDb(seed("provisioning"));
    const d = deps(db, h.transport);
    await planThenExecute(d, env(), site(), "wp_install", { ...INPUT, optional_plugins: ["aware-wave-oracle"], oracle_server_url: "http://oracle-web:3000" });
    const runId = String(runsOf(tables)[0].id);
    const changing = () => h.calls.filter((c) => c.command.startsWith(`site-wp ${SLUG} `)).length;
    let before = changing();
    for (let i = 0; i < 10 && runsOf(tables)[0].status === "running"; i++) {
      await pollRun(d, { site: site(), environment: env(), step: "wp_install", runId });
      expect(changing() - before).toBeLessThanOrEqual(1);
      before = changing();
    }
    expect(runsOf(tables)[0].status).toBe("completed");
  });

  it("a non-timeout transport failure (nothing reached the host) fails instead of waiting", async () => {
    const h = wpHost({ install: () => new Error("connect ECONNREFUSED 172.17.0.1:22") });
    const { db, tables } = fakeDb(seed("provisioning"));
    const r = await planThenExecute(deps(db, h.transport), env(), site(), "wp_install", INPUT);
    expect(r.body).toMatchObject({ ok: false, outcome: "failed" });
    expect(runsOf(tables)[0].status).toBe("failed");
  });

  it("a system-mode freeze stops polls from touching the host; they resume after it", async () => {
    const h = wpHost();
    const { db, tables } = fakeDb(seed("provisioning"));
    const d = deps(db, h.transport);
    await planThenExecute(d, env(), site(), "wp_install", INPUT);
    const runId = String(runsOf(tables)[0].id);
    const calls = h.calls.length;
    modeGate.allowed = false;
    modeGate.mode = "freeze";
    const p = await pollRun(d, { site: site(), environment: env(), step: "wp_install", runId });
    expect(p.body.poll).toMatchObject({ pending: true, blocked: "freeze" });
    expect(h.calls.length).toBe(calls);
    modeGate.allowed = true;
    await pollToEnd(d, runId);
    expect(runsOf(tables)[0].status).toBe("completed");
  });

  it("an install that outlives the SSH call stays running and tells the operator to reset the password", async () => {
    const h = wpHost({ install: () => new Error("gate_timeout_90000ms") });
    const { db, tables } = fakeDb(seed("provisioning"));
    const r = await planThenExecute(deps(db, h.transport), env(), site(), "wp_install", INPUT);
    expect(r.status).toBe(202);
    expect(r.body.reveal).toBeUndefined();
    expect(JSON.stringify(r.body.stages)).toMatch(/重設管理員密碼/);
    expect(runsOf(tables)[0].status).toBe("running");
  });

  it("reset_password shows a new password once and stores none", async () => {
    const h = wpHost();
    const { db, tables } = fakeDb(seed("ready"));
    const r = await planThenExecute(deps(db, h.transport), env(), site(), "wp_install", { mode: "reset_password" });
    expect(r.body).toMatchObject({ ok: true, outcome: "completed", reveal: { 管理員密碼: NEW_PASSWORD } });
    expect(JSON.stringify(tables)).not.toContain(NEW_PASSWORD);
    expect(h.calls.map((c) => c.command)).toContain(`site-wp ${SLUG} reset-admin-password`);
  });

  it("step input is checked: email required, <= 60 characters, gate grammar", () => {
    expect(parseWpInstallInput({ mode: "install" })).toMatchObject({ ok: false });
    expect(parseWpInstallInput({ admin_email: `${"a".repeat(55)}@x.com` })).toMatchObject({ ok: false });
    expect(parseWpInstallInput({ admin_email: "Ops@Aware-Wave.com" })).toEqual({ ok: true, input: { mode: "install", admin_email: "ops@aware-wave.com", optional_plugins: [], oracle_server_url: "" } });
  });
});

// ── item 3: environment status is a cache with a written rule ────────────────

describe("item 3: environments.status moves only along the rule", () => {
  it("failed -> provisioning on the next attempt, -> ready when open completes; a ready site stays ready", () => {
    expect(nextEnvironmentStatus("failed", "create", "start")).toBe("provisioning");
    expect(nextEnvironmentStatus("provisioning", "open", "completed")).toBe("ready");
    expect(nextEnvironmentStatus("provisioning", "wp_install", "completed")).toBeNull();
    expect(nextEnvironmentStatus("provisioning", "wp_install", "failed")).toBe("failed");
    expect(nextEnvironmentStatus("ready", "wp_install", "start")).toBeNull();
    expect(nextEnvironmentStatus("ready", "wp_install", "failed")).toBeNull();
    expect(nextEnvironmentStatus("archived", "create", "start")).toBeNull();
    expect(nextEnvironmentStatus("pending", "preflight", "start")).toBeNull();
  });

  it("a failed step then a successful re-run moves the row failed -> provisioning (engine)", async () => {
    const h = wpHost();
    const { db, tables } = fakeDb(seed("failed"));
    await planThenExecute(deps(db, h.transport), env(), site(), "wp_install", INPUT);
    expect(tables.environments[0].status).toBe("provisioning");
  });
});

// ── item 4: one host call for the status page ────────────────────────────────

describe("item 4: every observation shares one site-preflight", () => {
  it("GET status asks the host once, whatever the number of steps and panels", async () => {
    const h = wpHost();
    const { db } = fakeDb(seed());
    const r = await getSiteFlowStatus(deps(db, h.transport), { site: site(), environment: env() });
    expect(r.status).toBe(200);
    expect(h.calls.map((c) => c.command)).toEqual([`site-preflight ${SLUG} ${DOMAIN}`]);
    expect(r.body.panels).toMatchObject({ backup: { state: "listed" } });
  });
});

// ── item 5: the oracle plugin's server URL comes from the step input ─────────

describe("item 5: engine URL (server) for the oracle plugin", () => {
  it("required when the oracle plugin is chosen, refused otherwise, shown in the plan; the plugin URL is the catalog's", async () => {
    expect(parseWpInstallInput({ admin_email: "a@b.co", optional_plugins: ["aware-wave-oracle"] })).toMatchObject({ ok: false });
    expect(parseWpInstallInput({ admin_email: "a@b.co", oracle_server_url: "http://x:3000" })).toMatchObject({ ok: false });
    expect(parseWpInstallInput({ admin_email: "a@b.co", optional_plugins: ["evil-plugin"] })).toMatchObject({ ok: false });
    const h = wpHost();
    const { db } = fakeDb(seed());
    const input = { admin_email: "a@b.co", optional_plugins: ["aware-wave-oracle"], oracle_server_url: "http://oracle-web:3000" };
    const p = await planStep(deps(db, h.transport), { site: site(), environment: env(), step: "wp_install", input });
    const items = (p.body.plan as { items: Array<{ label: string; value: string }> }).items;
    expect(items.find((i) => i.label.includes("引擎網址"))?.value).toContain("http://oracle-web:3000");
    const oracleUrl = ownReleasePlugins().find((o) => o.slug === "aware-wave-oracle")!.url;
    expect(((p.body.plan as { params: Row }).params.plugins as string[])).toContain(oracleUrl);
  });

  it("the input takes only what the gate's grammar takes (no path, trailing slash, capitals, credentials)", () => {
    for (const bad of ["http://oracle-web:3000/", "http://oracle-web/api", "http://Oracle-web:3000", "http://u:p@oracle", "ftp://oracle"]) {
      expect(parseWpInstallInput({ admin_email: "a@b.co", optional_plugins: ["aware-wave-oracle"], oracle_server_url: bad }), bad).toMatchObject({ ok: false });
    }
  });

  const ORACLE_INPUT = { admin_email: "a@b.co", optional_plugins: ["aware-wave-oracle"], oracle_server_url: "http://oracle-web:3000" };

  it("after the plugins, verify writes the URL through set-oracle-engine-url and the step is done only on the value read back", async () => {
    const h = wpHost();
    const { db, tables } = fakeDb(seed("provisioning"));
    const d = deps(db, h.transport);
    await planThenExecute(d, env(), site(), "wp_install", ORACLE_INPUT);
    await pollToEnd(d, String(runsOf(tables)[0].id));
    expect(runsOf(tables)[0].status).toBe("completed");
    const cmds = h.calls.map((c) => c.command);
    expect(cmds).toContain(`site-wp ${SLUG} set-oracle-engine-url http://oracle-web:3000`);
    expect(cmds.findIndex((c) => c.includes(" set-oracle-engine-url "))).toBeGreaterThan(cmds.findIndex((c) => c.includes(" plugins ")));
    const s2 = await getSiteFlowStatus(d, { site: site(), environment: env() });
    expect((s2.body.steps as Row[]).find((x) => x.key === "wp_install")).toMatchObject({ state: "done" });
  });

  it("a value read back different from the one sent fails the step; the observation is not done", async () => {
    const h = wpHost({ engineUrl: () => json({ state: "ok", server_engine_url: "http://other:1" }) });
    const { db, tables } = fakeDb(seed("provisioning"));
    const d = deps(db, h.transport);
    await planThenExecute(d, env(), site(), "wp_install", ORACLE_INPUT);
    await pollToEnd(d, String(runsOf(tables)[0].id));
    expect(runsOf(tables)[0].status).toBe("failed");
    const s2 = await getSiteFlowStatus(d, { site: site(), environment: env() });
    expect(((s2.body.steps as Row[]).find((x) => x.key === "wp_install")!.observation as Row).status).not.toBe("done");
  });
});

// ── item 6: done means verified, not an exit code ────────────────────────────

describe("item 6: partial success never reads done", () => {
  it("a plugin the gate did not confirm active fails the step and the observation is not done", async () => {
    const h = wpHost({ plugins: (args) => json({ state: "ok", plugins: args.slice(1).join(" "), kept: "" }) }); // drops the first
    const { db, tables } = fakeDb(seed("provisioning"));
    const d = deps(db, h.transport);
    await planThenExecute(d, env(), site(), "wp_install", INPUT);
    const runId = String(runsOf(tables)[0].id);
    await pollRun(d, { site: site(), environment: env(), step: "wp_install", runId });
    expect(runsOf(tables)[0].status).toBe("failed");
    const status = await getSiteFlowStatus(d, { site: site(), environment: env() });
    const wp = (status.body.steps as Array<Row>).find((s) => s.key === "wp_install")!;
    expect(wp.state).toBe("failed");
    expect((wp.observation as Row).status).not.toBe("done");
  });

  it("a failed re-run is not hidden behind an older success: the newest install attempt decides", async () => {
    const failedNewer: Row = {
      ...completedInstallRun(),
      id: "00000000-0000-4000-8000-000000000002",
      status: "failed",
      started_at: "2026-11-22T00:00:00Z",
      input_payload: { plan_hash: "y", input: { mode: "install", admin_email: "a@b.co", optional_plugins: ["aware-wave-oracle"], oracle_server_url: "http://oracle-web:3000" } },
      output_payload: { stages: [{ stage: "execute", ok: false, detail: "pending", output: { wp_state: "reused", admin_user: "a@b.co" } }, { stage: "verify", ok: false, detail: "外掛安裝失敗" }] },
    };
    const { db } = fakeDb({ ...seed("failed"), ops_action_runs: [completedInstallRun(), failedNewer] });
    const s2 = await getSiteFlowStatus(deps(db, wpHost().transport), { site: site(), environment: env() });
    const wp = (s2.body.steps as Row[]).find((x) => x.key === "wp_install")!;
    expect((wp.observation as Row).status).toBe("partial");
    expect(wp.state).toBe("failed");
  });

  it("a newer attempt that never reached the host (precheck refused) does not undo a done install", async () => {
    const refused: Row = { ...completedInstallRun(), id: "00000000-0000-4000-8000-000000000003", status: "failed", started_at: "2026-11-22T00:00:00Z", output_payload: { stages: [{ stage: "precheck", ok: false, detail: "容器不健康" }] } };
    const { db } = fakeDb({ ...seed("provisioning"), ops_action_runs: [completedInstallRun(), refused] });
    const s2 = await getSiteFlowStatus(deps(db, wpHost().transport), { site: site(), environment: env() });
    expect(((s2.body.steps as Row[]).find((x) => x.key === "wp_install")!.observation as Row).status).toBe("done");
  });

  it("the open step is done only when the public home page is not the under-construction page; otherwise it closes again", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`<p>${UNDER_CONSTRUCTION_MARK}</p>`, { status: 503 })));
    const calls: string[] = [];
    const h = host((cmd) => {
      calls.push(cmd);
      if (cmd.startsWith("site-preflight")) return json(preflightJson({ registry: { domain: DOMAIN, ingress: "host-vhost", port: 8101, vhost_file: `/etc/nginx/sites-available/${DOMAIN}.conf` }, vhost_occupants: [{ file: `/etc/nginx/sites-enabled/${DOMAIN}.conf`, target: `/etc/nginx/sites-available/${DOMAIN}.conf` }] }));
      if (cmd === `site-wp ${SLUG} open`) return json({ state: "open" });
      if (cmd === `site-wp ${SLUG} close`) return json({ state: "under_construction" });
      return { code: 126 };
    });
    const { db, tables } = fakeDb({ ...seed("provisioning"), ops_action_runs: [completedInstallRun()] });
    const r = await planThenExecute(deps(db, h.transport), env(), site(), "open");
    expect(r.body).toMatchObject({ ok: false, reason: "verify_failed" });
    expect(calls).toContain(`site-wp ${SLUG} close`);
    expect(tables.environments[0].status).toBe("failed");
  });
});

/** A completed wp_install run whose verify confirmed every base plugin (what observe reads). */
function completedInstallRun(): Row {
  const plugins = pluginArgs({ plugin_packs: ["base"] }, []);
  return {
    id: "00000000-0000-4000-8000-000000000001",
    action_id: "cat-wp_install",
    environment_id: ENV_ID,
    status: "completed",
    started_at: "2026-11-21T00:00:00Z",
    input_payload: { plan_hash: "x", input: { mode: "install", admin_email: "a@b.co", optional_plugins: [] } },
    output_payload: { stages: [{ stage: "verify", ok: true, detail: "ok", output: { wp_state: "reused", plugins_verified: plugins } }] },
    metadata: { step: "wp_install" },
  };
}

// ── item 7: backup panel and hand-done items ─────────────────────────────────

describe("item 7: 每日備份 is an observation; 手動項目 ticks are stored with who and when", () => {
  it("backup: registered = listed for tonight; no registry = not yet", async () => {
    const { db } = fakeDb(seed());
    const listed = await getSiteFlowStatus(deps(db, wpHost().transport), { site: site(), environment: env() });
    expect((listed.body.panels as Row).backup).toMatchObject({ state: "listed", lastBackupAt: null });
    const none = await getSiteFlowStatus(deps(db, wpHost({ preflight: { registry: null, create_plan: "new" } }).transport), { site: site(), environment: env() });
    expect((none.body.panels as Row).backup).toMatchObject({ state: "absent" });
  });

  it("a tick keeps who, when and the note, keeps other metadata, and shows in the status answer", async () => {
    const { db, tables } = fakeDb(seed("pending", { waves: [1, 2] }));
    const r = await writeTick(db, { siteId: SITE_ID, env: env(), key: "uptime_monitor", checked: true, note: "監控名 acme", by: "ops@aware-wave.com", now: () => new Date(T0) });
    expect(r).toMatchObject({ ok: true });
    const meta = tables.sites[0].metadata as Row;
    expect(meta.waves).toEqual([1, 2]);
    expect(meta.manual_checks).toEqual([{ key: "uptime_monitor", by: "ops@aware-wave.com", at: new Date(T0).toISOString(), note: "監控名 acme" }]);
    const status = await getSiteFlowStatus(deps(db, wpHost().transport), { site: site(meta), environment: env() });
    const panel = (status.body.panels as { manual_checks: Array<Row> }).manual_checks;
    expect(panel.find((m) => m.key === "uptime_monitor")?.tick).toMatchObject({ by: "ops@aware-wave.com" });
    expect(await writeTick(db, { siteId: SITE_ID, env: env(), key: "gateway_routed", checked: true, note: "", by: "x" })).toEqual({ ok: false, error: "unknown_check" });
  });

  it("product-gateway: step 5 is a manual tick; execute refuses; the tick makes it done", async () => {
    const h = wpHost();
    const e = env({ ingress: "product-gateway" });
    const { db, tables } = fakeDb({ ...seed(), ops_action_runs: [completedInstallRun()] });
    const d = deps(db, h.transport);
    const p = await planStep(d, { site: site(), environment: e, step: "vhost" });
    expect(p).toMatchObject({ status: 409, body: { error: "manual_step" } });
    const x = await executeStep(d, { site: site(), environment: e, step: "vhost", planHash: "a".repeat(64), actor });
    expect(x).toMatchObject({ status: 409, body: { error: "manual_step" } });
    expect(h.calls.some((c) => c.command.startsWith("site-vhost"))).toBe(false);
    await writeTick(db, { siteId: SITE_ID, env: e, key: "gateway_routed", checked: true, note: "GO-2", by: "eng@aware-wave.com" });
    const s = await getSiteFlowStatus(d, { site: site(tables.sites[0].metadata as Row), environment: e });
    const vh = (s.body.steps as Row[]).find((x2) => x2.key === "vhost")!;
    expect(vh).toMatchObject({ state: "done", manual: { key: "gateway_routed" } });
  });
});

// ── item 8: prerequisites read by name ───────────────────────────────────────

describe("item 8 + SF-H row: prerequisites", () => {
  it("a step whose prerequisite is not done is refused before the host, with the step's name", async () => {
    const h = wpHost({ preflight: { registry: null, wp_container: "absent", db_container: "absent", create_plan: "new" } });
    const { db } = fakeDb(seed());
    const d = deps(db, h.transport);
    const p = await planStep(d, { site: site(), environment: env(), step: "wp_install", input: INPUT });
    const r = await executeStep(d, { site: site(), environment: env(), step: "wp_install", planHash: p.body.planHash, actor, input: INPUT });
    expect(r).toMatchObject({ status: 409, body: { error: "prerequisite_not_done", detail: "需先完成：建立網站主機" } });
    expect(h.calls.some((c) => c.command.includes(" install "))).toBe(false);
    const s = await getSiteFlowStatus(d, { site: site(), environment: env() });
    expect((s.body.steps as Row[]).find((x) => x.key === "vhost")!.reason).toBe("需先完成：安裝 WordPress 與外掛");
  });
});

// ── vhost (host-vhost) observation ───────────────────────────────────────────

describe("vhost: done only when the live config serves the domain from this site's file", () => {
  it("another vhost serving the domain blocks the step and names the file", async () => {
    const h = wpHost({ preflight: { vhost_occupants: [{ file: "/etc/nginx/sites-enabled/old.conf", target: "/etc/nginx/sites-available/old.conf" }] } });
    const { db } = fakeDb({ ...seed(), ops_action_runs: [completedInstallRun()] });
    const s = await getSiteFlowStatus(deps(db, h.transport), { site: site(), environment: env() });
    const vh = (s.body.steps as Row[]).find((x) => x.key === "vhost")!;
    expect(vh.state).toBe("blocked");
    expect(String(vh.reason)).toContain("/etc/nginx/sites-enabled/old.conf");
  });
});

// ── catalog ──────────────────────────────────────────────────────────────────

describe("catalog: own plugins and the Kadence theme", () => {
  it("Kadence is a theme, never a plugin to install; own plugins are white-listed release URLs", () => {
    const { wporg, releases } = resolveSiteFlowPlugins(["base"]);
    expect(wporg).not.toContain("kadence");
    expect(wporg).toContain("mainwp-child");
    expect(releases.map((r) => r.slug)).toEqual(["aware-wave-wp-bridge"]);
    for (const r of ownReleasePlugins()) {
      expect(r.url).toMatch(/^https:\/\/github\.com\/awarewaveai-pei\/[A-Za-z0-9][A-Za-z0-9._-]*\/releases\/download\/v[0-9]+(\.[0-9]+){0,3}\/[A-Za-z0-9][A-Za-z0-9._+-]*\.zip$/);
    }
  });

  it("plugin calls fit the gate: at most 20 args and 4096 bytes per command", () => {
    const args = Array.from({ length: 45 }, (_, i) => `plugin-${i}`);
    const batches = pluginBatches(SLUG, args);
    expect(batches.flat()).toEqual(args);
    for (const b of batches) {
      expect(b.length).toBeLessThanOrEqual(20);
      expect(`site-wp ${SLUG} plugins ${b.join(" ")}`.length).toBeLessThanOrEqual(4096);
    }
  });
});
