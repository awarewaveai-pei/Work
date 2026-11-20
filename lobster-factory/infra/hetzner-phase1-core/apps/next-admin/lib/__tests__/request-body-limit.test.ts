// Next's middleware body buffer must equal the largest body nginx lets through to next-admin: smaller, and a body nginx
// accepted is silently truncated (routes then read "invalid_json", 2026-11-20); larger is never reached.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = path.join(__dirname, "../..");
const MB = 1024 ** 2;
const capOf = (text: string) => { const m = /^\s*client_max_body_size\s+(\d+)M;/m.exec(text); return m ? Number(m[1]) * MB : null; };

/** Each `location { … }` of a server block that forwards a request body to next-admin, with the cap nginx applies there. */
function nextAdminCaps(conf: string): { where: string; bytes: number }[] {
  const out: { where: string; bytes: number }[] = [];
  for (const block of conf.split(/^\s*server\s*\{/m).slice(1)) {
    const name = /server_name\s+([^;]+);/.exec(block)?.[1] ?? "?";
    const head = block.slice(0, block.search(/^\s*location\b/m));
    const serverCap = capOf(head) ?? 1 * MB; // nginx default
    for (const m of block.matchAll(/^\s*location\b([^{]*)\{/gm)) {
      let depth = 1, i = m.index! + m[0].length;
      for (; depth && i < block.length; i++) depth += block[i] === "{" ? 1 : block[i] === "}" ? -1 : 0;
      const body = block.slice(m.index! + m[0].length, i - 1);
      if (!body.includes("next-admin:3000") || /proxy_pass_request_body\s+off;/.test(body)) continue;
      out.push({ where: `${name} location${m[1].trimEnd()}`, bytes: capOf(body) ?? serverCap });
    }
  }
  return out;
}

describe("request body limit", () => {
  it("next.config middlewareClientMaxBodySize = the largest nginx client_max_body_size in front of next-admin", () => {
    const caps = nextAdminCaps(readFileSync(path.join(APP, "../../nginx/default.conf"), "utf8"));
    const next = /middlewareClientMaxBodySize:\s*"(\d+)mb"/.exec(readFileSync(path.join(APP, "next.config.ts"), "utf8"))?.[1];
    expect(caps.length, "next-admin locations found").toBeGreaterThan(5);
    expect(next, "next.config").toBeTruthy();
    expect(caps.filter((c) => c.bytes > Number(next) * MB), "nginx lets more through than Next keeps").toEqual([]);
    expect(Math.max(...caps.map((c) => c.bytes))).toBe(Number(next) * MB);
  });
});
