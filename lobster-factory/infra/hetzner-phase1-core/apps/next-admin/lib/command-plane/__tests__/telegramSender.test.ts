// Outbound Telegram replies: 3-layer error handling (Markdown -> plain text
// retry on 400 -> Sentry). fetch is stubbed globally; no network access.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { sendTelegramMessage } from "../telegramSender";

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

const savedToken = process.env.TELEGRAM_BOT_TOKEN;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
});

afterEach(() => {
  if (savedToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = savedToken;
  vi.unstubAllGlobals();
});

function stubFetch(responses: Array<{ ok: boolean; error_code?: number; description?: string }>) {
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  let i = 0;
  const fn = vi.fn(async (url: string, init: { body: URLSearchParams }) => {
    calls.push({ url, body: init.body as URLSearchParams });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return { json: async () => r } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

describe("sendTelegramMessage -- misconfiguration", () => {
  it("does nothing (no fetch call) when TELEGRAM_BOT_TOKEN is not set", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const { fn } = stubFetch([{ ok: true }]);
    await sendTelegramMessage({ chatId: 1, text: "hi" });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("sendTelegramMessage -- success", () => {
  it("sends once with Markdown parse_mode when the first attempt succeeds", async () => {
    const { fn, calls } = stubFetch([{ ok: true }]);
    await sendTelegramMessage({ chatId: 42, text: "hello" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(calls[0].body.get("parse_mode")).toBe("Markdown");
    expect(calls[0].body.get("chat_id")).toBe("42");
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("includes reply_to_message_id when provided", async () => {
    const { calls } = stubFetch([{ ok: true }]);
    await sendTelegramMessage({ chatId: 42, text: "hello", replyToMessageId: 7 });
    expect(calls[0].body.get("reply_to_message_id")).toBe("7");
  });

  it("truncates text longer than the 4000-char headroom limit", async () => {
    const { calls } = stubFetch([{ ok: true }]);
    const longText = "a".repeat(5000);
    await sendTelegramMessage({ chatId: 1, text: longText });
    const sent = calls[0].body.get("text")!;
    expect(sent.length).toBeLessThan(5000);
    expect(sent).toContain("[truncated]");
  });
});

describe("sendTelegramMessage -- Markdown 400 retry", () => {
  it("retries as plain text (no parse_mode) on a 400, and succeeds silently", async () => {
    const { fn, calls } = stubFetch([
      { ok: false, error_code: 400, description: "can't parse entities" },
      { ok: true },
    ]);
    await sendTelegramMessage({ chatId: 1, text: "_unescaped_" });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls[0].body.get("parse_mode")).toBe("Markdown");
    expect(calls[1].body.has("parse_mode")).toBe(false);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("reports to Sentry when BOTH Markdown and the plain-text retry fail", async () => {
    const { fn } = stubFetch([
      { ok: false, error_code: 400, description: "bad markdown" },
      { ok: false, error_code: 400, description: "still bad" },
    ]);
    await sendTelegramMessage({ chatId: 1, text: "still bad" });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "sendTelegramMessage: failed in both Markdown and plain text",
      expect.objectContaining({ level: "error" }),
    );
  });
});

describe("sendTelegramMessage -- non-400 failure", () => {
  it("does NOT retry and reports to Sentry on a 403 (bot blocked by user)", async () => {
    const { fn } = stubFetch([{ ok: false, error_code: 403, description: "bot was blocked by the user" }]);
    await sendTelegramMessage({ chatId: 1, text: "hi" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "sendTelegramMessage: Telegram API error",
      expect.objectContaining({ extra: expect.objectContaining({ error_code: 403 }) }),
    );
  });

  it("does not retry on a 429 rate-limit either", async () => {
    const { fn } = stubFetch([{ ok: false, error_code: 429, description: "too many requests" }]);
    await sendTelegramMessage({ chatId: 1, text: "hi" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
  });
});
