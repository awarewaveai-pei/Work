import { Events, groupOrganization, track } from "@/lib/analytics";

/** The staff picked a client in the rail: the client becomes the PostHog group and one client_picked event is sent.
 *  `group` is the server-made hash that came with the picked row (org-search); the browser never hashes and calls no API
 *  for it. A row without one: the event goes without a group. Without a PostHog key everything here is silent. */
export function trackClientPicked(group: string | null | undefined, onDoor: boolean): void {
  if (group) groupOrganization(group);
  track(Events.CLIENT_PICKED, {
    ms_since_load: typeof performance !== "undefined" ? Math.round(performance.now()) : 0,
    surface: onDoor ? "door" : "workspace",
  });
}
