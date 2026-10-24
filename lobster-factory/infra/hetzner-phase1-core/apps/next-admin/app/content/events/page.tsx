import EventsCalendar from "../../(shell)/tools/events/EventsCalendar";

export const metadata = { title: "節日行事曆" };

// content.<base domain>/events: the read view; the cache refresh (/api/tools/events/sync) is staff-only and only the
// staff page passes `sync`.
export default function ContentDoorEventsPage() {
  return <EventsCalendar />;
}
