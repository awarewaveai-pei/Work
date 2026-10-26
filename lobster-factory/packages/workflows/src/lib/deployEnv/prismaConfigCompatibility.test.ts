import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// Resolve through the actual build consumer, including a nested npm installation.
const buildRequire = createRequire(import.meta.resolve("@trigger.dev/build/extensions/prisma"));
const prismaPath = buildRequire.resolve("@prisma/config");
const prismaRequire = createRequire(prismaPath);
const prisma = await import(pathToFileURL(prismaPath).href);
const { deepmerge } = await import(pathToFileURL(prismaRequire.resolve("deepmerge-ts")).href);
const fixtures: string[] = [];

async function fixture(config?: string) {
  const root = await mkdtemp(join(tmpdir(), "aw-prisma-config-"));
  fixtures.push(root);
  if (config !== undefined) await writeFile(join(root, "prisma.config.cjs"), config);
  return root;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Prisma build dependency compatibility", () => {
  it("handles the GHSA-ggr8-5vv4-36mx recursive object graph without stack exhaustion", () => {
    const left: Record<string, unknown> = { left: true };
    const right: Record<string, unknown> = { right: true };
    left.self = left;
    right.self = right;
    const merged = deepmerge(left, right);
    expect(merged).toMatchObject({ left: true, right: true });
    expect(merged.self).toBe(merged);
  });

  it("loads schema and nested migration settings through the real Prisma loader", async () => {
    const root = await fixture(`module.exports = {
      schema: "prisma/schema.prisma",
      migrations: { path: "prisma/migrations", seed: "node seed.js" },
      typedSql: { path: "prisma/sql" }
    };`);
    const result = await prisma.loadConfigFromFile({ configRoot: root });
    expect(result.error).toBeUndefined();
    expect(result.config).toMatchObject({
      schema: join(root, "prisma/schema.prisma"),
      migrations: { path: join(root, "prisma/migrations"), seed: "node seed.js" },
      typedSql: { path: join(root, "prisma/sql") },
    });
  });

  it("preserves the no-config default", async () => {
    const result = await prisma.loadConfigFromFile({ configRoot: await fixture() });
    expect(result.error).toBeUndefined();
    expect(result.resolvedPath).toBeNull();
  });

  it("still rejects an invalid config instead of silently accepting it", async () => {
    const result = await prisma.loadConfigFromFile({
      configRoot: await fixture("module.exports = { schema: 42 };"),
    });
    expect(result.error?._tag).toBe("ConfigFileSyntaxError");
  });
});
