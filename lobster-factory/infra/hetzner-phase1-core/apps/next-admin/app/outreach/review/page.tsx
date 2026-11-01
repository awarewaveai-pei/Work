import ReviewClient from "../../(shell)/tools/outreach/review/ReviewClient";

export const metadata = { title: "審核信件" };

// outreach.<base domain>/review, as staff open it at /tools/outreach/review.
export default function OutreachDoorReviewPage() {
  return <ReviewClient />;
}
