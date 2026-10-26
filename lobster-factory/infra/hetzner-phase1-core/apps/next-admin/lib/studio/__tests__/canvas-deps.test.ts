import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Regression guard — fabric is LOAD-BEARING, do NOT remove it.
 *
 * `app/tools/canvas/CanvasEditor.tsx` (the Fabric.js quick editor, linked in the main
 * sidebar nav and from OutputTrackBar's ✏️ button) does `import("fabric")`. If fabric is
 * dropped from package.json, `npm ci` on deploy won't install it → tsc/next build fails →
 * /tools/canvas 404s. A parallel session removed it twice on 2026-06-13 citing "fabric
 * needs manual npm install on sg-deploy" — that reason is WRONG: next-admin Dockerfile
 * runs `RUN npm ci`, so a lockfile dep installs automatically.
 *
 * This test makes the removal trip the sg-deploy `npm test` gate (the very gate that
 * removal was trying to keep green), so fabric cannot silently disappear again.
 * See agency-os/WORKLOG.md 2026-06-13 "修圖積木 + Fabric canvas".
 */
describe("canvas feature dependencies", () => {
  it("fabric stays declared in package.json (CanvasEditor needs it — see WORKLOG 2026-06-13)", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8")
    ) as { dependencies?: Record<string, string> };
    expect(
      pkg.dependencies?.fabric,
      "fabric removed from package.json → /tools/canvas build fails. It is intentional + " +
        "deploy-safe (Dockerfile npm ci). Do not remove; see agency-os/WORKLOG.md 2026-06-13."
    ).toBeTruthy();
  });
});
