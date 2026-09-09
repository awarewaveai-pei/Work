/**
 * Server-issued QA marker. Release gates accept only evidence emitted after
 * this boundary; browser request bodies can never create a trusted record.
 */
export const SYSTEM_QA_BOUNDARY_VERSION = "2.0.0";

export function automaticQaIssuance(capabilityId: string): Readonly<Record<string, string>> {
  return {
    issuer: "media-lego-system",
    boundaryVersion: SYSTEM_QA_BOUNDARY_VERSION,
    capabilityId,
  };
}

export function hasAutomaticQaIssuance(reportJson: unknown, capabilityId: string): boolean {
  if (!reportJson || typeof reportJson !== "object" || Array.isArray(reportJson)) return false;
  const issuance = (reportJson as Record<string, unknown>).issuance;
  if (!issuance || typeof issuance !== "object" || Array.isArray(issuance)) return false;
  const value = issuance as Record<string, unknown>;
  return value.issuer === "media-lego-system"
    && value.boundaryVersion === SYSTEM_QA_BOUNDARY_VERSION
    && value.capabilityId === capabilityId;
}
