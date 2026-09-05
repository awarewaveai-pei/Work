import { describe, expect, it } from "vitest";
import { optionalRendererAuthHeaders, resolveRendererAuth } from "../renderer-auth";

describe("resolveRendererAuth", () => {
  it("uses the canonical token for either renderer", () => {
    const env = {
      MEDIA_RENDER_AUTH_TOKEN: "canonical",
      VIDEO_SERVICE_SECRET: "quick-legacy",
      REMOTION_AUTH_TOKEN: "remotion-legacy",
    };

    expect(resolveRendererAuth("quick", env)).toEqual({
      ok: true,
      source: "canonical",
      headers: { "X-Render-Token": "canonical" },
    });
    expect(resolveRendererAuth("remotion", env)).toEqual({
      ok: true,
      source: "canonical",
      headers: { "X-Render-Token": "canonical" },
    });
  });

  it("uses only the matching legacy alias during the compatibility window", () => {
    expect(resolveRendererAuth("quick", { VIDEO_SERVICE_SECRET: "quick" })).toEqual({
      ok: true,
      source: "legacy",
      headers: { "X-Render-Token": "quick" },
    });
    expect(resolveRendererAuth("remotion", { REMOTION_AUTH_TOKEN: "remotion" })).toEqual({
      ok: true,
      source: "legacy",
      headers: { "X-Render-Token": "remotion" },
    });
    expect(resolveRendererAuth("quick", { REMOTION_AUTH_TOKEN: "remotion" })).toEqual({
      ok: false,
      error: "renderer_auth_not_configured",
    });
  });

  it("rejects missing or whitespace-only credentials", () => {
    expect(resolveRendererAuth("quick", { MEDIA_RENDER_AUTH_TOKEN: "   " })).toEqual({
      ok: false,
      error: "renderer_auth_not_configured",
    });
  });

  it("never adds a public health header when no credential is configured", () => {
    expect(optionalRendererAuthHeaders("quick", {})).toEqual({});
  });
});
