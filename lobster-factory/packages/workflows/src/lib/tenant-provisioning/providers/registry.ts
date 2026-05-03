import type { ProvisioningContext, ProvisioningProvider, ProviderStepResult } from "../types";
import { provisionGithub } from "./github";
import { provisionN8n } from "./n8n";
import { provisionPosthog } from "./posthog";
import { provisionSentry } from "./sentry";
import { provisionSupabase } from "./supabase";
import { provisionTrigger } from "./triggerDev";
import { provisionUptimeKuma } from "./uptimeKuma";

export async function runProviderStep(
  provider: ProvisioningProvider,
  ctx: ProvisioningContext
): Promise<ProviderStepResult> {
  const hints = ctx.hints;

  switch (provider) {
    case "github":
      return provisionGithub(ctx, hints);
    case "sentry":
      return provisionSentry(ctx, hints);
    case "posthog":
      return provisionPosthog(ctx, hints);
    case "n8n":
      return provisionN8n(ctx, hints);
    case "trigger":
      return provisionTrigger(ctx, hints);
    case "supabase":
      return provisionSupabase(ctx, hints);
    case "uptime_kuma":
      return provisionUptimeKuma(ctx, hints);
  }
}
