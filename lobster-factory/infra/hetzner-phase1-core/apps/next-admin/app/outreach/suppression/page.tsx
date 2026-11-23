import SuppressionClient from "../../(shell)/tools/outreach/settings/suppression/SuppressionClient";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "拒收名單" };

// outreach.<base domain>/suppression, as staff open it at /tools/outreach/settings/suppression.
export default function OutreachDoorSuppressionPage() {
  return <><h1 style={SR_ONLY}>拒收名單</h1><SuppressionClient /></>;
}
