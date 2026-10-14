// Gmail per-org OAuth (task T10) — authorize URL, code↔token exchange, access-token refresh,
// and draft creation via the Gmail REST API. Scope is gmail.compose ONLY (never gmail.send —
// Phase 1 never auto-sends, see spec Cold Gate). Refresh tokens are the only thing persisted
// (via lib/secret-vault.ts, keyed by connectorSecretRef(connectorAccountId)); access tokens are
// always re-derived at call time, never cached — one fewer expiry-tracking bug class to own.
import crypto from "node:crypto";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.compose";

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export interface OAuthState {
  connectorId: string;
  nonce: string;
  ts: number;
}

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes — long enough for a human to click through consent

/** HMAC-sign the OAuth `state` param so the callback can trust it without a server-side session store. */
export function signState(state: OAuthState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** Verify + parse a signed state. Returns null on bad signature, malformed payload, or expiry. */
export function verifyState(signed: string, secret: string): OAuthState | null {
  const parts = signed.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  // Constant-time compare on equal-length buffers; different lengths are never a valid match.
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (typeof state.connectorId !== "string" || typeof state.ts !== "number") return null;
    if (Date.now() - state.ts > STATE_MAX_AGE_MS) return null;
    return state;
  } catch {
    return null;
  }
}

/** Canonical redirect_uri base — derived from a configured app URL, not the inbound request's own
 *  `Host`/origin. Not currently exploitable (Google enforces its own pre-registered redirect_uri
 *  allowlist server-side), but deriving a security-relevant URL from request-controlled input is
 *  a smell worth avoiding when it's free to (critic suggestion, 2026-09-11). Matches the existing
 *  `NEXT_PUBLIC_APP_URL` fallback convention already used in lib/repair-center/github.ts. */
export function gmailOAuthRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.aware-wave.com";
  return new URL("/api/outreach/connectors/gmail/oauth/callback", base).toString();
}

export function buildAuthorizeUrl(opts: { clientId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    // Force the consent screen every time so Google re-issues a refresh_token — it is only
    // returned on the FIRST grant otherwise, which would silently break a reconnect flow.
    prompt: "consent",
    state: opts.state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function postForm(body: Record<string, string>): Promise<GoogleTokens> {
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    // Google's error body is JSON like {"error":"invalid_grant",...} — never contains the secret.
    throw new Error(`google oauth token endpoint ${resp.status}: ${detail.slice(0, 300)}`);
  }
  return (await resp.json()) as GoogleTokens;
}

export async function exchangeCodeForTokens(opts: {
  code: string; clientId: string; clientSecret: string; redirectUri: string;
}): Promise<GoogleTokens> {
  return postForm({
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
  });
}

/** Refresh tokens don't expire on their own use; access tokens do (~1h) — always refresh at call time. */
export async function refreshAccessToken(opts: {
  refreshToken: string; clientId: string; clientSecret: string;
}): Promise<GoogleTokens> {
  return postForm({
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    grant_type: "refresh_token",
  });
}

export async function getGmailProfile(accessToken: string): Promise<{ emailAddress: string }> {
  const resp = await fetch(`${GMAIL_API_BASE}/profile`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`gmail profile ${resp.status}: ${detail.slice(0, 200)}`);
  }
  return (await resp.json()) as { emailAddress: string };
}

/** Wrap a base64 string at RFC 2045's 76-char line limit (CRLF-joined). */
function wrapBase64(b64: string): string {
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join("\r\n");
}

/** RFC 2822 encoder: headers must be present even when a value is empty/absent (no Subject line
 *  is a deliberate cold-email design choice upstream — see messages/route.ts buildPrompt()).
 *  Body is base64-encoded with an explicit Content-Transfer-Encoding: without it, RFC 2045 §6.1
 *  defaults to 7bit, which asserts pure US-ASCII — silently non-compliant for the Traditional
 *  Chinese body text this product always generates (critic Major, 2026-09-11: unverified until
 *  the first live drafts.create() call, since Gmail's tolerance for a violating message wasn't
 *  known in advance and is exactly the kind of thing that should be spec-compliant, not "probably
 *  fine"). */
export function buildRfc2822Message(opts: {
  from: string; to: string; subject: string | null; bodyText: string;
}): string {
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
  ];
  if (opts.subject) {
    // RFC 2047 encode non-ASCII subjects (Traditional Chinese cold-email subjects are common here).
    headers.splice(3, 0, `Subject: =?UTF-8?B?${Buffer.from(opts.subject, "utf8").toString("base64")}?=`);
  }
  const encodedBody = wrapBase64(Buffer.from(opts.bodyText, "utf8").toString("base64"));
  return `${headers.join("\r\n")}\r\n\r\n${encodedBody}`;
}

export function toBase64Url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

export async function createGmailDraft(accessToken: string, raw: string): Promise<{ id: string }> {
  const resp = await fetch(`${GMAIL_API_BASE}/drafts`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ message: { raw } }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`gmail drafts.create ${resp.status}: ${detail.slice(0, 300)}`);
  }
  return (await resp.json()) as { id: string };
}
