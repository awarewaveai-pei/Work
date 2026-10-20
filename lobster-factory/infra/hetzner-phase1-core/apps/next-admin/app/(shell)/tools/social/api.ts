// The page's only way to the server: /api/social/* (C4 routes; lib/social/http.ts says what each status means).
import type { Account, Brand, Post, Tag } from "./model";

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
  // repeat / auto_mode / comments / tags: migration 0105 (C21). comments replace first_comment: never send both
  fields: {
    body?: string; first_comment?: string | null; link_url?: string | null; link_utm?: boolean; notes?: string | null; source_url?: string | null;
    repeat?: import("./model").RepeatRule | null; auto_mode?: import("./model").AutoMode;
  };
  targets: Array<{ account_id: string; custom_body: string | null; format: string }>;
  /** omitted = unchanged (a post that went out keeps its media as sent) */
  media?: Array<{ media_id: string; alt_text: string | null }>;
  /** omitted = unchanged; the post's whole set in order (lib/social/posts.ts) */
  comments?: Array<{ body: string; delay_minutes: 0 | 1 | 5 | 60; media_id: string | null }>;
  tags?: string[];
}
/** lib/social/store.ts AutoRule (0105 social_auto_rules); post_id null = the brand's */
export interface AutoRule {
  id: string; post_id: string | null; name: string; trigger: "comment" | "dm"; keywords: string[]; platforms: string[];
  action: "reply" | "dm" | "both"; reply: string; active: boolean; hits: number;
}
export interface StateInput { action: string; scheduledAt?: string; listId?: string; listPosition?: number; reason?: string; confirmPublishNow?: boolean }
/** lib/content/wp-calendar.ts CalendarPost: date is the site's wall clock, no zone */
export interface WpPost { siteId: string; siteName: string; id: number; title: string; status: "draft" | "future" | "publish"; date: string; viewUrl?: string }
/** slots = the weekday x time grid (0105); weekdays / send_time follow it until C23 */
export interface ListRow {
  id: string; name: string; weekdays: number[]; send_time: string; active: boolean; cursor: number; accounts: Array<{ account_id: string }>;
  slots: Array<{ weekday: number; send_time: string }>;
}
export interface ListInput { name: string; weekdays: number[]; send_time: string; active: boolean; account_ids: string[]; slots?: Array<{ weekday: number; send_time: string }> }
export interface LogRow { id: number; at: string; actor: string; action: string; post_id: string | null; detail: Record<string, unknown> | null }
export interface NeedsResult {
  failed: Array<{ id: string; body: string; scheduled_at: string | null; errors: string[] }>;
  expired: Array<{ id: string; platform: string; label: string }>;
  review: Array<{ id: string; body: string; scheduled_at: string | null }>;
  n: number;
}
/** /api/social/members (0103); owners only */
export interface Member { user_id: string; email: string | null; role: import("@/lib/social/state").BrandRole; created_at: string }
export interface MediaItem { id: string; kind: string; file_name: string; postiz_path: string | null; bytes: number | null; created_at: string; used?: number }
export interface InboxRow {
  accountId: string;
  platform: string;
  label: string;
  handle: string | null;
  picture: string | null;
  chatwootInboxId: number | null;
  unread: number;
  chatwootUrl: string | null;
  status: "ok" | "unlinked" | "not_configured" | "unavailable";
}
export interface InboxData { inboxes: InboxRow[] }

export const api = {
  brands: () => call<{ brands: Brand[] }>("GET", "/api/social/brands"),
  accounts: (brand: string) => call<{ accounts: Account[]; connecting: { id: string; platform: string; started_at: string } | null; justConnected: string | null; connectFailed: string | null }>("GET", `/api/social/accounts?${q({ brand })}`),
  inbox: (brand: string) => call<InboxData>("GET", `/api/social/inbox?${q({ brand })}`),
  connect: (brand: string, platform: string, accountId?: string) => call<{ attemptId: string; url: string }>("POST", "/api/social/accounts", { brand, platform, accountId }),
  cancelConnect: (brand: string, attempt: string) => call<object>("DELETE", `/api/social/accounts?${q({ brand, attempt })}`),
  unlink: (brand: string, id: string) => call<object>("DELETE", `/api/social/accounts?${q({ brand, id })}`),
  posts: (brand: string, start: string, end: string, wp = false) =>
    call<{ posts: Post[]; undatedTruncated: boolean; tags: Tag[]; wordpress?: WpPost[] }>("GET", `/api/social/posts?${q({ brand, start, end, ...(wp ? { wp: "1" } : {}) })}`),
  trash: (brand: string) => call<{ posts: Post[]; deletions: Record<string, { actor: string; from: string | null }> }>("GET", `/api/social/posts?${q({ brand, trash: "1" })}`),
  create: (brand: string, input: PostInput) => call<{ post: SavedRef }>("POST", "/api/social/posts", { brand, ...input }),
  save: (brand: string, id: string, version: number, input: PostInput) => call<{ post: SavedRef }>("PUT", `/api/social/posts/${id}`, { brand, version, ...input }),
  get: (brand: string, id: string) => call<{ post: Post }>("GET", `/api/social/posts/${id}?${q({ brand })}`),
  setState: (brand: string, id: string, version: number, input: StateInput) => call<{ post: SavedRef }>("PUT", `/api/social/posts/${id}/state`, { brand, version, ...input }),
  bulk: (brand: string, items: Array<{ id: string; version: number } & StateInput>) =>
    call<{ results: Array<{ id: string; ok: boolean; error?: string; version?: number; state?: string }> }>("POST", "/api/social/posts/bulk", { brand, items }),
  media: (brand: string) => call<{ media: MediaItem[] }>("GET", `/api/social/media?${q({ brand })}`),
  upload: (brand: string, imageUrl: string, fileName: string) => call<{ media: MediaItem }>("POST", "/api/social/media", { brand, imageUrl, fileName }),
  uploadVideo: (brand: string, videoUrl: string, fileName: string) => call<{ media: MediaItem }>("POST", "/api/social/media", { brand, videoUrl, fileName }),
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
  members: (brand: string) => call<{ members: Member[] }>("GET", `/api/social/members?${q({ brand })}`),
  addMember: (brand: string, email: string, role: string) => call<{ userId: string }>("POST", "/api/social/members", { brand, email, role }),
  setMemberRole: (brand: string, userId: string, role: string) => call<object>("PATCH", "/api/social/members", { brand, userId, role }),
  removeMember: (brand: string, userId: string) => call<object>("DELETE", `/api/social/members?${q({ brand, userId })}`),
  texts: (brand: string) => call<{ texts: Array<{ id: string; body: string; mediaIds: string[] }> }>("GET", `/api/social/texts?${q({ brand })}`),
  addText: (brand: string, body: string, mediaIds: string[] = []) => call<{ text: { id: string; body: string; mediaIds: string[] } }>("POST", "/api/social/texts", { brand, body, mediaIds }),
  deleteText: (brand: string, id: string) => call<object>("DELETE", `/api/social/texts?${q({ brand, id })}`),
  // C21: tags and a post's own auto-reply rule (a rule's save moves its post's version: the next write uses postVersion)
  tags: (brand: string) => call<{ tags: import("./model").Tag[] }>("GET", `/api/social/tags?${q({ brand })}`),
  saveTag: (brand: string, id: string | null, name: string, colour: string) => call<{ id: string }>("POST", "/api/social/tags", { brand, id, name, colour }),
  deleteTag: (brand: string, id: string) => call<object>("DELETE", `/api/social/tags?${q({ brand, id })}`),
  autoRules: (brand: string, post?: string) => call<{ rules: AutoRule[] }>("GET", `/api/social/auto-rules?${q({ brand, ...(post ? { post } : {}) })}`),
  saveAutoRule: (brand: string, id: string | null, rule: Omit<AutoRule, "id" | "hits">) =>
    call<{ id: string; postVersion: number | null }>("POST", "/api/social/auto-rules", { brand, id, rule }),
  deleteAutoRule: (brand: string, id: string) => call<{ postVersion: number | null }>("DELETE", `/api/social/auto-rules?${q({ brand, id })}`),
  // C26: the brand's smart link page (lib/social/smartlink.ts)
  smartLink: (brand: string) => call<SmartLinkData>("GET", `/api/social/smartlink?${q({ brand })}`),
  saveSmartLink: (brand: string, link: SmartLinkData["link"] & object, items: Array<{ id?: string; title: string; url: string; active: boolean }>) =>
    call<{ slug: string }>("PUT", "/api/social/smartlink", { brand, link, items }),
  // C24: 數據分析; account null = every channel
  metrics: (brand: string, days: number, account: string | null) =>
    call<{ analytics: import("@/lib/social/metrics").Analytics }>("GET", `/api/social/metrics?${q({ brand, days: String(days), ...(account ? { account } : {}) })}`),
  // C25: 報表管理
  reports: (brand: string) => call<{ reports: import("@/lib/social/reports").Report[] }>("GET", `/api/social/reports?${q({ brand })}`),
  reportPreview: (brand: string, from: string, to: string, accounts: string[]) =>
    call<{ data: import("@/lib/social/reports").ReportData }>("GET", `/api/social/reports?${q({ brand, preview: "1", from, to, accounts: accounts.join(",") })}`),
  createReport: (brand: string, r: import("@/lib/social/reports").ReportSpec) => call<{ id: string }>("POST", "/api/social/reports", { brand, ...r }),
  deleteReport: (brand: string, id: string) => call<object>("DELETE", `/api/social/reports?${q({ brand, id })}`),
  report: (id: string) => call<{ report: import("@/lib/social/reports").Report; data: import("@/lib/social/reports").ReportData }>("GET", `/api/social/reports/${id}`),
  monthly: (brand: string) => call<{ monthly: { enabled: boolean; lastRunAt: string | null; lastError: string | null } }>("GET", `/api/social/reports/monthly?${q({ brand })}`),
  setMonthly: (brand: string, enabled: boolean) => call<{ monthly: { enabled: boolean; lastRunAt: string | null; lastError: string | null } }>("PUT", "/api/social/reports/monthly", { brand, enabled }),
};
/** GET /api/social/smartlink; base = the public address up to the slug; clicks = the brand's last 28 days */
export interface SmartLinkData {
  link: { slug: string; title: string; bio: string; colour: import("./model").Tag["colour"]; published: boolean } | null;
  items: Array<{ id: string; title: string; url: string; active: boolean; clicks: number }>;
  suggested: string; base: string;
}
