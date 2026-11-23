import ConnectorsClient from "../../(shell)/tools/outreach/connectors/ConnectorsClient";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "信箱與連線" };

// outreach.<base domain>/connectors, as staff open it at /tools/outreach/connectors.
export default function OutreachDoorConnectorsPage() {
  return <><h1 style={SR_ONLY}>信箱與連線</h1><ConnectorsClient /></>;
}
