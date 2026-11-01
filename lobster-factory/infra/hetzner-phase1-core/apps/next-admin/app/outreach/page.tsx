import LeadsClient from "../(shell)/tools/outreach/leads/LeadsClient";

export const metadata = { title: "名單" };

// outreach.<base domain>/ -> /outreach, as staff open it at /tools/outreach/leads.
export default function OutreachDoorLeadsPage() {
  return <LeadsClient />;
}
