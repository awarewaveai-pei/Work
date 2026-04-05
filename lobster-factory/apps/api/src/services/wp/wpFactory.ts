import { ManifestSchema } from "../../types/manifest";

export async function validateManifest(raw: unknown) {
  return ManifestSchema.parse(raw);
}

export async function assertStagingOnly(environmentType: string) {
  if (environmentType !== "staging") {
    throw new Error("Operation blocked: only staging environment is allowed");
  }
}

export async function buildInstallPlan(manifest: unknown) {
  const parsed = await validateManifest(manifest);

  return {
    package: parsed.name,
    version: parsed.version,
    steps: parsed.steps,
    postInstall: parsed.postInstall,
    verification: parsed.verification,
    rollback: parsed.rollback,
  };
}

