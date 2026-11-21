import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteUnreferencedAsset, type AssetReference } from "./r2-delete-guard";

/**
 * FKs to media_assets that are RESTRICT / NO ACTION in the latest migration (__tests__/media-asset-delete.test.ts keeps
 * this equal to the migrations). Refused before R2: if the row delete is the first thing to fail, the file is already
 * gone and the card stays (2026-11-21, 17 My Designs videos). QA reports / transcription jobs CASCADE (0173).
 */
export const RESTRICTING_REFERENCES = [
  { table: "media_releases", column: "candidate_asset_id", label: "發布紀錄（發布證據，不可刪）" },
  { table: "media_production_projects", column: "active_candidate_asset_id", label: "製作專案正在使用的成片" },
] as const;

export type MediaAssetDelete =
  | { ok: true; deletedIds: string[] }
  | { ok: false; code: string; message: string; status: number; references?: AssetReference[] };

type Row = { id: string; object_key: string; organization_id: string | null; metadata?: unknown };

const variantOf = (metadata: unknown): string | null => {
  const v = (metadata as { variantOf?: unknown } | null | undefined)?.variantOf;
  return typeof v === "string" && v ? v : null;
};

/**
 * The only place media_assets rows are deleted (test-enforced). Takes the asset with every per-ratio row sharing its
 * R2 folder (metadata.variantOf, video-pipeline.ts), in the one safe order: refuse rows that must stay -> R2 through
 * r2-delete-guard (WordPress embeds, shared objects), then `extraKeys` (other objects the asset owns, e.g. a design's
 * source file) -> all rows in one statement. Any refusal or failure before the last step keeps every row.
 */
export async function deleteMediaAsset(db: SupabaseClient, asset: Row, opts: { extraKeys?: readonly string[] } = {}): Promise<MediaAssetDelete> {
  const rootId = variantOf(asset.metadata) ?? asset.id;
  const [root, variants] = await Promise.all([
    rootId === asset.id ? { data: [asset], error: null } : db.from("media_assets").select("id,object_key,organization_id").eq("id", rootId),
    db.from("media_assets").select("id,object_key,organization_id").eq("metadata->>variantOf", rootId),
  ]);
  if (root.error || variants.error) return { ok: false, code: "variant_lookup_failed", message: "無法確認同一部影片的其他比例，未刪除", status: 502 };
  const rows = new Map<string, Row>([[asset.id, asset]]);
  for (const r of [...(root.data ?? []), ...(variants.data ?? [])] as Row[]) {
    if (r.organization_id === asset.organization_id) rows.set(String(r.id), r);
  }
  const ids = [...rows.keys()];

  for (const ref of RESTRICTING_REFERENCES) {
    const { data, error } = await db.from(ref.table).select("id").in(ref.column, ids).limit(1);
    if (error || !Array.isArray(data)) return { ok: false, code: "reference_check_failed", message: `無法確認${ref.label}，未刪除`, status: 502 };
    if (data.length > 0) return { ok: false, code: "asset_referenced", message: `仍有${ref.label}指向這個檔案，未刪除`, status: 409 };
  }

  for (const key of [...new Set([...rows.values()].map((r) => r.object_key)), ...(opts.extraKeys ?? [])]) {
    const r = await deleteUnreferencedAsset(key, { exceptAssetIds: ids });
    if ("error" in r) {
      console.error("[media-asset-delete] refused:", key, r.error);
      return { ok: false, code: r.error, message: r.message, status: r.error === "asset_in_use" ? 409 : 502, ...("references" in r ? { references: r.references } : {}) };
    }
  }

  const { error } = await db.from("media_assets").delete().in("id", ids);
  if (error) {
    console.error("[media-asset-delete] row delete failed after R2:", ids, error.message);
    return { ok: false, code: "delete_failed", message: `資料列刪除失敗（${error.message}）`, status: 500 };
  }
  return { ok: true, deletedIds: ids };
}
