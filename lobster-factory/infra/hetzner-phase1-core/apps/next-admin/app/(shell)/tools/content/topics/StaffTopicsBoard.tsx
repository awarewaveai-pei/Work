"use client";
// Staff wrapper: the board plus the two staff-only parts -- step ④'s 排程 switch for a person who holds the schedules tool
// (staff-tools.test.ts NEEDS_OTHER_TOOL) and the 客戶 page's client picker (OrgPicker, which searches /api/ops/org-search).
// Kept out of TopicsBoard so the content door's page never imports an /api/ops caller.
import { ScheduleTable } from "@/app/(shell)/ops/schedules/ScheduleTable";
import { OrgPicker } from "@/app/(shell)/ops/clients/OrgPicker";
import type { OverviewData } from "@/lib/content/topics/overview-load";
import { TopicsBoard, type TopicsView } from "./TopicsBoard";

export function StaffTopicsBoard({ overview, canSchedule, view }: { overview: OverviewData; canSchedule: boolean; view: TopicsView }) {
  return <TopicsBoard overview={overview} view={view} pickClient={(p) => <OrgPicker {...p} by="id" searchPath="/api/ops/org-search" />}
    scheduleFor={canSchedule ? (slug) => <ScheduleTable only={slug} jobOnly="content_pipeline" /> : undefined} />;
}
