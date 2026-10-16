// One transactional email through Resend's HTTP API (the agency mail path: lib/outreach/connectors/router.ts
// "交易信：Resend"; Chatwoot sends through the same account over SMTP). Key and sender come from the environment, so a
// buyout install sends from its own Resend account and domain without a code change.
import { baseDomain } from "@/lib/portal/doors";

export type MailResult = { ok: true; id: string } | { ok: false; error: string };

export function mailFrom(env: Record<string, string | undefined> = process.env): string {
  return env.MAIL_FROM?.trim() || `AwareWave <noreply@${baseDomain(env)}>`;
}

export async function sendMail(msg: { to: string; subject: string; text: string; html: string }): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: "mail_not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: mailFrom(), to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) return { ok: false, error: `mail_rejected_${res.status}` };
    return { ok: true, id: body.id };
  } catch {
    return { ok: false, error: "mail_unreachable" };
  }
}
