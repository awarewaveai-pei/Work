import ServiceProfilesClient from "../../(shell)/tools/outreach/settings/service-profiles/ServiceProfilesClient";
import { SR_ONLY } from "@/lib/portal/sr-only";

export const metadata = { title: "服務設定" };

// outreach.<base domain>/profiles, as staff open it at /tools/outreach/settings/service-profiles.
export default function OutreachDoorServiceProfilesPage() {
  return <><h1 style={SR_ONLY}>服務設定</h1><ServiceProfilesClient /></>;
}
