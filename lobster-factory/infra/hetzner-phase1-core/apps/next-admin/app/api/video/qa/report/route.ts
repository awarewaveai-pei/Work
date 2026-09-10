import { NextResponse } from "next/server";
/** Browser-supplied QA records were retired: only named server QA producers may write evidence. */
export async function POST(): Promise<Response> {
  return NextResponse.json({ ok: false, error: "qa_report_browser_write_retired" }, { status: 410 });
}
