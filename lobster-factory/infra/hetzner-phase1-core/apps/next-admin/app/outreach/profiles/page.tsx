import ServiceProfilesClient from "../../(shell)/tools/outreach/settings/service-profiles/ServiceProfilesClient";

export const metadata = { title: "服務設定" };

// outreach.<base domain>/profiles, as staff open it at /tools/outreach/settings/service-profiles.
export default function OutreachDoorServiceProfilesPage() {
  return <ServiceProfilesClient />;
}
