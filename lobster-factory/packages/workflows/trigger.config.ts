import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // After first boot: open https://trigger.aware-wave.com, create a project,
  // copy the new project ref here and remove the old Cloud ref.
  project: "proj_6c4f24492a705729fc2c",
  triggerUrl: "https://trigger.aware-wave.com",
  dirs: ["./src/trigger"],
  build: {
    extensions: [
      // Sync PostHog server-side keys into Trigger prod/staging on each deploy when set locally.
      // Source: same POSTHOG_* as phase1 `.env` / vault — export before `npx trigger.dev deploy`.
      // See `infra/trigger/README.md` § PostHog（workflow 事件）.
      syncEnvVars(async () => {
        const out: Record<string, string> = {};
        const apiKey = process.env.POSTHOG_API_KEY ?? "";
        const host = process.env.POSTHOG_HOST ?? "";
        if (apiKey.trim() && host.trim()) {
          out.POSTHOG_API_KEY = apiKey;
          out.POSTHOG_HOST = host;
        }
        const ingest = process.env.OPS_INBOX_INGEST_TOKEN ?? "";
        if (ingest.trim()) {
          out.OPS_INBOX_INGEST_TOKEN = ingest.trim();
        }
        const awBase = process.env.AWAREWAVE_WEBHOOK_BASE_URL ?? "";
        if (awBase.trim()) {
          out.AWAREWAVE_WEBHOOK_BASE_URL = awBase.trim().replace(/\/$/, "");
        }
        return out;
      }),
    ],
  },
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
});
