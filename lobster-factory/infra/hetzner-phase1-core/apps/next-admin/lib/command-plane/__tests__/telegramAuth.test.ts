// Telegram webhook auth: header secret (timing-safe) + user/chat allowlists.
// All 3 checks must independently fail closed -- this is the ONLY gate between
// the public webhook endpoint and command dispatch (TELEGRAM_COMMAND_POLICY.md).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyTelegramActor, verifyTelegramSecret } from "../telegramAuth";
import type { TelegramMessage } from "../types";

const ENV_KEYS = ["TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_ALLOWED_USER_IDS", "TELEGRAM_ALLOWED_CHAT_IDS"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function reqWithHeader(headerValue: string | null): Request {
  const headers = new Headers();
  if (headerValue !== null) headers.set("x-telegram-bot-api-secret-token", headerValue);
  return new Request("https://example.test/webhook", { headers });
}

function msg(overrides: Partial<TelegramMessage> = {}): TelegramMessage {
  return {
    message_id: 1,
    from: { id: 111, username: "op" },
    chat: { id: 222, type: "private" },
    date: 0,
    text: "/status",
    ...overrides,
  };
}

describe("verifyTelegramSecret", () => {
  it("rejects when TELEGRAM_WEBHOOK_SECRET is not configured (config_missing)", () => {
    const result = verifyTelegramSecret(reqWithHeader("anything"));
    expect(result).toEqual({ ok: false, reason: "config_missing" });
  });

  it("rejects when the header is absent (missing_secret_header)", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "s3cret";
    const result = verifyTelegramSecret(reqWithHeader(null));
    expect(result).toEqual({ ok: false, reason: "missing_secret_header" });
  });

  it("rejects when the header value does not match (secret_mismatch)", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "s3cret";
    const result = verifyTelegramSecret(reqWithHeader("wrong-value"));
    expect(result).toEqual({ ok: false, reason: "secret_mismatch" });
  });

  it("rejects a header that merely starts with the right secret (no length-prefix bypass)", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "s3cret";
    const result = verifyTelegramSecret(reqWithHeader("s3cret-and-then-some"));
    expect(result).toEqual({ ok: false, reason: "secret_mismatch" });
  });

  it("accepts an exact match", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "s3cret";
    const result = verifyTelegramSecret(reqWithHeader("s3cret"));
    expect(result).toEqual({ ok: true });
  });
});

describe("verifyTelegramActor", () => {
  it("rejects a message with no `from` (missing_user)", () => {
    process.env.TELEGRAM_ALLOWED_USER_IDS = "111";
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = "222";
    const result = verifyTelegramActor(msg({ from: undefined }));
    expect(result).toEqual({ ok: false, reason: "missing_user" });
  });

  it("rejects when the allowlist env var is unset (deny by default, not fail-open)", () => {
    // TELEGRAM_ALLOWED_USER_IDS intentionally left unset.
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = "222";
    const result = verifyTelegramActor(msg());
    expect(result).toEqual({ ok: false, reason: "user_not_allowed" });
  });

  it("rejects when the allowlist env var is an empty/whitespace string", () => {
    process.env.TELEGRAM_ALLOWED_USER_IDS = "   ";
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = "222";
    const result = verifyTelegramActor(msg());
    expect(result).toEqual({ ok: false, reason: "user_not_allowed" });
  });

  it("rejects a user id not present in the CSV allowlist (user_not_allowed)", () => {
    process.env.TELEGRAM_ALLOWED_USER_IDS = "999,888";
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = "222";
    const result = verifyTelegramActor(msg());
    expect(result).toEqual({ ok: false, reason: "user_not_allowed" });
  });

  it("rejects an allowed user in a chat not on the chat allowlist (chat_not_allowed)", () => {
    process.env.TELEGRAM_ALLOWED_USER_IDS = "111";
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = "999";
    const result = verifyTelegramActor(msg());
    expect(result).toEqual({ ok: false, reason: "chat_not_allowed" });
  });

  it("accepts an allowed user in an allowed chat, CSV with surrounding whitespace", () => {
    process.env.TELEGRAM_ALLOWED_USER_IDS = " 111 , 333 ";
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = "222";
    const result = verifyTelegramActor(msg());
    expect(result).toEqual({ ok: true });
  });
});
