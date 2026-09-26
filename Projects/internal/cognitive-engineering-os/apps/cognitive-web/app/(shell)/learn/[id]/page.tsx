import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonView } from "../../../../components/LessonView";
import { lessonOf } from "../../../../lib/lessons";

// A tool's lesson, exactly as docs/mockups/iceberg-lesson-mock.html (lib/lessons.generated.ts). A tool without a
// lesson yet is a 404; its pages link here only when the lesson exists.
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lesson = lessonOf(decodeURIComponent((await params).id), "tool");
  return lesson ? { title: lesson.title } : {};
}

export default async function ToolLessonPage({ params }: Props) {
  const lesson = lessonOf(decodeURIComponent((await params).id), "tool");
  if (!lesson) notFound();
  return <LessonView html={lesson.html} />;
}
