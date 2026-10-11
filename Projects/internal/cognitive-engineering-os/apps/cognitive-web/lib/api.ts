export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) { super(`API ${status}`); }
}

/** GETs of one list that may share a request (A1, 2026-10-11 walk: a page reading 60 kinds sent 60 requests and
 *  Cloudflare's 50-per-10-seconds rule locked the whole Wi-Fi out). Every call with the same ``key`` made before the
 *  current task's microtasks run is sent as ONE ``GET url(items)`` (at most ``max`` items each); ``pick`` takes one
 *  item's answer out of it. One distinct item = the caller's own path, as before. ``alone``: a batch failure that
 *  belongs to one item, not all (an unknown kind) -- then each item is asked alone, so each caller gets its own answer.
 *  A third argument, so ``init`` stays a plain RequestInit: a test that mocks apiFetch still sees (path, undefined), one
 *  call per item, exactly as before. */
export type Coalesce = { key: string; item: string; url: (items: string[]) => string; pick: (payload: unknown, item: string) => unknown; max: number; alone?: (error: ApiError) => boolean };

const prefix = () => process.env.NEXT_PUBLIC_API_PREFIX ?? "/api";

async function send<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${prefix()}${path}`, { ...init, credentials: "same-origin", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiError(0, "NETWORK_UNREACHABLE");   // never the browser's own English ("Failed to fetch")
  }
  // a body that is not JSON (Cloudflare's 429/502/504 HTML page) leaves no detail: humanError answers by status
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, payload?.detail ?? payload);
  return payload as T;
}

type Waiter = { path: string; item: string; resolve: (value: unknown) => void; reject: (reason: unknown) => void };
const pending = new Map<string, { coalesce: Coalesce; waiters: Waiter[] }>();

const own = (error: unknown) => (error instanceof ApiError ? new ApiError(error.status, error.detail) : error);
const copy = (value: unknown) => (Array.isArray(value) ? value.slice() : value);   // callers never share one array

async function flush(key: string) {
  const batch = pending.get(key)!;
  pending.delete(key);
  const { coalesce, waiters } = batch;
  const items = [...new Set(waiters.map((waiter) => waiter.item))];
  const alone = (item: string) => send<unknown>(waiters.find((waiter) => waiter.item === item)!.path);
  const answers = new Map<string, Promise<unknown>>();
  if (items.length === 1) answers.set(items[0], alone(items[0]));
  for (let start = 0; items.length > 1 && start < items.length; start += coalesce.max) {
    const chunk = items.slice(start, start + coalesce.max);
    const sent = chunk.length === 1 ? null : send<unknown>(coalesce.url(chunk));
    for (const item of chunk) {
      answers.set(item, sent === null ? alone(item) : sent.then((payload) => {
        const found = coalesce.pick(payload, item);
        if (found === undefined) throw new ApiError(502, "BATCH_ITEM_MISSING");
        return found;
      }, (error) => {
        if (error instanceof ApiError && coalesce.alone?.(error)) return alone(item);
        throw error;
      }));
    }
  }
  for (const waiter of waiters) answers.get(waiter.item)!.then((value) => waiter.resolve(copy(value)), (error) => waiter.reject(own(error)));
}

export async function apiFetch<T>(path: string, init?: RequestInit, coalesce?: Coalesce): Promise<T> {
  if (!coalesce || (init?.method ?? "GET") !== "GET") return send<T>(path, init);
  return new Promise<T>((resolve, reject) => {
    const found = pending.get(coalesce.key);
    const waiter: Waiter = { path, item: coalesce.item, resolve: resolve as (value: unknown) => void, reject };
    if (found) { found.waiters.push(waiter); return; }
    pending.set(coalesce.key, { coalesce, waiters: [waiter] });
    queueMicrotask(() => { void flush(coalesce.key); });
  });
}
