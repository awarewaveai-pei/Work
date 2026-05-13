// Outbound Telegram replies. Used by the API route after routing completes.
// Telegram has a 4096-char per-message cap; we truncate with an explicit marker.
//
// Error handling strategy (3-layer):
//   1) Try with Markdown formatting (richer output for operator)
//   2) On 400: retry as plain text — most 400s are unescaped Markdown special chars
//      in handler output (_, *, [, etc.). Never silently drop the message.
//   3) Any remaining failure → Sentry with full details (error_code + description).

import * as Sentry from "@sentry/nextjs";

const TELEGRAM_API = "https://api.telegram.org";
const MAX_LEN = 4000; // leave headroom for markdown wrapping

export interface SendOptions {
  chatId: number;
  text: string;
  replyToMessageId?: number;
}

interface TelegramApiResult {
  ok: boolean;
  error_code?: number;
  description?: string;
}

async function callSendMessage(
  token: string,
  chatId: number,
  text: string,
  replyToMessageId?: number,
  parseMode?: string,
): Promise<TelegramApiResult> {
  const body = new URLSearchParams({
    chat_id: String(chatId),
    text,
    disable_web_page_preview: "true",
  });
  if (parseMode) body.set("parse_mode", parseMode);
  if (replyToMessageId !== undefined) {
    body.set("reply_to_message_id", String(replyToMessageId));
  }
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  return res.json() as Promise<TelegramApiResult>;
}

export async function sendTelegramMessage(opts: SendOptions): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return; // misconfiguration; surfaced via Sentry by caller

  const truncated =
    opts.text.length > MAX_LEN
      ? opts.text.slice(0, MAX_LEN) + "\n\n…[truncated]"
      : opts.text;

  // Attempt 1: Markdown mode
  const first = await callSendMessage(
    token,
    opts.chatId,
    truncated,
    opts.replyToMessageId,
    "Markdown",
  );
  if (first.ok) return;

  // Attempt 2: plain text — handles Markdown parse errors (400) from unescaped
  // special chars that can appear in handler output (status text, error messages, etc.)
  if (first.error_code === 400) {
    const plain = await callSendMessage(
      token,
      opts.chatId,
      truncated,
      opts.replyToMessageId,
    );
    if (plain.ok) return;
    Sentry.captureMessage("sendTelegramMessage: failed in both Markdown and plain text", {
      level: "error",
      tags: { component: "command-plane", phase: "telegram_send" },
      extra: {
        chatId: opts.chatId,
        markdownError: `${first.error_code}: ${first.description}`,
        plainError: `${plain.error_code}: ${plain.description}`,
      },
    });
    return;
  }

  // Non-400 failures: 403 bot blocked by user, 429 rate-limit, 5xx Telegram outage, etc.
  Sentry.captureMessage("sendTelegramMessage: Telegram API error", {
    level: "error",
    tags: { component: "command-plane", phase: "telegram_send" },
    extra: {
      chatId: opts.chatId,
      error_code: first.error_code,
      description: first.description,
    },
  });
}
