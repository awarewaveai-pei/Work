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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
