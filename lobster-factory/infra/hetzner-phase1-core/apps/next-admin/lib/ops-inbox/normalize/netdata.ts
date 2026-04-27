import type { IncidentDraft, IncidentSeverity } from "../types";
import { netdataHostToTag } from "../registry/sourceMapping";

export function normalizeNetdata(raw: any): IncidentDraft {
  const status: string = (raw?.status ?? "UNKNOWN").toUpperCase();
  const severity: IncidentSeverity = status === "CRITICAL" ? "critical" : status === "WARNING" ? "medium" : "low";

  const host: string = raw?.host ?? "unknown-host";
  const alarm: string = raw?.alarm ?? "unknown-alarm";
  const valueStr: string = raw?.value_string ?? "";
  const info: string = raw?.info ?? "";

  const hostTag = netdataHostToTag(host);

  return {
    source: "netdata",
    external_id: `${host}:${alarm}`,
    fingerprint: "",
    signal_type: "resource",
    severity,
    service: null,
    environment: "production",
    title: `Netdata: ${alarm} = ${valueStr} on ${host}`,
    message: info || null,
    raw,
    tags: { host: hostTag.host, alarm, status, value_string: valueStr },
  };
}
