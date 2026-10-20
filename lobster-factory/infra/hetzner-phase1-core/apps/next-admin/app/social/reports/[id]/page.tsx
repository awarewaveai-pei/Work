import { notFound } from "next/navigation";
import ReportView from "../../../(shell)/tools/social/reports/ReportView";

// the id goes into /api/social/reports/<id> as it is: only a report id may reach it
const REPORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = { title: "報表 · 社群發文" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!REPORT_ID.test(id)) notFound();
  return <ReportView id={id} />;
}
