import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonView } from "../../../../../components/LessonView";
import { lessonOf } from "../../../../../lib/lessons";

// A workflow's lesson, exactly as docs/mockups/workflow-lesson-mock.html (lib/lessons.generated.ts). A workflow without a
// lesson yet is a 404; its pages link here only when the lesson exists.
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lesson = lessonOf(decodeURIComponent((await params).id), "workflow");
  return lesson ? { title: lesson.title } : {};
}

export default async function WorkflowLessonPage({ params }: Props) {
  const lesson = lessonOf(decodeURIComponent((await params).id), "workflow");
  if (!lesson) notFound();
  return <LessonView html={lesson.html} />;
}
