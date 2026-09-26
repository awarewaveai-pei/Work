import { LESSONS, type Lesson } from "./lessons.generated";

// Lessons are exported from the lesson mocks (docs/mockups, sync-design-system.py -> lessons.generated.ts). Server
// only: importing this module ships every lesson's HTML, so a client page gets its lesson link as a prop.
export function lessonOf(id: string, kind: Lesson["kind"]): Lesson | null {
  const lesson = LESSONS[id];
  return lesson?.kind === kind ? lesson : null;
}

export function lessonHref(id: string, kind: Lesson["kind"]): string | null {
  return lessonOf(id, kind)?.href ?? null;
}
