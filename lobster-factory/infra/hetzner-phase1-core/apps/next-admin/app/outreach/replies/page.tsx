import RepliesClient from "../../(shell)/tools/outreach/replies/RepliesClient";

export const metadata = { title: "回信" };

// outreach.<base domain>/replies, as staff open it at /tools/outreach/replies.
export default function OutreachDoorRepliesPage() {
  return <RepliesClient />;
}
