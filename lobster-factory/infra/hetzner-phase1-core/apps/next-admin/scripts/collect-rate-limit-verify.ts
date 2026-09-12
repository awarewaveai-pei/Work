// Verify migration 0082's collection_rate_limit_take() against a real Postgres, in a throwaway
// container -- same pattern as packages/db/scripts/kb-local-verify.sh, but the assertion is PARITY:
// the SQL function must return exactly what lib/collect/net/rate-limit.ts's own nextBucket() would
// compute for the identical sequence of requests. Importing nextBucket() directly (via the app's own
// "@/*" alias -- this file lives under apps/next-admin so tsx resolves it, unlike packages/db which
// has no such alias) is what makes this a drift check instead of two independent guesses agreeing by
// luck.
//
// Usage (from apps/next-admin): npx tsx scripts/collect-rate-limit-verify.ts     (needs docker)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nextBucket, type BucketState, type TakeRequest } from "@/lib/collect/net/rate-limit";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(HERE, "../../../../../packages/db");
const CONTAINER = `rl-verify-${process.pid}`;
const IMAGE = "supabase/postgres:15.8.1.085"; // matches prod, per kb-local-verify.sh's own note

function run(cmd: string, args: string[], input?: string): { status: number; out: string } {
  const r = spawnSync(cmd, args, { input, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return { status: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function psqlRun(sql: string): string {
  const r = run("docker", ["exec", "-i", CONTAINER, "psql", "-h", "127.0.0.1", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-tAc", sql]);
  if (r.status !== 0) throw new Error(`psql failed: ${r.out}`);
  return r.out.trim();
}

function psqlFile(file: string): void {
  const r = run("docker", ["exec", "-i", CONTAINER, "psql", "-h", "127.0.0.1", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-f", "-"], fs.readFileSync(file, "utf8"));
  if (r.status !== 0) throw new Error(`psql -f ${file} failed: ${r.out}`);
}

/** Calls the DB function for one request. Mirrors RateLimiter.take()'s own call shape. */
function dbTake(host: string, req: TakeRequest): number {
  const minInterval = req.minIntervalMs === undefined ? "NULL" : String(req.minIntervalMs);
  const out = psqlRun(
    `SELECT collection_rate_limit_take('${host.replace(/'/g, "''")}', ${req.ratePerSecond}, ${req.burst}, ${minInterval}, ${req.now})`,
  );
  return Number(out);
}

function cleanup() {
  run("docker", ["rm", "-f", CONTAINER]);
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  cleanup();
  process.exit(1);
}

function main() {
  console.log(`▶ starting ${IMAGE} as ${CONTAINER}`);
  run("docker", ["run", "-d", "--name", CONTAINER, "-e", "POSTGRES_PASSWORD=verify", "-e", "POSTGRES_DB=postgres", IMAGE]);

  let ready = false;
  for (let i = 0; i < 120; i++) {
    const r = run("docker", ["exec", CONTAINER, "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", "postgres", "-c", "SELECT 1"]);
    if (r.status === 0) {
      ready = true;
      break;
    }
    spawnSync("sleep", ["1"]);
  }
  if (!ready) fail("postgres never became reachable in the container");

  console.log("▶ bootstrapping roles 0082's RLS grants reference");
  psqlRun(
    "DO $$ BEGIN " +
      "IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF; " +
      "IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF; " +
      "IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; " +
      "END $$;",
  );

  console.log("▶ applying 0082 (durable per-host rate-limit bucket)");
  psqlFile(path.join(DB_DIR, "migrations", "0082_collection_rate_limit_buckets.sql"));

  console.log("▶ proving the harness can fail (a green run of a dead harness proves nothing)");
  let selfTestRaised = false;
  try {
    psqlRun("DO $$ BEGIN ASSERT false, 'harness self-test'; END $$");
  } catch (e) {
    selfTestRaised = String(e).includes("harness self-test");
  }
  if (!selfTestRaised) fail("ASSERT does not raise here -- parity failures below would be no-ops too");
  console.log("  self-test raised as expected");

  console.log("▶ parity: randomised request sequences vs. nextBucket() in-process");
  let rng = 42;
  const rand = () => {
    // xorshift32 -- deterministic across runs so a failure is reproducible without seeding argv.
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    return ((rng >>> 0) % 100000) / 100000;
  };

  let cases = 0;
  // host 8 pins minIntervalMs to an explicit 0 for every step -- nextBucket()'s guard is
  // `req.minIntervalMs && ...` (0 is falsy in JS, so this must behave IDENTICALLY to "no interval
  // floor"), which the random 200-2200ms range below never exercises. Critic finding 2026-09-12:
  // the SQL's naive `IS NOT NULL` guard treated explicit 0 as "wait if since_last < 0" instead --
  // masked today by an unrelated invariant, but a landmine. Migration now guards `<> 0` too.
  for (let host = 0; host < 9; host++) {
    const hostName = `host-${host}.example.test`;
    let jsState: BucketState | null = null;
    let now = 1_000_000_000_000; // fixed epoch base, not Date.now() -- reproducible
    const rate = 0.5 + rand() * 4.5; // 0.5..5 req/s
    const burst = 1 + Math.floor(rand() * 5); // 1..5
    const pinZeroInterval = host === 8;
    const useInterval = pinZeroInterval || rand() < 0.5;
    const minIntervalMs = pinZeroInterval ? 0 : useInterval ? Math.floor(200 + rand() * 2000) : undefined;

    for (let step = 0; step < 25; step++) {
      // Advance time by a mix of "way ahead" (bucket fully refills) and "right on top of the last
      // request" (the case most likely to disagree between two independent implementations).
      now += rand() < 0.3 ? Math.floor(rand() * 50) : Math.floor(rand() * 5000);
      const req: TakeRequest = { host: hostName, ratePerSecond: rate, burst, minIntervalMs, now };

      const { state: expectedState, waitMs: expectedWait } = nextBucket(jsState, req);
      jsState = expectedState;

      const actualWait = dbTake(hostName, req);
      cases++;
      if (actualWait !== expectedWait) {
        fail(
          `parity mismatch host=${hostName} step=${step} req=${JSON.stringify(req)} expected=${expectedWait} actual=${actualWait}`,
        );
      }
    }
  }
  console.log(`  ${cases} request/response pairs matched nextBucket() exactly`);

  console.log("▶ concurrency: two simultaneous first-ever requests for one host must not both be granted");
  const freshHost = "concurrent.example.test";
  const now2 = 2_000_000_000_000;
  const req2 = `('${freshHost}', 1, 1, NULL, ${now2})`;
  // Two real, separate docker exec processes racing the SAME row -- not two awaits in one Node
  // process, which would not exercise Postgres's own row locking at all.
  const child = () =>
    run("docker", [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tAc",
      `SELECT collection_rate_limit_take${req2}`,
    ]);
  const [ra, rb] = [child(), child()];
  const waits = [Number(ra.out.trim()), Number(rb.out.trim())];
  const grantedCount = waits.filter((w) => w === 0).length;
  if (grantedCount !== 1) {
    fail(`expected exactly 1 of 2 concurrent first-requests granted with burst=1, got waits=${JSON.stringify(waits)}`);
  }
  console.log(`  waits=${JSON.stringify(waits)} -- exactly one granted, as burst=1 requires`);

  console.log("▶ applying the down migration, then re-applying (a migration you cannot re-apply is not a rollback path)");
  psqlFile(path.join(DB_DIR, "scripts", "0082_collection_rate_limit_buckets_down.sql"));
  const afterDown = psqlRun(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'collection_rate_limit_buckets')",
  );
  if (afterDown !== "f") fail(`down migration did not drop the table (EXISTS = ${afterDown})`);
  psqlFile(path.join(DB_DIR, "migrations", "0082_collection_rate_limit_buckets.sql"));
  const reapplyWait = dbTake("reapply.example.test", { host: "reapply.example.test", ratePerSecond: 1, burst: 1, now: 3_000_000_000_000 });
  if (reapplyWait !== 0) fail(`re-applied migration behaved unexpectedly: first request wait=${reapplyWait}, expected 0`);
  console.log("  DOWN_OK, re-apply OK");

  cleanup();
  console.log(`✅ collection_rate_limit_take verified: ${cases} parity cases + concurrency + down/re-apply`);
}

try {
  main();
} catch (e) {
  console.error(e);
  cleanup();
  process.exit(1);
}
