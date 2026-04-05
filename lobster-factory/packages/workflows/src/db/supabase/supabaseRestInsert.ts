export type SupabaseRestConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

export type SupabaseRestInsertOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  traceId?: string;
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
  const url = `${config.supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(rowId)}`;

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

