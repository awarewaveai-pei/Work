// POST /api/internal/commands/telegram
// Telegram webhook ingress for the Always-On Command Plane.
// Style: mirrors lib/ops-inbox webhook handlers (Sentry/Uptime-Kuma/PostHog).
//
// Security boundary (TELEGRAM_COMMAND_POLICY.md):
//   1) X-Telegram-Bot-Api-Secret-Token must match TELEGRAM_WEBHOOK_SECRET
//   2) message.from.id must be in TELEGRAM_ALLOWED_USER_IDS
//   3) message.chat.id must be in TELEGRAM_ALLOWED_CHAT_IDS
// Failures return 200 silently (do not echo back; do not 401 — see policy).

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { redactSecrets } from "@/lib/ops-inbox/redactSecrets";
import {
  verifyTelegramActor,
  verifyTelegramSecret,
} from "@/lib/command-plane/telegramAuth";
import {
  getTelegramText,
  isTelegramUpdate,
  type NormalizedCommand,
} from "@/lib/command-plane/types";
import { routeCommand } from "@/lib/command-plane/commandRouter";
import { phase1Handlers } from "@/lib/command-plane/handlers";
import { sendTelegramMessage } from "@/lib/command-plane/telegramSender";
import { reportCommandError } from "@/lib/command-plane/errorReporting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Required env vars for the command plane. Checked once per cold start so
// any misconfigured deploy surfaces immediately in Sentry rather than silently
// swallowing every incoming Telegram message for hours.
const REQUIRED_ENV: ReadonlyArray<string> = [
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_ALLOWED_USER_IDS",
  "TELEGRAM_ALLOWED_CHAT_IDS",
  "TELEGRAM_BOT_TOKEN",
  "COMMAND_PLANE_DEFAULT_ORG_ID",
];
const _missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (_missingEnv.length > 0) {
  // Capture once at module load — every deploy that is missing env vars will
  // produce exactly one Sentry event (not one per request).
  Sentry.captureMessage(
    `command-plane misconfigured: missing env vars: ${_missingEnv.join(", ")}`,
    {
      level: "error",
      tags: { component: "command-plane", phase: "startup" },
      extra: { missing: _missingEnv },
    },
  );
}

export async function POST(req: Request) {
  // 1) Header secret check.
  const secret = verifyTelegramSecret(req);
  if (secret.ok === false) {
    // Sentry policy: missing_secret_header is high-volume / low-signal noise
    // (random internet scanners + the command-plane-smoke test deliberately
    // hits without the header to verify silent-200 + audit-row behavior).
    // The error_events row is still written as audit; only the Sentry event
    // is suppressed for that one reason. secret_mismatch and config_missing
    // are real signals and still surface in Sentry via reportCommandError.
    const supabase = getSupabaseWriteClient();
    await reportCommandError(supabase, {
      organizationId: process.env.COMMAND_PLANE_DEFAULT_ORG_ID ?? null,
      source_type: "telegram_auth_failed",
      source_ref: null,
      error_code: secret.reason,
      error_message: `secret check failed: ${secret.reason}`,
      silentSentry: secret.reason === "missing_secret_header",
    });
    // Return 200 OK to avoid leaking that the endpoint exists.
    return NextResponse.json({ ok: true });
  }

  // 2) Parse + redact (logs only; full payload still flows through router).
  const raw = await safeJson(req);
  const redacted = raw ? redactSecrets(raw) : null;
  if (!isTelegramUpdate(raw)) {
    Sentry.captureMessage("telegram payload missing update_id", {
      level: "warning",
      extra: { redacted },
    });
    return NextResponse.json({ ok: true });
  }

  // 3) Actor allowlist.
  const message = raw.message;
  const actor = verifyTelegramActor(message);
  if (actor.ok === false || !message) {
    const failureReason: string =
      actor.ok === false ? actor.reason : "missing_message";
    const supabase = getSupabaseWriteClient();
    await reportCommandError(supabase, {
      organizationId: process.env.COMMAND_PLANE_DEFAULT_ORG_ID ?? null,
      source_type: "telegram_auth_failed",
      source_ref: `update:${raw.update_id}`,
      error_code: failureReason,
      error_message: failureReason,
      event_payload: { redacted },
    });
    return NextResponse.json({ ok: true });
  }

  // 4) Parse command text.
  const text = getTelegramText(raw);
  if (!text || !text.startsWith("/")) {
    // Not a command — ignore silently (allows free-form messages without spam).
    return NextResponse.json({ ok: true });
  }
  const { command, argsText } = parseCommandText(text);

  // 5) Resolve org from env (Phase 1: single-owner deployment).
  const orgId = process.env.COMMAND_PLANE_DEFAULT_ORG_ID;
  if (!orgId) {
    Sentry.captureMessage("COMMAND_PLANE_DEFAULT_ORG_ID not set", { level: "error" });
    await sendTelegramMessage({
      chatId: message.chat.id,
      text: "⚠️ Command plane is not fully configured (missing default org).",
      replyToMessageId: message.message_id,
    });
    return NextResponse.json({ ok: true });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    Sentry.captureMessage("supabase write client unavailable", { level: "error" });
    return NextResponse.json({ ok: true });
  }

  const input: NormalizedCommand = {
    source: "telegram",
    sourceEventId: String(raw.update_id),
    actorType: "human",
    actorRef: String(message.from!.id),
    command,
    args: argsText ? { raw: argsText } : {},
    organizationId: orgId,
    workspaceId: process.env.COMMAND_PLANE_DEFAULT_WORKSPACE_ID ?? null,
    metadata: {
      chat_id: message.chat.id,
      message_id: message.message_id,
      username: message.from?.username,
    },
  };

  // 6) Route. Send reply asynchronously after Telegram has its 200.
  const replyChatId = message.chat.id;
  const replyToId = message.message_id;
  const result = await routeCommand(supabase, input, {
    handlers: phase1Handlers,
  }).catch((err) => {
    Sentry.captureException(err, {
      tags: { component: "command-plane", phase: "router" },
    });
    return null;
  });

  // 7) Reply to Telegram (best-effort).
  await sendTelegramMessage({
    chatId: replyChatId,
    replyToMessageId: replyToId,
    text: formatReply(result, command),
  }).catch((err) =>
    Sentry.captureException(err, {
      tags: { component: "command-plane", phase: "telegram_send" },
    }),
  );

  return NextResponse.json({ ok: true });
}

async function safeJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function parseCommandText(text: string): { command: string; argsText: string | null } {
  const trimmed = text.trim();
  const space = trimmed.indexOf(" ");
  if (space === -1) {
    // strip optional bot suffix: /status@MyBot -> /status
    return { command: stripBotSuffix(trimmed), argsText: null };
  }
  return {
    command: stripBotSuffix(trimmed.slice(0, space)),
    argsText: trimmed.slice(space + 1).trim() || null,
  };
}

function stripBotSuffix(cmd: string): string {
  const at = cmd.indexOf("@");
  return at === -1 ? cmd : cmd.slice(0, at);
}

function formatReply(
  result:
    | {
        traceId: string;
        status: string;
        commandRequestId: string;
        reason?: string;
        result?: Record<string, unknown>;
      }
    | null
    | undefined,
  command: string,
): string {
  if (!result) {
    return `⚠️ ${command} could not be processed. Check logs (Sentry).`;
  }
  switch (result.status) {
    case "completed": {
      const text = (result.result as { text?: string } | undefined)?.text;
      return text ?? `✅ ${command} completed (trace \`${result.traceId}\`)`;
    }
    case "queued":
      return `⏳ ${command} queued for approval (trace \`${result.traceId}\`)`;
    case "blocked_by_killswitch":
      return `🛑 Blocked by kill switch: ${result.reason ?? "unknown"}`;
    case "blocked_by_policy":
      return `🚫 Blocked by policy: ${result.reason ?? "unknown"}`;
    case "failed":
      return `❌ ${command} failed: ${result.reason ?? "unknown"} (trace \`${result.traceId}\`)`;
    default:
      return `${command} → ${result.status} (trace \`${result.traceId}\`)`;
  }
}
