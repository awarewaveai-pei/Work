import * as Sentry from "@sentry/nextjs";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import type { Incident, IncidentTransition, NotificationLogEntry } from "../types";
import type { Notifier } from "./types";
import { SlackNotifier } from "./slack";
import { decideNotification } from "./rules";

const NOTIFIERS: Notifier[] = [new SlackNotifier("slack:ops-incidents", process.env.OPS_INBOX_SLACK_INCIDENTS_WEBHOOK ?? "")];

export async function dispatchNotifications(args: { incident: Incident; transition: IncidentTransition }): Promise<void> {
  const decision = decideNotification({
    incident: args.incident,
    transition: args.transition,
    now: new Date(),
  });

  const publicUrl = process.env.OPS_INBOX_PUBLIC_URL ?? "http://localhost:3000";
  if (!decision.shouldSend) {
    await appendLog(args.incident.id, {
      channel: NOTIFIERS[0]?.id ?? "unknown",
      rule: "new_incident_first_occurrence",
      status: "throttled",
      ts: new Date().toISOString(),
      reason: decision.reason,
    });
    return;
  }

  for (const notifier of NOTIFIERS) {
    try {
      const result = await notifier.send({ incident: args.incident, rule: decision.rule!, publicUrl });
      await appendLog(args.incident.id, {
        channel: notifier.id,
        rule: decision.rule!,
        status: result.status,
        ts: new Date().toISOString(),
        message_ts: result.externalRef,
        reason: result.reason,
        error: result.error,
      });
    } catch (e: any) {
      Sentry.captureException(e);
      await appendLog(args.incident.id, {
        channel: notifier.id,
        rule: decision.rule!,
        status: "failed",
        ts: new Date().toISOString(),
        error: String(e?.message ?? e),
      });
    }
  }
}

async function appendLog(incidentId: string, entry: NotificationLogEntry): Promise<void> {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return;
  const { data: cur } = await supabase.from("ops_incidents").select("notification_log").eq("id", incidentId).single();
  if (!cur) return;
  await supabase
    .from("ops_incidents")
    .update({ notification_log: [...((cur as any).notification_log as NotificationLogEntry[]), entry] })
    .eq("id", incidentId);
}
