import type { ReactNode } from "react";
import StaffArticleSchedule from "./StaffArticleSchedule";

export default function StaffSocialLayout({ children }: { children: ReactNode }) {
  return <StaffArticleSchedule>{children}</StaffArticleSchedule>;
}
