// Three-state Telegram delivery (site-watch I2, packages/db/migrations/0091_site_watch.sql header):
// only a 2xx is "sent", only a 4xx is "surely not delivered"; anything that may have reached Telegram
// (5xx, abort, network) is "uncertain" and counts as possibly delivered.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TELEGRAM_SEND_TIMEOUT_MS,
  TelegramNotifier,
  buildOperatorTelegramNotifier,
  combineDeliveries,
  parseTelegramMinSeverity,
  sendTelegram,
} from "@/lib/ops-inbox/notify/telegram";

afterEach(() => vi.unstubAllGlobals());

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("sendTelegram", () => {
  it("2xx = sent; the request carries its own abort deadline", async () => {
    const spy = stubFetch(async () => new Response("{}", { status: 200 }));
    expect(await sendTelegram("tok", "123", "hi")).toEqual({ kind: "sent" });
    const init = spy.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(TELEGRAM_SEND_TIMEOUT_MS).toBe(10_000);
    expect(String(init.body)).toContain("chat_id=123");
    expect(String(init.body)).not.toContain("parse_mode"); // plain text: page-controlled strings are never markup
  });

  it("4xx = rejected (Telegram answered and refused)", async () => {
    stubFetch(async () => new Response("bad", { status: 400 }));
    expect(await sendTelegram("tok", "123", "hi")).toEqual({ kind: "rejected", code: "telegram_400" });
  });

  it("5xx, abort and network errors = uncertain (may have been delivered)", async () => {
    stubFetch(async () => new Response("oops", { status: 502 }));
    expect(await sendTelegram("tok", "123", "hi")).toEqual({ kind: "uncertain", code: "telegram_502" });
    stubFetch(async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); });
    expect((await sendTelegram("tok", "123", "hi")).kind).toBe("uncertain");
    stubFetch(async () => { throw new TypeError("fetch failed"); });
    expect((await sendTelegram("tok", "123", "hi")).kind).toBe("uncertain");
  });
});

describe("combineDeliveries", () => {
  it("sent only when every chat got it; rejected only when no chat could have", () => {
    expect(combineDeliveries([])).toEqual({ kind: "rejected", code: "telegram_no_chats" });
    expect(combineDeliveries([{ kind: "sent" }, { kind: "sent" }])).toEqual({ kind: "sent" });
    expect(combineDeliveries([{ kind: "rejected", code: "a" }, { kind: "rejected", code: "b" }])).toEqual({ kind: "rejected", code: "a;b" });
    expect(combineDeliveries([{ kind: "sent" }, { kind: "rejected", code: "b" }])).toEqual({ kind: "uncertain", code: "b" });
    expect(combineDeliveries([{ kind: "rejected", code: "a" }, { kind: "uncertain", code: "b" }])).toEqual({ kind: "uncertain", code: "a;b" });
  });
});

describe("TelegramNotifier.sendText", () => {
  it("missing token or chats = rejected before any request leaves", async () => {
    const spy = stubFetch(async () => new Response("{}", { status: 200 }));
    expect(await new TelegramNotifier("t", "", "123", "medium").sendText("x")).toEqual({ kind: "rejected", code: "telegram_bot_token_missing" });
    expect(await new TelegramNotifier("t", "tok", "  ", "medium").sendText("x")).toEqual({ kind: "rejected", code: "telegram_chat_ids_missing" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("fans out to every chat; one refused + one delivered = uncertain, code names the chat", async () => {
    stubFetch(async (_u, init) => new Response("{}", { status: String(init.body).includes("chat_id=111") ? 403 : 200 }));
    const n = new TelegramNotifier("t", "tok", "111, 222", "medium");
    expect(n.chatCount).toBe(2);
    expect(await n.sendText("x")).toEqual({ kind: "uncertain", code: "111:telegram_403" });
  });
});

describe("severity gate and builder", () => {
  it("meetsMinSeverity ranks low < medium < high < critical; unknown config falls back to medium", () => {
    const n = new TelegramNotifier("t", "tok", "1", "medium");
    expect(["low", "medium", "high", "critical"].map((s) => n.meetsMinSeverity(s as never))).toEqual([false, true, true, true]);
    expect(parseTelegramMinSeverity(undefined)).toBe("medium");
    expect(parseTelegramMinSeverity(" HIGH ")).toBe("high");
    expect(parseTelegramMinSeverity("urgent")).toBe("medium");
  });

  it("switched off = null; on = chats from OPS_INBOX_TELEGRAM_CHAT_IDS, else TELEGRAM_ALLOWED_CHAT_IDS", () => {
    expect(buildOperatorTelegramNotifier(env({ OPS_INBOX_TELEGRAM_NOTIFY_ENABLED: "false" }))).toBeNull();
    const own = buildOperatorTelegramNotifier(env({ OPS_INBOX_TELEGRAM_NOTIFY_ENABLED: "true", TELEGRAM_BOT_TOKEN: "t", OPS_INBOX_TELEGRAM_CHAT_IDS: "1,2", TELEGRAM_ALLOWED_CHAT_IDS: "9" }));
    expect(own?.chatCount).toBe(2);
    const fallback = buildOperatorTelegramNotifier(env({ OPS_INBOX_TELEGRAM_NOTIFY_ENABLED: "yes", TELEGRAM_BOT_TOKEN: "t", TELEGRAM_ALLOWED_CHAT_IDS: "9" }));
    expect(fallback?.chatCount).toBe(1);
  });
});
