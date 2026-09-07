export type RendererKind = "quick" | "remotion";

export type RendererAuthResolution =
  | { ok: true; source: "canonical" | "legacy"; headers: { "X-Render-Token": string } }
  | { ok: false; error: "renderer_auth_not_configured" };

type RendererAuthEnvironment = {
  MEDIA_RENDER_AUTH_TOKEN?: string;
  VIDEO_SERVICE_SECRET?: string;
  REMOTION_AUTH_TOKEN?: string;
};

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/**
 * Resolves the private renderer credential without exposing it to route callers.
 *
 * MEDIA_RENDER_AUTH_TOKEN is the canonical setting. The renderer-specific aliases
 * are a one-release compatibility bridge for the pre-existing deployment shape.
 */
export function resolveRendererAuth(
  renderer: RendererKind,
  env: RendererAuthEnvironment = process.env as unknown as RendererAuthEnvironment,
): RendererAuthResolution {
  const canonical = nonBlank(env.MEDIA_RENDER_AUTH_TOKEN);
  if (canonical) {
    return { ok: true, source: "canonical", headers: { "X-Render-Token": canonical } };
  }

  const legacy = nonBlank(
    renderer === "quick" ? env.VIDEO_SERVICE_SECRET : env.REMOTION_AUTH_TOKEN,
  );
  if (legacy) {
    return { ok: true, source: "legacy", headers: { "X-Render-Token": legacy } };
  }

  return { ok: false, error: "renderer_auth_not_configured" };
}

/** Health is intentionally public; callers may attach a credential when present. */
export function optionalRendererAuthHeaders(
  renderer: RendererKind,
  env: RendererAuthEnvironment = process.env as unknown as RendererAuthEnvironment,
): Record<string, string> {
  const resolution = resolveRendererAuth(renderer, env);
  return resolution.ok ? resolution.headers : {};
}
