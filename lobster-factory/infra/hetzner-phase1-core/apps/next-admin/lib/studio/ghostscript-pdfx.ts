/**
 * Ghostscript OutputIntent pass — embeds an ICC profile into a CMYK PDF to make it
 * PDF/X-1a (scenario A: direct-to-print). Required because pdf-lib CANNOT add an ICC
 * OutputIntent (PR #1512 closed, library unmaintained — plan §10.3 ground-truth 1).
 *
 * HOW (verified web-researcher 2026-06-13, Ghostscript docs + upstream PDFX_def.ps):
 *   `gs -dPDFX` alone does NOT write an /OutputIntent — it only enforces conformity +
 *   colour conversion. The /OutputIntent dict (with the embedded ICC DestOutputProfile)
 *   is injected by a PDFX_def.ps pdfmark file passed BEFORE the input PDF. We generate
 *   that file with buildPdfxDef() and then POST-VERIFY the output really contains
 *   /OutputIntent — gs is silent if the pdfmark fails, and we must never return a PDF
 *   that claims to be PDF/X but isn't (a printer rejects it at preflight).
 *
 * DEPLOY GATE ([0-a-gs]): the gs binary + bundled ICC profiles ship via the Dockerfile
 * (`apk add --no-cache ghostscript` → /usr/share/ghostscript/iccprofiles/default_cmyk.icc).
 * The real pass only runs when POD_OUTPUT_INTENT_DEPLOYED=true; until then it throws so a
 * CMYK destination degrades to a clear "not deployed" error rather than a silent non-PDF/X.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { IccProfileName } from "./print-destinations";
import { buildPdfxDef } from "./pdfx-def";

const execFileP = promisify(execFile);

export type { IccProfileName }; // re-export so existing importers of this module keep working

/**
 * Ghostscript (Alpine `apk add ghostscript`) bundles a SWOP CMYK profile here. It is the
 * safe default DestOutputProfile: always present, produces a valid PDF/X-1a OutputIntent.
 */
const BUNDLED_CMYK_ICC = "/usr/share/ghostscript/iccprofiles/default_cmyk.icc";

/**
 * Resolve the container path of the ICC profile for a destination. Defaults ALL profiles
 * to the bundled SWOP profile so the pipeline works end-to-end with zero procurement. To
 * ship region-accurate colour later, drop the licensed/CC profile into the image and set
 * the matching env var — NO code change:
 *   - POD_ICC_JapanColor2001Coated  (Adobe-licensed; or a basICColor ISO-Coated CC subst.)
 *   - POD_ICC_USWebCoatedSWOP        (bundled default is already SWOP)
 *   - POD_ICC_CoatedFOGRA39          (basICColor ISOcoated_v2_bas.ICC, CC-licensed)
 */
export function resolveIccPath(icc: IccProfileName): string {
  const override = process.env[`POD_ICC_${icc}`]?.trim();
  return override && override.length > 0 ? override : BUNDLED_CMYK_ICC;
}

/** PDF/X OutputIntent identification metadata per named profile. */
const PDFX_META: Record<IccProfileName, { outputCondition: string; conditionId: string }> = {
  JapanColor2001Coated: { outputCondition: "Japan Color 2001 Coated", conditionId: "JC200103" },
  USWebCoatedSWOP: { outputCondition: "U.S. Web Coated (SWOP) v2", conditionId: "CGATS TR001" },
  CoatedFOGRA39: { outputCondition: "Coated FOGRA39 (ISO 12647-2:2004)", conditionId: "FOGRA39" },
};

/** Absolute paths inside the deployed image (kept for backward-compat with earlier importers). */
export const ICC_PATHS: Record<IccProfileName, string> = {
  JapanColor2001Coated: BUNDLED_CMYK_ICC,
  USWebCoatedSWOP: BUNDLED_CMYK_ICC,
  CoatedFOGRA39: BUNDLED_CMYK_ICC,
};

/** Toggled on once gs + ICC profiles are baked into the image (Dockerfile + compose env). */
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

/** gs ran but the output has no /OutputIntent — the pdfmark silently failed; refuse it. */
export class GsOutputIntentMissingError extends Error {
  constructor(icc: IccProfileName) {
    super(
      `GS_OUTPUT_INTENT_MISSING: Ghostscript produced a PDF without /OutputIntent for ` +
        `"${icc}". The PDFX_def.ps pdfmark did not take (bad ICC path or gs version). ` +
        `Refusing to return a non-PDF/X file that a printer would reject.`
    );
    this.name = "GsOutputIntentMissingError";
  }
}

// gs args (order matters: PDFX_def.ps BEFORE the input PDF). -dPDFX forces
// CompatibilityLevel=1.3, so there are no object streams and /OutputIntent is plaintext
// (this is what the post-verify greps). Mirrored verbatim by the Docker REALTEST.
function gsArgs(defPath: string, inPath: string, outPath: string): string[] {
  return [
    "-dPDFX",
    "-dBATCH",
    "-dNOPAUSE",
    "-dPDFXCompatibilityPolicy=1",
    "-sColorConversionStrategy=CMYK",
    "-sDEVICE=pdfwrite",
    `-sOutputFile=${outPath}`,
    defPath,
    inPath,
  ];
}

/**
 * Apply an ICC OutputIntent to a CMYK PDF via Ghostscript, producing PDF/X-1a.
 * DEPLOY-GATED: throws OutputIntentNotDeployedError until POD_OUTPUT_INTENT_DEPLOYED=true.
 * On success, the returned buffer is guaranteed to contain an /OutputIntent (post-verified).
 */
export async function applyOutputIntent(pdf: Buffer, icc: IccProfileName): Promise<Buffer> {
  if (!OUTPUT_INTENT_DEPLOYED) {
    throw new OutputIntentNotDeployedError(icc);
  }
  const os = await import("node:os");
  const path = await import("node:path");
  const fs = await import("node:fs/promises");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pdfx-"));
  const inPath = path.join(dir, "in.pdf");
  const outPath = path.join(dir, "out.pdf");
  const defPath = path.join(dir, "PDFX_def.ps");
  try {
    const meta = PDFX_META[icc];
    const defPs = buildPdfxDef({
      iccPath: resolveIccPath(icc),
      pdfxVersion: "PDF/X-1:2001",
      conformance: "PDF/X-1a:2001",
      outputCondition: meta.outputCondition,
      conditionId: meta.conditionId,
      title: "AwareWave Print",
    });
    await fs.writeFile(inPath, pdf);
    await fs.writeFile(defPath, defPs, "latin1"); // PostScript is latin1/ASCII, not UTF-8
    // Bound the child: a pathological/malformed PDF must not hang gs forever (Next's
    // maxDuration does NOT kill the spawned process). maxBuffer covers gs stderr warnings.
    await execFileP("gs", gsArgs(defPath, inPath, outPath), {
      timeout: 30_000,
      killSignal: "SIGKILL",
      maxBuffer: 64 * 1024 * 1024,
    });

    const out = await fs.readFile(outPath);
    // Post-verify: gs is silent on a failed pdfmark. -dPDFX forces PDF 1.3 (no object
    // streams) so the Catalog keys are plaintext-greppable. Co-require the Catalog array
    // key /OutputIntents AND /DestOutputProfile (the embedded ICC ref) so a stray
    // "/OutputIntent" inside input content can't false-pass a silently-failed pdfmark.
    if (!out.includes(Buffer.from("/OutputIntents")) || !out.includes(Buffer.from("/DestOutputProfile"))) {
      throw new GsOutputIntentMissingError(icc);
    }
    return Buffer.from(out);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
