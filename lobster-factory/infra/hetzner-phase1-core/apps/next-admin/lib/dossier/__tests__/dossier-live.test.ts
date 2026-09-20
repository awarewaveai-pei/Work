// A real background file, built from documents really sitting in the knowledge base, by a real
// model. Off by default: it reads the live database and spends a model call.
//
//   COLLECT_DOSSIER_LIVE=1 DOSSIER_FOLDER="<folder name or id>" npx vitest run lib/dossier/__tests__/dossier-live.test.ts
//
// Preview mode only — it never writes the report back. The point is to READ the thing the operator
// will read, because a mocked model proves the plumbing and nothing about the output (memory:
// "verify the actual deliverable, not a proxy" — a Story Bible was once declared working off a
// success panel while the real video was wrong).

import path from "node:path";
import { config as loadEnvFile } from "dotenv";
import { describe, expect, it } from "vitest";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { buildFolderDossier, readFolderSources } from "@/lib/dossier/folder";

loadEnvFile({ path: path.resolve(__dirname, "../../../.env.local"), override: false });

const LIVE = process.env.COLLECT_DOSSIER_LIVE === "1";
const FOLDER = process.env.DOSSIER_FOLDER ?? "";

describe.skipIf(!LIVE)("dossier, live", () => {
  it(
    "reads a real folder and produces a report whose claims carry sources",
    async () => {
      const sb = getSupabaseWriteClient();
      expect(sb, "no supabase client — check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY").toBeTruthy();

      const { data: folders } = await sb!
        .from("cs_knowledge_folders")
        .select("id,name,organization_id")
        .order("created_at", { ascending: false })
        .limit(50);
      const folder = (folders ?? []).find((f) => f.id === FOLDER || (f.name as string).includes(FOLDER));
      expect(folder, `no folder matching "${FOLDER}" — candidates: ${(folders ?? []).map((f) => f.name).join(", ")}`).toBeTruthy();

      const sources = await readFolderSources(folder!.organization_id as string, folder!.id as string);
      console.log(`\n資料夾「${folder!.name}」有 ${sources.length} 份可用來源：`);
      for (const s of sources) console.log(`  [${s.angle ?? "-"}] ${s.title.slice(0, 60)} — ${s.url}`);

      const result = await buildFolderDossier({
        organizationId: folder!.organization_id as string,
        folderId: folder!.id as string,
        preview: true,
      });

      if (!result.ok) console.log(`FAILED: ${result.error} ${result.detail ?? ""}`);
      expect(result.ok, `${result.error}: ${result.detail ?? ""}`).toBe(true);

      console.log(`\n${"=".repeat(70)}\n${result.markdown}\n${"=".repeat(70)}\n`);

      // The one property that makes this a dossier rather than an essay.
      expect(result.markdown, "no citation markers in the whole report").toMatch(/\[\d+\]/);
      expect(result.markdown).toContain("## 來源");
      expect(result.report!.citations.length).toBe(sources.length);
    },
    240_000,
  );
});
