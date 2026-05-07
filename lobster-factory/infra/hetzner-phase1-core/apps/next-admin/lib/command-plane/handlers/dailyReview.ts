// /daily-review — last 24h slice, AI-summarised.

import type { CommandHandler } from "../commandRouter";
import { generateSummary } from "./_anthropic";

export const dailyReviewHandler: CommandHandler = async (request, { supabase }) => {
  const orgId = request.organization_id;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [commands, incidents, errors] = await Promise.all([
    supabase
      .from("command_requests")
      .select("command, status, source, received_at")
      .eq("organization_id", orgId)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(50),
    supabase
      .from("incidents")
      .select("title, severity, status, first_seen_at")
      .eq("organization_id", orgId)
      .gte("first_seen_at", since)
      .order("first_seen_at", { ascending: false })
      .limit(20),
    supabase
      .from("error_events")
      .select("source_type, error_message, occurred_at")
      .eq("organization_id", orgId)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(20),
  ]);

  const text = await generateSummary({
    title: "Daily review (last 24h)",
    payload: {
      window_start: since,
      window_end: new Date().toISOString(),
      commands: commands.data ?? [],
      incidents: incidents.data ?? [],
      errors: errors.data ?? [],
    },
  });

  return {
    text,
    counts: {
      commands: (commands.data ?? []).length,
      incidents: (incidents.data ?? []).length,
      errors: (errors.data ?? []).length,
    },
  };
};
