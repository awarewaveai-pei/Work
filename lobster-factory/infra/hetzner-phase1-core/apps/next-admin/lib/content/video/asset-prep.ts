/**
 * asset-prep.ts — 將 data: URL（Flux 輸出）寫入臨時檔案，回傳本機絕對路徑。
 *
 * 設計假設：next-admin 與 video-service 共同掛載同一個檔案系統 volume（本機開發 / Docker
 * Compose 共用 /tmp），因此本機路徑對 video-service 的 _materialize_asset 也是可見的。
 * 若未來兩個服務跑在不同主機上，需改為 S3/GCS pre-signed URL 方案。
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

/**
 * 解碼 data:image/...;base64,... URL，寫到 os.tmpdir()/awvideo/<hint>-<hash>.png，
 * 回傳絕對路徑。
 *
 * @param dataUrl  `data:image/...;base64,...` 格式字串（Flux generateTarotImage 回傳）
 * @param hint     檔名前綴（例：「scene1」），便於偵錯識別
 * @throws         若 dataUrl 不符合 data: URL 格式
 */
export function dataUrlToTempFile(dataUrl: string, hint: string): string {
  // 解析 data URL
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error(`dataUrlToTempFile：非 data: URL 格式（前 60 字：${dataUrl.slice(0, 60)}）`);
  }

  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, "base64");

  // 用內容雜湊取代循序 index，避免並行場景間的競爭條件（race condition）
  const hash = crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 8);

  // 確保目錄存在
  const dir = path.join(os.tmpdir(), "awvideo");
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${hint}-${hash}.png`);
  fs.writeFileSync(filePath, buffer);

  return filePath;
}

/**
 * 刪除本輪建立的臨時素材檔（呼叫端在 render 完成後於 finally 統一清，防 /tmp 無限增長）。
 * 永不拋出：個別刪除失敗只忽略（檔可能已被外部 reaper 清掉）。
 */
export function cleanupTempFiles(paths: string[]): void {
  for (const p of paths) {
    try {
      fs.rmSync(p, { force: true });
    } catch {
      /* 已不存在 / 權限問題 — 忽略 */
    }
  }
}
