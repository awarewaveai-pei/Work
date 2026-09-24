// Source guards for provision-staging's MainWP preparation. The route cannot export helpers
// (Next.js route files only export handlers), so the invariants are checked on the source.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  path.resolve(__dirname, "../../../app/api/internal/hosting/provision-staging/route.ts"),
  "utf8",
);
const responseBlock = src.slice(src.indexOf("return NextResponse.json({\n      environmentId"));

describe("provision-staging MainWP preparation", () => {
  it("installs mainwp-child with the other plugins", () => {
    expect(src).toMatch(/const managementPlugins = \["mainwp-child"\]/);
    expect(src).toMatch(/\.\.\.managementPlugins,/);
  });

  it("prepares the child on every call, not only on a fresh install", () => {
    const call = src.indexOf("await prepareMainWpChild(conn, slug, body.mainwpChildUniqueId)");
    expect(call).toBeGreaterThan(src.indexOf("const pluginsOk = pluginResult.code === 0;"));
    expect(call).toBeLessThan(src.indexOf("return NextResponse.json({\n      environmentId"));
    expect(src.slice(src.indexOf("const alreadyInstalled"), call)).not.toMatch(/if \(alreadyInstalled\)[\s\S]*prepareMainWpChild/);
  });

  it("only passes a hex id to the shell, and never returns the id", () => {
    expect(src).toContain("/^[0-9a-f]{32,128}$/.test(uniqueId)");
    expect(responseBlock).not.toMatch(/mainwpChildUniqueId|uniqueId/);
    expect(src).toMatch(/mainwp_child_user_enable_passwd_auth_connect 0 [^`]*>\/dev\/null 2>&1`/);
  });
});
