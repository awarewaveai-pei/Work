import ContentCalendar from "../../(shell)/tools/content/calendar/ContentCalendar";

export const metadata = { title: "內容行事曆" };

// content.<base domain>/calendar, as staff open it at /tools/content/calendar.
export default function ContentDoorCalendarPage() {
  return <ContentCalendar />;
}
