// Outbound Telegram replies. Used by the API route after routing completes.
// Telegram has a 4096-char per-message cap; we truncate with an explicit marker.

const TELEGRAM_API = "https://api.telegram.org";
const MAX_LEN = 4000; // leave headroom for markdown wrapping

export interface SendOptions {
  chatId: number;
  text: string;
  replyToMessageId?: number;
}

export async function sendTelegramMessage(opts: SendOptions): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return; // misconfiguration; surfaced via Sentry by caller

  const truncated = opts.text.length > MAX_LEN
    ? opts.text.slice(0, MAX_LEN) + "\n\n…[truncated]"
    : opts.text;

  const body = new URLSearchParams({
    chat_id: String(opts.chatId),
    text: truncated,
    parse_mode: "Markdown",
    disable_web_page_preview: "true",
  });
  if (opts.replyToMessageId !== undefined) {
    body.set("reply_to_message_id", String(opts.replyToMessageId));
  }

  await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}
