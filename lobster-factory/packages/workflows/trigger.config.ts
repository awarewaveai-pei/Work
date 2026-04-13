import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // After first boot: open https://trigger.aware-wave.com, create a project,
  // copy the new project ref here and remove the old Cloud ref.
  project: "proj_rqykzzwujizcxdzgnedn",
  triggerUrl: "https://trigger.aware-wave.com",
  dirs: ["./src/trigger"],
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
