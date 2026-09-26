// The 423 contract every gated route answers and every UI reads: pinned here as literals, so the route
// tests that compare against blockedChangeBody() cannot drift together with it unnoticed. The second
// test keeps the code defined in one place.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BLOCKED_CHANGE_CODE, blockedChangeBody, blockedChangeMessage, blockedChangeResponse } from "../blocked-change";

const ROOT = path.resolve(__dirname, "..", "..", ".."); // .../apps/next-admin

describe("blocked-change contract", () => {
  it("423 with a readable error, the machine code and the mode", async () => {
    const res = blockedChangeResponse("emergency_stop");
    expect(res.status).toBe(423);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      ok: false,
      error: "系統模式為 emergency_stop，已擋下這次變更；到 /ops/system-modes 切回 normal 後再試",
      code: "system_mode_blocks_change",
      mode: "emergency_stop",
    });
    expect(blockedChangeBody("x").code).toBe(BLOCKED_CHANGE_CODE);
    expect(blockedChangeMessage(undefined)).toContain("未知");
  });

  // Source files (app, lib, components; tests excluded) whose text matches `re`.
  function sourcesMatching(re: RegExp): string[] {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (["node_modules", ".next", "__tests__"].includes(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && re.test(fs.readFileSync(full, "utf8"))) {
          hits.push(path.relative(ROOT, full).replace(/\\/g, "/"));
        }
      }
    };
    for (const d of ["app", "lib", "components"]) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
    return hits.sort();
  }

  it("the code string is written only in blocked-change.ts (every producer imports it)", () => {
    expect(sourcesMatching(new RegExp(BLOCKED_CHANGE_CODE))).toEqual(["lib/system-modes/blocked-change.ts"]);
  });

  it("no route hand-writes a 423: only the contract builds one (wordpress-core's is an internal failure object)", () => {
    expect(sourcesMatching(/status:\s*423\b/)).toEqual(["lib/content/publish/wordpress-core.ts", "lib/system-modes/blocked-change.ts"]);
  });
});
