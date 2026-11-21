// 2026-11-21: 17 My Designs videos failed to delete -- media_qa_reports' RESTRICT FK refused the row AFTER R2 had removed
// the file (cards left pointing at nothing), and that route skipped a video's other-ratio rows while R2 removed their
// whole folder. Invariants: media-asset-delete.ts is the only code that deletes media_assets rows; it refuses every
// RESTRICT reference (= the migrations) before R2, over the asset and all its ratio rows.
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeDb } from "../video/__tests__/fake-db";

const guard = vi.hoisted(() => ({ keys: [] as string[], refuse: null as string | null }));
vi.mock("../r2-delete-guard", () => ({
  deleteUnreferencedAsset: async (k: string) => {
    guard.keys.push(k);
    return guard.refuse === k ? { ok: false, error: "asset_in_use", references: [], message: "in use" } : { ok: true, deleted: 1 };
  },
}));
const { deleteMediaAsset, RESTRICTING_REFERENCES } = await import("../media-asset-delete");

// __tests__ -> content -> lib -> next-admin -> apps -> hetzner-phase1-core -> infra -> lobster-factory.
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../../../../packages/db/migrations");
const APP_ROOT = path.resolve(__dirname, "../../..");

type Fk = { target: string; action: string };
/** "table.column" -> its FK's target table and latest ON DELETE action, in migration order. Throws on a reference it
 *  cannot classify, so an unusual spelling fails here instead of slipping past the equality check. */
function latestFks(): Map<string, Fk> {
  const fks = new Map<string, Fk>();
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith(".down.sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").replace(/--[^\n]*/g, "");
    for (const stmt of sql.split(";")) {
      const dropped = stmt.match(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/i)?.[1];
      if (dropped) for (const k of [...fks.keys()]) if (k.startsWith(`${dropped}.`)) fks.delete(k);
      const table = stmt.match(/(?:create|alter)\s+table\s+(?:if\s+not\s+exists\s+)?(?:only\s+)?(?:public\.)?"?(\w+)"?/i)?.[1];
      const re = /(?:"?(\w+)"?\s+uuid\b[^,]*?|foreign\s+key\s*\(\s*"?(\w+)"?\s*\)\s*)references\s+(?:public\.)?"?(\w+)"?\s*(?:\(\s*"?id"?\s*\))?(?:\s+on\s+delete\s+(cascade|restrict|set\s+null|set\s+default|no\s+action))?/gi;
      const found = [...stmt.matchAll(re)];
      const all = stmt.match(/\breferences\s/gi)?.length ?? 0;
      if (found.length !== all && /media_assets|media_qa_reports|media_transcription_jobs/i.test(stmt)) {
        throw new Error(`${file}: ${all - found.length} FK reference(s) the parser cannot read near media tables`);
      }
      if (!table) continue;
      for (const m of found) fks.set(`${table}.${m[1] ?? m[2]}`, { target: m[3], action: (m[4] ?? "no action").toLowerCase().replace(/\s+/g, " ") });
    }
  }
  return fks;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return ["node_modules", "__tests__"].includes(e.name) || e.name.startsWith(".") ? [] : sourceFiles(p);
    return /\.(tsx?|mjs|cjs|js)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("media_assets delete invariants", () => {
  const fks = latestFks();
  const blocks = (a: string) => a === "restrict" || a === "no action";

  it("sanity: the parser sees the FK history (0011 SET NULL, 0173 CASCADE)", () => {
    expect(fks.get("ai_image_jobs.output_asset_id")).toEqual({ target: "media_assets", action: "set null" });
    expect(fks.get("media_qa_reports.candidate_asset_id")).toEqual({ target: "media_assets", action: "cascade" });
    expect(fks.get("media_qa_reports.supersedes_report_id")).toEqual({ target: "media_qa_reports", action: "set null" });
  });

  it("RESTRICTING_REFERENCES = every RESTRICT / NO ACTION FK to media_assets", () => {
    const restricting = [...fks].filter(([, f]) => f.target === "media_assets" && blocks(f.action)).map(([k]) => k).sort();
    expect(RESTRICTING_REFERENCES.map((r) => `${r.table}.${r.column}`).sort()).toEqual(restricting);
  });

  it("nothing blocks the rows a media_assets delete cascades to", () => {
    const cascaded = new Set<string>();
    for (let grew = true; grew;) {
      grew = false;
      for (const [k, f] of fks) {
        const t = k.split(".")[0];
        if (f.action === "cascade" && (f.target === "media_assets" || cascaded.has(f.target)) && !cascaded.has(t)) { cascaded.add(t); grew = true; }
      }
    }
    expect([...cascaded].sort()).toEqual(["media_qa_reports", "media_transcription_jobs"]);
    expect([...fks].filter(([, f]) => cascaded.has(f.target) && blocks(f.action)).map(([k]) => k)).toEqual([]);
  });

  it("media-asset-delete.ts is the only code that deletes media_assets rows", () => {
    const deleters = sourceFiles(APP_ROOT)
      .filter((f) => /["'`]media_assets["'`][\s\S]{0,400}?\.delete\(/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(APP_ROOT, f).replace(/\\/g, "/"));
    expect(deleters).toEqual(["lib/content/media-asset-delete.ts"]);
  });
});

describe("deleteMediaAsset", () => {
  const ORG = "org-1";
  let tables: Record<string, Record<string, unknown>[]>;
  const db = () => fakeDb(() => tables) as unknown as SupabaseClient;
  const A = { id: "a", object_key: "video/x/16x9.mp4", organization_id: ORG, metadata: {} };
  const B = { id: "b", object_key: "video/x/9x16.mp4", organization_id: ORG, metadata: { variantOf: "a" } };
  const OTHER = { id: "o", object_key: "video/y/9x16.mp4", organization_id: "org-2", metadata: { variantOf: "a" } };

  beforeEach(() => {
    guard.keys = []; guard.refuse = null;
    tables = { media_assets: [A, B, OTHER].map((r) => ({ ...r })), media_releases: [], media_production_projects: [] };
  });

  it("a release on any ratio row refuses before R2 and keeps every row", async () => {
    tables.media_releases.push({ id: "r", candidate_asset_id: "b" });
    expect(await deleteMediaAsset(db(), A)).toMatchObject({ ok: false, code: "asset_referenced", status: 409 });
    expect(guard.keys).toEqual([]);
    expect(tables.media_assets.map((r) => r.id)).toEqual(["a", "b", "o"]);
  });

  it("takes the asset, its ratio rows and extra keys; another organization's row stays", async () => {
    expect(await deleteMediaAsset(db(), A, { extraKeys: ["designs/src.svg"] })).toEqual({ ok: true, deletedIds: ["a", "b"] });
    expect(guard.keys).toEqual(["video/x/16x9.mp4", "video/x/9x16.mp4", "designs/src.svg"]);
    expect(tables.media_assets.map((r) => r.id)).toEqual(["o"]);
  });

  it("starting from a ratio row takes the whole video", async () => {
    expect(await deleteMediaAsset(db(), B)).toMatchObject({ ok: true, deletedIds: expect.arrayContaining(["a", "b"]) });
    expect(tables.media_assets.map((r) => r.id)).toEqual(["o"]);
  });

  it("an R2 refusal keeps every row", async () => {
    guard.refuse = "video/x/9x16.mp4";
    expect(await deleteMediaAsset(db(), A)).toMatchObject({ ok: false, code: "asset_in_use", status: 409 });
    expect(tables.media_assets.map((r) => r.id)).toEqual(["a", "b", "o"]);
  });
});
