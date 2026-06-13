/**
 * Ghostscript OutputIntent pass — embeds an ICC profile into a CMYK PDF to make it
 * PDF/X-1a (scenario A: direct-to-print). Required because pdf-lib CANNOT add an ICC
 * OutputIntent (PR #1512 closed, library unmaintained — plan §10.3 ground-truth 1).
 *
 * ⚠️ DEPLOY-GATED STUB. The interface is shipped now so to-print-file.ts ([1-d]) is
 * pure-code-complete and not blocked on infra. The real `gs` invocation is wired at
 * deploy time ([0-a-gs] gate) because it needs:
 *   - Alpine base (node:20-alpine) → `apk add --no-cache ghostscript` (NOT apt-get)
 *   - 3 ICC files COPYed into the image (Alpine has no icc-profiles-free package;
 *     Adobe JapanColor/SWOP licensing must be confirmed) — see plan §10.3 deploy note.
 *
 * Until then, any cmyk+ICC destination that reaches here throws OUTPUT_INTENT_NOT_DEPLOYED
 * rather than silently returning a non-PDF/X file that a printer would reject at preflight.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export type IccProfileName =
  | "JapanColor2001Coated" // 台灣 / 日 / 亞洲
  | "USWebCoatedSWOP" // 美國
  | "CoatedFOGRA39"; // 歐洲

/** Absolute paths inside the deployed image (populated at [0-a-gs] deploy gate). */
export const ICC_PATHS: Record<IccProfileName, string> = {
  JapanColor2001Coated: "/usr/share/color/icc/JapanColor2001Coated.icc",
  USWebCoatedSWOP: "/usr/share/color/icc/USWebCoatedSWOP.icc",
  CoatedFOGRA39: "/usr/share/color/icc/CoatedFOGRA39.icc",
};

/** Toggled on once gs + ICC profiles are baked into the image (env or build flag). */
export const OUTPUT_INTENT_DEPLOYED = process.env.POD_OUTPUT_INTENT_DEPLOYED === "true";

export class OutputIntentNotDeployedError extends Error {
  constructor(icc: IccProfileName) {
    super(
      `OUTPUT_INTENT_NOT_DEPLOYED: Ghostscript ICC pass for "${icc}" is deploy-gated ` +
        `([0-a-gs]). Set POD_OUTPUT_INTENT_DEPLOYED=true after gs + ICC profiles are baked ` +
        `into the image. Until then this CMYK PDF is NOT PDF/X-1a and a printer will reject it.`
    );
    this.name = "OutputIntentNotDeployedError";
  }
}

/**
 * Apply an ICC OutputIntent to a CMYK PDF via Ghostscript, producing PDF/X-1a.
 *
 * DEPLOY-GATED: throws until POD_OUTPUT_INTENT_DEPLOYED=true. The implementation
 * sketch (run at deploy gate) writes the PDF to os.tmpdir(), runs:
 *   gs -dPDFX -dBATCH -dNOPAUSE -dPDFXCompatibilityPolicy=1
 *      -sColorConversionStrategy=CMYK -sDEVICE=pdfwrite
 *      -sOutputICCProfile=<ICC_PATHS[icc]> -sOutputFile=out.pdf in.pdf
 * then reads out.pdf back. Temp paths use os.tmpdir(), never the repo.
 */
export async function applyOutputIntent(pdf: Buffer, icc: IccProfileName): Promise<Buffer> {
  if (!OUTPUT_INTENT_DEPLOYED) {
    throw new OutputIntentNotDeployedError(icc);
  }
  // Deploy-gated real implementation — wired at [0-a-gs]. Reference invocation kept
  // here so the deploy step has the exact contract; not exercised until the flag flips.
  /* istanbul ignore next */
  {
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pdfx-"));
    const inPath = path.join(dir, "in.pdf");
    const outPath = path.join(dir, "out.pdf");
    try {
      await fs.writeFile(inPath, pdf);
      await execFileP("gs", [
        "-dPDFX",
        "-dBATCH",
        "-dNOPAUSE",
        "-dPDFXCompatibilityPolicy=1",
        "-sColorConversionStrategy=CMYK",
        "-sDEVICE=pdfwrite",
        `-sOutputICCProfile=${ICC_PATHS[icc]}`,
        `-sOutputFile=${outPath}`,
        inPath,
      ]);
      return Buffer.from(await fs.readFile(outPath));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}
