// The page's only way to the server: /api/social/* (C4 routes; lib/social/http.ts says what each status means).
import type { Account, Brand, Post } from "./model";

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly detail?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  let json: { ok?: boolean; error?: string; detail?: unknown } & Record<string, unknown> = {};
  try {
    json = await res.json();
  } catch {
    // a proxy error page: the status says enough
  }
  if (!res.ok || json.ok === false) throw new ApiError(res.status, json.error ?? `HTTP ${res.status}`, json.detail);
  return json as T;
}

const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

export interface SavedRef { id: string; version: number }
export interface PostInput {
  fields: { body?: string; first_comment?: string | null; link_url?: string | null; link_utm?: boolean; notes?: string | null; source_url?: string | null };
  targets: Array<{ account_id: string; custom_body: string | null; format: string }>;
  /** omitted = unchanged (a post that went out keeps its media as sent) */
  media?: Array<{ media_id: string; alt_text: string | null }>;
}
export interface StateInput { action: string; scheduledAt?: string; listId?: string; listPosition?: number; reason?: string; confirmPublishNow?: boolean }
/** lib/content/wp-calendar.ts CalendarPost: date is the site's wall clock, no zone */
export interface WpPost { siteId: string; siteName: string; id: number; title: string; status: "draft" | "future" | "publish"; date: string; viewUrl?: string }
export interface ListRow { id: string; name: string; weekdays: number[]; send_time: string; active: boolean; cursor: number; accounts: Array<{ account_id: string }> }
export interface ListInput { name: string; weekdays: number[]; send_time: string; active: boolean; account_ids: string[] }
export interface LogRow { id: number; at: string; actor: string; action: string; post_id: string | null; detail: Record<string, unknown> | null }
export interface NeedsResult {
  failed: Array<{ id: string; body: string; scheduled_at: string | null; errors: string[] }>;
  expired: Array<{ id: string; platform: string; label: string }>;
  review: Array<{ id: string; body: string; scheduled_at: string | null }>;
  n: number;
}
export interface MediaItem { id: string; kind: string; file_name: string; postiz_path: string | null; bytes: number | null; created_at: string; used?: number }

export const api = {
  brands: () => call<{ brands: Brand[] }>("GET", "/api/social/brands"),
  accounts: (brand: string) => call<{ accounts: Account[]; connecting: { id: string; platform: string; started_at: string } | null; justConnected: string | null; connectFailed: string | null }>("GET", `/api/social/accounts?${q({ brand })}`),
  connect: (brand: string, platform: string, accountId?: string) => call<{ attemptId: string; url: string }>("POST", "/api/social/accounts", { brand, platform, accountId }),
  cancelConnect: (brand: string, attempt: string) => call<object>("DELETE", `/api/social/accounts?${q({ brand, attempt })}`),
  unlink: (brand: string, id: string) => call<object>("DELETE", `/api/social/accounts?${q({ brand, id })}`),
  posts: (brand: string, start: string, end: string, wp = false) =>
    call<{ posts: Post[]; undatedTruncated: boolean; wordpress?: WpPost[] }>("GET", `/api/social/posts?${q({ brand, start, end, ...(wp ? { wp: "1" } : {}) })}`),
  trash: (brand: string) => call<{ posts: Post[] }>("GET", `/api/social/posts?${q({ brand, trash: "1" })}`),
  create: (brand: string, input: PostInput) => call<{ post: SavedRef }>("POST", "/api/social/posts", { brand, ...input }),
  save: (brand: string, id: string, version: number, input: PostInput) => call<{ post: SavedRef }>("PUT", `/api/social/posts/${id}`, { brand, version, ...input }),
  get: (brand: string, id: string) => call<{ post: Post }>("GET", `/api/social/posts/${id}?${q({ brand })}`),
  setState: (brand: string, id: string, version: number, input: StateInput) => call<{ post: SavedRef }>("PUT", `/api/social/posts/${id}/state`, { brand, version, ...input }),
  bulk: (brand: string, items: Array<{ id: string; version: number } & StateInput>) =>
    call<{ results: Array<{ id: string; ok: boolean; error?: string; version?: number; state?: string }> }>("POST", "/api/social/posts/bulk", { brand, items }),
  media: (brand: string) => call<{ media: MediaItem[] }>("GET", `/api/social/media?${q({ brand })}`),
  upload: (brand: string, imageUrl: string, fileName: string) => call<{ media: MediaItem }>("POST", "/api/social/media", { brand, imageUrl, fileName }),
  lists: (brand: string) => call<{ lists: ListRow[] }>("GET", `/api/social/lists?${q({ brand })}`),
  list: (brand: string, id: string) => call<{ list: ListRow; items: Post[]; upcoming: Post[] }>("GET", `/api/social/lists/${id}?${q({ brand })}`),
  createList: (brand: string, input: ListInput) => call<{ id: string }>("POST", "/api/social/lists", { brand, ...input }),
  saveList: (brand: string, id: string, input: ListInput) => call<{ id: string }>("PUT", `/api/social/lists/${id}`, { brand, ...input }),
  deleteList: (brand: string, id: string) => call<object>("DELETE", `/api/social/lists/${id}?${q({ brand })}`),
  reorderList: (brand: string, id: string, postIds: string[]) => call<object>("PUT", `/api/social/lists/${id}/order`, { brand, postIds }),
  wpArticle: (brand: string, site: string, post: number) =>
    call<{ article: import("@/lib/social/wp-article").WpArticle }>("GET", `/api/social/wp-article?${q({ brand, site, post: String(post) })}`),
  log: (brand: string, before?: number) => call<{ log: LogRow[] }>("GET", `/api/social/log?${q({ brand, ...(before ? { before: String(before) } : {}) })}`),
  needs: (brand: string) => call<NeedsResult>("GET", `/api/social/needs?${q({ brand })}`),
  settings: (brand: string) => call<{ requireReview: boolean }>("GET", `/api/social/settings?${q({ brand })}`),
  setRequireReview: (brand: string, requireReview: boolean) => call<{ requireReview: boolean }>("PUT", "/api/social/settings", { brand, requireReview }),
  texts: (brand: string) => call<{ texts: Array<{ id: string; body: string }> }>("GET", `/api/social/texts?${q({ brand })}`),
  addText: (brand: string, body: string) => call<{ text: { id: string; body: string } }>("POST", "/api/social/texts", { brand, body }),
  deleteText: (brand: string, id: string) => call<object>("DELETE", `/api/social/texts?${q({ brand, id })}`),
};
