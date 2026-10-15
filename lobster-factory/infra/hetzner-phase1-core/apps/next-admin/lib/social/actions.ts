// One user action on one post, shared by PUT /api/social/posts/[id]/state, POST /api/social/posts/bulk and DELETE
// /api/social/posts/[id]: the rule (state.ts, with the brand's review setting), then the write -- a plain state change,
// or for a post already in Postiz the withdrawal (withdraw.ts). A rejection's reason also goes into the post's notes
// (C8: 理由進備註與紀錄); a submission tells the approvers (review.ts notifyReview, via the ops inbox).
import { transition, type BrandRole, type PostAction, type PostState, type TransitionInput } from "./state";
import { savePost, setState, snapshotOf, type PostRow } from "./store";
import { notifyReview, requiresReview } from "./review";
import { withdrawQueued } from "./withdraw";

export async function applyAction(brandId: string, post: PostRow, action: PostAction, role: BrandRole, input: TransitionInput,
  actor: string, detail: Record<string, unknown>): Promise<{ id: string; version: number; state: PostState }> {
  const next = transition(snapshotOf(post), action, role, { ...input, requireReview: await requiresReview(brandId) });
  let version = post.version;
  if (action === "reject" && input.reason?.trim()) {
    const notes = [post.notes?.trim(), `退回：${input.reason.trim()}`].filter(Boolean).join("\n").slice(0, 20000);
    version = (await savePost(brandId, post.id, version, { notes }, null, null, actor)).version;
  }
  const saved = post.state === "queued"
    ? await withdrawQueued(brandId, post, next, actor, action, detail)
    : await setState(brandId, post.id, version, next, actor, action, detail);
  if (action === "submit") await notifyReview(brandId, post.id, post.body);
  return { ...saved, state: next.state };
}
