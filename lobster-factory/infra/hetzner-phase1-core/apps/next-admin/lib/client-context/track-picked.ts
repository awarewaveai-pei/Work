import { Events, groupOrganization, track } from "@/lib/analytics";

/** The staff picked a client in the rail: one client_picked event and the client as the PostHog group (id only).
 *  method is "other": the rail's picker does not say which of search / category / row was used (blueprint §13.2). */
export function trackClientPicked(orgId: string, onDoor: boolean): void {
  groupOrganization(orgId);
  track(Events.CLIENT_PICKED, {
    method: "other",
    ms_since_load: typeof performance !== "undefined" ? Math.round(performance.now()) : 0,
    surface: onDoor ? "door" : "workspace",
  });
}
