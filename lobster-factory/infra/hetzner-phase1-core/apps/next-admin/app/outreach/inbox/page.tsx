import InboxClient from "../../(shell)/tools/outreach/inbox/InboxClient";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "匯入名單" };

// outreach.<base domain>/inbox, as staff open it at /tools/outreach/inbox.
export default function OutreachDoorInboxPage() {
  return <><h1 style={SR_ONLY}>匯入名單</h1><InboxClient /></>;
}
