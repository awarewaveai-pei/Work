"use client";
import type { ReactNode } from "react";
import ArticleSchedule from "./ArticleSchedule";
import { ArticleScheduleContext } from "./ArticleScheduleSlot";

export default function StaffArticleSchedule({ children }: { children: ReactNode }) {
  return <ArticleScheduleContext.Provider value={ArticleSchedule}>{children}</ArticleScheduleContext.Provider>;
}
