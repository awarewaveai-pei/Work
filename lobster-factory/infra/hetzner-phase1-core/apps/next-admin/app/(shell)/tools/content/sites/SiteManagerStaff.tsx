"use client";
// Staff-only (/tools/content/sites): SiteManager plus the schedule's text-road buttons. A content door page renders
// SiteManager without this file, so its import closure names no /api/tools/sub-worker or /api/tools/codex-laptop
// (same split as ../ContentStudioStaff.tsx).
import SiteManager, { type TextRoadControl } from "./SiteManager";
import TextModelButtons from "./TextModelButtons";

const textRoad: TextRoadControl = (p) => <TextModelButtons {...p} />;

export default function SiteManagerStaff() {
  return <SiteManager textRoad={textRoad} />;
}
