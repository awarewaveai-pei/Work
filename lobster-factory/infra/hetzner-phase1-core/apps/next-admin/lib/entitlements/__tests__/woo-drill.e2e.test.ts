// ADR 017 4b-9, local half: a real WordPress + WooCommerce + aware-wave-store (tests/e2e/woo-drill) pays an order the way a
// card gateway does, and its plugin's signed event reaches the real payment route and database. Run only by
//   python lobster-factory/infra/hetzner-phase1-core/tests/e2e/entitlements/entitlements-real-db.py --suite woo-drill
// (needs Docker; skipped otherwise). The member is linked beforehand: making an account needs GoTrue, which this harness
// does not run (that path has its own tests). Subscriptions need WooCommerce Subscriptions (paid) and stay for the live drill.
import { execFile } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startRestProxy } from "./real-db";

const REST = process.env.ENTITLEMENTS_REST;
const PORT = 39123;
const SECRET = "woo-drill-secret-0123456789-0123456789-01";
const ORG = "00000000-0000-4000-8000-0000000000b9";
const USER = "00000000-0000-4000-8000-0000000000ba";
const DIR = path.resolve(__dirname, "../../../../../tests/e2e/woo-drill");
const env = { ...process.env, DRILL_RECEIVER_PORT: String(PORT), MSYS_NO_PATHCONV: "1" };
// Async on purpose: WordPress calls the receiver in this process while a `wp` command runs; a sync exec would block the
// event loop, the plugin would time out after 15 s and record a retry instead of the delivery.
const run = promisify(execFile);
const compose = async (...a: string[]) => (await run("docker", ["compose", ...a], { cwd: DIR, env, encoding: "utf8" })).stdout;
const wp = (...a: string[]) => compose("exec", "-T", "cli", "wp", ...a);
/** One drill.php step; it prints one JSON line last. */
const step = async (...a: string[]) => JSON.parse((await wp("eval-file", "/tmp/drill.php", ...a)).trim().split("\n").pop() as string);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!REST)("WooCommerce to the payment route, end to end (4b-9 local)", () => {
  let proxy: http.Server;
  let receiver: http.Server;
  let db: SupabaseClient;
  let ids: { product_id: number; wp_user_id: number };
  const answered: string[] = [];   // what the route told the plugin, for a failure message
  const rows = async (table: string, filter: Record<string, string>) => {
    let q = db.from(table).select("*");
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    return data as Array<Record<string, unknown>>;
  };
  const balance = async () => Number((await db.rpc("entitlement_credit_balance", { p_organization_id: ORG })).data);
  const runQueue = () => wp("action-scheduler", "run", "--hooks=awbridge_send_payment_event");
  /** Runs the plugin's queue until the order carries the plugin's "sent" note for `eventId`: the note is written after the
   *  route answered, so the route's database writes are done by then (Action Scheduler may also run the queue on its own). */
  const sentNote = (eventId: string) => `AwareWave：已送付款事件 ${eventId}（HTTP 200）。`;
  const notes = async (orderId: number) => (await step("notes", String(orderId))).notes as string[];
  const deliver = async (orderId: number, eventId: string) => {
    for (let i = 0; i < 15; i++) {
      await runQueue();
      if ((await notes(orderId)).includes(sentNote(eventId))) return;
      await pause(1000);
    }
    throw new Error(`${eventId} never sent: notes ${JSON.stringify(await notes(orderId))} route ${JSON.stringify(answered)}`);
  };

  beforeAll(async () => {
    proxy = await startRestProxy(REST as string);
    Object.assign(process.env, { PAYMENTS_PROVIDERS: "woo", PAYMENTS_WOO_SECRET: SECRET });
    db = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
    // The receiver = the production route handler, behind a plain HTTP listener the WordPress relay can reach.
    const { POST } = await import("../../../app/api/webhooks/payments/[provider]/route");
    receiver = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        const provider = /\/api\/webhooks\/payments\/([a-z]+)$/.exec(req.url ?? "")?.[1] ?? "";
        const r = await POST(new Request(`http://app.test${req.url}`, { method: "POST", headers: req.headers as Record<string, string>, body }),
          { params: Promise.resolve({ provider }) });
        const text = await r.text();
        answered.push(`${r.status} ${text.slice(0, 200)}`);
        res.writeHead(r.status, { "content-type": "application/json" });
        res.end(text);
      });
    });
    await new Promise<void>((ok) => receiver.listen(PORT, "0.0.0.0", ok));

    await compose("up", "-d");
    for (let i = 0; i < 60; i++) {
      try { await wp("db", "check"); break; } catch { await pause(2000); }
    }
    await compose("cp", "drill.php", "cli:/tmp/drill.php");
    await wp("core", "install", "--url=http://localhost", "--title=drill", "--admin_user=admin", "--admin_password=drill-admin-pass-0001",
      "--admin_email=admin@drill.test", "--skip-email");
    await wp("plugin", "install", "woocommerce", "--activate");
    await wp("plugin", "activate", "aware-wave-store");
    ids = await step("setup", `http://localhost:${PORT}`, SECRET);

    const { data: site } = await db.from("seller_sites").select("id").eq("key_id", "aware-wave-com").single();
    for (const [table, value] of [
      ["organizations", { id: ORG, type: "client", name: "Drill Member", slug: `wp-member-${ids.wp_user_id}`, kind: "customer" }],
      ["profiles", { id: USER, email: "member@drill.test", default_organization_id: ORG }],
      ["customer_identities", { provider: "awarewave-wp", site_id: (site as { id: string }).id, external_id: String(ids.wp_user_id), user_id: USER, organization_id: ORG }],
    ] as const) {
      const { error } = await db.from(table).insert(value);
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }, 600_000);

  afterAll(async () => {
    try { await compose("down", "-v"); } catch { /* the stack carries the awarewave.test label for a manual sweep */ }
    await new Promise<void>((ok) => receiver?.close(() => ok()));
    await new Promise<void>((ok) => proxy?.close(() => ok()));
  }, 120_000);

  it("a paid credit pack order reaches the route once and tops up the member's wallet; a full refund takes it back", async () => {
    const order = await step("order", String(ids.product_id), String(ids.wp_user_id));
    expect(order).toMatchObject({ status: "processing" });
    const eventId = `wc:payment_complete:${order.order_id}:credit_pack`;
    await deliver(order.order_id, eventId);
    // the plugin queues one job per hook (payment_complete and status processing); the inbox keeps one row
    expect(await rows("payment_events", { event_id: eventId })).toEqual([expect.objectContaining({ provider: "woo", kind: "credit_pack", organization_id: ORG })]);
    expect(await balance()).toBe(100);

    expect(await step("refund", String(order.order_id))).toMatchObject({ status: "refunded" });
    const refunds = () => rows("payment_events", { organization_id: ORG, kind: "refund" });
    for (let i = 0; i < 15 && (await refunds()).length === 0; i++) {
      await runQueue();
      await pause(1000);
    }
    const [refund] = await refunds();
    expect(refund).toMatchObject({ provider: "woo" });
    await deliver(order.order_id, refund.event_id as string);
    expect(await balance()).toBe(0);
  }, 180_000);
});
