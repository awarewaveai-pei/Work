// The one place post state changes are decided (SOCIAL_MANAGER_PLAN.md C4; ADR 016 §2). Routes call transition();
// the database (0096 checks + 0098 social_set_state) keeps the shape, this table keeps who may do what from where.
// queued / published / error are the sender's (C5, lib/social/dispatch.ts + migration 0100): no user action produces
// them except restore of a published post. A queued post is already in Postiz: schedule / unschedule / delete /
// publish_now on it go through lib/social/withdraw.ts (delete its Postiz posts, then 0100 social_release_post).
// A list slot (listId + listPosition) is set only by to_rotation; every other action clears it (0096: list_position
// exists only in rotation), so a post that left rotation never looks like a C7 slot or blocks deleting its list.

export type PostState = "draft" | "review" | "scheduled" | "queued" | "published" | "error" | "rotation" | "deleted";
export type BrandRole = "owner" | "editor" | "reviewer" | "client";
export type PostAction =
  | "submit" | "approve" | "reject" | "schedule" | "unschedule" | "to_rotation" | "from_rotation" | "delete" | "restore" | "publish_now";

export interface PostSnapshot {
  state: PostState;
  scheduledAt: string | null;
  listId: string | null;
  listPosition: number | null;
  publishedAt: string | null;
  targetCount: number;
  hasContent: boolean;   // text or media to send on every target (store.ts snapshotOf)
}

export interface TransitionInput {
  scheduledAt?: string;
  listId?: string;
  listPosition?: number;
  reason?: string;
  confirmPublishNow?: boolean;
}

export interface Transition {
  state: PostState;
  scheduledAt: string | null;
  listId: string | null;
  listPosition: number | null;
}

export class TransitionError extends Error {
  constructor(readonly code: "forbidden" | "illegal" | "invalid", message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

interface Rule {
  from: readonly PostState[];
  roles: readonly BrandRole[];
}

const EDIT: readonly BrandRole[] = ["owner", "editor"];
const REVIEW: readonly BrandRole[] = ["owner", "reviewer"];

export const RULES: Record<PostAction, Rule> = {
  submit: { from: ["draft"], roles: EDIT },
  approve: { from: ["review"], roles: REVIEW },
  reject: { from: ["review"], roles: REVIEW },
  schedule: { from: ["draft", "scheduled", "queued", "error"], roles: EDIT },
  unschedule: { from: ["scheduled", "queued"], roles: EDIT },
  to_rotation: { from: ["draft"], roles: EDIT },
  from_rotation: { from: ["rotation"], roles: EDIT },
  delete: { from: ["draft", "review", "scheduled", "queued", "error", "rotation", "published"], roles: EDIT },
  restore: { from: ["deleted"], roles: EDIT },
  publish_now: { from: ["draft", "scheduled", "queued", "error"], roles: ["owner"] },
};

/** The actions after which C5 sends the post to its targets. */
const SENDS: readonly PostAction[] = ["approve", "schedule", "publish_now"];

/** Content (body, targets, media) may change only here; the database refuses the rest too (0098). */
export const EDITABLE_STATES: readonly PostState[] = ["draft", "review", "scheduled", "error", "rotation"];

function futureTime(value: string | undefined, now: Date): string {
  const t = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(t)) throw new TransitionError("invalid", "scheduledAt is required (ISO time)");
  if (t <= now.getTime()) throw new TransitionError("invalid", "scheduledAt must be in the future");
  return new Date(t).toISOString();
}

export function transition(post: PostSnapshot, action: PostAction, role: BrandRole, input: TransitionInput = {},
  now: Date = new Date()): Transition {
  const rule = RULES[action];
  if (!rule.roles.includes(role)) throw new TransitionError("forbidden", `${role} may not ${action}`);
  if (!rule.from.includes(post.state)) throw new TransitionError("illegal", `cannot ${action} a ${post.state} post`);
  const keep = { scheduledAt: post.scheduledAt, listId: null, listPosition: null };
  if (SENDS.includes(action)) {
    if (post.targetCount === 0) throw new TransitionError("invalid", "pick at least one channel first");
    if (!post.hasContent) throw new TransitionError("invalid", "there is nothing to send: add text or media");
  }
  if (action === "to_rotation" && !post.hasContent) throw new TransitionError("invalid", "there is nothing to send: add text or media");
  switch (action) {
    case "submit":
      return { ...keep, state: "review" };
    case "approve":
    case "schedule":
      return { ...keep, state: "scheduled", scheduledAt: futureTime(input.scheduledAt, now) };
    case "reject":
      if (!input.reason?.trim()) throw new TransitionError("invalid", "a rejection needs a reason");
      return { ...keep, state: "draft" };
    case "unschedule":
    case "from_rotation":
      return { ...keep, state: "draft" };
    case "to_rotation":
      if (!input.listId || !Number.isInteger(input.listPosition) || (input.listPosition as number) < 0) {
        throw new TransitionError("invalid", "listId and a listPosition >= 0 are required");
      }
      return { state: "rotation", scheduledAt: null, listId: input.listId, listPosition: input.listPosition as number };
    case "delete":
      return { ...keep, state: "deleted" };
    case "restore":
      // a deleted published post comes back published, never as a draft that would be sent twice (0096)
      return { ...keep, state: post.publishedAt ? "published" : "draft" };
    case "publish_now":
      if (input.confirmPublishNow !== true) throw new TransitionError("invalid", "publishing now needs confirmPublishNow=true");
      return { ...keep, state: "scheduled", scheduledAt: now.toISOString() };
  }
  throw new TransitionError("illegal", `unknown action ${action as string}`);
}
