import ReviewClient from "../../(shell)/tools/outreach/review/ReviewClient";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "審核信件" };

// outreach.<base domain>/review, as staff open it at /tools/outreach/review.
export default function OutreachDoorReviewPage() {
  return <><h1 style={SR_ONLY}>審核信件</h1><ReviewClient /></>;
}
