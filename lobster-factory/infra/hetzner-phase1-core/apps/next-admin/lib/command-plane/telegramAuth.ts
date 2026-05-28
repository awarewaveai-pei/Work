// Telegram webhook authentication.
// Telegram sends X-Telegram-Bot-Api-Secret-Token header, set during setWebhook.
// We additionally enforce user_id / chat_id allowlists from env (csv).
//
// Auth policy (see TELEGRAM_COMMAND_POLICY.md):
//   1. Header secret token must match TELEGRAM_WEBHOOK_SECRET (timing-safe).
//   2. message.from.id must be in TELEGRAM_ALLOWED_USER_IDS (csv).
//   3. message.chat.id must be in TELEGRAM_ALLOWED_CHAT_IDS (csv).
// Failures return 401 silently — we do not echo to Telegram (avoids becoming
// an enumeration oracle for attackers).

import type { TelegramMessage } from "./types";
import { timingSafeEqual } from "../security/timingSafeEqual";

export type TelegramAuthOutcome =
  | { ok: true }
  | { ok: false; reason: TelegramAuthFailure };

export type TelegramAuthFailure =
  | "missing_secret_header"
  | "secret_mismatch"
  | "missing_user"
  | "user_not_allowed"
  | "chat_not_allowed"
  | "config_missing";

export function verifyTelegramSecret(req: Request): TelegramAuthOutcome {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return { ok: false, reason: "config_missing" };
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!got) return { ok: false, reason: "missing_secret_header" };
  if (!timingSafeEqual(got, expected)) return { ok: false, reason: "secret_mismatch" };
  return { ok: true };
}

export function verifyTelegramActor(message: TelegramMessage | undefined): TelegramAuthOutcome {
  if (!message?.from) return { ok: false, reason: "missing_user" };
  if (!isAllowed(message.from.id, process.env.TELEGRAM_ALLOWED_USER_IDS)) {
    return { ok: false, reason: "user_not_allowed" };
  }
  if (!isAllowed(message.chat.id, process.env.TELEGRAM_ALLOWED_CHAT_IDS)) {
    return { ok: false, reason: "chat_not_allowed" };
  }
  return { ok: true };
}

function isAllowed(id: number, csv: string | undefined): boolean {
  if (!csv || csv.trim() === "") return false;
  const set = new Set(
    csv
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
  return set.has(String(id));
}

// timingSafeEqual is imported from lib/security/timingSafeEqual (shared SSOT).
// Both this module and verifyIngestToken use the same implementation so a future
// security fix cannot land on one and silently miss the other (m2 critic Major fix).
