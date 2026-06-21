import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { OpsRole } from "@/lib/ops-contracts";

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

// SSRF guard: private / link-local / loopback ranges that must never be fetched
const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1|0\.0\.0\.0)/i;

function assertSafeImageUrl(url: string): void {
  if (!url.startsWith("https://")) {
    throw new Error(`imageUrl must use https:// scheme, got: ${url.slice(0, 30)}`);
  }
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("imageUrl is not a valid URL");
  }
  if (PRIVATE_HOST_RE.test(hostname)) {
    throw new Error(`imageUrl hostname is private/internal: ${hostname}`);
  }
}

// Max image bytes accepted for upload (10 MB)
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// Fetch timeout for remote image download (20 s)
const IMAGE_FETCH_TIMEOUT_MS = 20_000;

type RawIntegration = {
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
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(`Postiz /integrations returned ${res.status}: ${body}`);
  }
  return res.json() as Promise<RawIntegration[]>;
}

export async function listIntegrations(clientId: string): Promise<SocialChannel[]> {
  const db = getSupabaseWriteClient();
  if (!db) throw new Error("Supabase client not configured");

  const { data: rows, error } = await db
    .from("social_postiz_connections")
    .select("postiz_integration_id, platform, label, status")
    .eq("client_id", clientId);

  if (error) throw new Error(`social_postiz_connections query failed: ${error.message}`);
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
      label: row.label ?? liveEntry?.name ?? row.platform,
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
    // SSRF guard: https-only + private IP block
    assertSafeImageUrl(imageUrl);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), IMAGE_FETCH_TIMEOUT_MS);
    let fetchRes: Response;
    try {
      fetchRes = await fetch(imageUrl, { signal: ctrl.signal });
    } catch (err) {
      clearTimeout(timer);
      throw new Error(
        `Failed to fetch image: ${ctrl.signal.aborted ? "timeout" : err instanceof Error ? err.message : String(err)}`
      );
    }
    clearTimeout(timer);

    if (!fetchRes.ok) {
      throw new Error(`Failed to fetch image: HTTP ${fetchRes.status}`);
    }
    const ct = fetchRes.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) {
      throw new Error(`Expected image/* content-type, got: ${ct}`);
    }
    mimeType = ct.split(";")[0].trim();

    const ab = await fetchRes.arrayBuffer();
    if (ab.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`Image too large: ${ab.byteLength} bytes (max ${MAX_IMAGE_BYTES})`);
    }
    buffer = Buffer.from(ab);
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
}): Promise<PostizPostResult[]> {
  const { mode, posts, media } = opts;
  const cfg = getPostizConfig();
  const results: PostizPostResult[] = [];

  for (const post of posts) {
    const value: Record<string, unknown> = { content: post.content };
    if (media) value.image = [{ id: media.id, path: media.path }];

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

      const json = (await res.json()) as { id?: string; posts?: Array<{ id: string }> };
      const postizPostId = json.id ?? json.posts?.[0]?.id;
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

export function assertCanPublishNow(role: OpsRole, confirmPublishNow: boolean): void {
  if (role !== "owner" && role !== "admin") {
    throw new Error("Only owner or admin may publish immediately");
  }
  if (!confirmPublishNow) {
    throw new Error("Immediate publish requires confirmPublishNow=true");
  }
}
