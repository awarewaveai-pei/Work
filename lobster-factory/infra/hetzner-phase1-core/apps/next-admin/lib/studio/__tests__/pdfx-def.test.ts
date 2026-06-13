import { describe, expect, it } from "vitest";
import { buildPdfxDef, escapePostScriptString } from "../pdfx-def";

describe("escapePostScriptString", () => {
  it("escapes the PostScript literal metacharacters ( ) and backslash", () => {
    expect(escapePostScriptString("a(b)c")).toBe("a\\(b\\)c");
    expect(escapePostScriptString("a\\b")).toBe("a\\\\b");
  });

  it("preserves dashes, colons, slashes — must NOT eat real punctuation [regression]", () => {
    // an over-broad control-char range once nearly ate these; PDF/X-1a:2001 must survive.
    expect(escapePostScriptString("PDF/X-1a:2001")).toBe("PDF/X-1a:2001");
    expect(escapePostScriptString("U.S. Web Coated (SWOP) v2")).toBe("U.S. Web Coated \\(SWOP\\) v2");
    expect(escapePostScriptString("http://www.color.org")).toBe("http://www.color.org");
  });

  it("collapses control chars (newline/CR/tab) to spaces", () => {
    expect(escapePostScriptString("a\nb\r\tc")).toBe("a b  c");
  });
});

describe("buildPdfxDef", () => {
  const ps = buildPdfxDef({
    iccPath: "/usr/share/ghostscript/iccprofiles/default_cmyk.icc",
    pdfxVersion: "PDF/X-1:2001",
    conformance: "PDF/X-1a:2001",
    outputCondition: "U.S. Web Coated (SWOP) v2",
    conditionId: "CGATS TR001",
    title: "AwareWave Print",
  });

  it("emits the OutputIntent + DestOutputProfile pdfmark structure", () => {
    expect(ps).toContain("/OutputIntent");
    expect(ps).toContain("/DestOutputProfile {icc_PDFX}");
    expect(ps).toContain("/OutputIntents [ {OutputIntent_PDFX} ]");
    expect(ps).toContain("/S /GTS_PDFX");
  });

  it("declares PDF/X-1a conformance + embeds CMYK profile at N=4", () => {
    expect(ps).toContain("/GTS_PDFXVersion (PDF/X-1:2001)");
    expect(ps).toContain("/GTS_PDFXConformance (PDF/X-1a:2001)");
    expect(ps).toContain("<< /N 4 >>");
    expect(ps).toContain("/ICCProfile (/usr/share/ghostscript/iccprofiles/default_cmyk.icc)");
  });

  it("escapes parens in the OutputCondition so the .ps literal is not broken", () => {
    expect(ps).toContain("(U.S. Web Coated \\(SWOP\\) v2)");
  });

  it("starts with the %! PostScript marker", () => {
    expect(ps.startsWith("%!")).toBe(true);
  });
});
