import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyOutputIntent,
  resolveIccPath,
  OutputIntentNotDeployedError,
  ICC_PATHS,
} from "../ghostscript-pdfx";

const BUNDLED = "/usr/share/ghostscript/iccprofiles/default_cmyk.icc";

describe("resolveIccPath", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults every profile to the bundled SWOP CMYK profile (zero procurement)", () => {
    expect(resolveIccPath("JapanColor2001Coated")).toBe(BUNDLED);
    expect(resolveIccPath("USWebCoatedSWOP")).toBe(BUNDLED);
    expect(resolveIccPath("CoatedFOGRA39")).toBe(BUNDLED);
  });

  it("honours a per-profile env override path (drop-in licensed/CC profile, no code change)", () => {
    vi.stubEnv("POD_ICC_CoatedFOGRA39", "/app/icc/ISOcoated_v2_bas.ICC");
    expect(resolveIccPath("CoatedFOGRA39")).toBe("/app/icc/ISOcoated_v2_bas.ICC");
    // a blank override falls back to the bundled default
    vi.stubEnv("POD_ICC_USWebCoatedSWOP", "   ");
    expect(resolveIccPath("USWebCoatedSWOP")).toBe(BUNDLED);
  });

  it("ICC_PATHS back-compat map points all names at the bundled profile", () => {
    expect(ICC_PATHS.JapanColor2001Coated).toBe(BUNDLED);
  });
});

describe("applyOutputIntent deploy gate", () => {
  it("throws OutputIntentNotDeployedError when POD_OUTPUT_INTENT_DEPLOYED is not set", async () => {
    // OUTPUT_INTENT_DEPLOYED is read at module load; default test env has it unset → false.
    await expect(applyOutputIntent(Buffer.from("%PDF-1.3"), "USWebCoatedSWOP")).rejects.toBeInstanceOf(
      OutputIntentNotDeployedError,
    );
  });
});
