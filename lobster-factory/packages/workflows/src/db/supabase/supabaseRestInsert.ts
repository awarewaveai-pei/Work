export type SupabaseRestConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

export type SupabaseRestInsertOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  traceId?: string;
  /**
   * Extra PostgREST filters AND-ed onto a PATCH alongside `id=eq.<rowId>`.
   * Values are raw PostgREST operators, e.g. `{ status: "eq.pending" }`.
   * Used for atomic compare-and-swap claims (M10): a PATCH that matches 0 rows
   * returns an empty representation, so the caller can detect a lost race.
   */
  match?: Record<string, string>;
  onAttempt?: (ctx: {
    attempt: number;
    table: string;
    traceId: string;
    status?: number;
    error?: string;
  }) => void;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Phase 1: do not call by default.
 * This adapter exists so later you can execute the returned row payloads via PostgREST.
 */
export async function supabaseRestInsert(
  config: SupabaseRestConfig,
  table: string,
  row: Record<string, unknown>,
  options: SupabaseRestInsertOptions = {}
) {
  const fetchImpl = (globalThis as any).fetch as typeof fetch;
  if (!fetchImpl) throw new Error("global fetch is not available in this runtime");

  const maxRetries = Math.max(0, Number(options.maxRetries ?? 2));
  const baseDelayMs = Math.max(50, Number(options.baseDelayMs ?? 250));
  const traceId = options.traceId ?? `trace-${Date.now()}`;

  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const res = await fetchImpl(`${config.supabaseUrl}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        "x-lobster-trace-id": traceId,
      },
      body: JSON.stringify([row]),
    });

    if (res.ok) {
      options.onAttempt?.({ attempt, table, traceId, status: res.status });
      const json = (await res.json()) as unknown;
      return json;
    }

    const text = await res.text().catch(() => "");
    lastError = `${res.status} ${res.statusText} ${text}`.trim();
    options.onAttempt?.({
      attempt,
      table,
      traceId,
      status: res.status,
      error: lastError,
    });

    const retryable = res.status >= 500 || res.status === 429;
    if (!retryable || attempt >= maxRetries) break;

    const delay = baseDelayMs * 2 ** attempt;
    await sleep(delay);
  }

  throw new Error(
    `Supabase REST insert failed for ${table} [traceId=${traceId}] after ${
      maxRetries + 1
    } attempts: ${lastError}`
  );
}

/**
 * PATCH a single row by primary key `id` (PostgREST `id=eq.<uuid>`).
 */
export async function supabaseRestPatch(
  config: SupabaseRestConfig,
  table: string,
  rowId: string,
  patch: Record<string, unknown>,
  options: SupabaseRestInsertOptions = {}
) {
  const fetchImpl = (globalThis as any).fetch as typeof fetch;
  if (!fetchImpl) throw new Error("global fetch is not available in this runtime");

  const maxRetries = Math.max(0, Number(options.maxRetries ?? 2));
  const baseDelayMs = Math.max(50, Number(options.baseDelayMs ?? 250));
  const traceId = options.traceId ?? `trace-${Date.now()}`;
  let url = `${config.supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(rowId)}`;
  if (options.match) {
    for (const [k, v] of Object.entries(options.match)) {
      url += `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
    }
  }

  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const res = await fetchImpl(url, {
      method: "PATCH",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        "x-lobster-trace-id": traceId,
      },
      body: JSON.stringify(patch),
    });

    if (res.ok) {
      options.onAttempt?.({ attempt, table, traceId, status: res.status });
      const text = await res.text();
      if (!text) return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    }

    const text = await res.text().catch(() => "");
    lastError = `${res.status} ${res.statusText} ${text}`.trim();
    options.onAttempt?.({
      attempt,
      table,
      traceId,
      status: res.status,
      error: lastError,
    });

    const retryable = res.status >= 500 || res.status === 429;
    if (!retryable || attempt >= maxRetries) break;

    const delay = baseDelayMs * 2 ** attempt;
    await sleep(delay);
  }

  throw new Error(
    `Supabase REST patch failed for ${table} id=${rowId} [traceId=${traceId}] after ${
      maxRetries + 1
    } attempts: ${lastError}`
  );
}

/**
 * GET rows from a table using PostgREST filter params.
 * filters: e.g. { status: "eq.queued", limit: 10, order: "created_at.asc" }
 */
export async function supabaseRestQuery(
  config: SupabaseRestConfig,
  table: string,
  filters: Record<string, string | number> = {}
): Promise<unknown[]> {
  const fetchImpl = (globalThis as any).fetch as typeof fetch;
  if (!fetchImpl) throw new Error("global fetch is not available in this runtime");

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    params.set(k, String(v));
  }
  const url = `${config.supabaseUrl}/rest/v1/${table}?${params.toString()}`;

  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      "apikey":        config.serviceRoleKey,
      "Authorization": `Bearer ${config.serviceRoleKey}`,
      "Accept":        "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase REST query failed for ${table}: ${res.status} ${text}`);
  }

  return res.json() as Promise<unknown[]>;
}

