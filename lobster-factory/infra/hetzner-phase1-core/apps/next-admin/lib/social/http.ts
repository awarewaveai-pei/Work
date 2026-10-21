// One error-to-response mapping for every /api/social route, so a refusal means the same status everywhere.
import { NextResponse } from "next/server";
import { PostizApiError } from "@/lib/content/postiz";
import { BrandAccessError } from "./authz";
import { SocialStoreError } from "./store";
import { TransitionError } from "./state";
import { MetaAdsError } from "./meta-ads";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class BadRequest extends Error {
  constructor(message: string, readonly detail?: unknown) {
    super(message);
    this.name = "BadRequest";
  }
}

export function uuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new BadRequest(`${name} must be a uuid`);
  return value;
}

/** The post version the editor loaded: compare-and-set against it (0098). */
export function postVersion(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isInteger(n) || (n as number) < 1) throw new BadRequest("version must be the post's current version (integer >= 1)");
  return n as number;
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
    return body as Record<string, unknown>;
  } catch {
    throw new BadRequest("body must be a JSON object");
  }
}

export async function handle(run: () => Promise<unknown>): Promise<Response> {
  try {
    return NextResponse.json({ ok: true, ...((await run()) as object) });
  } catch (e) {
    const reply = (status: number, error: string, detail?: unknown) =>
      NextResponse.json({ ok: false, error, ...(detail !== undefined ? { detail } : {}) }, { status });
    if (e instanceof BadRequest) return reply(400, e.message, e.detail);
    if (e instanceof BrandAccessError) return reply(403, e.message);
    if (e instanceof TransitionError) return reply(e.code === "forbidden" ? 403 : e.code === "illegal" ? 409 : 400, e.message);
    if (e instanceof SocialStoreError) return reply(e.status, e.message);
    if (e instanceof PostizApiError) return reply(502, e.message, e.retryAfterSeconds !== undefined ? { retryAfterSeconds: e.retryAfterSeconds } : undefined);
    if (e instanceof MetaAdsError) return reply(e.status, e.message, { code: e.code });
    console.error("[api/social]", e);
    return reply(500, "internal error");
  }
}
