import type { Incident } from "@/lib/ops-inbox/types";
import { getService } from "@/lib/ops-inbox/registry/services";

export function buildRemoteUiUrl(incident: Incident, target: "n8n" | "supabase"): string {
  const svc = getService(incident.service);
  if (!svc) return target === "n8n" ? "https://n8n.aware-wave.com" : "https://studio.aware-wave.com";
  if (svc.type === "remote-ui-n8n") return svc.ui_url;
  if (svc.type === "remote-ui-supabase") return svc.ui_url;
  return target === "n8n" ? "https://n8n.aware-wave.com" : "https://studio.aware-wave.com";
}
