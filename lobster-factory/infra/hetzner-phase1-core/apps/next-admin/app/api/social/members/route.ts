// /api/social/members -- a brand's members (ADR 018 §3; migration 0103). Owners only: the list carries emails.
//   GET    ?brand                         { members }
//   POST   { brand, email, role }         add an existing account by email
//   PATCH  { brand, userId, role }        change a role (the last owner stays)
//   DELETE ?brand&userId                  remove (the last owner stays)
import { actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import type { BrandRole } from "@/lib/social/state";
import { addMember, listMembers, removeMember, setMemberRole } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES: readonly BrandRole[] = ["owner", "editor", "reviewer", "client"];
const OWNER: readonly BrandRole[] = ["owner"];

function role(value: unknown): BrandRole {
  if (typeof value !== "string" || !ROLES.includes(value as BrandRole)) throw new BadRequest("role must be owner, editor, reviewer or client");
  return value as BrandRole;
}

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    await requireBrandRole(req, brand, OWNER);
    return { members: await listMembers(brand) };
  });
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    await requireBrandRole(req, brand, OWNER);
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!/^[^\s@]{1,64}@[^\s@]{1,255}$/.test(email)) throw new BadRequest("email is not an email address");
    return { userId: await addMember(brand, email, role(body.role), actorOf(req)) };
  });
}

export async function PATCH(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    await requireBrandRole(req, brand, OWNER);
    await setMemberRole(brand, uuid(body.userId, "userId"), role(body.role), actorOf(req));
    return {};
  });
}

export async function DELETE(req: Request): Promise<Response> {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const brand = uuid(q.get("brand"), "brand");
    await requireBrandRole(req, brand, OWNER);
    await removeMember(brand, uuid(q.get("userId"), "userId"), actorOf(req));
    return {};
  });
}
