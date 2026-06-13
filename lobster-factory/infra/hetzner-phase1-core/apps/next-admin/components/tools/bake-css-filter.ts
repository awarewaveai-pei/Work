/**
 * Bake a CSS filter string (from ColorGrade `toCssFilter`) into an image, client-side, at the
 * image's own resolution. Used so the plain Download / Save-to-Designs actions output the SAME
 * adjustment the user sees in the live preview — no server round-trip, no resize. Matches the
 * preview exactly (both are CSS filters); gamma/sharpen have no canvas-filter analog (the
 * high-fidelity Sharp bake lives behind OutputTrackBar's web/print tracks).
 *
 * Returns the original data URL unchanged when the filter is neutral/empty or on any failure
 * (so a bake error never blocks a download/save).
 */
export function bakeCssFilter(dataUrl: string, cssFilter: string): Promise<string> {
  if (!cssFilter || cssFilter === "none") return Promise.resolve(dataUrl);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.filter = cssFilter;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(dataUrl); // taint / encode failure → fall back to the raw image
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
