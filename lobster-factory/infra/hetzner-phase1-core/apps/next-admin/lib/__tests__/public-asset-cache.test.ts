import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { UNVERSIONED_PUBLIC_DIRS } from "../public-asset-cache";

const PUBLIC = path.join(__dirname, "..", "..", "public");
const hasCode = (dir: string): boolean =>
  readdirSync(dir).some((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? hasCode(p) : /\.(m?js|css)$/.test(f);
  });

describe("unversioned public code revalidates", () => {
  it("every public/ folder holding .js/.css is listed", () => {
    const withCode = readdirSync(PUBLIC).filter((d) => statSync(path.join(PUBLIC, d)).isDirectory() && hasCode(path.join(PUBLIC, d)));
    expect([...UNVERSIONED_PUBLIC_DIRS].sort()).toEqual(withCode.sort());
  });

  it("next.config sends Cache-Control private, no-cache for each listed folder", async () => {
    const rules = await nextConfig.headers!();
    for (const dir of UNVERSIONED_PUBLIC_DIRS) {
      const rule = rules.find((r) => r.source === `/${dir}/:path*`);
      expect(rule?.headers).toContainEqual({ key: "Cache-Control", value: "private, no-cache" });
    }
  });
});
