/**
 * pexels.ts — 從 Pexels Videos API 抓取 B-roll 影片 URL。
 *
 * 回傳一條合適的 https mp4 連結（640–1920px 寬），或 null（找不到 / API 無效）。
 * 永不拋出例外：所有錯誤都捕獲並回傳 null，讓呼叫端降級到 Flux 靜態圖。
 */

/** Pexels API 回應中單一影片檔的形狀（只取需要的欄位）。 */
interface PexelsVideoFile {
  link: string;
  width: number;
  height: number;
}

interface PexelsVideo {
  video_files: PexelsVideoFile[];
}

interface PexelsSearchResponse {
  videos?: PexelsVideo[];
}

/**
 * 以關鍵字搜尋 Pexels 影片，回傳第一條寬度在 640–1920px 的 mp4 連結。
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
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=5&size=medium`;
    const res = await fetch(url, {
      headers: { Authorization: apiKey },
      signal,
    });

    if (!res.ok) return null;

    const data = (await res.json()) as PexelsSearchResponse;
    const videos = data.videos ?? [];

    for (const video of videos) {
      // 優先選寬度介於 640–1920px 的檔案（避免過小或過大）
      const suitable = (video.video_files ?? []).find(
        (f) => f.width >= 640 && f.width <= 1920 && f.link.startsWith("https://")
      );
      if (suitable) return suitable.link;
    }

    return null;
  } catch {
    // 網路錯誤、AbortError、JSON 解析失敗 — 一律 null，讓 Flux 接手
    return null;
  }
}
