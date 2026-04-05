import fs from "node:fs/promises";
import path from "node:path";
import { getArtifactsMode } from "./artifactMode";

/** @deprecated Prefer `getArtifactsMode()` — kept for call sites that only care about local disk. */
export function getLocalArtifactsMode(): "off" | "local" {
  return getArtifactsMode() === "local" ? "local" : "off";
}

export function resolveLocalArtifactsBaseDir(): string {
  const explicit = process.env.LOBSTER_ARTIFACTS_BASE_DIR?.trim();
  if (explicit) return path.resolve(explicit);

  const wr = process.env.LOBSTER_WORK_ROOT?.trim();
  if (wr) {
    return path.join(path.resolve(wr), "agency-os", "reports", "artifacts", "lobster");
  }

  throw new Error(
    "LOBSTER_ARTIFACTS_MODE=local requires LOBSTER_ARTIFACTS_BASE_DIR or LOBSTER_WORK_ROOT"
  );
}

/**
 * Writes full shell stdout/stderr under `.../apply-manifest/<workflowRunId>/`.
 * `logs_ref` is a stable logical key (not necessarily a public URL).
 */
export async function writeApplyManifestLocalArtifacts(params: {
  workflowRunId: string;
  packageInstallRunId: string;
  stdout: string;
  stderr: string;
}): Promise<{ logsRef: string }> {
  const base = resolveLocalArtifactsBaseDir();
  const dir = path.join(base, "apply-manifest", params.workflowRunId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "stdout.log"), params.stdout, "utf8");
  await fs.writeFile(path.join(dir, "stderr.log"), params.stderr, "utf8");
  await fs.writeFile(
    path.join(dir, "meta.json"),
    JSON.stringify(
      {
        trigger: "apply-manifest",
        packageInstallRunId: params.packageInstallRunId,
        writtenAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
  return { logsRef: `lobster-local-artifacts:apply-manifest/${params.workflowRunId}/` };
}

export async function writeApplyManifestLocalArtifactsFailure(params: {
  workflowRunId: string;
  packageInstallRunId: string;
  message: string;
  stderrExcerpt?: string;
}): Promise<{ logsRef: string }> {
  const base = resolveLocalArtifactsBaseDir();
  const dir = path.join(base, "apply-manifest", params.workflowRunId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "error.txt"), params.message, "utf8");
  if (params.stderrExcerpt) {
    await fs.writeFile(path.join(dir, "stderr.excerpt.log"), params.stderrExcerpt, "utf8");
  }
  await fs.writeFile(
    path.join(dir, "meta.json"),
    JSON.stringify(
      {
        trigger: "apply-manifest",
        failed: true,
        packageInstallRunId: params.packageInstallRunId,
        writtenAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
  return { logsRef: `lobster-local-artifacts:apply-manifest/${params.workflowRunId}/` };
}
