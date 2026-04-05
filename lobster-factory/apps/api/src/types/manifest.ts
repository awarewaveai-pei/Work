import { z } from "zod";

export const ManifestStepSchema = z.object({
  id: z.string(),
  type: z.enum(["install_theme", "install_plugin", "conditional_plugin"]),
  slug: z.string().optional(),
  condition: z.string().optional(),
});

export const ManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  schemaVersion: z.string(),
  target: z.literal("staging-only"),
  description: z.string().optional(),
  guardrails: z.object({
    allowEnvironments: z.array(z.string()),
    requireBackup: z.boolean(),
    blockIfProduction: z.boolean(),
  }),
  dependencies: z.array(z.unknown()),
  conflicts: z.array(z.unknown()),
  steps: z.array(ManifestStepSchema),
  postInstall: z.array(z.record(z.any())),
  verification: z.array(z.record(z.any())),
  rollback: z.object({
    strategy: z.string(),
  }),
});

export type Manifest = z.infer<typeof ManifestSchema>;

