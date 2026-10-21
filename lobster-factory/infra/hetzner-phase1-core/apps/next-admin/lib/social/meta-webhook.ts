// C27: Meta webhook verification, event normalisation and the Graph API reply port.
// The webhook route owns auth/tenant lookup; this module keeps Meta's wire shapes and
// access-token handling out of the browser and makes them testable without a live Meta app.
import { createHmac, timingSafeEqual } from "node:crypto";

export type MetaSocialEnv = Record<string, string | undefined>;
export type MetaEventKind = "comment" | "dm";
export type MetaSocialPlatform = "facebook" | "instagram";

export type MetaWebhookEvent = {
  eventId: string;
  kind: MetaEventKind;
  platform: MetaSocialPlatform;
  channelId: string;
  senderId: string;
  targetId: string;
  text: string;
};

type MetaSocialConfig = { baseUrl: string; accessToken: string; organizationId: string };

export class MetaSocialError extends Error {
  constructor(readonly status: number, message: string, readonly code = "meta_social_error") {
    super(message);
    this.name = "MetaSocialError";
  }
}

export class MetaSocialConfigError extends MetaSocialError {
  constructor(message: string) {
    super(503, message, "meta_social_not_configured");
    this.name = "MetaSocialConfigError";
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Meta signs the exact raw request body, never the parsed JSON representation. */
export function verifyMetaSignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature || !signature.startsWith("sha256=") || !appSecret) return false;
  const received = signature.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

export function autoReplyReady(env: MetaSocialEnv = process.env): boolean {
  return env.META_AUTO_REPLY_ENABLED?.trim().toLowerCase() === "true"
    && env.META_AUTO_REPLY_REVIEW_APPROVED?.trim().toLowerCase() === "true";
}

export function getMetaSocialConfig(env: MetaSocialEnv = process.env): MetaSocialConfig {
  const accessToken = env.META_SOCIAL_ACCESS_TOKEN?.trim();
  const organizationId = env.META_SOCIAL_ORGANIZATION_ID?.trim();
  if (!accessToken) throw new MetaSocialConfigError("Meta 自動回覆未設定 META_SOCIAL_ACCESS_TOKEN");
  if (!organizationId) throw new MetaSocialConfigError("Meta 自動回覆未設定 META_SOCIAL_ORGANIZATION_ID");
  const version = (env.META_GRAPH_API_VERSION?.trim() || "v24.0").replace(/^v/, "v");
  if (!/^v\d+\.\d+$/.test(version)) throw new MetaSocialConfigError("META_GRAPH_API_VERSION 格式不正確");
  return {
    baseUrl: `${env.META_GRAPH_API_BASE_URL?.trim() || "https://graph.facebook.com"}/${version}`,
    accessToken,
    organizationId,
  };
}

function addComment(events: MetaWebhookEvent[], platform: MetaSocialPlatform, channelId: string, value: Record<string, unknown>): void {
  if (value.verb && value.verb !== "add") return;
  const id = text(value.comment_id) ?? text(value.id);
  const message = text(value.message) ?? text(value.text);
  const from = record(value.from);
  const senderId = text(from?.id);
  if (!id || !message || !senderId) return;
  events.push({ eventId: `${platform}:comment:${id}`, kind: "comment", platform, channelId, senderId, targetId: id, text: message });
}

function addMessage(events: MetaWebhookEvent[], platform: MetaSocialPlatform, channelId: string, value: Record<string, unknown>): void {
  const sender = record(value.sender);
  const recipient = record(value.recipient);
  const message = record(value.message);
  if (message?.is_echo === true) return;
  const eventId = text(message?.mid);
  const senderId = text(sender?.id);
  const recipientId = text(recipient?.id) ?? channelId;
  const body = text(message?.text);
  if (!eventId || !senderId || !recipientId || !body) return;
  events.push({ eventId: `${platform}:dm:${eventId}`, kind: "dm", platform, channelId: recipientId, senderId, targetId: eventId, text: body });
}

/** Convert both Page `feed` changes and Instagram `comments` changes to one safe event shape. */
export function parseMetaWebhookPayload(payload: unknown): MetaWebhookEvent[] {
  const root = record(payload);
  if (!root || (root.object !== "page" && root.object !== "instagram")) return [];
  const platform: MetaSocialPlatform = root.object === "instagram" ? "instagram" : "facebook";
  const entries = Array.isArray(root.entry) ? root.entry : [];
  const events: MetaWebhookEvent[] = [];
  for (const rawEntry of entries) {
    const entry = record(rawEntry);
    const channelId = text(entry?.id);
    if (!channelId) continue;
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const rawChange of changes) {
      const change = record(rawChange);
      const value = record(change?.value);
      if (!value) continue;
      if ((platform === "facebook" && change?.field === "feed" && value.item === "comment")
        || (platform === "instagram" && change?.field === "comments")) addComment(events, platform, channelId, value);
    }
    const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
    for (const rawMessage of messaging) {
      const value = record(rawMessage);
      if (value) addMessage(events, platform, channelId, value);
    }
  }
  return events;
}

async function graphPost(path: string, params: Record<string, string>, env?: MetaSocialEnv): Promise<Record<string, unknown>> {
  const config = getMetaSocialConfig(env);
  const url = new URL(`${config.baseUrl}/${path.replace(/^\//, "")}`);
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || body.error) {
    const apiError = record(body.error);
    throw new MetaSocialError(502, `Meta 社群 API：${text(apiError?.message) ?? `HTTP ${response.status}`}`, "meta_api_error");
  }
  return body;
}

/** Reply publicly to a comment or send a DM, using the endpoint for the event's platform. */
export async function replyToMetaEvent(event: MetaWebhookEvent, message: string, env?: MetaSocialEnv): Promise<void> {
  const body = message.trim();
  if (!body) throw new MetaSocialError(400, "自動回覆內容不可為空", "empty_reply");
  if (event.kind === "comment") {
    await graphPost(`${event.targetId}/${event.platform === "instagram" ? "replies" : "comments"}`, { message: body }, env);
    return;
  }
  await graphPost(`${event.channelId}/messages`, {
    recipient: JSON.stringify({ id: event.senderId }),
    message: JSON.stringify({ text: body }),
  }, env);
}
