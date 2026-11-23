import LeadsClient from "../(shell)/tools/outreach/leads/LeadsClient";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "名單" };

// outreach.<base domain>/ -> /outreach, as staff open it at /tools/outreach/leads.
export default function OutreachDoorLeadsPage() {
  return <><h1 style={SR_ONLY}>名單</h1><LeadsClient /></>;
}
