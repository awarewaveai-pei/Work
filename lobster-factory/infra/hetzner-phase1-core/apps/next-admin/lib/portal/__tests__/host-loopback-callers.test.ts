// Host cron/scripts call next-admin on 127.0.0.1, which is the probe door, not a staff door (doors.ts). Middleware
// 404s every loopback path except the liveness probes, so a host caller must use a matcher-excluded family
// (/api/internal/*, /login). 2026-10-20: /api/video/reconcile went 404 and the orphan alert was blind for 3 days.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "../../../middleware";

const STACK_ROOT = resolve(process.cwd(), "../..");

function shellScripts(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "apps" || name === "node_modules" || name.startsWith(".")) return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return shellScripts(p);
    return name.endsWith(".sh") ? [p] : [];
  });
}

// poke.sh <key> </path> <TOKEN_VAR> in scripts/cron.d/* rings 127.0.0.1:3002<path> (poke.sh's default base).
function cronPokePaths(): { file: string; path: string }[] {
  const dir = join(STACK_ROOT, "scripts", "cron.d");
  return readdirSync(dir).flatMap((name) => {
    const file = join(dir, name);
    return [...readFileSync(file, "utf8").matchAll(/\/poke\.sh [a-z0-9_]+ (\/\S+) [A-Z0-9_]+/g)].map((m) => ({ file, path: m[1] }));
  });
}

function loopbackPaths(): { file: string; path: string }[] {
  return [
    ...shellScripts(STACK_ROOT).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/127\.0\.0\.1:300[02](\/[^\s"'}$|)]*)/g)].map((m) => ({ file, path: m[1] })),
    ),
    ...cronPokePaths(),
  ];
}

const matcher = new RegExp(`^${config.matcher[0]}$`);

describe("host scripts reach next-admin on loopback", () => {
  it("finds the known callers (guards against a silent empty scan)", () => {
    const paths = loopbackPaths().map((c) => c.path);
    expect(paths).toContain("/api/internal/video/reconcile");
    expect(paths).toContain("/api/internal/events/sync");
    expect(paths).toContain("/api/internal/schedules/run-due"); // via cron.d poke.sh lines
  });

  it("every loopback path is matcher-excluded or a probe path the middleware serves", async () => {
    for (const { file, path } of loopbackPaths()) {
      if (!matcher.test(path)) continue; // middleware never runs: the route's own auth is the gate
      const res = await middleware(new NextRequest(`http://127.0.0.1:3002${path}`, { headers: { host: "127.0.0.1:3002" } }));
      expect(res.status, `${file}: ${path}`).not.toBe(404);
    }
  });
});
