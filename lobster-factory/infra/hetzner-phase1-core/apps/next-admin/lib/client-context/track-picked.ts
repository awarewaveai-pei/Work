import { Events, groupOrganization, track } from "@/lib/analytics";

/** The staff picked a client in the rail: the client becomes the PostHog group (the server's hash of its id, asked from
 *  /api/ops/analytics-context: the browser never hashes) and one client_picked event is sent. Without a PostHog key:
 *  nothing, and no request. The event is sent even if the hash cannot be fetched (then without a group). */
export function trackClientPicked(orgId: string, onDoor: boolean): void {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()) return;
  const ms = typeof performance !== "undefined" ? Math.round(performance.now()) : 0;
  const send = () => track(Events.CLIENT_PICKED, { ms_since_load: ms, surface: onDoor ? "door" : "workspace" });
  fetch(`/api/ops/analytics-context?org=${encodeURIComponent(orgId)}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((ctx: { group?: string | null } | null) => { if (ctx?.group) groupOrganization(ctx.group); })
    .catch(() => undefined)
    .then(send);
}
