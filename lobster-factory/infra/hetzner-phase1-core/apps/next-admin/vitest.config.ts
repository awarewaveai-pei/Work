import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // React component tests compile with the automatic runtime, so a .tsx test needs no `import React`.
  // Without this, JSX emits React.createElement and every component test dies on "React is not
  // defined" — which reads like a broken component rather than a missing compiler flag.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],   // jsdom tests wait 5 s for async UI (see the file)
    // A test that imports a whole page takes ~1.3 s alone and passes; in the full suite (600+ files in parallel, and on
    // the 2-core deploy host) the same test can pass vitest's default 5 s and abort a deploy (2026-11-20:
    // ops/billing page.sidebar; workers saw hosting-gate-contract and tarot batch-store the same way). 20 s is a
    // ceiling for load, not a budget: a test that hangs still fails.
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
