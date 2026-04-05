import { z } from "zod";
import type { StagingHostingProvisionResult } from "../types";

const BodySchema = z.object({
  environmentId: z.string().min(1),
  wpRootPath: z.string().min(1),
  stagingSiteUrl: z.string().url(),
  wpAdminUrl: z.string().url(),
  provisioningNotes: z.array(z.string()).optional(),
});

/**
 * `LOBSTER_HOSTING_ADAPTER=http_json` — POST JSON to your control plane; maps response into apply-manifest fields.
 * Contract: `docs/hosting/HTTP_JSON_HOSTING_ADAPTER.md`.
 */
export async function provisionHttpJsonStaging(input: {
  organizationId: string;
  siteId: string;
  siteName: string;
}): Promise<StagingHostingProvisionResult> {
  const baseUrl = process.env.LOBSTER_HOSTING_PROVIDER_BASE_URL?.trim();
  const token = process.env.LOBSTER_HOSTING_API_TOKEN?.trim();
  const missing: string[] = [];
  if (!baseUrl) missing.push("LOBSTER_HOSTING_PROVIDER_BASE_URL");
  if (!token) missing.push("LOBSTER_HOSTING_API_TOKEN");

  if (missing.length > 0) {
    return {
      outcome: "blocked",
      adapter: "http_json",
      message:
        "http_json adapter requires base URL and API token. Set env vars or use LOBSTER_HOSTING_ADAPTER=mock.",
      missingEnv: missing,
    };
  }

  const path =
    process.env.LOBSTER_HOSTING_PROVISION_PATH?.trim() || "/v1/lobster/staging-provision";
  const timeoutMs = Math.min(
    Math.max(Number(process.env.LOBSTER_HOSTING_HTTP_TIMEOUT_MS || "45000") || 45000, 1000),
    120_000
  );

  let url: URL;
  try {
    url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  } catch {
    return {
      outcome: "blocked",
      adapter: "http_json",
      message: `Invalid LOBSTER_HOSTING_PROVIDER_BASE_URL or LOBSTER_HOSTING_PROVISION_PATH.`,
      missingEnv: [],
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        organizationId: input.organizationId,
        siteId: input.siteId,
        siteName: input.siteName,
      }),
    });

    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      return {
        outcome: "blocked",
        adapter: "http_json",
        message: `Hosting API returned non-JSON (HTTP ${res.status}).`,
        missingEnv: [],
      };
    }

    if (!res.ok) {
      const detail =
        json && typeof json === "object" && json !== null && "message" in json
          ? String((json as { message: unknown }).message)
          : text.slice(0, 500);
      return {
        outcome: "blocked",
        adapter: "http_json",
        message: `Hosting API error HTTP ${res.status}: ${detail}`,
        missingEnv: [],
      };
    }

    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return {
        outcome: "blocked",
        adapter: "http_json",
        message: `Hosting API JSON did not match contract: ${parsed.error.message}`,
        missingEnv: [],
      };
    }

    const data = parsed.data;
    return {
      outcome: "provisioned",
      ref: {
        adapter: "http_json",
        environmentId: data.environmentId,
        wpRootPath: data.wpRootPath,
        stagingSiteUrl: data.stagingSiteUrl,
        wpAdminUrl: data.wpAdminUrl,
        provisioningNotes: data.provisioningNotes ?? [
          "LOBSTER_HOSTING_ADAPTER=http_json: values returned by vendor HTTP API.",
        ],
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      outcome: "blocked",
      adapter: "http_json",
      message: aborted
        ? `Hosting API request timed out after ${timeoutMs}ms.`
        : `Hosting API request failed: ${msg}`,
      missingEnv: [],
    };
  } finally {
    clearTimeout(timer);
  }
}
