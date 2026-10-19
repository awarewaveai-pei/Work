import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { OpsRole } from "@/lib/ops-contracts";
import { fetchRemoteFile } from "@/lib/collect/net/remote-file";

export type SocialPlatform =
  | "instagram"
  | "facebook"
  | "reddit"
  | "linkedin"
  | "x"
  | "threads"
  | "tiktok"
  | "pinterest"
  | "bluesky";

export type SocialChannel = {
  clientId: string;
  postizIntegrationId: string;
  platform: SocialPlatform;
  label: string;
  status: "connected" | "disabled" | "expired";
};

export type PostizMediaRef = { id: string; path: string };

export type PostizPostResult = {
  platform: string;
  integrationId: string;
  status: "ok" | "error";
  postizPostId?: string;
  noId?: true;
  error?: string;
};

type PostizConfig = { baseUrl: string; apiKey: string };

export function getPostizConfig(): PostizConfig {
  const baseUrl = process.env.POSTIZ_API_BASE_URL;
  const apiKey = process.env.POSTIZ_API_KEY;
  if (!baseUrl) throw new Error("POSTIZ_API_BASE_URL env var not set");
  if (!apiKey) throw new Error("POSTIZ_API_KEY env var not set");
  return { baseUrl, apiKey };
}

// A remote image or video is fetched through collect (lib/collect/net/remote-file.ts): the address gate on every
// redirect hop, the connection pinned to the checked address, the byte cap read as a stream.

// Max image bytes accepted for upload (10 MB)
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// Fetch timeout for remote image download (20 s)
const IMAGE_FETCH_TIMEOUT_MS = 20_000;

// Max video bytes accepted for upload (200 MB)
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
// Fetch timeout for remote video download (2 min)
const VIDEO_FETCH_TIMEOUT_MS = 120_000;

/**
 * Preferred video format per platform.
 * 9x16 = vertical short-form (TikTok/IG Reels/Threads)
 * 4x5  = portrait feed (IG Feed/FB/Pinterest)
 * 16x9 = landscape standard (LinkedIn/Reddit/X/Bluesky)
 */
export const PLATFORM_VIDEO_FORMAT: Record<string, "16x9" | "9x16" | "4x5"> = {
  tiktok:    "9x16",
  instagram: "9x16",
  threads:   "9x16",
  facebook:  "4x5",
  pinterest: "4x5",
  linkedin:  "16x9",
  reddit:    "16x9",
  x:         "16x9",
  bluesky:   "16x9",
  youtube:   "16x9",
};

export type RawIntegration = {
  id: string;
  name: string;
  identifier: string;
  picture: string | null;
  disabled: boolean;
  profile: string;
};

async function fetchPostizIntegrations(cfg: PostizConfig): Promise<RawIntegration[]> {
  const res = await fetch(`${cfg.baseUrl}/public/v1/integrations`, {
    headers: { Authorization: cfg.apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),   // the sender holds a send lease while it waits (review 2026-10-15 R5)
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`Postiz /integrations returned ${res.status}: ${body}`);
  }
  return res.json() as Promise<RawIntegration[]>;
}

export async function listAllIntegrations(): Promise<RawIntegration[]> {
  const cfg = getPostizConfig();
  return fetchPostizIntegrations(cfg);
}

export async function listIntegrations(clientId: string): Promise<SocialChannel[]> {
  const db = getSupabaseWriteClient();
  if (!db) throw new Error("Supabase client not configured");

  const { data: rows, error } = await db
    .from("social_accounts")
    .select("postiz_integration_id, platform, label, status")
    .eq("organization_id", clientId);

  if (error) throw new Error(`social_accounts query failed: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  const cfg = getPostizConfig();
  const live = await fetchPostizIntegrations(cfg);
  const liveMap = new Map(live.map((i) => [i.id, i]));

  return rows.map((row) => {
    const liveEntry = liveMap.get(row.postiz_integration_id);
    const status: SocialChannel["status"] =
      !liveEntry || liveEntry.disabled ? "disabled" : (row.status as SocialChannel["status"]);
    return {
      clientId,
      postizIntegrationId: row.postiz_integration_id,
      platform: row.platform as SocialPlatform,
      label: row.label || liveEntry?.name || row.platform,   // 0096 copied a missing label as ''
      status,
    };
  });
}

export async function uploadMedia(opts: {
  imageUrl: string;
  filename?: string;
}): Promise<PostizMediaRef> {
  const { imageUrl, filename = "image.webp" } = opts;
  const cfg = getPostizConfig();

  let buffer: Buffer;
  let mimeType = "image/webp";

  if (imageUrl.startsWith("data:")) {
    const comma = imageUrl.indexOf(",");
    if (comma === -1) throw new Error("Invalid data URL: missing comma");
    const meta = imageUrl.slice(5, comma);
    const [mime] = meta.split(";");
    mimeType = mime || "image/webp";
    const b64 = imageUrl.slice(comma + 1);
    buffer = Buffer.from(b64, "base64");
    if (buffer.length === 0) throw new Error("base64 decode produced empty buffer");
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(`Image too large: ${buffer.length} bytes (max ${MAX_IMAGE_BYTES})`);
    }
  } else {
    const file = await fetchRemoteFile(imageUrl, {
      maxBytes: MAX_IMAGE_BYTES, timeoutMs: IMAGE_FETCH_TIMEOUT_MS, accept: (ct) => ct.startsWith("image/"),
    });
    mimeType = file.contentType;
    buffer = Buffer.from(file.bytes);
  }

  const form = new FormData();
  const ab = new ArrayBuffer(buffer.length);
  new Uint8Array(ab).set(buffer);
  const blob = new Blob([ab], { type: mimeType });
  form.append("file", blob, filename);

  const uploadRes = await fetch(`${cfg.baseUrl}/public/v1/upload`, {
    method: "POST",
    headers: { Authorization: cfg.apiKey },
    body: form,
  });
  if (!uploadRes.ok) {
    const body = (await uploadRes.text()).slice(0, 200);
    throw new Error(`Postiz upload failed: ${uploadRes.status} ${body}`);
  }
  const json = (await uploadRes.json()) as { id: string; path: string };
  if (!json.id || !json.path) throw new Error(`Unexpected upload response: ${JSON.stringify(json)}`);
  return { id: json.id, path: json.path };
}

/**
 * Upload a video to Postiz media storage via HTTPS URL.
 * Larger limits than uploadMedia (200 MB / 2 min timeout).
 */
export async function uploadVideo(opts: {
  videoUrl: string;
  filename?: string;
}): Promise<PostizMediaRef> {
  const { videoUrl, filename = "video.mp4" } = opts;
  const cfg = getPostizConfig();
  const file = await fetchRemoteFile(videoUrl, {
    maxBytes: MAX_VIDEO_BYTES, timeoutMs: VIDEO_FETCH_TIMEOUT_MS,
    // R2 presigned URLs sometimes omit the type: the file name says it then
    accept: (ct) => ct.startsWith("video/") || ct === "" || ct === "application/octet-stream" || ct === "binary/octet-stream",
  });
  const ext = filename.split(".").pop()?.toLowerCase() ?? "mp4";
  const mimeType = file.contentType.startsWith("video/") ? file.contentType
    : ext === "webm" ? "video/webm" : ext === "mov" ? "video/quicktime" : "video/mp4";
  const buffer = Buffer.from(file.bytes);

  const ab = new ArrayBuffer(buffer.length);
  new Uint8Array(ab).set(buffer);
  const form = new FormData();
  form.append("file", new Blob([ab], { type: mimeType }), filename);

  const up = await fetch(`${cfg.baseUrl}/public/v1/upload`, {
    method: "POST",
    headers: { Authorization: cfg.apiKey },
    body: form,
  });
  if (!up.ok) {
    const errText = await up.text().catch(() => "");
    throw new Error(`Postiz video upload ${up.status}: ${errText.slice(0, 200)}`);
  }
  const json = (await up.json()) as { id?: string; path?: string };
  if (!json.id || !json.path) throw new Error(`Unexpected video upload response: ${JSON.stringify(json)}`);
  return { id: json.id, path: json.path };
}

export async function createSocialPost(opts: {
  clientId: string;
  mode: "draft" | "now";
  posts: Array<{
    integrationId: string;
    platform: string;
    content: string;
    platformSettings?: Record<string, unknown>;
  }>;
  media?: PostizMediaRef;
  /** Per-platform media (e.g. different video formats per platform). Takes precedence over `media`. */
  mediaPerPlatform?: Record<string, PostizMediaRef>;
}): Promise<PostizPostResult[]> {
  const { mode, posts, media, mediaPerPlatform } = opts;
  const cfg = getPostizConfig();
  const results: PostizPostResult[] = [];

  for (const post of posts) {
    // v2.25.1 rejects a value without an image array ("posts.0.value.0.image must be an array"), text-only included.
    const platformMedia = mediaPerPlatform?.[post.platform] ?? media;
    const value: Record<string, unknown> = {
      content: post.content,
      image: platformMedia ? [{ id: platformMedia.id, path: platformMedia.path }] : [],
    };

    const body = {
      type: mode,
      date: new Date().toISOString(),
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: post.integrationId },
          value: [value],
          settings: {
            __type: post.platform,
            ...(post.platformSettings ?? {}),
          },
        },
      ],
    };

    try {
      const res = await fetch(`${cfg.baseUrl}/public/v1/posts`, {
        method: "POST",
        headers: {
          Authorization: cfg.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        results.push({
          platform: post.platform,
          integrationId: post.integrationId,
          status: "error",
          error: `HTTP ${res.status}: ${errText.slice(0, 200)}`,
        });
        continue;
      }

      // v2.25.1 answers [{ postId, integration }] (fixtures/postiz-v2.25.1/post-create.json); v2.11.3 { id } / { posts }.
      const json = (await res.json()) as Array<{ postId?: string }> | { id?: string; posts?: Array<{ id: string }> };
      const postizPostId = Array.isArray(json) ? json[0]?.postId : (json.id ?? json.posts?.[0]?.id);
      results.push({
        platform: post.platform,
        integrationId: post.integrationId,
        status: "ok",
        postizPostId,
        ...(postizPostId ? {} : { noId: true as const }),
      });
    } catch (err) {
      results.push({
        platform: post.platform,
        integrationId: post.integrationId,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

// ---- v2.25.1 public API (SOCIAL_MANAGER_PLAN.md C3). Shapes from lib/content/__tests__/fixtures/postiz-v2.25.1/.
// No retry loop here: a 429 carries retryAfter and the caller (C5's dispatch task) decides when to come back.

export class PostizApiError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "PostizApiError";
  }
}

async function postizRequest<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const cfg = getPostizConfig();
  const res = await fetch(`${cfg.baseUrl}/public/v1${path}`, {
    method,
    headers: { Authorization: cfg.apiKey, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    // Seconds only; an absent header must not read as "retry now" (Number(null) is 0).
    const header = res.status === 429 ? res.headers.get("retry-after") : null;
    const retry = header && /^\d+$/.test(header.trim()) ? Number(header) : undefined;
    throw new PostizApiError(res.status, `Postiz ${method} ${path.split("?")[0]} returned ${res.status}: ${text}`, retry);
  }
  return (await res.json()) as T;
}

export type PostizPostState = "QUEUE" | "PUBLISHED" | "ERROR" | "DRAFT";

export type PostizPost = {
  id: string;
  content: string;
  publishDate: string;
  releaseURL: string | null;
  releaseId: string | null;
  state: PostizPostState;
  error: string | null;
  intervalInDays: number | null;
  group: string;
  creationMethod: string;
  settings: string; // JSON text, e.g. {"__type":"bluesky"}
  tags: unknown[];
  integration: { id: string; name: string; providerIdentifier: string; picture: string | null };
};

/** Posts whose publish date falls in [start, end]; `customer` = a Postiz group (our brand). */
export async function listPosts(opts: { start: Date; end: Date; customer?: string }): Promise<PostizPost[]> {
  const q = new URLSearchParams({ startDate: opts.start.toISOString(), endDate: opts.end.toISOString() });
  if (opts.customer) q.set("customer", opts.customer);
  return (await postizRequest<{ posts: PostizPost[] }>("GET", `/posts?${q}`)).posts;
}

/** Deletes the post's whole group (Postiz deletes by group). A post already gone is not an error: v2.25.1 answers 404. */
export async function deletePost(id: string): Promise<{ existed: boolean }> {
  try {
    await postizRequest("DELETE", `/posts/${encodeURIComponent(id)}`);
    return { existed: true };
  } catch (e) {
    if (e instanceof PostizApiError && e.status === 404) return { existed: false };
    throw e;
  }
}

/** One Postiz post: one channel, `values` = the post then its comments (Postiz `value[]`), `settings` = the provider's
 *  DTO incl. `__type`. Throws PostizApiError (429 with retryAfter): unlike createSocialPost, the caller (C5 dispatch)
 *  must tell "refused" from "maybe created". One request per channel keeps each its own Postiz group, so deletePost
 *  removes only that channel's post. `sendKey` is stored as settings.awarewave_send_key: the public create keeps unknown
 *  settings keys (validatePosts runs class-validator without whitelist) and GET /posts returns `settings`, so the
 *  sender finds its own post again by that exact key (sendKeyOf). Postiz assigns the post id itself. */
export const SEND_KEY_SETTING = "awarewave_send_key";

export function sendKeyOf(post: { settings: string }): string | null {
  try {
    const v = (JSON.parse(post.settings) as Record<string, unknown>)[SEND_KEY_SETTING];
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

export async function createPost(opts: {
  sendKey: string;
  integrationId: string;
  type: "schedule" | "now" | "draft";
  date: string;
  values: Array<{ content: string; image: Array<{ id: string; path: string; alt?: string }> }>;
  settings: Record<string, unknown> & { __type: string };
}): Promise<string> {
  const res = await postizRequest<Array<{ postId?: string }>>("POST", "/posts", {
    type: opts.type, date: opts.date, shortLink: false, tags: [],
    posts: [{ integration: { id: opts.integrationId }, value: opts.values, settings: { ...opts.settings, [SEND_KEY_SETTING]: opts.sendKey } }],
  });
  const id = Array.isArray(res) ? res[0]?.postId : undefined;
  // a 2xx without an id: Postiz may hold the post; the caller treats it as an uncertain send, never as refused
  if (!id) throw new Error(`Postiz POST /posts answered without a post id: ${JSON.stringify(res).slice(0, 200)}`);
  return id;
}

export async function changeStatus(id: string, status: "draft" | "schedule"): Promise<void> {
  await postizRequest("PUT", `/posts/${encodeURIComponent(id)}/status`, { status });
}

/** OAuth URL to connect a channel (`refreshId` = an existing integration to reconnect). The user opens it. */
export async function connectUrl(platform: string, refreshId?: string): Promise<string> {
  const q = refreshId ? `?${new URLSearchParams({ refresh: refreshId })}` : "";
  return (await postizRequest<{ url: string }>("GET", `/social/${encodeURIComponent(platform)}${q}`)).url;
}

export async function listGroups(): Promise<Array<{ id: string; name: string }>> {
  return postizRequest("GET", "/groups");
}

/** One metric a day as the platform's provider labels it (v2.25.1; facebook.provider.js analytics / postAnalytics).
 *  A provider without analytics answers [] (Bluesky). GETs do not count against API_LIMIT in v2.25.1. */
export type PostizAnalyticsSeries = { label: string; percentageChange?: number; data: Array<{ total: number | string; date: string }> };

export async function accountAnalytics(integrationId: string, days: number): Promise<PostizAnalyticsSeries[]> {
  return postizRequest("GET", `/analytics/${encodeURIComponent(integrationId)}?date=${days}`);
}

export async function postAnalytics(postizPostId: string, days: number): Promise<PostizAnalyticsSeries[]> {
  return postizRequest("GET", `/analytics/post/${encodeURIComponent(postizPostId)}?date=${days}`);
}

export function assertCanPublishNow(role: OpsRole, confirmPublishNow: boolean): void {
  if (role !== "owner" && role !== "admin") {
    throw new Error("Only owner or admin may publish immediately");
  }
  if (!confirmPublishNow) {
    throw new Error("Immediate publish requires confirmPublishNow=true");
  }
}
