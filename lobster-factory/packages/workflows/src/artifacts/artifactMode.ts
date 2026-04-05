/**
 * `LOBSTER_ARTIFACTS_MODE` — where apply-manifest persists full stdout/stderr.
 */
export type ArtifactsMode = "off" | "local" | "remote_put";

export function getArtifactsMode(): ArtifactsMode {
  const v = (process.env.LOBSTER_ARTIFACTS_MODE || "").toLowerCase();
  if (v === "local" || v === "1" || v === "true") return "local";
  if (
    v === "remote_put" ||
    v === "presigned_put" ||
    v === "r2_put" ||
    v === "s3_put"
  ) {
    return "remote_put";
  }
  return "off";
}
