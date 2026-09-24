// HCI-30 fetch runner -- bounded in-memory job store (TASKS.md "jobs Map 無 TTL/淘汰").
// In-memory only, as before: a restart still loses all job state (Task 8 owns durable persistence).
//
// Invariant: memory is bounded AND a job processJob is still mutating is never removed (the Task 9
// orchestrator would 404 mid-poll). Both hold only by refusing admission when every slot is in flight,
// so set() returns false instead of growing past maxJobs. In-flight jobs are time-bounded by
// processJob's own timeouts (ready-wait + fetch deadline + object-storage timeout).
// Pitfall: IN_FLIGHT_STATUSES must match orchestrate-discovered-fetch.mjs's set of the same name.

export const DEFAULT_JOB_TTL_MS = 60 * 60 * 1000;
export const DEFAULT_MAX_JOBS = 1000;

const IN_FLIGHT_STATUSES = new Set(['queued', 'fetching']);

function readPositiveInt(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  return n;
}

/** Throws on an invalid override -- server.mjs calls this at module load and refuses to start. */
export function loadJobStoreConfigFromEnv(env = process.env) {
  return {
    ttlMs: readPositiveInt(env, 'HCI_FETCH_RUNNER_JOB_TTL_MS', DEFAULT_JOB_TTL_MS),
    maxJobs: readPositiveInt(env, 'HCI_FETCH_RUNNER_JOB_MAX', DEFAULT_MAX_JOBS),
  };
}

/**
 * TTL counts from set() time and applies to finished jobs only. get() hides an expired job even
 * before the next sweep, so /status answers 404 exactly when TTL says it is gone.
 */
export function createJobStore({ ttlMs = DEFAULT_JOB_TTL_MS, maxJobs = DEFAULT_MAX_JOBS, now = Date.now } = {}) {
  // Map iteration order = insertion order = storedAt order (ids are fresh UUIDs, set once each).
  const entries = new Map();

  const isFinished = (job) => !IN_FLIGHT_STATUSES.has(job.status);
  const isExpired = (entry, t) => isFinished(entry.job) && t - entry.storedAt >= ttlMs;

  function sweep() {
    const t = now();
    let removed = 0;
    for (const [id, entry] of entries) {
      if (isExpired(entry, t)) {
        entries.delete(id);
        removed++;
      }
    }
    return removed;
  }

  function evictOldestFinished() {
    for (const [id, entry] of entries) {
      if (isFinished(entry.job)) {
        entries.delete(id);
        return true;
      }
    }
    return false;
  }

  function set(id, job) {
    sweep();
    while (entries.size >= maxJobs) {
      if (!evictOldestFinished()) return false;
    }
    entries.set(id, { job, storedAt: now() });
    return true;
  }

  function get(id) {
    const entry = entries.get(id);
    if (!entry) return undefined;
    if (isExpired(entry, now())) {
      entries.delete(id);
      return undefined;
    }
    return entry.job;
  }

  return {
    set,
    get,
    sweep,
    get size() {
      return entries.size;
    },
  };
}
