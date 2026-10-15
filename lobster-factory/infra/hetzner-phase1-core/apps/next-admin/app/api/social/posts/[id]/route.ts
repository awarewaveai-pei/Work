// /api/social/posts/[id]?brand=<id>
//   GET     one post with its targets and media
//   PUT     { brand, version, fields?, targets?, media? } -> save content (version = what the editor loaded; 409 when
//           someone saved first or the post left the editable states)
//   DELETE  ?brand&version -> to the bin (restore via PUT .../state { action: "restore" })
import { ANY_ROLE, WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { handle, jsonBody, postVersion, uuid } from "@/lib/social/http";
import { assertWithinLimits, parsePostPayload } from "@/lib/social/posts";
import { transition } from "@/lib/social/state";
import { getPost, getPostAt, savePost, setState, snapshotOf } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const brand = uuid(new URL(req.url).searchParams.get("brand"), "brand");
    requireBrandRole(req, brand, ANY_ROLE);
    return { post: await getPost(brand, uuid((await params).id, "id")) };
  });
}

export async function PUT(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const id = uuid((await params).id, "id");
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    requireBrandRole(req, brand, WRITE_ROLES);
    const payload = parsePostPayload(body);
    const version = postVersion(body.version);
    if (payload.fields.body !== undefined || payload.targets) {
      const current = await getPostAt(brand, id, version);   // the limits are checked against the version being saved
      const targets = payload.targets ?? current.targets.map((t) => ({ account_id: t.account_id, custom_body: t.custom_body, format: t.format }));
      if (targets.length) await assertWithinLimits(brand, payload.fields.body ?? current.body, targets);
    }
    return { post: await savePost(brand, id, version, payload.fields, payload.targets, payload.media, actorOf(req)) };
  });
}

export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  return handle(async () => {
    const id = uuid((await params).id, "id");
    const q = new URL(req.url).searchParams;
    const brand = uuid(q.get("brand"), "brand");
    const role = requireBrandRole(req, brand, ANY_ROLE);
    const post = await getPostAt(brand, id, postVersion(q.get("version")));
    const next = transition(snapshotOf(post), "delete", role);
    return { post: await setState(brand, id, post.version, next, actorOf(req), "delete") };
  });
}
