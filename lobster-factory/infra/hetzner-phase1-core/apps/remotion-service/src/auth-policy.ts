export interface RendererAuthPolicyInput {
  token: string | undefined;
  host: string | undefined;
  allowInsecureLocalRender: boolean;
}

export type RendererAuthPolicy =
  | { ok: true; authRequired: true }
  | { ok: true; authRequired: false }
  | { ok: false; error: string };

export function isLoopbackHost(host: string | undefined): boolean {
  const normalized = host?.trim().replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
}

/** Empty credentials are allowed only for explicit loopback-only local development. */
export function evaluateRendererAuthPolicy(
  input: RendererAuthPolicyInput,
): RendererAuthPolicy {
  if (input.token?.trim()) return { ok: true, authRequired: true };
  if (input.allowInsecureLocalRender && isLoopbackHost(input.host)) {
    return { ok: true, authRequired: false };
  }
  return {
    ok: false,
    error: "RENDER_AUTH_TOKEN is required unless ALLOW_INSECURE_LOCAL_RENDER=true and REMOTION_HOST is loopback",
  };
}
