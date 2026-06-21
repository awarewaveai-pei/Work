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
    throw new Error(`Postiz /integrations returned ${res.status}: ${await res.text()}`);
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
    const live = liveMap.get(row.postiz_integration_id);
    const status: SocialChannel["status"] =
      !live || live.disabled ? "disabled" : (row.status as SocialChannel["status"]);
    return {
      clientId,
      postizIntegrationId: row.postiz_integration_id,
      platform: row.platform as SocialPlatform,
      label: row.label ?? live?.name ?? row.platform,
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
  } else if (imageUrl.startsWith("https://") || imageUrl.startsWith("http://")) {
    const fetchRes = await fetch(imageUrl);
    if (!fetchRes.ok) {
      throw new Error(`Failed to fetch image from ${imageUrl}: ${fetchRes.status}`);
    }
    const ct = fetchRes.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) {
      throw new Error(`Expected image/* content-type, got: ${ct}`);
    }
    mimeType = ct.split(";")[0].trim();
    buffer = Buffer.from(new Uint8Array(await fetchRes.arrayBuffer()));
  } else {
    throw new Error(`Unsupported imageUrl scheme: ${imageUrl.slice(0, 30)}`);
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
    throw new Error(`Postiz upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }
  const json = (await uploadRes.json()) as { id: string; path: string };
  if (!json.id || !json.path) throw new Error(`Unexpected upload response: ${JSON.stringify(json)}`);
  return { id: json.id, path: json.path };
}

export async function createSocialPost(opts: {
  clientId: string;
  mode: "draft" | "now";
  posts: Array<{ integrationId: string; platform: string; content: string }>;
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
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: post.integrationId },
          value: [value],
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
