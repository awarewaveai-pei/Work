import FollowupsClient from "../../(shell)/tools/outreach/followups/FollowupsClient";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "追蹤" };

// outreach.<base domain>/followups, as staff open it at /tools/outreach/followups.
export default function OutreachDoorFollowupsPage() {
  return <><h1 style={SR_ONLY}>追蹤</h1><FollowupsClient /></>;
}
