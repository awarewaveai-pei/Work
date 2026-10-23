/**
 * Record a payment the operator received outside any shop (ADR 017 step 4a: a bank transfer). Signs one local
 * PaymentEvent with PAYMENTS_LOCAL_SECRET (mcp/user-env.ps1; the same value is in the next-admin container) and posts
 * it to /api/webhooks/payments/local. Sending the same command twice records it once: the event id is
 * <kind>:<org>:<--ref>, so --ref (the transfer, refund or case reference) is required for every kind and must be new
 * for each real payment -- reusing one for a different payment is refused (event_id_reused), never silently skipped.
 *
 *   node scripts/record-payment.mjs credit_pack --org <billing account uuid> --units 500 --ref <transfer ref>
 *   node scripts/record-payment.mjs subscription_paid --org <uuid> --plan social_pro --until 2026-11-23 --ref <transfer ref>
 *   node scripts/record-payment.mjs subscription_canceled --org <uuid> --plan social_pro --ref <request ref>
 *   node scripts/record-payment.mjs refund --org <uuid> --ref <transfer ref of the pack>              (credit pack: only the unused part)
 *   node scripts/record-payment.mjs refund --org <uuid> --plan social_pro --ref <refund ref>          (subscription: access ends now)
 *   node scripts/record-payment.mjs chargeback --org <uuid> --ref <bank case>                          (suspends + freezes)
 *   node scripts/record-payment.mjs chargeback_cleared --org <uuid> --ref <bank case> --note "<review outcome>"  (lifts it)
 * --url (default https://app.aware-wave.com), --event-id (overrides the default id), --dry-run (print, send nothing).
 * The answer is the control plane's: {"ok":true,...} recorded, {"ok":true,"replayed":true} already recorded.
 */
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://app.aware-wave.com";

function flags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) throw new Error(`unexpected argument: ${argv[i]}`);
    const key = argv[i].slice(2);
    if (key === "dry-run") { out[key] = true; continue; }
    if (i + 1 >= argv.length) throw new Error(`--${key} needs a value`);
    out[key] = argv[++i];
  }
  return out;
}

/** Pure: arguments -> { url, body, signature }. Exported for the test that checks the app accepts what it signs. */
export function buildPayment(argv, secret) {
  const [kind, ...rest] = argv;
  const f = flags(rest);
  if (!f.org) throw new Error("--org <billing account uuid> is required");
  if (!f.ref) throw new Error("--ref <transfer, refund or case reference> is required: it makes this payment's event id");
  if (!secret || secret.length < 32) throw new Error("PAYMENTS_LOCAL_SECRET is missing or shorter than 32 characters");
  const base = { kind, organization_id: f.org };
  let event;
  if (kind === "credit_pack") event = { ...base, units: Number(f.units), order_ref: f.ref };
  else if (kind === "subscription_paid") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.until ?? "")) throw new Error("--until YYYY-MM-DD is required (end of the paid period, Taipei)");
    event = { ...base, plan_key: f.plan, period_end: `${f.until}T23:59:59+08:00`, ...(f.ref ? { external_ref: f.ref } : {}) };
  } else if (kind === "subscription_canceled") event = { ...base, plan_key: f.plan };
  else if (kind === "refund") event = f.plan ? { ...base, target: "subscription", plan_key: f.plan } : { ...base, target: "credit_pack", order_ref: f.ref };
  else if (kind === "chargeback") event = { ...base, ref: f.ref };
  else if (kind === "chargeback_cleared") event = { ...base, ...(f.note ? { note: f.note } : {}) };
  else throw new Error(`unknown kind "${kind}"`);
  const eventId = f["event-id"] ?? `${kind}:${f.org}:${f.ref}`;
  const body = JSON.stringify({ event_id: eventId, ...event });
  const signature = createHmac("sha256", secret).update(body, "utf8").digest("base64");
  return { url: `${(f.url ?? DEFAULT_URL).replace(/\/+$/, "")}/api/webhooks/payments/local`, body, signature, dryRun: f["dry-run"] === true };
}

async function main() {
  const p = buildPayment(process.argv.slice(2), (process.env.PAYMENTS_LOCAL_SECRET ?? "").trim());
  if (p.dryRun) { console.log(JSON.stringify({ url: p.url, body: JSON.parse(p.body) }, null, 2)); return; }
  const res = await fetch(p.url, { method: "POST", headers: { "content-type": "application/json", "x-awarewave-payment-signature": p.signature }, body: p.body });
  console.log(res.status, await res.text());
  if (!res.ok) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exitCode = 1; });
}
