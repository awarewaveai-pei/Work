import { describe, expect, it } from "vitest";
import { transition, TransitionError, type BrandRole, type PostAction, type PostSnapshot, type PostState } from "../state";

const STATES: PostState[] = ["draft", "review", "scheduled", "queued", "published", "error", "rotation", "deleted"];
const ROLES: BrandRole[] = ["owner", "editor", "reviewer", "client"];
const ACTIONS: PostAction[] = ["submit", "approve", "reject", "schedule", "unschedule", "to_rotation", "from_rotation", "delete", "restore", "publish_now"];

// Written out independently of RULES: which actions each state allows, and to whom.
const LEGAL: Record<PostAction, { from: PostState[]; roles: BrandRole[] }> = {
  submit: { from: ["draft"], roles: ["owner", "editor"] },
  approve: { from: ["review"], roles: ["owner", "reviewer"] },
  reject: { from: ["review"], roles: ["owner", "reviewer"] },
  schedule: { from: ["draft", "scheduled", "queued", "error"], roles: ["owner", "editor"] },
  unschedule: { from: ["scheduled", "queued"], roles: ["owner", "editor"] },
  to_rotation: { from: ["draft"], roles: ["owner", "editor"] },
  from_rotation: { from: ["rotation"], roles: ["owner", "editor"] },
  delete: { from: ["draft", "review", "scheduled", "queued", "error", "rotation", "published"], roles: ["owner", "editor"] },
  restore: { from: ["deleted"], roles: ["owner", "editor"] },
  publish_now: { from: ["draft", "scheduled", "queued", "error"], roles: ["owner"] },
};

const NOW = new Date("2026-10-15T00:00:00Z");
const INPUT = { scheduledAt: "2026-10-16T09:00:00Z", listId: "l1", listPosition: 0, reason: "tone", confirmPublishNow: true };
const post = (state: PostState, extra: Partial<PostSnapshot> = {}): PostSnapshot =>
  ({ state, scheduledAt: "2026-10-15T09:00:00Z", listId: null, listPosition: null, publishedAt: null, targetCount: 1, hasContent: true, ...extra });

describe("social post transitions", () => {
  it("every action x state x role is allowed exactly when the table says so", () => {
    for (const action of ACTIONS) for (const state of STATES) for (const role of ROLES) {
      const legal = LEGAL[action].from.includes(state) && LEGAL[action].roles.includes(role);
      const run = () => transition(post(state), action, role, INPUT, NOW);
      if (legal) expect(run, `${role} ${action} ${state}`).not.toThrow();
      else expect(run, `${role} ${action} ${state}`).toThrow(TransitionError);
    }
  });

  it("a client (read-only) can do nothing; a queued post (already in Postiz) can only be moved, unscheduled or deleted", () => {
    for (const action of ACTIONS) {
      expect(() => transition(post("draft"), action, "client", INPUT, NOW)).toThrow(/client may not/);
      const fromQueued = () => transition(post("queued"), action, "owner", INPUT, NOW);
      if (["schedule", "unschedule", "delete", "publish_now"].includes(action)) expect(fromQueued, action).not.toThrow();
      else expect(fromQueued, action).toThrow(TransitionError);
    }
  });

  it("scheduling needs a future time; rejecting needs a reason; publishing now needs the confirmation", () => {
    expect(() => transition(post("draft"), "schedule", "editor", { scheduledAt: "2026-10-14T00:00:00Z" }, NOW)).toThrow(/future/);
    expect(() => transition(post("draft"), "schedule", "editor", {}, NOW)).toThrow(/required/);
    expect(() => transition(post("review"), "reject", "reviewer", { reason: "  " }, NOW)).toThrow(/reason/);
    expect(() => transition(post("draft"), "publish_now", "owner", {}, NOW)).toThrow(/confirmPublishNow/);
    expect(transition(post("draft"), "publish_now", "owner", { confirmPublishNow: true }, NOW))
      .toMatchObject({ state: "scheduled", scheduledAt: NOW.toISOString() });
  });

  it("restore brings a published post back published, never as a draft that would be sent twice", () => {
    expect(transition(post("deleted", { publishedAt: "2026-10-10T00:00:00Z" }), "restore", "editor", {}, NOW).state).toBe("published");
    expect(transition(post("deleted"), "restore", "editor", {}, NOW).state).toBe("draft");
  });

  it("rotation holds a list slot and no time", () => {
    expect(transition(post("draft"), "to_rotation", "editor", { listId: "l1", listPosition: 3 }, NOW))
      .toEqual({ state: "rotation", scheduledAt: null, listId: "l1", listPosition: 3 });
    expect(() => transition(post("draft"), "to_rotation", "editor", { listId: "l1", listPosition: -1 }, NOW)).toThrow(/listPosition/);
  });

  // review 2026-10-15: a slot kept after leaving rotation broke 0096's shape (the list could never be deleted) and made
  // a manual post look like a C7 slot
  it("every action except to_rotation leaves no list slot behind", () => {
    const inList = { listId: "l1", listPosition: 2 };
    for (const action of ACTIONS) for (const state of LEGAL[action].from) {
      if (action === "to_rotation") continue;
      const next = transition(post(state, state === "rotation" ? { ...inList, scheduledAt: null } : { listId: "l1" }), action, "owner", INPUT, NOW);
      expect([next.listId, next.listPosition], `${action} ${state}`).toEqual([null, null]);
    }
  });

  it("nothing is scheduled or sent without a channel and something to send", () => {
    for (const action of ["approve", "schedule", "publish_now"] as const) {
      const from = LEGAL[action].from[0];
      expect(() => transition(post(from, { targetCount: 0 }), action, "owner", INPUT, NOW), action).toThrow(/channel/);
      expect(() => transition(post(from, { hasContent: false }), action, "owner", INPUT, NOW), action).toThrow(/nothing to send/);
    }
    expect(() => transition(post("draft", { hasContent: false }), "to_rotation", "owner", INPUT, NOW)).toThrow(/nothing to send/);
    expect(transition(post("draft", { targetCount: 0 }), "to_rotation", "owner", INPUT, NOW).state).toBe("rotation");   // the list's accounts send it
  });
});

// C8: the role matrix with the brand's review setting. Six actions a person does on a post, four roles, review off/on.
describe("review required (C8, migration 0102)", () => {
  const SIX: PostAction[] = ["submit", "approve", "reject", "schedule", "publish_now", "delete"];
  const FROM: Record<string, PostState> = { submit: "draft", approve: "review", reject: "review", schedule: "draft", publish_now: "draft", delete: "draft" };
  // with review on, the only change: an editor cannot put a draft on the schedule (submit instead)
  const allowed = (action: PostAction, role: BrandRole, review: boolean) =>
    LEGAL[action].roles.includes(role) && !(review && role === "editor" && action === "schedule");
  it("4 roles x 6 actions, review off and on", () => {
    for (const review of [false, true]) for (const action of SIX) for (const role of ROLES) {
      const run = () => transition(post(FROM[action]), action, role, { ...INPUT, requireReview: review }, NOW);
      if (allowed(action, role, review)) expect(run, `${review} ${role} ${action}`).not.toThrow();
      else expect(run, `${review} ${role} ${action}`).toThrow(TransitionError);
    }
  });
  it("with review on an editor may still move an approved post, and an owner may still schedule a draft", () => {
    expect(() => transition(post("scheduled"), "schedule", "editor", { ...INPUT, requireReview: true }, NOW)).not.toThrow();
    expect(() => transition(post("draft"), "schedule", "owner", { ...INPUT, requireReview: true }, NOW)).not.toThrow();
    expect(() => transition(post("error"), "schedule", "editor", { ...INPUT, requireReview: true }, NOW)).toThrow(/needs review/);
    expect(() => transition(post("draft"), "to_rotation", "editor", { ...INPUT, requireReview: true }, NOW)).toThrow(/needs review/);
    expect(() => transition(post("draft"), "to_rotation", "owner", { ...INPUT, requireReview: true }, NOW)).not.toThrow();
  });
});
