// One user action on one post, shared by PUT /api/social/posts/[id]/state and POST /api/social/posts/bulk: the rule
// (state.ts), then the write -- a plain state change, or for a post already in Postiz the withdrawal (withdraw.ts).
import { transition, type BrandRole, type PostAction, type PostState, type TransitionInput } from "./state";
import { setState, snapshotOf, type PostRow } from "./store";
import { withdrawQueued } from "./withdraw";

export async function applyAction(brandId: string, post: PostRow, action: PostAction, role: BrandRole, input: TransitionInput,
  actor: string, detail: Record<string, unknown>): Promise<{ id: string; version: number; state: PostState }> {
  const next = transition(snapshotOf(post), action, role, input);
  const saved = post.state === "queued"
    ? await withdrawQueued(brandId, post, next, actor, action, detail)
    : await setState(brandId, post.id, post.version, next, actor, action, detail);
  return { ...saved, state: next.state };
}
