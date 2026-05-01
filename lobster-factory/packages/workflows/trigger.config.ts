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
        const apiKey = process.env.POSTHOG_API_KEY ?? "";
        const host = process.env.POSTHOG_HOST ?? "";
        if (!apiKey.trim() || !host.trim()) {
          return {};
        }
        return {
          POSTHOG_API_KEY: apiKey,
          POSTHOG_HOST: host,
        };
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
