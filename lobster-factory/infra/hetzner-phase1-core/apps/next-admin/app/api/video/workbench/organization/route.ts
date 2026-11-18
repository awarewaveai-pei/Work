import { NextResponse } from "next/server";
import { GET as session } from "../session/route";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { assertOrgAccess, OrgAccessError } from "@/lib/tenant-guard";
import { COOKIE_NAME, HEADER_NAME, UUID_RE } from "@/public/editor-shared/video-organization.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (!origin) return site === "same-origin";
  const url = new URL(req.url);
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host).split(",")[0].trim();
  const protocol = (req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "")).split(",")[0].trim();
  try { return new URL(origin).origin === new URL(`${protocol}://${host}`).origin; }
  catch { return false; }
}

/** Selection changes no permissions: the existing session gate resolves authorization and the root billing account. */
export async function POST(req: Request): Promise<Response> {
  const deny = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
  if (!sameOrigin(req)) return deny(403, "cross_site_request_blocked");
  let body: unknown;
  try { body = await req.json(); } catch { return deny(400, "invalid_json"); }
  const organizationId = typeof (body as { organizationId?: unknown })?.organizationId === "string"
    ? (body as { organizationId: string }).organizationId.trim().toLowerCase() : "";
  if (!UUID_RE.test(organizationId)) return deny(400, "invalid_org");
  const headers = new Headers(req.headers);
  headers.set(HEADER_NAME, organizationId);
  // Selection intentionally replaces the old hint. Middleware has already validated the login and injected identity.
  headers.delete("cookie");
  const authorized = await session(new Request(req.url, { headers }));
  if (authorized.status !== 204) return authorized;
  try { assertOrgAccess(req, organizationId); }
  catch (error) { if (error instanceof OrgAccessError) return deny(403, "org_forbidden"); throw error; }
  const db = getSupabaseWriteClient();
  if (!db) return deny(503, "unavailable");
  const { data, error } = await db.from("organizations").select("id").eq("id", organizationId).eq("status", "active").maybeSingle();
  if (error) return deny(503, "unavailable");
  if (!data) return deny(403, "org_not_active");
  const response = NextResponse.json({ ok: true, organizationId }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(COOKIE_NAME, organizationId, { httpOnly: true, secure: true, sameSite: "strict", path: "/" });
  return response;
}
