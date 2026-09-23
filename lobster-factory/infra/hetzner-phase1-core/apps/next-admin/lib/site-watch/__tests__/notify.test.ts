// C8 notification step against a fake store: which owed message is sent, deferred, skipped or dropped
// as stale, and what reaches the DB. The DB side of the same state machine is proven by the SQL
// harness (packages/db/scripts/site-watch-local-verify.sh); this covers the TS decisions around it.
import { describe, expect, it, vi } from "vitest";
import { TelegramNotifier, type TelegramDelivery } from "@/lib/ops-inbox/notify/telegram";
import { LeaseLost, runNotifications, type NotifyContext, type TextNotifier } from "@/lib/site-watch/notify";
import type { PageStateRow, SiteWatchStore } from "@/lib/site-watch/store";

const ORG = { id: "00000000-0000-0000-0000-0000000000aa", slug: "shop-a", name: "Shop A", status: "active", siteUrl: "https://shop.example.com" };

function row(over: Partial<PageStateRow> = {}): PageStateRow {
  return {
    target_id: "t", page_id: "aaaaaaaaaaaaaaaa", kind: "availability", page_url: "https://shop.example.com",
    failure_streak: 2, last_failure_code: "http_5xx", last_message: "HTTP 500", episode_id: "e1",
    alert_state: "pending", recovery_state: "none", recovery_reason: null, incident_id: "i1",
    baseline_set_at: null, baseline_sha256: null, owed_since: "2026-09-23T00:00:00Z", updated_at: "2026-09-23T00:00:00Z",
    ...over,
  };
}

function fakeStore(over: Partial<Record<keyof SiteWatchStore, unknown>> = {}) {
  const base = {
    renew: vi.fn(async (): Promise<number | null> => 300),
    notifyBegin: vi.fn(async () => true),
    notifyFinish: vi.fn(async () => true),
    upsertIncident: vi.fn(async () => "i-new"),
    attachIncident: vi.fn(async () => true),
    resolveForRecovery: vi.fn(async (): Promise<string> => "pending_send"),
  };
  return { ...base, ...over } as unknown as SiteWatchStore & typeof base;
}

function notifier(result: TelegramDelivery = { kind: "sent" }, chatCount = 1): TextNotifier & { sendText: ReturnType<typeof vi.fn> } {
  return { chatCount, meetsMinSeverity: () => true, sendText: vi.fn(async () => result) };
}

function ctx(store: SiteWatchStore, n: TextNotifier | null): NotifyContext {
  return { store, notifier: n, publicUrl: "https://app.aware-wave.com", targetId: "t", gen: 7, windowS: 300, org: ORG };
}

describe("runNotifications — alert phase", () => {
  it("sends an owed alert: renew, begin (state -> uncertain first), send, finish with the delivery kind", async () => {
    const store = fakeStore();
    const n = notifier({ kind: "sent" });
    const out = await runNotifications(ctx(store, n), [row()]);
    expect(out).toEqual([{ pageId: "aaaaaaaaaaaaaaaa", kind: "availability", phase: "alert", outcome: "sent" }]);
    expect(store.notifyBegin.mock.invocationCallOrder[0]).toBeLessThan(n.sendText.mock.invocationCallOrder[0]);
    expect(store.notifyFinish).toHaveBeenCalledWith("t", 7, expect.anything(), "alert", "sent");
    expect(n.sendText.mock.calls[0][0]).toContain("網站打不開 — Shop A");
  });

  it("Telegram switched off (notifier null) records skipped without renewing or sending", async () => {
    const store = fakeStore();
    const out = await runNotifications(ctx(store, null), [row()]);
    expect(out[0].outcome).toBe("skipped");
    expect(store.renew).not.toHaveBeenCalled();
    expect(store.notifyFinish).toHaveBeenCalledWith("t", 7, expect.anything(), "alert", "skipped");
  });

  it("D1: with the real notifier at the default min severity, visual alerts are skipped and availability alerts are sent", async () => {
    const tg = new TelegramNotifier("telegram:operator", "token", "123", "medium");
    const send = vi.spyOn(tg, "sendText").mockResolvedValue({ kind: "sent" });
    const store = fakeStore();
    const out = await runNotifications(ctx(store, tg), [row({ kind: "visual", page_id: "bbbbbbbbbbbbbbbb" }), row()]);
    expect(out.map((o) => [o.kind, o.outcome])).toEqual([["visual", "skipped"], ["availability", "sent"]]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("a lease too short to outlive the send timeouts defers: no begin, no send, state untouched", async () => {
    const store = fakeStore({ renew: vi.fn(async () => 39) }); // 1 chat x 10s + 30s = 40s needed
    const n = notifier();
    const out = await runNotifications(ctx(store, n), [row()]);
    expect(out[0].outcome).toBe("deferred");
    expect(store.notifyBegin).not.toHaveBeenCalled();
    expect(n.sendText).not.toHaveBeenCalled();
  });

  it("more chats need more lease: 3 chats x 10s + 30s = 60s", async () => {
    const store = fakeStore({ renew: vi.fn(async () => 59) });
    expect((await runNotifications(ctx(store, notifier({ kind: "sent" }, 3)), [row()]))[0].outcome).toBe("deferred");
    const store2 = fakeStore({ renew: vi.fn(async () => 60) });
    expect((await runNotifications(ctx(store2, notifier({ kind: "sent" }, 3)), [row()]))[0].outcome).toBe("sent");
  });

  it("a lost lease during renew stops the whole step", async () => {
    const store = fakeStore({ renew: vi.fn(async () => null) });
    await expect(runNotifications(ctx(store, notifier()), [row()])).rejects.toBeInstanceOf(LeaseLost);
  });

  it("begin refused (someone else moved the episode) = stale, nothing sent", async () => {
    const store = fakeStore({ notifyBegin: vi.fn(async () => false) });
    const n = notifier();
    expect((await runNotifications(ctx(store, n), [row()]))[0].outcome).toBe("stale");
    expect(n.sendText).not.toHaveBeenCalled();
  });

  it("4xx rejected and 5xx/abort uncertain are passed to the DB as such", async () => {
    for (const d of [{ kind: "rejected", code: "telegram_400" }, { kind: "uncertain", code: "telegram_502" }] as TelegramDelivery[]) {
      const store = fakeStore();
      const out = await runNotifications(ctx(store, notifier(d)), [row()]);
      expect(out[0].outcome).toBe(d.kind);
      expect(store.notifyFinish).toHaveBeenCalledWith("t", 7, expect.anything(), "alert", d.kind);
    }
  });

  it("no incident yet: upserts one (with the kind's severity) and attaches it before sending", async () => {
    const store = fakeStore();
    await runNotifications(ctx(store, notifier()), [row({ incident_id: null, kind: "visual" })]);
    expect(store.upsertIncident).toHaveBeenCalledWith(expect.objectContaining({ source: "site_watch", severity: "low" }));
    expect(store.attachIncident).toHaveBeenCalledWith("t", 7, expect.anything(), "i-new");
  });

  it("attach refused = stale, no send", async () => {
    const store = fakeStore({ attachIncident: vi.fn(async () => false) });
    const n = notifier();
    expect((await runNotifications(ctx(store, n), [row({ incident_id: null })]))[0].outcome).toBe("stale");
    expect(n.sendText).not.toHaveBeenCalled();
  });

  it("rows that owe nothing are left alone", async () => {
    const store = fakeStore();
    const out = await runNotifications(ctx(store, notifier()), [row({ alert_state: "sent" }), row({ alert_state: "skipped" }), row({ alert_state: "none", episode_id: null })]);
    expect(out).toEqual([]);
    expect(store.renew).not.toHaveBeenCalled();
  });
});

describe("runNotifications — recovery phase", () => {
  const recovering = row({ alert_state: "sent", recovery_state: "pending_resolve", recovery_reason: "recovered" });

  it("resolves the incident, then sends the recovery message", async () => {
    const store = fakeStore();
    const n = notifier();
    const out = await runNotifications(ctx(store, n), [recovering]);
    expect(out[0]).toMatchObject({ phase: "recovery", outcome: "sent" });
    expect(store.notifyBegin).toHaveBeenCalledWith("t", 7, expect.objectContaining({ recovery_state: "pending_send" }), "recovery");
    expect(n.sendText.mock.calls[0][0]).toContain("已恢復");
  });

  it("operator already closed the incident by hand: no message", async () => {
    const store = fakeStore({ resolveForRecovery: vi.fn(async () => "closed_by_operator") });
    const n = notifier();
    expect((await runNotifications(ctx(store, n), [recovering]))[0].outcome).toBe("closed_by_operator");
    expect(n.sendText).not.toHaveBeenCalled();
  });

  it("fenced while resolving stops the step", async () => {
    const store = fakeStore({ resolveForRecovery: vi.fn(async () => "fenced") });
    await expect(runNotifications(ctx(store, notifier()), [recovering])).rejects.toBeInstanceOf(LeaseLost);
  });

  it("a pending_send recovery skips the resolve and just sends; a disabled close says so", async () => {
    const store = fakeStore();
    const n = notifier();
    await runNotifications(ctx(store, n), [row({ alert_state: "sent", recovery_state: "pending_send", recovery_reason: "disabled" })]);
    expect(store.resolveForRecovery).not.toHaveBeenCalled();
    expect(n.sendText.mock.calls[0][0]).toContain("網站巡檢已關閉");
  });
});
