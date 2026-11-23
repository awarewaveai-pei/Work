import RepliesClient from "../../(shell)/tools/outreach/replies/RepliesClient";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "回信" };

// outreach.<base domain>/replies, as staff open it at /tools/outreach/replies.
export default function OutreachDoorRepliesPage() {
  return <><h1 style={SR_ONLY}>回信</h1><RepliesClient /></>;
}
