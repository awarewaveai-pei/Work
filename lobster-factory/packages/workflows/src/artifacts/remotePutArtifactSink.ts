import { z } from "zod";

const PutTargetSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  contentType: z.string().optional(),
});

const DescriptorSchema = z.object({
  puts: z.record(z.string(), PutTargetSchema),
  logsRef: z.string().min(1).optional(),
});

export type PutDescriptor = z.infer<typeof DescriptorSchema>;

async function loadPutDescriptor(params: {
  workflowRunId: string;
  packageInstallRunId: string;
  files: string[];
}): Promise<PutDescriptor> {
  const inline = process.env.LOBSTER_ARTIFACTS_PUT_DESCRIPTOR_JSON?.trim();
  if (inline) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(inline);
    } catch (e) {
      throw new Error(
        `LOBSTER_ARTIFACTS_PUT_DESCRIPTOR_JSON is not valid JSON: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    const d = DescriptorSchema.safeParse(parsed);
    if (!d.success) throw new Error(`PUT descriptor invalid: ${d.error.message}`);
    return d.data;
  }

  const presignUrl = process.env.LOBSTER_ARTIFACTS_PRESIGN_URL?.trim();
  if (!presignUrl) {
    throw new Error(
      "LOBSTER_ARTIFACTS_MODE=remote_put requires LOBSTER_ARTIFACTS_PRESIGN_URL or LOBSTER_ARTIFACTS_PUT_DESCRIPTOR_JSON"
    );
  }

  const token = process.env.LOBSTER_ARTIFACTS_PRESIGN_TOKEN?.trim();
  const timeoutMs = Math.min(
    Math.max(Number(process.env.LOBSTER_ARTIFACTS_PRESIGN_TIMEOUT_MS || "30000") || 30000, 3000),
    120_000
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(presignUrl, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        trigger: "apply-manifest",
        workflowRunId: params.workflowRunId,
        packageInstallRunId: params.packageInstallRunId,
        files: params.files,
      }),
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Presign endpoint returned non-JSON (HTTP ${res.status})`);
    }

    if (!res.ok) {
      const msg =
        json && typeof json === "object" && json !== null && "message" in json
          ? String((json as { message: unknown }).message)
          : text.slice(0, 400);
      throw new Error(`Presign HTTP ${res.status}: ${msg}`);
    }

    const d = DescriptorSchema.safeParse(json);
    if (!d.success) throw new Error(`Presign response invalid: ${d.error.message}`);
    return d.data;
  } finally {
    clearTimeout(timer);
  }
}

async function putOne(
  name: string,
  body: string,
  target: z.infer<typeof PutTargetSchema>
): Promise<void> {
  const putTimeoutMs = Math.min(
    Math.max(Number(process.env.LOBSTER_ARTIFACTS_PUT_TIMEOUT_MS || "120000") || 120000, 5000),
    300_000
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), putTimeoutMs);
  try {
    const headers: Record<string, string> = { ...(target.headers || {}) };
    if (target.contentType && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = target.contentType;
    }

    const res = await fetch(target.url, {
      method: "PUT",
      signal: controller.signal,
      headers,
      body: Buffer.from(body, "utf8"),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`PUT ${name} failed HTTP ${res.status}: ${t.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

function defaultLogsRef(workflowRunId: string): string {
  return `lobster-remote-artifacts:apply-manifest/${workflowRunId}/`;
}

/**
 * Upload stdout/stderr/meta via presigned (or inline descriptor) PUTs — R2/S3 compatible without SDK.
 */
export async function writeApplyManifestRemotePutArtifacts(params: {
  workflowRunId: string;
  packageInstallRunId: string;
  stdout: string;
  stderr: string;
}): Promise<{ logsRef: string }> {
  const meta = JSON.stringify(
    {
      trigger: "apply-manifest",
      packageInstallRunId: params.packageInstallRunId,
      writtenAt: new Date().toISOString(),
    },
    null,
    2
  );

  const files = ["stdout.log", "stderr.log", "meta.json"] as const;
  const descriptor = await loadPutDescriptor({
    workflowRunId: params.workflowRunId,
    packageInstallRunId: params.packageInstallRunId,
    files: [...files],
  });

  const bodies: Record<string, string> = {
    "stdout.log": params.stdout,
    "stderr.log": params.stderr,
    "meta.json": meta,
  };

  for (const name of files) {
    const target = descriptor.puts[name];
    if (!target) throw new Error(`PUT descriptor missing key "${name}"`);
    await putOne(name, bodies[name], target);
  }

  return { logsRef: descriptor.logsRef ?? defaultLogsRef(params.workflowRunId) };
}

export async function writeApplyManifestRemotePutArtifactsFailure(params: {
  workflowRunId: string;
  packageInstallRunId: string;
  message: string;
  stderrExcerpt?: string;
}): Promise<{ logsRef: string }> {
  const files = ["error.txt", "meta.json"] as const;
  const extra = params.stderrExcerpt ? (["stderr.excerpt.log"] as const) : [];
  const allFiles = [...files, ...extra];

  const meta = JSON.stringify(
    {
      trigger: "apply-manifest",
      failed: true,
      packageInstallRunId: params.packageInstallRunId,
      writtenAt: new Date().toISOString(),
    },
    null,
    2
  );

  const descriptor = await loadPutDescriptor({
    workflowRunId: params.workflowRunId,
    packageInstallRunId: params.packageInstallRunId,
    files: [...allFiles],
  });

  const errT = descriptor.puts["error.txt"];
  const metaT = descriptor.puts["meta.json"];
  if (!errT || !metaT) {
    throw new Error('PUT descriptor must include "error.txt" and "meta.json"');
  }
  await putOne("error.txt", params.message, errT);
  await putOne("meta.json", meta, metaT);
  const exT = descriptor.puts["stderr.excerpt.log"];
  if (params.stderrExcerpt && exT) {
    await putOne("stderr.excerpt.log", params.stderrExcerpt, exT);
  }

  return { logsRef: descriptor.logsRef ?? defaultLogsRef(params.workflowRunId) };
}
