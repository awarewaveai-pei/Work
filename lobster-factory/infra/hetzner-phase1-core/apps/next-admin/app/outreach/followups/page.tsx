import FollowupsClient from "../../(shell)/tools/outreach/followups/FollowupsClient";

export const metadata = { title: "追蹤" };

// outreach.<base domain>/followups, as staff open it at /tools/outreach/followups.
export default function OutreachDoorFollowupsPage() {
  return <FollowupsClient />;
}
