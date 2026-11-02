// Reply sync against a fake Gmail and a fake store (card C4.7): per-message sent detection (a sent first email never
// marks its follow-up), edited and deleted drafts, same-thread reply, a new-thread unsubscribe, a bounce, one claim per
// mail, a failed classification retried next tick, history 404 -> dated scan, the cursor moving only after every page.
// The side effects themselves are SQL (co_apply_reply), tested in packages/db/tests/test_0153_co_replies.py.
import { afterEach, describe, expect, it, vi } from "vitest";
import { GmailNotFound, type GmailApi, type GmailMessage } from "../gmail-api";
import { gmailApi, replyText } from "../gmail-api";
import { runGmailSync, type Classification, type GmailSyncState, type NewReply, type PendingSend, type StoredReply, type SyncConnector, type SyncStore } from "../gmail-sync";

const CONN: SyncConnector = { id: "c1", organization_id: "org", created_at: "2026-11-01T00:00:00Z", settings: { email: "me@pool.example", gmail_sync: { history_id: "100" } } };
const T0 = Date.parse("2026-11-02T01:00:00Z");
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

function mail(id: string, opts: { from?: string; subject?: string; thread?: string; labels?: string[]; at?: number; text?: string; headers?: Record<string, string> } = {}): GmailMessage {
  const headers = { From: opts.from ?? "Boss <boss@shop.example>", Subject: opts.subject ?? "Re: 合作", "Message-ID": `<${id}@mail>`, ...(opts.headers ?? {}) };
  return { id, threadId: opts.thread ?? `t-${id}`, labelIds: opts.labels ?? ["INBOX"], internalDate: String(opts.at ?? T0 + 3_600_000),
    payload: { mimeType: "multipart/alternative", headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
      parts: [{ mimeType: "text/plain", body: { data: b64(opts.text ?? "請問價格？\n\n> 原本的信") } }] } };
}

class FakeGmail implements GmailApi {
  messages = new Map<string, GmailMessage>();
  drafts = new Map<string, { id: string; message: { id: string; threadId: string } }>();
  historyPages: Array<{ ids: string[]; next?: string }> | "expired" = [{ ids: [] }];
  inbox: string[] = [];
  failPage2 = false;
  calls: string[] = [];
  async profile() { return { emailAddress: "me@pool.example", historyId: "900" }; }
  async message(id: string, _format?: string) { this.calls.push(`get:${id}`); const m = this.messages.get(id); if (!m) throw new GmailNotFound("messages.get"); return m; }
  async thread(id: string) { return { id, messages: [...this.messages.values()].filter((m) => m.threadId === id) }; }
  onDraftMiss: (() => void) | null = null;
  async draft(id: string) { const d = this.drafts.get(id); if (!d) { this.onDraftMiss?.(); throw new GmailNotFound("drafts.get"); } return d; }
  async list(q: string) {
    this.calls.push(`list:${q}`);
    const before = Number(/before:(\d+)/.exec(q)?.[1] ?? Infinity);
    const ids = q.startsWith("in:inbox") ? this.inbox : [...this.messages.values()].filter((m) => m.labelIds?.includes("SENT")).map((m) => m.id);
    return { ids: ids.filter((id) => Number(this.messages.get(id)?.internalDate ?? 0) / 1000 < before) };
  }
  async history(_start: string, token?: string) {
    if (this.historyPages === "expired") throw new GmailNotFound("history.list");
    const i = token ? Number(token) : 0;
    if (i === 1 && this.failPage2) throw new Error("gmail history.list 500");
    return { ...this.historyPages[i], historyId: `h${i}` };
  }
}

class FakeStore implements SyncStore {
  sends: PendingSend[] = [];
  sent = new Map<string, string>();      // co message id -> gmail message id
  unsent: string[] = [];
  meta: Record<string, unknown> = {};
  leads: Record<string, { id: string; organization_id: string | null }> = { "boss@shop.example": { id: "lead-1", organization_id: "org" } };
  threads: Record<string, { id: string; organization_id: string | null; message_id: string | null }> = {};
  replies: Array<NewReply & { id: string; done?: string; attempts: number }> = [];
  state: GmailSyncState = { history_id: "100" };
  async connectors() { return [{ ...CONN, settings: { ...CONN.settings, gmail_sync: this.state } }]; }
  async pendingSends() { return this.sends.filter((s) => !this.sent.has(s.messageId) && !this.unsent.includes(s.messageId)); }
  async setDraftMeta(eventId: string, meta: unknown) { this.meta[eventId] = meta; }
  async sentElsewhere(g: string) { return [...this.sent.values()].includes(g); }
  async markSent(m: string, _at: string, g: string) { if (this.sent.has(m) || [...this.sent.values()].includes(g)) return false; this.sent.set(m, g); return true; }
  async markUnsent(m: string) { this.unsent.push(m); return true; }
  async leadForAddress(_c: SyncConnector, email: string) { return this.leads[email] ?? null; }
  async leadForThread(_c: SyncConnector, t: string) { return this.threads[t] ?? null; }
  async lastSentMessage() { return "msg-last"; }
  async claimReply(row: NewReply) { if (this.replies.some((r) => r.dedupe_key === row.dedupe_key)) return null; const id = `r${this.replies.length + 1}`; this.replies.push({ ...row, id, attempts: 0 }); return id; }
  async pendingReplies() { return this.replies.filter((r) => !r.done && r.attempts < 5) as StoredReply[]; }
  async applyReply(id: string, c: Classification) { const r = this.replies.find((x) => x.id === id)!; if (r.done) return "already"; r.done = c.type; return "applied"; }
  async failReply(id: string) { const r = this.replies.find((x) => x.id === id)!; r.attempts++; if (r.attempts >= 5) r.done = "unprocessed"; return r.attempts; }
  async saveState(_id: string, patch: GmailSyncState, clear?: number) {
    const next: Record<string, unknown> = { ...this.state, ...patch };
    for (const k of Object.keys(next)) if (next[k] === null) delete next[k];  // co_merge_gmail_sync strips nulls
    if (clear !== undefined && next.rescan_days === clear) delete next.rescan_days;
    this.state = next as GmailSyncState;
  }
}

function setup() {
  const gmail = new FakeGmail();
  const store = new FakeStore();
  const classified: string[] = [];
  const pushes: string[] = [];
  let classifyFails = 0;
  const deps = {
    store, gmailFor: async () => gmail, notify: async (t: string) => { pushes.push(t); },
    classify: async (r: StoredReply): Promise<Classification> => {
      classified.push(r.id);
      if (classifyFails > 0) { classifyFails--; throw new Error("openai_502"); }
      return { type: "pricing", by: "ai", suggested: "回報價", interpretation: "問價" };
    },
    now: () => new Date(T0 + 7_200_000),
  };
  return { gmail, store, deps, classified, pushes, failClassify: (n: number) => { classifyFails = n; } };
}

const send = (id: string, over: Partial<PendingSend> = {}): PendingSend => ({ messageId: id, status: "drafted", sendingSince: null, subject: "合作提案", leadEmail: "boss@shop.example", eventId: `e-${id}`,
  draftedAt: new Date(T0).toISOString(), draftId: `d-${id}`, gmailMessageId: `g-${id}`, threadId: "t-1", ...over });

describe("sent detection", () => {
  it("a sent first email is marked; its follow-up still in Gmail drafts is not -- even when the follow-up's message id changed", async () => {
    const { gmail, store, deps } = setup();
    store.sends = [send("first"), send("follow", { draftedAt: new Date(T0 + 86_400_000).toISOString() })];
    gmail.messages.set("g-first", mail("g-first", { thread: "t-1", labels: ["SENT"], at: T0 + 60_000 }));
    // the follow-up was edited in Gmail: its old message is gone, the draft lives under a new message in the same thread
    gmail.messages.set("g-follow-2", mail("g-follow-2", { thread: "t-1", labels: ["DRAFT"], at: T0 + 90_000_000 }));
    gmail.drafts.set("d-follow", { id: "d-follow", message: { id: "g-follow-2", threadId: "t-1" } });
    const r = await runGmailSync(deps);
    expect(r.errors).toEqual([]);
    expect([...store.sent]).toEqual([["first", "g-first"]]);
    expect(store.unsent).toEqual([]);
    expect(store.meta["e-follow"]).toEqual({ draftId: "d-follow", messageId: "g-follow-2", threadId: "t-1" });
  });

  it("sending a draft that changed its id: the thread's SENT message after the draft counts; the draft and the mail gone = needs_edit", async () => {
    const { gmail, store, deps } = setup();
    store.sends = [send("a"), send("b", { threadId: "t-b" })];
    gmail.messages.set("g-a-sent", mail("g-a-sent", { thread: "t-1", labels: ["SENT"], at: T0 + 120_000 }));
    const r = await runGmailSync(deps);
    expect(r.sent).toBe(1);
    expect(store.sent.get("a")).toBe("g-a-sent");
    expect(store.unsent).toEqual(["b"]);
  });

  it("an automatic send left 'sending' whose draft is still a draft: kept at 29 minutes, needs_edit at 31 (C8.3)", async () => {
    const { gmail, store, deps } = setup();
    const at = (min: number) => new Date(T0 + 7_200_000 - min * 60_000).toISOString();  // deps.now = T0 + 2 h
    store.sends = [send("fresh", { status: "sending", sendingSince: at(29) }), send("old", { status: "sending", sendingSince: at(31), threadId: "t-old" })];
    gmail.messages.set("g-fresh", mail("g-fresh", { thread: "t-1", labels: ["DRAFT"] }));
    gmail.messages.set("g-old", mail("g-old", { thread: "t-old", labels: ["DRAFT"] }));
    const r = await runGmailSync(deps);
    expect(r.errors).toEqual([]);
    expect(store.sent.size).toBe(0);
    expect(store.unsent).toEqual(["old"]);
  });

  it("no internalDate: the Date header dates it; neither is an error, never a 1970 date (Codex rounds 2-3)", async () => {
    const dated = setup();
    dated.store.sends = [send("hdr")];
    dated.gmail.messages.set("g-hdr", { ...mail("g-hdr", { thread: "t-1", labels: ["SENT"], headers: { Date: "Mon, 02 Nov 2026 09:30:00 +0800" } }), internalDate: undefined });
    await runGmailSync(dated.deps);
    expect(dated.store.sent.get("hdr")).toBe("g-hdr");

    const { gmail, store, deps } = setup();
    store.sends = [send("nodate")];
    gmail.messages.set("g-nodate", { ...mail("g-nodate", { thread: "t-1", labels: ["SENT"] }), internalDate: undefined });
    const r = await runGmailSync(deps);
    expect(store.sent.size).toBe(0);
    expect(r.errors[0]).toMatch(/no internalDate and no Date header/);
    const urls: string[] = [];
    const api = gmailApi("tok", (async (u: string) => { urls.push(u); return new Response(JSON.stringify({ id: "x", messages: [] })); }) as unknown as typeof fetch);
    await api.message("m1", "meta");
    await api.thread("t1");
    expect(urls.every((u) => u.includes("format=metadata"))).toBe(true);
  });

  it("a gone pre-C4.2 draft: one sent mail with its subject counts; another mail to the same person, or two matches, never (Codex round 3)", async () => {
    const one = setup();
    one.store.sends = [send("old", { gmailMessageId: null, threadId: null })];
    one.gmail.messages.set("other", mail("other", { labels: ["SENT"], subject: "上次的報價" }));
    one.gmail.messages.set("mine", mail("mine", { labels: ["SENT"], subject: "合作提案" }));
    await runGmailSync(one.deps);
    expect([...one.store.sent]).toEqual([["old", "mine"]]);

    const two = setup();
    two.store.sends = [send("old", { gmailMessageId: null, threadId: null })];
    two.gmail.messages.set("x1", mail("x1", { labels: ["SENT"], subject: "合作提案" }));
    two.gmail.messages.set("x2", mail("x2", { labels: ["SENT"], subject: "合作提案" }));
    await runGmailSync(two.deps);
    expect(two.store.sent.size).toBe(0);
    expect(two.store.unsent).toEqual(["old"]);

    const none = setup();
    none.store.sends = [send("old", { gmailMessageId: null, threadId: null })];
    none.gmail.messages.set("other", mail("other", { labels: ["SENT"], subject: "上次的報價" }));
    await runGmailSync(none.deps);
    expect(none.store.unsent).toEqual(["old"]);
  });

  it("a draft from before C4.2 (no message id) gets its ids from the draft", async () => {
    const { gmail, store, deps } = setup();
    store.sends = [send("old", { gmailMessageId: null, threadId: null })];
    gmail.drafts.set("d-old", { id: "d-old", message: { id: "g-old", threadId: "t-old" } });
    gmail.messages.set("g-old", mail("g-old", { thread: "t-old", labels: ["DRAFT"] }));
    await runGmailSync(deps);
    expect(store.meta["e-old"]).toEqual({ draftId: "d-old", messageId: "g-old", threadId: "t-old" });
    expect(store.sent.size + store.unsent.length).toBe(0);
  });
});

afterEach(() => { vi.restoreAllMocks(); });

describe("critic fixes", () => {
  it("the person sends between our thread read and the draft lookup: re-read the thread, it is sent, not needs_edit (M2)", async () => {
    const { gmail, store, deps } = setup();
    store.sends = [send("race")];
    gmail.onDraftMiss = () => { gmail.messages.set("g-race-sent", mail("g-race-sent", { thread: "t-1", labels: ["SENT"], at: T0 + 120_000 })); };
    await runGmailSync(deps);
    expect(store.sent.get("race")).toBe("g-race-sent");
    expect(store.unsent).toEqual([]);
  });

  it("a scan out of time stores where it stopped and the next tick goes on from there, then becomes the cursor (M1)", async () => {
    const { gmail, store, deps } = setup();
    store.state = {};  // first connection
    for (const [id, h] of [["n3", 3], ["n2", 2], ["n1", 1]] as const) {
      gmail.messages.set(id, mail(id, { at: T0 + h * 3_600_000, from: "boss@shop.example", subject: `第 ${h} 封` }));
      gmail.inbox.push(id);
    }
    let clock = 0;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const message = gmail.message.bind(gmail);
    gmail.message = async (id: string, f?: string) => { if (f === "meta") clock++; return message(id, f); };
    await runGmailSync({ ...deps, deadline: 0 });  // time for one mail per tick (late = now > deadline)
    expect(store.replies.map((x) => x.gmail_message_id)).toEqual(["n3"]);
    expect(store.state.scan?.before).toBe(Math.floor((T0 + 3 * 3_600_000) / 1000) + 1);
    expect(store.state.history_id).toBeUndefined();
    for (let i = 0; i < 2; i++) { clock = 0; await runGmailSync({ ...deps, deadline: 0 }); }  // n2; then n1, the last one, finishes it
    expect(store.replies.map((x) => x.gmail_message_id).sort()).toEqual(["n1", "n2", "n3"]);
    expect(store.state).toMatchObject({ history_id: "900" });
    expect(store.state.scan).toBeUndefined();
  });

  it("an out-of-office answer is not stored and stops nothing; a bounce with Auto-Submitted still counts (m3)", async () => {
    const { gmail, store, deps } = setup();
    store.leads["gone@shop.example"] = { id: "lead-2", organization_id: "org" };
    gmail.messages.set("ooo", mail("ooo", { subject: "休假中", headers: { "Auto-Submitted": "auto-replied" } }));
    gmail.messages.set("bo", mail("bo", { from: "mailer-daemon@googlemail.com", headers: { "Auto-Submitted": "auto-replied", "X-Failed-Recipients": "gone@shop.example" } }));
    gmail.historyPages = [{ ids: ["ooo", "bo"] }];
    await runGmailSync(deps);
    expect(store.replies.map((x) => [x.gmail_message_id, x.kind])).toEqual([["bo", "bounce"]]);
  });
});

describe("incoming mail", () => {
  it("a reply in our thread is claimed once, quoted text cut, and classified; the same mail again is not a second row", async () => {
    const { gmail, store, deps, classified } = setup();
    store.threads["t-1"] = { id: "lead-1", organization_id: "org", message_id: "msg-first" };
    gmail.messages.set("in-1", mail("in-1", { thread: "t-1" }));
    gmail.historyPages = [{ ids: ["in-1", "in-1"] }];
    const r = await runGmailSync(deps);
    expect(r.replies).toBe(1);
    expect(store.replies).toMatchObject([{ lead_id: "lead-1", message_id: "msg-first", kind: "reply", reply_text: "請問價格？", done: "pricing", dedupe_key: "<in-1@mail>" }]);
    await runGmailSync(deps);
    expect(store.replies).toHaveLength(1);
    expect(classified).toEqual(["r1"]);
  });

  it("a new-thread mail with subject unsubscribe is ruled, not sent to the model; a bounce names the lead in X-Failed-Recipients", async () => {
    const { gmail, store, deps, classified } = setup();
    store.leads["gone@shop.example"] = { id: "lead-2", organization_id: "org" };
    gmail.messages.set("u", mail("u", { subject: "unsubscribe" }));
    gmail.messages.set("bo", mail("bo", { from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", subject: "Delivery Status Notification (Failure)",
      headers: { "X-Failed-Recipients": "gone@shop.example" } }));
    gmail.historyPages = [{ ids: ["u", "bo"] }];
    const r = await runGmailSync(deps);
    expect(store.replies.map((x) => [x.lead_id, x.kind, x.done])).toEqual([["lead-1", "reply", "unsubscribe"], ["lead-2", "bounce", "bounce"]]);
    expect(r.bounces).toBe(1);
    expect(classified).toEqual([]);
  });

  it("a mail in our thread belongs to that thread's lead even when the address is also a lead elsewhere (Codex F2)", async () => {
    const { gmail, store, deps } = setup();
    store.leads["boss@shop.example"] = { id: "lead-in-org-b", organization_id: "org-b" };
    store.threads["t-a"] = { id: "lead-in-org-a", organization_id: "org-a", message_id: "msg-a" };
    gmail.messages.set("in-a", mail("in-a", { thread: "t-a" }));
    gmail.historyPages = [{ ids: ["in-a"] }];
    await runGmailSync(deps);
    expect(store.replies).toMatchObject([{ lead_id: "lead-in-org-a", organization_id: "org-a", message_id: "msg-a" }]);
  });

  it("mail from nobody we wrote to, and our own mail, is never stored", async () => {
    const { gmail, store, deps } = setup();
    gmail.messages.set("x", mail("x", { from: "news@other.example" }));
    gmail.messages.set("me", mail("me", { from: "me@pool.example" }));
    gmail.historyPages = [{ ids: ["x", "me"] }];
    await runGmailSync(deps);
    expect(store.replies).toEqual([]);
    expect(store.state.history_id).toBe("h0");
  });

  it("a failed classification keeps the cursor and is retried next tick; five failures push and stop blocking", async () => {
    const { gmail, store, deps, failClassify, pushes } = setup();
    gmail.messages.set("in-1", mail("in-1"));
    gmail.historyPages = [{ ids: ["in-1"] }];
    failClassify(1);
    const first = await runGmailSync(deps);
    expect(first.failed).toBe(1);
    expect(store.state.history_id).toBe("100");
    await runGmailSync(deps);
    expect(store.replies[0]).toMatchObject({ done: "pricing", attempts: 1 });
    expect(store.state.history_id).toBe("h0");

    const s2 = setup();
    s2.gmail.messages.set("in-9", mail("in-9"));
    s2.gmail.historyPages = [{ ids: ["in-9"] }];
    s2.failClassify(99);
    for (let i = 0; i < 5; i++) await runGmailSync(s2.deps);
    expect(s2.store.replies[0]).toMatchObject({ done: "unprocessed", attempts: 5 });
    expect(s2.pushes).toHaveLength(1);
    expect(s2.store.state.history_id).toBe("h0");
  });

  it("an expired history id falls back to a dated inbox scan; two history pages are both read before the cursor moves", async () => {
    const { gmail, store, deps } = setup();
    gmail.historyPages = "expired";
    gmail.inbox = ["in-1"];
    gmail.messages.set("in-1", mail("in-1"));
    await runGmailSync(deps);
    expect(gmail.calls.some((c) => c.startsWith("list:in:inbox -from:me after:"))).toBe(true);
    expect(store.replies).toHaveLength(1);
    expect(store.state.history_id).toBe("900");

    const s2 = setup();
    s2.gmail.historyPages = [{ ids: ["p1"], next: "1" }, { ids: ["p2"] }];
    s2.gmail.messages.set("p1", mail("p1"));
    s2.gmail.messages.set("p2", mail("p2", { from: "boss@shop.example" }));
    s2.gmail.failPage2 = true;
    const failed = await runGmailSync(s2.deps);
    expect(failed.errors).toHaveLength(1);
    expect(s2.store.state.history_id).toBe("100");
    expect(s2.store.replies).toHaveLength(0);
    s2.gmail.failPage2 = false;
    await runGmailSync(s2.deps);
    expect(s2.store.replies.map((x) => x.gmail_message_id)).toEqual(["p1", "p2"]);
    expect(s2.store.state.history_id).toBe("h1");
  });

  it("a 補掃 N 天 request scans that many days and is cleared once done", async () => {
    const { gmail, store, deps } = setup();
    store.state = { history_id: "100", rescan_days: 3 };
    await runGmailSync(deps);
    const since = Math.floor((T0 + 7_200_000 - 3 * 86_400_000) / 1000);
    expect(gmail.calls).toContain(`list:in:inbox -from:me after:${since}`);
    expect(store.state).toEqual({ history_id: "900", last_ok_at: new Date(T0 + 7_200_000).toISOString() });
  });
});

describe("replyText", () => {
  it("falls back to the HTML part without tags and cuts a 寫道 quote", () => {
    const m: GmailMessage = { id: "h", threadId: "t", payload: { mimeType: "text/html", body: { data: b64("<p>好的，<b>下週</b>談</p><div>王小明 於 2026年11月1日 寫道：</div><p>舊信</p>") } } };
    expect(replyText(m)).toBe("好的，下週談");
  });
});
