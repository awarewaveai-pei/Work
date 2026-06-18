/**
 * pexels.ts — 從 Pexels Photos API 抓取 B-roll 靜態圖 URL。
 *
 * 回傳一條合適的 https 圖片連結（large2x 或 large），或 null（找不到 / API 無效）。
 * 永不拋出例外：所有錯誤都捕獲並回傳 null，讓呼叫端降級到 Flux 靜態圖。
 *
 * 注意：改用 Photos API（/v1/search）而非 Videos API，因為影片 URL（.mp4）
 * 無法作為靜態圖輸入 EU video-service Ken Burns pipeline。
 */

interface PexelsPhotoSrc {
  original: string;
  large2x: string;
  large: string;
}

interface PexelsPhoto {
  src: PexelsPhotoSrc;
}

interface PexelsPhotoSearchResponse {
  photos?: PexelsPhoto[];
}

/**
 * 以關鍵字搜尋 Pexels 照片，回傳第一張的 large2x URL（約 1280px 寬）。
 * @param keyword 英文搜尋關鍵字（建議 1–3 個單字）
 * @param apiKey  process.env.PEXELS_API_KEY
 * @param signal  可選的 AbortSignal（用於 timeout 控制）
 */
export async function fetchBrollUrl(
  keyword: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=5&orientation=landscape`;
    const res = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: signal ?? AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as PexelsPhotoSearchResponse;
    const photos = data.photos ?? [];

    for (const photo of photos) {
      const imgUrl = photo.src?.large2x || photo.src?.large;
      if (imgUrl?.startsWith("https://") && new URL(imgUrl).hostname.endsWith(".pexels.com")) return imgUrl;
    }

    return null;
  } catch {
    // 網路錯誤、AbortError、JSON 解析失敗 — 一律 null，讓 Flux 接手
    return null;
  }
}
