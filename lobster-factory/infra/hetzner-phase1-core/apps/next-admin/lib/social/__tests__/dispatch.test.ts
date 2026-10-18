// The sender's decisions (SOCIAL_MANAGER_PLAN.md C5 acceptance): dry run writes nothing, a send writes its Postiz id
// back, Postiz ERROR becomes error (+ incident), 429 backs off and keeps the target pending, an uncertain send is
// adopted instead of resent, a write-back on a withdrawn post deletes the orphan. The database side of each step is
// proven by packages/db/scripts/0100_social_dispatch-local-verify.sh; here the ports are an in-memory fake.
// posts-states.constructed.json: built from the real posts-with-draft.json row (only id/state/error/releaseURL changed).
import { describe, expect, it, vi } from "vitest";
import { PostizApiError, type PostizPost, type RawIntegration } from "@/lib/content/postiz";
import { MAX_POSTIZ_CALLS, runDispatch, type DispatchPorts, type LeaseResult, type QueuedPost } from "../dispatch";
import states from "@/lib/content/__tests__/fixtures/postiz-v2.25.1/posts-states.constructed.json";

const NOW = new Date("2026-10-15T09:55:00Z");
const INTEGRATION = "cmqe3jw960001p58nt0xohbi8";
const live: RawIntegration[] = [{ id: INTEGRATION, name: "soulful", identifier: "bluesky", picture: null, disabled: false, profile: "x" }];
const [PUB, ERR, QUE0] = (states as { posts: PostizPost[] }).posts;
// the Postiz copy of an uncertain send: Postiz's own id, our key in its settings (createPost)
const QUE: PostizPost = { ...QUE0, settings: JSON.stringify({ __type: "bluesky", awarewave_send_key: "key-uncertain" }) };

function post(targets: Array<Partial<QueuedPost["targets"][number]>>, extra: Partial<QueuedPost> = {}): QueuedPost {
  return {
    id: "p1", organizationId: "org", version: 7, state: "queued", scheduledAt: "2026-10-15T10:00:00Z", updatedAt: "2026-10-15T09:50:00Z", body: "launch day",
    comments: [], linkUrl: null, linkUtm: false, media: [],
    targets: targets.map((t, i) => ({ id: `t${i + 1}`, accountId: "acc", platform: "bluesky", integrationId: INTEGRATION, accountStatus: "connected",
      customBody: null, format: "post", state: "pending", postizPostId: null, updatedAt: "2026-10-15T09:00:00Z", ...t })),
    ...extra,
  };
}

function fakePorts(posts: QueuedPost[], opts: { lease?: LeaseResult; postizPosts?: PostizPost[]; recordSendOk?: boolean; orphans?: string[] } = {}) {
  const calls: string[] = [];
  const ports: DispatchPorts & { calls: string[] } = {
    calls,
    getBackoff: vi.fn(async () => null),
    setBackoff: vi.fn(async () => undefined),
    claimDue: vi.fn(async () => posts.length),
    loadDue: vi.fn(async () => posts),
    loadQueued: vi.fn(async () => posts),
    beginSend: vi.fn(async (_p, t) => ({ lease: opts.lease ?? "go", sendKey: opts.lease === "uncertain" ? "key-uncertain" : `key-${t}` })),
    recordSend: vi.fn(async (_p, t, id, err) => { calls.push(`record ${t} ${id} ${err}`); return opts.recordSendOk ?? true; }),
    resetTarget: vi.fn(async (_p, t, id) => { calls.push(`reset ${t} ${id}`); return true; }),
    recordOutcome: vi.fn(async (p, changes) => {
      const t = p.targets.map((x) => changes.find((c) => c.id === x.id)?.state ?? x.state);
      return t.some((s) => s === "pending" || s === "queued") ? "queued" : t.some((s) => s === "error") ? "error" : "published";
    }),
    setAccountStatus: vi.fn(async () => undefined),
    sendAllowed: vi.fn(async () => true),
    loadOrphans: vi.fn(async () => opts.orphans ?? []),
    orphanGone: vi.fn(async (id: string) => { calls.push(`gone ${id}`); }),
    orphanFailed: vi.fn(async (id: string) => { calls.push(`failed ${id}`); }),
    raiseIncident: vi.fn(async () => null),
    postiz: {
      integrations: vi.fn(async () => live),
      listPosts: vi.fn(async () => opts.postizPosts ?? []),
      createPost: vi.fn(async (o: { sendKey: string }) => { calls.push("create"); return o.sendKey === "key-t1" ? "pz-new" : `pz-${o.sendKey}`; }),
      deletePost: vi.fn(async (id: string) => { calls.push(`delete ${id}`); return { existed: true }; }),
    },
  };
  return ports;
}

describe("runDispatch", () => {
  it("dry run: lists what would be sent, claims nothing, writes nothing, calls no Postiz", async () => {
    const ports = fakePorts([post([{}, { platform: "pinterest" }], { state: "scheduled" })]);
    vi.mocked(ports.loadQueued).mockResolvedValue([]);
    const r = await runDispatch(ports, { mode: "dry_run", now: NOW });
    expect(r.wouldSend).toEqual([
      { postId: "p1", targetId: "t1", platform: "bluesky", type: "schedule", chars: 10 },
      expect.objectContaining({ targetId: "t2", error: expect.stringMatching(/pinterest/) }),
    ]);
    expect(ports.claimDue).not.toHaveBeenCalled();
    expect(ports.recordSend).not.toHaveBeenCalled();
    expect(ports.postiz.createPost).not.toHaveBeenCalled();
    expect(ports.postiz.integrations).not.toHaveBeenCalled();
  });

  it("sends a due post at its time and writes the Postiz id back", async () => {
    const ports = fakePorts([post([{}])]);
    const r = await runDispatch(ports, { mode: "apply", now: NOW });
    expect(ports.postiz.createPost).toHaveBeenCalledWith(expect.objectContaining({
      sendKey: "key-t1", integrationId: INTEGRATION, type: "schedule", date: "2026-10-15T10:00:00Z", settings: { __type: "bluesky" },
      values: [{ content: "<p>launch day</p>", image: [] }] }));
    expect(ports.recordSend).toHaveBeenCalledWith(expect.anything(), "t1", "pz-new", null);
    expect([r.claimed, r.sent, r.errors]).toEqual([1, 1, []]);
    expect(ports.recordOutcome).not.toHaveBeenCalled();   // just sent: its result comes on a later run
  });

  it("reconciles: PUBLISHED -> published with releaseURL, ERROR -> error with Postiz's message and an incident", async () => {
    const ports = fakePorts([post([{ state: "queued", postizPostId: PUB.id }, { state: "queued", postizPostId: ERR.id }, { state: "queued", postizPostId: QUE.id }]),
      post([{ state: "queued", postizPostId: ERR.id }], { id: "p2" })], { postizPosts: [PUB, ERR, QUE] });
    const r = await runDispatch(ports, { mode: "apply", now: NOW });
    expect(ports.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }), [
      { id: "t1", state: "published", release_url: PUB.releaseURL },
      { id: "t2", state: "error", error: "Invalid token: the channel must be reconnected" },
    ]);
    expect(ports.postiz.listPosts).toHaveBeenCalledTimes(1);   // one window read per run, whatever the number of posts
    expect(r.errored).toBe(1);
    expect(ports.raiseIncident).toHaveBeenCalledWith(expect.objectContaining({ id: "p2" }), expect.stringMatching(/Invalid token/));
  });

  it("429: nothing reached Postiz -- the target stays pending, the sender backs off until the reset", async () => {
    const ports = fakePorts([post([{}, {}])]);
    vi.mocked(ports.postiz.createPost).mockRejectedValueOnce(new PostizApiError(429, "rate", 1800));
    const r = await runDispatch(ports, { mode: "apply", now: NOW });
    expect(ports.calls).toEqual(["record t1 null null"]);   // lease dropped, no second send in this run
    expect(ports.setBackoff).toHaveBeenCalledWith(new Date(NOW.getTime() + 1800_000));
    expect(r.backoffUntil).toBe("2026-10-15T10:25:00.000Z");
    const later = fakePorts([post([{}])]);
    vi.mocked(later.getBackoff).mockResolvedValue(new Date(NOW.getTime() + 60_000));
    expect((await runDispatch(later, { mode: "apply", now: NOW })).backoffUntil).not.toBeNull();
    expect(later.claimDue).not.toHaveBeenCalled();
  });

  it("a refusal is an error; a 5xx or timeout keeps the lease (uncertain) and writes nothing", async () => {
    const refused = fakePorts([post([{}])]);
    vi.mocked(refused.postiz.createPost).mockRejectedValueOnce(new PostizApiError(400, "bad settings"));
    await runDispatch(refused, { mode: "apply", now: NOW });
    expect(refused.recordSend).toHaveBeenCalledWith(expect.anything(), "t1", null, expect.stringMatching(/refused.*bad settings/));
    const flaky = fakePorts([post([{}])]);
    vi.mocked(flaky.postiz.createPost).mockRejectedValueOnce(new Error("The operation was aborted due to timeout"));
    const r = await runDispatch(flaky, { mode: "apply", now: NOW });
    expect(flaky.recordSend).not.toHaveBeenCalled();
    expect(r.uncertain).toBe(1);
  });

  // review 2026-10-15 (text matching flagged twice; then: Postiz assigns its own ids): decided by the key in settings
  it("an uncertain send is found in Postiz by its send key, or sent again with that same key", async () => {
    const found = fakePorts([post([{}])], { lease: "uncertain", postizPosts: [QUE] });
    const r = await runDispatch(found, { mode: "apply", now: NOW });
    expect(found.postiz.createPost).not.toHaveBeenCalled();
    expect(found.recordSend).toHaveBeenCalledWith(expect.anything(), "t1", QUE.id, null);   // Postiz's id, found by our key
    expect(r.adopted).toBe(1);
    // same text, no key (a person's post, or another link): not this send -- send again, same key
    const other = { ...QUE, id: "someone-elses", settings: JSON.stringify({ __type: "bluesky" }) };
    const missing = fakePorts([post([{}])], { lease: "uncertain", postizPosts: [other] });
    await runDispatch(missing, { mode: "apply", now: NOW });
    expect(missing.postiz.createPost).toHaveBeenCalledWith(expect.objectContaining({ sendKey: "key-uncertain" }));
    // found first, even when the channel was disconnected since the first try
    const offline = fakePorts([post([{}])], { lease: "uncertain", postizPosts: [QUE] });
    vi.mocked(offline.postiz.integrations).mockResolvedValue([{ ...live[0], disabled: true }]);
    await runDispatch(offline, { mode: "apply", now: NOW });
    expect(offline.recordSend).toHaveBeenCalledWith(expect.anything(), "t1", QUE.id, null);
  });

  it("the time is checked again right before the Postiz call: slow checks give the lease back unsent", async () => {
    let t = 0;
    const ports = fakePorts([post([{}])]);
    vi.mocked(ports.postiz.integrations).mockImplementation(async () => { t = 200_000; return live; });
    const r = await runDispatch(ports, { mode: "apply", now: NOW, clock: () => t });
    expect(ports.postiz.createPost).not.toHaveBeenCalled();
    expect(ports.recordSend).toHaveBeenCalledWith(expect.anything(), "t1", null, null);
    expect(r.stoppedEarly).toBe("time");
  });

  it("a failed target is resent only after its Postiz ERROR post is deleted; published ones are left alone", async () => {
    const ports = fakePorts([post([{ state: "error", postizPostId: ERR.id }, { state: "published", postizPostId: PUB.id }])]);
    await runDispatch(ports, { mode: "apply", now: NOW });
    expect(ports.calls).toEqual([`delete ${ERR.id}`, `reset t1 ${ERR.id}`, "create", "record t1 pz-new null"]);
  });

  it("a write-back refused (post withdrawn meanwhile) deletes the Postiz post it just made, even on the run's last call", async () => {
    const ports = fakePorts([post([{}])], { recordSendOk: false });
    const r = await runDispatch(ports, { mode: "apply", now: NOW });
    expect(ports.calls).toEqual(["create", "record t1 pz-new null", "delete pz-new", "gone pz-new"]);
    expect(r.orphansDeleted).toBe(1);
    // review 2026-10-15: the create that used the last call of the budget must not leave its orphan behind
    const last = fakePorts(Array.from({ length: MAX_POSTIZ_CALLS }, (_, i) => post([{ id: `t${i}` }], { id: `p${i}` })), { recordSendOk: false });
    const rl = await runDispatch(last, { mode: "apply", now: NOW });
    const creates = vi.mocked(last.postiz.createPost).mock.calls.length;
    expect(rl.postizCalls).toBe(MAX_POSTIZ_CALLS + 1);   // the last create used the budget; its delete still ran
    expect([rl.orphansDeleted, vi.mocked(last.postiz.deletePost).mock.calls.length]).toEqual([creates, creates]);
  });

  // review 2026-10-15: a withdrawn post's Postiz copy must never be forgotten, or it goes out anyway
  it("an orphan whose delete fails stays recorded and is deleted on a later run first", async () => {
    const ports = fakePorts([post([{}])], { recordSendOk: false });
    vi.mocked(ports.postiz.deletePost).mockRejectedValueOnce(new Error("Postiz 502"));
    const r = await runDispatch(ports, { mode: "apply", now: NOW });
    expect(ports.calls).toEqual(["create", "record t1 pz-new null", "failed pz-new"]);
    expect(r.errors.join()).toMatch(/orphan pz-new/);
    const later = fakePorts([], { orphans: ["pz-new"] });
    const rl = await runDispatch(later, { mode: "apply", now: NOW });
    expect(later.calls).toEqual(["delete pz-new", "gone pz-new"]);
    expect(rl.orphansDeleted).toBe(1);
  });

  it("the time budget is checked before every send, so a slow run stops between targets, not inside one", async () => {
    let t = 0;
    const ports = fakePorts([post([{}, {}, {}])]);
    vi.mocked(ports.postiz.createPost).mockImplementation(async (o) => { t += 100_000; return `pz-${o.sendKey}`; });
    const r = await runDispatch(ports, { mode: "apply", now: NOW, clock: () => t });
    expect([vi.mocked(ports.postiz.createPost).mock.calls.length, r.stoppedEarly]).toEqual([2, "time"]);
    expect(vi.mocked(ports.beginSend).mock.calls.length).toBe(2);   // the third never took a lease
  });

  it("an incident that could not be raised fails the run (Sentry), not a green result", async () => {
    const ports = fakePorts([post([{ state: "queued", postizPostId: ERR.id }])], { postizPosts: [ERR] });
    vi.mocked(ports.raiseIncident).mockResolvedValue("upsert:db down");
    const r = await runDispatch(ports, { mode: "apply", now: NOW });
    expect(r.errors.join()).toMatch(/incident not raised/);
  });

  it("a post sent late (held back for over a week) still has its fresh Postiz result read", async () => {
    const old = post([{ state: "queued", postizPostId: PUB.id }], { scheduledAt: "2026-10-01T10:00:00Z" });
    const ports = fakePorts([old], { postizPosts: [PUB] });
    await runDispatch(ports, { mode: "apply", now: NOW });
    expect(ports.recordOutcome).toHaveBeenCalledWith(expect.anything(), [{ id: "t1", state: "published", release_url: PUB.releaseURL }]);
  });

  it("a channel disconnected in Postiz is not sent: target error, account expired", async () => {
    const ports = fakePorts([post([{}])]);
    vi.mocked(ports.postiz.integrations).mockResolvedValue([{ ...live[0], disabled: true }]);
    await runDispatch(ports, { mode: "apply", now: NOW });
    expect(ports.postiz.createPost).not.toHaveBeenCalled();
    expect(ports.setAccountStatus).toHaveBeenCalledWith("acc", "expired");
    expect(ports.recordSend).toHaveBeenCalledWith(expect.anything(), "t1", null, expect.stringMatching(/reconnect/));
    expect(ports.recordOutcome).toHaveBeenCalledWith(expect.anything(), []);   // nothing open: the post settles to error
  });

  it("a brand in a blocking system mode sends nothing; its queued results are still read back", async () => {
    const ports = fakePorts([post([{}]), post([{ state: "queued", postizPostId: PUB.id }], { id: "p2" })], { postizPosts: [PUB] });
    vi.mocked(ports.sendAllowed).mockResolvedValue(false);
    const r = await runDispatch(ports, { mode: "apply", now: NOW });
    expect(ports.postiz.createPost).not.toHaveBeenCalled();
    expect(ports.beginSend).not.toHaveBeenCalled();
    expect(r.blockedByMode).toBe(1);
    expect(ports.sendAllowed).toHaveBeenCalledTimes(1);   // once per brand per run
    expect(ports.recordOutcome).toHaveBeenCalledWith(expect.objectContaining({ id: "p2" }), [{ id: "t1", state: "published", release_url: PUB.releaseURL }]);
  });

  it("draft mode: the same pipeline, but Postiz only stores a draft", async () => {
    const ports = fakePorts([post([{}])]);
    await runDispatch(ports, { mode: "draft", now: NOW });
    expect(ports.postiz.createPost).toHaveBeenCalledWith(expect.objectContaining({ type: "draft" }));
    expect(ports.recordSend).toHaveBeenCalledWith(expect.anything(), "t1", "pz-new", null);
  });

  // review 2026-10-15 R5
  it("a target refused during this claim is not sent again next run while the others are still open", async () => {
    const ports = fakePorts([post([{ state: "error", postizPostId: null, updatedAt: "2026-10-15T09:52:00Z" }, { state: "queued", postizPostId: QUE.id }])], { postizPosts: [QUE] });
    await runDispatch(ports, { mode: "apply", now: NOW });
    expect(ports.resetTarget).not.toHaveBeenCalled();
    expect(ports.postiz.createPost).not.toHaveBeenCalled();
  });

  it("a rehearsal draft left in Postiz settles as an error once the sender is out of draft mode", async () => {
    const draft = { ...QUE, state: "DRAFT" as const };
    const ports = fakePorts([post([{ state: "queued", postizPostId: draft.id }])], { postizPosts: [draft] });
    await runDispatch(ports, { mode: "apply", now: NOW });
    expect(ports.recordOutcome).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ id: "t1", state: "error", error: expect.stringMatching(/rehearsal/) })]);
    const still = fakePorts([post([{ state: "queued", postizPostId: draft.id }])], { postizPosts: [draft] });
    await runDispatch(still, { mode: "draft", now: NOW });
    expect(still.recordOutcome).not.toHaveBeenCalled();
  });

  it("a link compose cannot read fails that target, never the run (its lease would hang)", async () => {
    const ports = fakePorts([post([{}], { linkUrl: "https://", linkUtm: true })]);
    const r = await runDispatch(ports, { mode: "apply", now: NOW });
    expect(ports.recordSend).toHaveBeenCalledWith(expect.anything(), "t1", null, expect.stringMatching(/not a full web address/));
    expect(r.errors).toEqual([]);
  });

  it("a past-due post (publish now, or a backlog) goes out as type now", async () => {
    const ports = fakePorts([post([{}], { scheduledAt: "2026-10-15T09:50:00Z" })]);
    await runDispatch(ports, { mode: "apply", now: NOW });
    expect(ports.postiz.createPost).toHaveBeenCalledWith(expect.objectContaining({ type: "now" }));
  });
});
