import ConnectorsClient from "../../(shell)/tools/outreach/connectors/ConnectorsClient";

export const metadata = { title: "信箱與連線" };

// outreach.<base domain>/connectors, as staff open it at /tools/outreach/connectors.
export default function OutreachDoorConnectorsPage() {
  return <ConnectorsClient />;
}
