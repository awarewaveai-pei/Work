// GET /api/social/needs?brand -- what needs someone (C8; lib/social/review.ts needs): failed posts, expired channels,
// and for an approver (owner / reviewer) the posts waiting for review. Feeds the header's 「通知 N」 and the log's
// 「需處理」 filter (C11).
import { ANY_ROLE, requireBrandRole } from "@/lib/social/authz";
import { handle, uuid } from "@/lib/social/http";
import { needs } from "@/lib/social/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    const role = requireBrandRole(req, brand, ANY_ROLE);
    return await needs(brand, role);
  });
}
