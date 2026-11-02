// The Gmail reads the reply sync needs (SPEC §5.6, card C4.3), behind one interface so the sync is tested with a fake.
// All calls are GET (gmail.readonly, C1.6) through google-oauth.ts gmailGet, the one Gmail exit. A 404 is GmailNotFound:
// the sync treats a vanished message or an expired history id as a fact, any other failure as an error that stops the
// round without moving the cursor.
import { gmailGet, GmailNotFound } from "./google-oauth";

export { GmailNotFound };

export interface GmailHeader { name: string; value: string }
export interface GmailPart { mimeType?: string; headers?: GmailHeader[]; body?: { data?: string }; parts?: GmailPart[] }
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string;  // epoch ms as a string
  payload?: GmailPart;
}

export interface GmailApi {
  profile(): Promise<{ emailAddress: string; historyId: string }>;
  /** format: meta = ids, labels and the headers the sync reads (format=metadata documents headers; neither it nor
   *  "minimal" promises internalDate, so the sync dates a mail by internalDate or else its Date header); full = all. */
  message(id: string, format: "meta" | "full"): Promise<GmailMessage>;
  thread(id: string): Promise<{ id: string; messages: GmailMessage[] }>;
  draft(id: string): Promise<{ id: string; message: { id: string; threadId: string } }>;
  /** One page of messages.list. */
  list(q: string, pageToken?: string): Promise<{ ids: string[]; next?: string }>;
  /** One page of history.list (INBOX, messageAdded). */
  history(startHistoryId: string, pageToken?: string): Promise<{ ids: string[]; historyId: string; next?: string }>;
}

export function gmailApi(accessToken: string, fetcher: typeof fetch = fetch): GmailApi {
  const get = <T>(path: string, what: string): Promise<T> => gmailGet<T>(accessToken, path, what, fetcher);
  // Every header the sync reads before deciding a mail is ours (gmail-sync.ts incoming, sent detection).
  const META = `format=metadata&${["Date", "Subject", "From", "Message-ID", "X-Failed-Recipients", "Auto-Submitted", "X-Autoreply", "X-Autorespond", "Precedence"]
    .map((h) => `metadataHeaders=${h}`).join("&")}`;
  const page = (token?: string) => (token ? `&pageToken=${encodeURIComponent(token)}` : "");
  return {
    profile: () => get("/profile", "profile"),
    message: (id, format) => get(`/messages/${encodeURIComponent(id)}?${format === "full" ? "format=full" : META}`, "messages.get"),
    async thread(id) {
      const t = await get<{ id: string; messages?: GmailMessage[] }>(`/threads/${encodeURIComponent(id)}?${META}`, "threads.get");
      return { id: t.id, messages: t.messages ?? [] };
    },
    draft: (id) => get(`/drafts/${encodeURIComponent(id)}?format=minimal`, "drafts.get"),
    async list(q, pageToken) {
      const r = await get<{ messages?: Array<{ id: string }>; nextPageToken?: string }>(
        `/messages?maxResults=100&q=${encodeURIComponent(q)}${page(pageToken)}`, "messages.list");
      return { ids: (r.messages ?? []).map((m) => m.id), next: r.nextPageToken };
    },
    async history(startHistoryId, pageToken) {
      const r = await get<{ history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>; historyId: string; nextPageToken?: string }>(
        `/history?startHistoryId=${encodeURIComponent(startHistoryId)}&labelId=INBOX&historyTypes=messageAdded&maxResults=500${page(pageToken)}`,
        "history.list");
      const ids = (r.history ?? []).flatMap((h) => (h.messagesAdded ?? []).map((a) => a.message.id));
      return { ids, historyId: r.historyId, next: r.nextPageToken };
    },
  };
}

export function header(m: GmailMessage, name: string): string | null {
  const n = name.toLowerCase();
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? null;
}

/** The bare address of a From / X-Failed-Recipients value, lowercase. */
export function addressOf(value: string | null): string | null {
  if (!value) return null;
  const m = /<([^>]+)>/.exec(value)?.[1] ?? value.split(",")[0];
  const a = m.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a) ? a : null;
}

const decode = (data?: string): string => (data ? Buffer.from(data, "base64url").toString("utf8") : "");

function findPart(p: GmailPart | undefined, mime: string): GmailPart | null {
  if (!p) return null;
  if (p.mimeType === mime && p.body?.data) return p;
  for (const c of p.parts ?? []) {
    const hit = findPart(c, mime);
    if (hit) return hit;
  }
  return null;
}

const stripHtml = (html: string): string => html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/(p|div|li|tr|blockquote|h[1-6])>/gi, "\n")
  .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// The quoted earlier mail: lines starting ">" and everything from a "wrote:" / 寫道 / Original Message line on.
const QUOTE_START = /^(On .{3,200} wrote:|.{1,200}(寫道|写道)[:：]|-{2,}\s*Original Message\s*-{2,}|_{10,})\s*$/;

/** What the sender wrote: text/plain, else the HTML part without tags; quoted history cut; at most `max` characters. */
export function replyText(m: GmailMessage, max = 4000): string {
  const plain = findPart(m.payload, "text/plain");
  const raw = plain ? decode(plain.body?.data) : stripHtml(decode(findPart(m.payload, "text/html")?.body?.data));
  const kept: string[] = [];
  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    if (QUOTE_START.test(line.trim())) break;
    if (line.trimStart().startsWith(">")) continue;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}
