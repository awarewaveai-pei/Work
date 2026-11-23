import EventsCalendarStaff from "./EventsCalendarStaff";

export const metadata = { title: "節日行事曆" };

export default function EventsPage() {
  return <EventsCalendarStaff heading={<h1 style={{ margin: 0, fontSize: 22 }}>節日行事曆</h1>} />;
}
