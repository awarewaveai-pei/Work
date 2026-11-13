// DELETE /api/social/posts/[id]/purge?brand=<id>&version=<n> -- erase a post that is in the bin (已刪除貼文 → 永久刪除).
// Who and which: lib/social/state.ts assertCanPurge (the restore roles; only a binned, never-published post); the erase and
// its purge audit row: lib/social/store.ts purgePost. No bulk form: each erase is confirmed on its own.
import { ANY_ROLE, actorOf, requireBrandRole } from "@/lib/social/authz";
import { handle, postVersion, uuid } from "@/lib/social/http";
import { assertCanPurge } from "@/lib/social/state";
import { getPostAt, purgePost } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handle(async () => {
    const id = uuid((await params).id, "id");
    const q = new URL(req.url).searchParams;
    const brand = uuid(q.get("brand"), "brand");
    const role = await requireBrandRole(req, brand, ANY_ROLE);
    const version = postVersion(q.get("version"));
    const post = await getPostAt(brand, id, version);
    assertCanPurge({ state: post.state, publishedAt: post.published_at, sentTargets: post.targets.filter((t) => t.state === "published" || t.release_url).length }, role);
    await purgePost(brand, id, version, actorOf(req));
    return { purged: id };
  });
}
