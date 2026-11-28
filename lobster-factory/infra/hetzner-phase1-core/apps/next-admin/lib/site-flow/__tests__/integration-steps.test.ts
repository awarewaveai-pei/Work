// Card SF-I acceptance (WP-SF-I-integrations.md items 1-5 + switch-off guard + private-key leak check): the real
// engine with the real mainwp/bridge steps, a scripted host gate (real gate-client), an in-memory PostgREST fake, a fake
// vault, a fake MainWP and a fake WordPress site that really verifies the Ed25519 signature against the public key the
// gate wrote. Step 5 (vhost) is stubbed done: its own behaviour is covered by host-steps.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createPublicKey, verify as edVerify } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

const modeGate = vi.hoisted(() => ({ allowed: true, mode: "normal" }));
vi.mock("@/lib/system-modes/production-change-gate", () => ({
  checkProductionChangeAllowed: vi.fn(async () => ({ allowed: modeGate.allowed, mode: modeGate.mode })),
}));
const vault = vi.hoisted(() => ({ store: new Map<string, string>(), failPut: false, failGet: false, calls: [] as string[] }));
vi.mock("@/lib/secret-vault", () => ({
  clientCredSecretRef: (id: string) => `client_cred:${id}`,
  putSecret: vi.fn(async (name: string, value: string) => {
    vault.calls.push(`put ${name}`);
    if (vault.failPut) throw new Error("secret-vault put failed: connection reset");
    vault.store.set(name, value);
    return name;
  }),
  getSecret: vi.fn(async (name: string) => {
    vault.calls.push(`get ${name}`);
    if (vault.failGet) throw new Error("secret-vault get failed: timeout");
    return vault.store.get(name) ?? null;
  }),
  deleteSecret: vi.fn(async (name: string) => {
    vault.calls.push(`delete ${name}`);
    return vault.store.delete(name);
  }),
}));

import { executeStep, getSiteFlowStatus, planStep, SITE_STEP_DEFINITIONS, type EngineDeps } from "../engine";
import { createSiteGateClient, gateTargetOf, type GateTransport } from "../gate-client";
import { HOST_STEPS } from "../steps";
import { bridgeStep, expectedBridgeVersion, versionAtLeast } from "../steps/bridge";
import { connectionOf } from "../mainwp-client";
import { bridgeSiteOrg } from "@/lib/payments/woo";
import type { EnvironmentRow, SiteRow, SiteStepDefinition, SiteStepKey } from "../types";

type Row = Record<string, unknown>;
const T0 = Date.parse("2026-11-23T10:00:00Z");

/** In-memory PostgREST subset: select/eq/neq/in/lt/order/limit, insert, update (+select), delete, maybeSingle. */
function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = structuredClone(seed);
  const fail = { insert: new Set<string>(), update: new Set<string>() };
  let seq = 0;
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
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
      delete: () => ((op = "delete"), q),
      maybeSingle: async () => ({ data: structuredClone(matching()[0] ?? null), error: null }),
      then: (resolve: (v: unknown) => void) => {
        void Promise.resolve().then(() => {
          if (op === "insert") {
            if (fail.insert.has(table)) return resolve({ error: { message: "insert refused" } });
            rows.push({ started_at: new Date(T0 + ++seq * 1000).toISOString(), ended_at: null, error_summary: null, output_payload: {}, ...structuredClone(inserted) });
            return resolve({ error: null });
          }
          if (op === "update") {
            if (fail.update.has(table)) return resolve({ data: null, error: { message: "update refused" } });
            const m = matching();
            for (const r of m) Object.assign(r, structuredClone(patch));
            return resolve({ data: m.map((r) => ({ id: r.id })), error: null });
          }
          if (op === "delete") {
            const m = new Set(matching());
            tables[table] = rows.filter((r) => !m.has(r));
            rows.splice(0, rows.length, ...tables[table]);
            tables[table] = rows;
            return resolve({ error: null });
          }
          resolve({ data: structuredClone(matching()), error: null });
        });
      },
    };
    return q;
  };
  return { db: { from } as unknown as SupabaseClient, tables, fail };
}

const ORG = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const OTHER_ORG = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const SITE_ID = "6f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";
const ENV_ID = "7a1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";
const SLUG = "acme-example-com";
const DOMAIN = "acme.example.com";
const URL_ = `https://${DOMAIN}`;
const MAINWP = "https://mainwp.test";
const ADMIN = "ops@aware-wave.com";

/** The three live rows (Soulful, AwareWave, E2E-Verify-0704) an SF-I write must never touch. */
const EXISTING_WP_SITES: Row[] = [
  { id: "w-soulful", name: "Soulful", url: "https://soulfulexpression.org", organization_id: "org-soulful", active: true, token: "t1", username: "u1" },
  { id: "w-aw", name: "AwareWave", url: "https://aware-wave.com", organization_id: "org-aw", active: true, token: "t2", username: "u2" },
  { id: "w-e2e", name: "E2E-Verify-0704", url: "https://aware-wave.com/staging/e2e-verify-0704", organization_id: "org-e2e", active: true, token: "t3", username: "admin" },
];

const site = (): SiteRow => ({ id: SITE_ID, organization_id: ORG, workspace_id: "ws", project_id: "pj", name: "Acme", primary_domain: DOMAIN, locale: "zh_TW", metadata: {} });
const envRow = (meta: Row = {}): Row => ({
  id: ENV_ID,
  site_id: SITE_ID,
  organization_id: ORG,
  environment_type: "production",
  hosting_provider: "ks-aw-01-docker",
  base_url: URL_,
  wp_root_path: null,
  status: "provisioning",
  credentials_ref: null,
  updated_at: "2026-11-23T00:00:00Z",
  metadata: { host_slug: SLUG, ingress: "host-vhost", plugin_packs: ["base"], ...meta },
});
/** The environment as the engine would load it now (fresh from the fake table). */
const envOf = (t: Record<string, Row[]>): EnvironmentRow => structuredClone(t.environments.find((e) => e.id === ENV_ID)) as unknown as EnvironmentRow;

const KEYS: SiteStepKey[] = ["preflight", "create", "wp_install", "vhost", "mainwp", "bridge", "open"];
const catalog = (off: SiteStepKey[] = []) => KEYS.map((k) => ({ id: `cat-${k}`, action_key: `site.${k}`, enabled: !off.includes(k) }));
/** A completed wp_install run, as SF-H records it (verify output carries the admin user the gate reported). */
const wpInstallRun = (): Row => ({
  id: "run-wp",
  action_id: "cat-wp_install",
  environment_id: ENV_ID,
  status: "completed",
  started_at: "2026-11-23T09:00:00Z",
  input_payload: { input: { mode: "install", admin_email: ADMIN } },
  output_payload: { stages: [{ stage: "verify", ok: true, detail: "ok", output: { admin_user: ADMIN, wp_state: "installed" } }] },
  metadata: { step: "wp_install" },
});
const seed = (over: Partial<Record<string, Row[]>> = {}) => ({
  ops_action_catalog: catalog(),
  environments: [envRow()],
  sites: [{ id: SITE_ID, organization_id: ORG, metadata: {} }],
  wp_sites: structuredClone(EXISTING_WP_SITES),
  client_credentials: [],
  ops_action_runs: [wpInstallRun()],
  ...over,
});

// ── the outside world ────────────────────────────────────────────────────────

type Reply = { code: number; stdout?: string; stderr?: string };
const jsonOut = (o: Row): Reply => ({ code: 0, stdout: `${JSON.stringify(o)}\n` });

/** Host gate: set-mainwp-id and put-bridge-pubkey behave like aw-hosting-gate.sh site_wp. */
function hostGate(world: World) {
  const calls: Array<{ command: string; stdin: string | undefined }> = [];
  const answer = (command: string, stdin?: string): Reply => {
      if (command === "staging-wp acme" && stdin) {
        // the gate-client staging adapter's fixed scripts (values arrive inside the script, never argv)
        const m = /AW_KEY_ID='([^']+)' AW_PUB='([^']+)'/.exec(stdin);
        if (m) command = `site-wp ${SLUG} put-bridge-pubkey ${m[1]} ${m[2]} write`;
        const u = /mainwp_child_uniqueId ([0-9a-f]+)/.exec(stdin);
        if (u) command = `site-wp ${SLUG} set-mainwp-id ${u[1]}`;
      }
      const a = command.split(" ");
      if (command.startsWith(`site-wp ${SLUG} set-mainwp-id `)) {
        world.childUniqueId = a[3];
        return jsonOut({ state: "ok" });
      }
      if (command.startsWith(`site-wp ${SLUG} put-bridge-pubkey `)) {
        if (world.gatePutFails) return { code: 3, stderr: "aw-hosting-gate: put-bridge-pubkey failed: connection to the WP container lost" };
        const [keyId, pub] = [a[3], a[4]];
        const have = world.siteKeys.get(keyId);
        if (have && (have.pub !== pub || have.revoked)) return { code: 3, stderr: "aw-hosting-gate: put-bridge-pubkey failed: key_id exists with another key or is revoked" };
        if (have) return jsonOut({ state: "reused", key_id: keyId });
        world.siteKeys.set(keyId, { pub, revoked: false });
        return jsonOut({ state: "created", key_id: keyId });
      }
      return { code: 126, stderr: `unexpected ${command}` };
  };
  const transport: GateTransport = {
    exec: async (command, stdin) => {
      calls.push({ command, stdin });
      const r = answer(command, stdin);
      return { code: r.code, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
  };
  return { transport, calls };
}

interface World {
  mainwpSites: Array<{ id: number; url: string; sync_errors: string; suspended?: number }>;
  mainwpAdds: Row[];
  mainwpTruncated: boolean;
  childUniqueId: string | null;
  siteKeys: Map<string, { pub: string; revoked: boolean }>;
  gatePutFails: boolean;
  bridgeVersion: string;
  signedCalls: number;
  fetchLog: string[];
  siteUrl: string;
}
// The site runs the catalog-pinned bridge; a hardcoded "0.22.0" broke every bridge test when ff49d498 moved the pin.
const newWorld = (): World => ({ mainwpSites: [], mainwpAdds: [], mainwpTruncated: false, childUniqueId: null, siteKeys: new Map(), gatePutFails: false, bridgeVersion: expectedBridgeVersion(), signedCalls: 0, fetchLog: [], siteUrl: URL_ });

/** fetch: MainWP v2 (list, add) and the new site's wp-bridge (/health public, /drafts signed). */
function stubFetch(world: World) {
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    world.fetchLog.push(`${method} ${url}`);
    const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.startsWith(`${MAINWP}/wp-json/mainwp/v2/sites?`) && method === "GET") {
      const data = world.mainwpSites.map((s) => ({ ...s, name: "x" }));
      return res(200, { success: 1, total: data.length + (world.mainwpTruncated ? 100 : 0), data });
    }
    if (url === `${MAINWP}/wp-json/mainwp/v2/sites/add` && method === "POST") {
      const body = JSON.parse(String(init?.body));
      world.mainwpAdds.push(body);
      if (body.uniqueid !== world.childUniqueId) return res(200, { success: 0, error: "REG_ERROR7" });
      const id = 40 + world.mainwpSites.length;
      world.mainwpSites.push({ id, url: `${body.url}/`, sync_errors: "" });
      return res(200, { success: 1, data: { id } });
    }
    if (url === `${world.siteUrl}/?rest_route=/aware-wave-bridge/v1/health`) {
      if (world.bridgeVersion === "down") return res(503, {});
      return res(200, { name: "aware-wave-wp-bridge", version: world.bridgeVersion, crypto_ready: true });
    }
    if (url === `${world.siteUrl}/?rest_route=/aware-wave-bridge/v1/drafts` && method === "POST") {
      // RestController authenticate: the key must be on the site, active, and the signature must verify.
      const h = new Headers(init?.headers);
      const keyId = h.get("X-AWBridge-Key-Id") ?? "";
      const key = world.siteKeys.get(keyId);
      if (!key || key.revoked) return res(401, { ok: false, reason: "unknown_key" });
      const body = String(init?.body ?? "");
      const canonical = `POST\n/aware-wave-bridge/v1/drafts\n${h.get("X-AWBridge-Timestamp")}\n${h.get("X-AWBridge-Nonce")}\n${createHash("sha256").update(body).digest("hex")}`;
      const pub = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(key.pub, "base64")]), format: "der", type: "spki" });
      const good = edVerify(null, Buffer.from(canonical), pub, Buffer.from(h.get("X-AWBridge-Signature") ?? "", "base64"));
      if (!good) return res(401, { ok: false, reason: "bad_signature" });
      world.signedCalls += 1;
      return res(200, { posts: [] });
    }
    return res(404, { error: `unexpected ${method} ${url}` });
  });
  vi.stubGlobal("fetch", f);
  return f;
}

// step 5 stubbed: done (its observation needs the host preflight; host-steps.test.ts covers it)
const vhostDone: SiteStepDefinition = { ...HOST_STEPS.vhost!, observe: async () => ({ status: "done", detail: "stub" }) };

function engine(db: SupabaseClient, transport: GateTransport): EngineDeps {
  return { db, steps: { ...SITE_STEP_DEFINITIONS, vhost: vhostDone }, gateFor: (e) => createSiteGateClient(gateTargetOf(e), transport), now: () => T0 + 60_000 };
}

const actor = { role: "owner" as const, userId: "u-1" };
async function run(d: EngineDeps, t: Record<string, Row[]>, step: SiteStepKey, input: unknown = undefined) {
  const p = await planStep(d, { site: site(), environment: envOf(t), step, input });
  if (p.status !== 200) return p;
  return executeStep(d, { site: site(), environment: envOf(t), step, planHash: p.body.planHash, actor, input });
}
const observe = async (d: EngineDeps, t: Record<string, Row[]>, step: SiteStepKey) => {
  const s = await getSiteFlowStatus(d, { site: site(), environment: envOf(t) });
  return (s.body.steps as Array<{ key: string; state: string; reason: string | null; observation: { status: string } | null }>).find((x) => x.key === step)!;
};
const runsOf = (t: Record<string, Row[]>, step: SiteStepKey) => (t.ops_action_runs ?? []).filter((r) => (r.metadata as Row)?.step === step);

const consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];
let world: World;
beforeEach(() => {
  modeGate.allowed = true;
  vault.store.clear();
  vault.failPut = false;
  vault.failGet = false;
  vault.calls = [];
  world = newWorld();
  vi.stubEnv("MAINWP_DASHBOARD_URL", MAINWP);
  vi.stubEnv("MAINWP_CONSUMER_KEY", "ck_test");
  vi.stubEnv("MAINWP_CONSUMER_SECRET", "cs_test_secret");
  for (const m of ["log", "info", "warn", "error", "debug"] as const) consoleSpies.push(vi.spyOn(console, m));
});
afterEach(() => {
  while (consoleSpies.length) consoleSpies.pop()!.mockRestore();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const consoleText = () => consoleSpies.map((s) => JSON.stringify(s.mock.calls)).join("\n");

// ── registry ─────────────────────────────────────────────────────────────────

describe("registry", () => {
  it("steps 6 and 7 are registered: all seven site.* steps have a body", () => {
    expect(Object.keys(HOST_STEPS).sort()).toEqual([...KEYS].sort());
  });
});

// ── item 1: MainWP ───────────────────────────────────────────────────────────

describe("mainwp (item 1)", () => {
  it("sets a unique id on the site through the gate, adds the site with it, stores the MainWP id; the id is not kept anywhere", async () => {
    const { db, tables } = fakeDb(seed());
    stubFetch(world);
    const gate = hostGate(world);
    const r = await run(engine(db, gate.transport), tables, "mainwp");
    expect(r.body.outcome, JSON.stringify(r.body)).toBe("completed");
    expect(world.childUniqueId).toMatch(/^[0-9a-f]{48}$/);
    expect(world.mainwpAdds).toEqual([{ url: URL_, name: "Acme", admin: ADMIN, uniqueid: world.childUniqueId }]);
    expect((envOf(tables).metadata as Row).mainwp_site_id).toBe("40");
    expect(JSON.stringify(tables.ops_action_runs)).not.toContain(world.childUniqueId!);
    expect((await observe(engine(db, gate.transport), tables, "mainwp")).state).toBe("done");
  });

  it("a URL MainWP already lists is reused: no new unique id, no second add", async () => {
    const { db, tables } = fakeDb(seed());
    world.mainwpSites.push({ id: 7, url: `${URL_}/`, sync_errors: "" });
    stubFetch(world);
    const gate = hostGate(world);
    const r = await run(engine(db, gate.transport), tables, "mainwp");
    expect(r.body.outcome).toBe("completed");
    expect(gate.calls).toEqual([]);
    expect(world.mainwpAdds).toEqual([]);
    expect((envOf(tables).metadata as Row).mainwp_site_id).toBe("7");
  });

  it("listed but not connected: execute refuses (no re-add), the page names the hand step, and a reconnect in MainWP turns it done", async () => {
    const { db, tables } = fakeDb(seed());
    world.mainwpSites.push({ id: 7, url: URL_, sync_errors: "Unable to connect" });
    stubFetch(world);
    const gate = hostGate(world);
    const r = await run(engine(db, gate.transport), tables, "mainwp");
    expect(r.body.outcome).toBe("failed");
    expect(world.mainwpAdds).toEqual([]);
    expect(gate.calls).toEqual([]);
    const o = await observe(engine(db, gate.transport), tables, "mainwp");
    expect(o.observation?.status).toBe("blocked");
    expect((o.observation as { detail?: string }).detail).toContain("Reconnect");
    // SF-K: the failed run just above must not hide the hand step: the shown state and reason are the observed cause.
    expect(runsOf(tables, "mainwp").some((x) => x.status === "failed")).toBe(true);
    expect(o.state).toBe("blocked");
    expect(o.reason).toContain("Reconnect");
    world.mainwpSites[0].sync_errors = ""; // the operator reconnected in MainWP
    expect((await observe(engine(db, gate.transport), tables, "mainwp")).state).toBe("done");
  });

  it("a cut MainWP list without the site is not 'absent': nothing is added", async () => {
    const { db, tables } = fakeDb(seed());
    world.mainwpTruncated = true;
    stubFetch(world);
    const gate = hostGate(world);
    const r = await run(engine(db, gate.transport), tables, "mainwp");
    expect(r.body.outcome).toBe("failed");
    expect(world.mainwpAdds).toEqual([]);
    expect(gate.calls).toEqual([]);
  });

  it("connected only on MainWP's own signals; a row that says neither is unknown", () => {
    expect(connectionOf({ sync_errors: "" }).connected).toBe(true);
    expect(connectionOf({ sync_errors: "x" }).connected).toBe(false);
    expect(connectionOf({ status: "connected", suspended: 1 }).connected).toBe(false);
    expect(connectionOf({ id: 1 }).connected).toBeNull();
  });

  it("same contract as the workflows copy (route, auth, body keys) -- next-admin cannot import packages/workflows", () => {
    const wf = readFileSync(path.resolve(__dirname, "../../../../../../../packages/workflows/src/integrations/integration-steps.ts"), "utf8");
    const na = readFileSync(path.resolve(__dirname, "../mainwp-client.ts"), "utf8");
    for (const needle of ["/wp-json/mainwp/v2/", "sites/add", "Basic ", "uniqueid", "admin", "success", "MAINWP_DASHBOARD_URL", "MAINWP_CONSUMER_KEY", "MAINWP_CONSUMER_SECRET"]) {
      expect(wf, needle).toContain(needle);
      expect(na, needle).toContain(needle);
    }
  });
});

// ── items 2-4: wp-bridge ─────────────────────────────────────────────────────

/** Everything the run, the console and the host saw, to grep for the private key. */
function everythingVisible(t: Record<string, Row[]>, gateCalls: Array<{ command: string; stdin: string | undefined }>, extra: unknown[] = []): string {
  const { client_credentials: creds, environments, wp_sites, ops_action_runs } = t;
  return [JSON.stringify({ ops_action_runs, environments, wp_sites, creds }), consoleText(), JSON.stringify(gateCalls), JSON.stringify(world.fetchLog), JSON.stringify(extra)].join("\n");
}
const theSecret = () => [...vault.store.values()][0];

describe("bridge (items 2-4)", () => {
  it("key pair made here: private key only in the vault, public key through the gate, a signed request proves it, the owner row is written", async () => {
    const { db, tables } = fakeDb(seed());
    stubFetch(world);
    const gate = hostGate(world);
    const r = await run(engine(db, gate.transport), tables, "bridge");
    expect(r.body.outcome, JSON.stringify(r.body)).toBe("completed");

    const bridge = (envOf(tables).metadata as Row).bridge as Row;
    expect(bridge.key_id).toMatch(/^aw-7a1e2d3c-[0-9a-f]{8}$/);
    expect(envOf(tables) as unknown as Row).toMatchObject({ credentials_ref: bridge.credential_id });
    const cred = tables.client_credentials.find((c) => c.id === bridge.credential_id)!;
    expect(cred).toMatchObject({ client_id: ORG, identifier: bridge.key_id, secret_ref: `client_cred:${bridge.credential_id}` });
    expect(vault.store.has(`client_cred:${bridge.credential_id}`)).toBe(true);
    expect(world.signedCalls).toBe(1);
    const put = gate.calls.find((c) => c.command.includes("put-bridge-pubkey"))!;
    expect(put.command).toMatch(new RegExp(`^site-wp ${SLUG} put-bridge-pubkey ${bridge.key_id} [A-Za-z0-9+/]{43}= write$`));
    expect(put.stdin).toBeUndefined();

    // item 3: the owner row, org from sites.organization_id; bridgeSiteOrg answers it (not global mode)
    const row = tables.wp_sites.find((w) => w.url === URL_)!;
    expect(row).toMatchObject({ organization_id: ORG, active: true });
    expect(await bridgeSiteOrg(db as never, URL_)).toBe(ORG);
    // old data untouched
    expect(tables.wp_sites.filter((w) => w.url !== URL_)).toEqual(EXISTING_WP_SITES);
    expect((await observe(engine(db, gate.transport), tables, "bridge")).state).toBe("done");
  });

  it("the private key is in no run input/output/error, console line, gate argument/stdin, outgoing URL or table but the vault", async () => {
    const { db, tables } = fakeDb(seed());
    stubFetch(world);
    const gate = hostGate(world);
    const r = await run(engine(db, gate.transport), tables, "bridge");
    expect(r.body.outcome).toBe("completed");
    const secret = theSecret();
    expect(secret).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    const seen = everythingVisible(tables, gate.calls, [r.body]);
    expect(seen).not.toContain(secret);
    expect(seen).not.toContain(secret.slice(4, 24)); // a fixed fragment, as the card asks
    expect(seen).not.toContain(Buffer.from(secret, "base64").toString("hex").slice(0, 32));
  });

  it("an existing key_id with its private key still vaulted is reused: no second key, same public key on the site", async () => {
    const { db, tables } = fakeDb(seed());
    stubFetch(world);
    const gate = hostGate(world);
    await run(engine(db, gate.transport), tables, "bridge");
    const first = (envOf(tables).metadata as Row).bridge as Row;
    const puts = vault.calls.filter((c) => c.startsWith("put")).length;
    const r = await run(engine(db, gate.transport), tables, "bridge");
    expect(r.body.outcome).toBe("completed");
    expect((envOf(tables).metadata as Row).bridge).toEqual(first);
    expect(vault.calls.filter((c) => c.startsWith("put")).length).toBe(puts);
    expect(world.siteKeys.size).toBe(1);
    expect(tables.client_credentials).toHaveLength(1);
  });

  it("item 4: the site write fails after the vault write -> not done, nothing half-claimed; the re-run converges on the same key", async () => {
    const { db, tables } = fakeDb(seed());
    stubFetch(world);
    const gate = hostGate(world);
    world.gatePutFails = true;
    const r1 = await run(engine(db, gate.transport), tables, "bridge");
    expect(r1.body.outcome).toBe("failed");
    const reg = (envOf(tables).metadata as Row).bridge as Row;
    expect(world.siteKeys.size).toBe(0);
    const o = await observe(engine(db, gate.transport), tables, "bridge");
    expect(o.state).not.toBe("done");
    expect(tables.wp_sites.some((w) => w.url === URL_)).toBe(false);

    world.gatePutFails = false;
    const r2 = await run(engine(db, gate.transport), tables, "bridge");
    expect(r2.body.outcome).toBe("completed");
    expect(((envOf(tables).metadata as Row).bridge as Row).key_id).toBe(reg.key_id);
    expect((await observe(engine(db, gate.transport), tables, "bridge")).state).toBe("done");
    expect(everythingVisible(tables, gate.calls, [r1.body, r2.body])).not.toContain(theSecret());
  });

  it("item 4: the site holds this key_id revoked -> the vault copy is dropped and the re-run makes a new key", async () => {
    const { db, tables } = fakeDb(seed());
    stubFetch(world);
    const gate = hostGate(world);
    await run(engine(db, gate.transport), tables, "bridge");
    const old = (envOf(tables).metadata as Row).bridge as Row;
    world.siteKeys.get(String(old.key_id))!.revoked = true;
    const r1 = await run(engine(db, gate.transport), tables, "bridge");
    expect(r1.body.outcome).toBe("failed");
    expect((envOf(tables).metadata as Row).bridge).toBeNull();
    expect(vault.store.has(`client_cred:${old.credential_id}`)).toBe(false);
    const r2 = await run(engine(db, gate.transport), tables, "bridge");
    expect(r2.body.outcome).toBe("completed");
    expect(((envOf(tables).metadata as Row).bridge as Row).key_id).not.toBe(old.key_id);
    expect(everythingVisible(tables, gate.calls, [r1.body, r2.body])).not.toContain(theSecret());
  });

  it("the vault write fails -> the site is not touched, the credential row is removed, no registration is left", async () => {
    const { db, tables } = fakeDb(seed());
    stubFetch(world);
    const gate = hostGate(world);
    vault.failPut = true;
    const putSpy = vi.mocked((await import("@/lib/secret-vault")).putSecret);
    putSpy.mockClear();
    const r = await run(engine(db, gate.transport), tables, "bridge");
    expect(r.body.outcome).toBe("failed");
    const attempted = String(putSpy.mock.calls[0]?.[1] ?? "");
    expect(attempted).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(everythingVisible(tables, gate.calls, [r.body])).not.toContain(attempted);
    expect(gate.calls).toEqual([]);
    expect(tables.client_credentials).toEqual([]);
    expect((envOf(tables).metadata as Row).bridge).toBeUndefined();
  });

  it("a vault that cannot be read is not 'missing': no new key is made over the registered one", async () => {
    const { db, tables } = fakeDb(seed());
    stubFetch(world);
    const gate = hostGate(world);
    await run(engine(db, gate.transport), tables, "bridge");
    const before = structuredClone((envOf(tables).metadata as Row).bridge);
    vault.failGet = true;
    const r = await run(engine(db, gate.transport), tables, "bridge");
    expect(r.body.outcome).toBe("failed");
    expect((envOf(tables).metadata as Row).bridge).toEqual(before);
  });

  it("item 3: the same URL registered to another organization fails the step and is not overwritten; nothing is made", async () => {
    const other = { id: "w-other", name: "Other", url: `${URL_}/`, organization_id: OTHER_ORG, active: true, token: "x", username: "y" };
    const { db, tables } = fakeDb(seed({ wp_sites: [...structuredClone(EXISTING_WP_SITES), other] }));
    stubFetch(world);
    const gate = hostGate(world);
    const r = await run(engine(db, gate.transport), tables, "bridge");
    expect(r.body.outcome).toBe("failed");
    expect(r.body.reason).toBe("precheck_failed");
    expect(tables.wp_sites.find((w) => w.id === "w-other")).toEqual(other);
    expect(tables.wp_sites).toHaveLength(EXISTING_WP_SITES.length + 1);
    expect(vault.calls).toEqual([]);
    expect(gate.calls).toEqual([]);
  });

  it("item 3: the organization comes from sites.organization_id, never from what the caller sends", async () => {
    const { db, tables } = fakeDb(seed());
    stubFetch(world);
    const gate = hostGate(world);
    const r = await run(engine(db, gate.transport), tables, "bridge", { organization_id: OTHER_ORG });
    expect(r.body.outcome).toBe("completed");
    expect(tables.wp_sites.find((w) => w.url === URL_)!.organization_id).toBe(ORG);
    expect(((tables.client_credentials[0] as Row).client_id)).toBe(ORG);
  });

  it("an older bridge on the site than the catalog pin is not done", async () => {
    const { db, tables } = fakeDb(seed());
    world.bridgeVersion = "0.21.9";
    stubFetch(world);
    const gate = hostGate(world);
    const r = await run(engine(db, gate.transport), tables, "bridge");
    expect(r.body.outcome).toBe("failed");
    expect(versionAtLeast("0.22.0", "0.22.0")).toBe(true);
    expect(versionAtLeast("0.23.0-beta", "0.22.0")).toBe(false);
  });

  it("plan carries no key material and is the same twice (hash-stable)", async () => {
    const { db, tables } = fakeDb(seed());
    stubFetch(world);
    const d = engine(db, hostGate(world).transport);
    const a = await planStep(d, { site: site(), environment: envOf(tables), step: "bridge" });
    const b = await planStep(d, { site: site(), environment: envOf(tables), step: "bridge" });
    expect(a.body.planHash).toBe(b.body.planHash);
    expect(vault.calls).toEqual([]);
    expect(bridgeStep.parseInput).toBeUndefined();
  });
});

describe("live observation and staging subdirectory sites", () => {
  it("bridge done is re-checked now: plugin gone, or the vault reference deleted, is no longer done", async () => {
    const { db, tables } = fakeDb(seed());
    stubFetch(world);
    const gate = hostGate(world);
    await run(engine(db, gate.transport), tables, "bridge");
    expect((await observe(engine(db, gate.transport), tables, "bridge")).state).toBe("done");
    world.bridgeVersion = "down";
    expect((await observe(engine(db, gate.transport), tables, "bridge")).observation?.status).toBe("partial");
    world.bridgeVersion = expectedBridgeVersion();
    tables.client_credentials[0].secret_ref = null;
    expect((await observe(engine(db, gate.transport), tables, "bridge")).observation?.status).toBe("partial");
  });

  it("an http:// row of another organization for the same host blocks an https:// site (one site, one owner)", async () => {
    const other = { id: "w-http", name: "Old", url: `http://${DOMAIN}`, organization_id: OTHER_ORG, active: true, token: "x", username: "y" };
    const { db, tables } = fakeDb(seed({ wp_sites: [...structuredClone(EXISTING_WP_SITES), other] }));
    stubFetch(world);
    const gate = hostGate(world);
    const r = await run(engine(db, gate.transport), tables, "bridge");
    expect(r.body.reason).toBe("precheck_failed");
    expect(tables.wp_sites.find((w) => w.id === "w-http")).toEqual(other);
    expect(vault.calls).toEqual([]);
  });

  it("a same-organization http:// row: the https:// spelling is added beside it, the old row untouched, and the step converges", async () => {
    const mine = { id: "w-http-mine", name: "Acme old", url: `http://${DOMAIN}`, organization_id: ORG, active: true, token: "x", username: "y" };
    const { db, tables } = fakeDb(seed({ wp_sites: [...structuredClone(EXISTING_WP_SITES), mine] }));
    stubFetch(world);
    const gate = hostGate(world);
    const r = await run(engine(db, gate.transport), tables, "bridge");
    expect(r.body.outcome, JSON.stringify(r.body)).toBe("completed");
    expect(tables.wp_sites.find((w) => w.id === "w-http-mine")).toEqual(mine);
    expect(await bridgeSiteOrg(db as never, URL_)).toBe(ORG);
    expect((await observe(engine(db, gate.transport), tables, "bridge")).state).toBe("done");
  });

  it("a site that does not answer at all is 'cannot tell', not 'partial' (no retry bait on a network blip)", async () => {
    const { db, tables } = fakeDb(seed());
    stubFetch(world);
    const gate = hostGate(world);
    await run(engine(db, gate.transport), tables, "bridge");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect((await observe(engine(db, gate.transport), tables, "bridge")).observation?.status).toBe("unknown");
  });

  it("staging subdirectory site: no host steps 1-5 to wait for; both steps run through the staging adapter", async () => {
    const stagingUrl = "https://aware-wave.com/staging/acme";
    world.siteUrl = stagingUrl;
    const stagingEnv = envRow({});
    Object.assign(stagingEnv, { environment_type: "staging", hosting_provider: "ks-aw-01-staging-subdir", base_url: stagingUrl, wp_root_path: "/var/www/html/staging/acme", metadata: {} });
    const { db, tables } = fakeDb(seed({ environments: [stagingEnv], ops_action_runs: [] }));
    stubFetch(world);
    const gate = hostGate(world);
    // the real vhost step (not the stub): it cannot observe a staging site, and must not be waited for
    const d: EngineDeps = { ...engine(db, gate.transport), steps: SITE_STEP_DEFINITIONS };
    const m = await run(d, tables, "mainwp");
    expect(m.body.outcome, JSON.stringify(m.body)).toBe("completed");
    expect(world.mainwpAdds[0]).toMatchObject({ url: stagingUrl, admin: "admin" });
    const b = await run(d, tables, "bridge");
    expect(b.body.outcome, JSON.stringify(b.body)).toBe("completed");
    expect(gate.calls.every((c) => c.command === "staging-wp acme")).toBe(true);
    expect(tables.wp_sites.find((w) => w.url === stagingUrl)).toMatchObject({ organization_id: ORG });
    expect(await bridgeSiteOrg(db as never, stagingUrl)).toBe(ORG);
    // the parent install keeps its owner
    expect(await bridgeSiteOrg(db as never, "https://aware-wave.com")).toBe("org-aw");
    expect(everythingVisible(tables, gate.calls, [m.body, b.body])).not.toContain(theSecret());
  });
});

// ── switches off: nothing reaches MainWP writes, the vault or the host ───────

describe("catalog switches off (tonight's deploy ships with site.mainwp / site.bridge disabled)", () => {
  it("status, plan and execute with both switches off never add to MainWP, touch the vault or call the gate", async () => {
    const { db, tables } = fakeDb(seed({ ops_action_catalog: catalog(["mainwp", "bridge"]) }));
    const f = stubFetch(world);
    const gate = hostGate(world);
    const d = engine(db, gate.transport);
    await getSiteFlowStatus(d, { site: site(), environment: envOf(tables) });
    for (const step of ["mainwp", "bridge"] as const) {
      expect((await planStep(d, { site: site(), environment: envOf(tables), step })).status).toBe(403);
      const e = await executeStep(d, { site: site(), environment: envOf(tables), step, planHash: "0".repeat(64), actor });
      expect(e.status).toBe(403);
    }
    expect(f.mock.calls.filter(([, init]) => (init?.method ?? "GET") !== "GET")).toEqual([]);
    expect(vault.calls).toEqual([]);
    // the status page's host read (site-preflight, for steps 1-5) is the only gate call; nothing that changes the host
    expect(gate.calls.filter((c) => !/^site-(preflight|job) /.test(c.command))).toEqual([]);
    expect(tables.client_credentials).toEqual([]);
    expect(tables.wp_sites).toEqual(EXISTING_WP_SITES);
  });
});
