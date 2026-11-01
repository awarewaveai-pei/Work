import SuppressionClient from "../../(shell)/tools/outreach/settings/suppression/SuppressionClient";

export const metadata = { title: "拒收名單" };

// outreach.<base domain>/suppression, as staff open it at /tools/outreach/settings/suppression.
export default function OutreachDoorSuppressionPage() {
  return <SuppressionClient />;
}
