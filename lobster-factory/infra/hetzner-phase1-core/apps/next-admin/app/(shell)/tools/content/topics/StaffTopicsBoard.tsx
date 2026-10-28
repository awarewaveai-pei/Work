"use client";
// Staff wrapper: the board plus step ④'s 排程 switch for a person who holds the schedules tool (staff-tools.test.ts
// NEEDS_OTHER_TOOL). Kept out of TopicsBoard so the content door's page never imports an /api/ops caller.
import { ScheduleTable } from "@/app/(shell)/ops/schedules/ScheduleTable";
import type { OverviewData } from "@/lib/content/topics/overview-load";
import { TopicsBoard } from "./TopicsBoard";

export function StaffTopicsBoard({ overview, canSchedule }: { overview: OverviewData; canSchedule: boolean }) {
  return <TopicsBoard overview={overview} scheduleFor={canSchedule ? (slug) => <ScheduleTable only={slug} jobOnly="content_pipeline" /> : undefined} />;
}
