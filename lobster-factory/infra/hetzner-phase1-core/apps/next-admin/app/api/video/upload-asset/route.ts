/**
 * POST /api/video/upload-asset  (multipart/form-data)
 *
 * 草稿審核時上傳「自己的影片/圖片」當某場景素材 → 存進 R2 designs 暫存區 → 回 URL。
 * 回傳的 URL 落在 render-draft 的 ALLOWED_HOSTS（R2 designs base），渲染時可直接用；
 * 並比照 Flux 暫存圖，於 EU 渲染完成後由 /status cleanupVideoInputKeys 清掉（designs/ 格式）。
 *
 * Form fields: file (File, 必填), rightsConfirmed ("true", 必填 — 沒勾「有權使用」回 400), oldImageUrl? (string — 替換時清舊圖)
 * 允許型別: image/png, image/jpeg, image/webp, video/mp4
 * Success: { ok: true, imageUrl, r2Key, kind: "image" | "video" }
 * Failure: { ok: false, error }
 */

import { signOrigin } from "@/lib/content/video/asset-origin";
import { NextRequest, NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { createHash } from "node:crypto";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

// 本 route 在 handler 內 Buffer.from(arrayBuffer) + 透過 r2.ts 用 node:crypto → 必須 nodejs runtime（與其餘 78 個 Buffer/上傳 route 一致；防 edge 預設翻轉的地雷）。
export const runtime = "nodejs";
export const maxDuration = 120; // 影片上傳（≤45MB）+ R2 PUT 在慢速上行可能耗時

const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12 MB
// 45MB：穩在 SG host nginx `location ^~ /api/` 的 client_max_body_size 50M 之內（含 Content-Length 預擋餘裕），
// 確保 app 回乾淨 JSON 413 而非 nginx HTML 413。scene 短片足夠。調高需同步調 nginx /api/ 上限。
const MAX_VIDEO_BYTES = 45 * 1024 * 1024; // 45 MB
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4"]);

/** 以 magic bytes 驗證 buffer 實際型別與宣告 mime 相符（client mime 可偽造 → 防混入非媒體內容）。 */
function magicMatches(mime: string, buf: Buffer): boolean {
  if (buf.length < 12) return false;
  switch (mime) {
    case "image/png":
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    case "image/jpeg":
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case "image/webp":
      return buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
    case "video/mp4":
      // ISO BMFF：bytes 4-7 == "ftyp"（box type）
      return buf.toString("ascii", 4, 8) === "ftyp";
    default:
      return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // 解析前先用 Content-Length 擋超大 body（防 req.formData() 把整包讀進記憶體致 OOM）。
  // 注意：chunked 上傳 Content-Length 可缺/可偽 → 真正後盾是 nginx client_max_body_size，此為深度防禦。
  const declaredLen = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLen) && declaredLen > MAX_VIDEO_BYTES + 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: `請求過大（上限 ${MAX_VIDEO_BYTES / 1048576}MB）` },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "需 multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file 為必填" }, { status: 400 });
  }

  const mime = file.type;
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ ok: false, error: `不支援的型別：${mime || "未知"}（僅 PNG/JPEG/WebP/MP4）` }, { status: 415 });
  }

  // D7: no upload without the uploader stating they may use the file (the upload screen's checkbox sends this).
  const rightsConfirmed = form.get("rightsConfirmed") === "true";
  if (!rightsConfirmed) {
    return NextResponse.json({ ok: false, error: "請先勾選「我有權使用這個素材」才能上傳" }, { status: 400 });
  }

  const isVideo = mime === "video/mp4";
  const cap = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > cap) {
    return NextResponse.json(
      { ok: false, error: `檔案過大（${(file.size / 1048576).toFixed(1)}MB，上限 ${cap / 1048576}MB）` },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (!magicMatches(mime, buf)) {
    return NextResponse.json({ ok: false, error: "檔案內容與宣告型別不符（疑似損毀或偽造）" }, { status: 422 });
  }

  const { buildDesignKey, putDesignObject, isR2Configured } = await import("@/lib/storage/r2");
  if (!isR2Configured()) {
    return NextResponse.json({ ok: false, error: "R2 未設定（跨機影片素材需 R2 暫存）" }, { status: 503 });
  }
  const key = buildDesignKey(mime);
  if (!key) {
    return NextResponse.json({ ok: false, error: `無法為型別建立儲存鍵：${mime}` }, { status: 415 });
  }
  const put = await putDesignObject(key, buf, mime);
  if (!put.ok) {
    return NextResponse.json({ ok: false, error: `上傳 R2 失敗：${"error" in put ? put.error : "r2_put_failed"}` }, { status: 502 });
  }

  // 上傳成功後才清舊圖（僅 designs/ 格式；deleteDesignObject 硬鎖 designs bucket → 無 SSRF/path traversal）。
  const oldImageUrl = form.get("oldImageUrl");
  if (typeof oldImageUrl === "string") {
    try {
      const path = new URL(oldImageUrl).pathname.replace(/^\//, "");
      if (/^designs\/\d{4}-\d{2}\/[0-9a-f-]+\.\w+$/i.test(path)) {
        const { deleteDesignObject } = await import("@/lib/storage/r2");
        await deleteDesignObject(path);
      }
    } catch {
      /* best-effort */
    }
  }

  // D7: the statement is recorded now and signed so the rights QA can read it later.
  const origin = signOrigin(put.publicUrl, { kind: "upload", rightsConfirmed });

  // FootageEditor supplies an organization ID to make the uploaded source a
  // durable tenant-owned media_assets row. Legacy callers omit it and retain
  // the original temporary-upload response.
  const organizationId = typeof form.get("organizationId") === "string" ? String(form.get("organizationId")).trim() : "";
  if (organizationId) {
    try { assertOrgAccess(req, organizationId); }
    catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e) as NextResponse; throw e; }
    const db = getSupabaseWriteClient();
    if (!db) return NextResponse.json({ ok: false, error: "asset persistence unavailable" }, { status: 503 });
    const asset = await db.from("media_assets").insert({
      organization_id: organizationId,
      storage_backend: "r2",
      asset_domain: "real_footage",
      object_key: key,
      object_url: put.publicUrl,
      mime_type: mime,
      byte_size: buf.byteLength,
      checksum_sha256: createHash("sha256").update(buf).digest("hex"),
      metadata: { source: "footage_editor", original_name: file.name, rights_status: "cleared", license_ref: "uploader-confirmed", source_ref: put.publicUrl },
    }).select("id, checksum_sha256").single();
    if (asset.error || !asset.data) {
      try { const { deleteDesignObject } = await import("@/lib/storage/r2"); await deleteDesignObject(key); } catch { /* best effort cleanup */ }
      return NextResponse.json({ ok: false, error: "asset registration failed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, imageUrl: put.publicUrl, r2Key: key, kind: isVideo ? "video" : "image", assetId: asset.data.id, checksumSha256: asset.data.checksum_sha256, ...(origin ? { origin } : {}) });
  }

  return NextResponse.json({ ok: true, imageUrl: put.publicUrl, r2Key: key, kind: isVideo ? "video" : "image", ...(origin ? { origin } : {}) });
}
