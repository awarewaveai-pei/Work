// Next's middleware silently cuts a request body at middlewareClientMaxBodySize; the browser shrinks pictures to the
// size this module believes. The two must agree, or saves vanish again (2026-11-15, tarot -> My Designs).
import path from "node:path";
import { describe, expect, it } from "vitest";
import loadConfig from "next/dist/server/config";
import { REQUEST_BODY_MAX_BYTES } from "../image-upload-limit";

describe("request body size", () => {
  it("the body size the browser shrinks to is the one Next's middleware passes whole", async () => {
    // Next's own loader: the value it runs with, its default included when unset (a commented-out line is unset).
    const config = await loadConfig("phase-production-server", path.resolve(__dirname, "../../.."));
    expect(REQUEST_BODY_MAX_BYTES).toBe(Number(config.experimental.middlewareClientMaxBodySize));
  }, 30_000);
});
