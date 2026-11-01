import InboxClient from "../../(shell)/tools/outreach/inbox/InboxClient";

export const metadata = { title: "匯入名單" };

// outreach.<base domain>/inbox, as staff open it at /tools/outreach/inbox.
export default function OutreachDoorInboxPage() {
  return <InboxClient />;
}
