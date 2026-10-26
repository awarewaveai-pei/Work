/**
 * pexels.ts — Pexels Photos API（B-roll 靜態圖）+ Pexels Videos API（B-roll 真實影片）。
 *
 * fetchBrollUrl：回傳 Pexels 照片 URL（large2x）→ EU pipeline 走 zoompan（Ken Burns）。
 * fetchBrollVideoUrl：回傳 Pexels HD MP4 URL → EU pipeline 走 stream_loop（真實影片）。
 * 兩者永不拋出例外，失敗一律回 null，讓呼叫端自行降級。
 *
 * 注意：原先只用 Photos API，因為 Videos URL（.mp4）無法送進 Ken Burns pipeline。
 * 現在 pexels-video 模式明確要求真實影片，故同時開放 Videos API。
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

interface PexelsVideoFile {
  quality: string;   // "hd" | "sd" | "uhd"
  file_type: string; // "video/mp4"
  width: number;
  height: number;
  link: string;      // https://videos.pexels.com/video-files/...
}

interface PexelsVideo {
  video_files: PexelsVideoFile[];
}

interface PexelsVideoSearchResponse {
  videos?: PexelsVideo[];
}

/** 去掉 exclude 後隨機取一個；exclude 為空或全被排除分別回第一個／null。 */
function pickExcluding(candidates: string[], exclude?: readonly string[]): string | null {
  const left = exclude?.length ? candidates.filter((c) => !exclude.includes(c)) : candidates;
  if (!left.length) return null;
  return exclude?.length ? left[Math.floor(Math.random() * left.length)] : left[0];
}

/**
 * 以關鍵字搜尋 Pexels 照片，回傳第一張的 large2x URL（約 1280px 寬）；給 exclude（重新生成）時改從其餘結果隨機取。
 * @param keyword 英文搜尋關鍵字（建議 1–3 個單字）
 * @param apiKey  process.env.PEXELS_API_KEY
 * @param signal  可選的 AbortSignal（用於 timeout 控制）
 */
export async function fetchBrollUrl(
  keyword: string,
  apiKey: string,
  signal?: AbortSignal,
  orientation: "landscape" | "portrait" = "landscape",
  exclude?: readonly string[],
): Promise<string | null> {
  try {
    const perPage = exclude?.length ? 15 : 5;
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=${perPage}&orientation=${orientation}`;
    const res = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: signal ?? AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as PexelsPhotoSearchResponse;
    const photos = data.photos ?? [];

    const candidates: string[] = [];
    for (const photo of photos) {
      const imgUrl = photo.src?.large2x || photo.src?.large;
      if (imgUrl?.startsWith("https://") && new URL(imgUrl).hostname.endsWith(".pexels.com")) {
        if (!exclude?.length) return imgUrl;
        candidates.push(imgUrl);
      }
    }

    return pickExcluding(candidates, exclude);
  } catch {
    // 網路錯誤、AbortError、JSON 解析失敗 — 一律 null，讓 Flux 接手
    return null;
  }
}

/**
 * 以關鍵字搜尋 Pexels 影片，回傳一個 HD MP4 直連 URL（videos.pexels.com）。
 * 優先選 1280px 寬的 HD 橫式影片；找不到時回傳任何可用 HD MP4。
 * @param keyword 英文搜尋關鍵字（建議 1–3 個單字）
 * @param apiKey  process.env.PEXELS_API_KEY
 * @param signal  可選的 AbortSignal
 */
export async function fetchBrollVideoUrl(
  keyword: string,
  apiKey: string,
  signal?: AbortSignal,
  orientation: "landscape" | "portrait" = "landscape",
  exclude?: readonly string[],
): Promise<string | null> {
  try {
    const perPage = exclude?.length ? 15 : 5;
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=${perPage}&orientation=${orientation}`;
    const res = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: signal ?? AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as PexelsVideoSearchResponse;
    const videos = data.videos ?? [];
    const candidates: string[] = [];

    for (const video of videos) {
      const files = video.video_files ?? [];
      // 偏好 HD 橫式 ~1280px；次選任何 HD MP4
      // Pexels API 回傳兩種 host：新影片 = videos.pexels.com；舊 Vimeo-sourced = player.vimeo.com
      // 兩者均接受（EU _is_safe_https_url is_global 均可通過；render-draft ALLOWED_HOSTS 已同步加入）
      const isAllowedVideoUrl = (link: string) => {
        try {
          const h = new URL(link).hostname;
          return (h === "videos.pexels.com" || h === "player.vimeo.com") && /\.mp4(\?|$)/.test(link);
        } catch { return false; }
      };
      // 依目標方向選主軸 ≥1280 的片：橫式看 width，直式看 height（避免直式格式拿到橫片再被裁）。
      const longEdge = (f: PexelsVideoFile) => (orientation === "portrait" ? f.height : f.width);
      const matchesOrient = (f: PexelsVideoFile) => (orientation === "portrait" ? f.height > f.width : f.width > f.height);
      const preferred = files.find(
        (f) => f.quality === "hd" && f.file_type === "video/mp4" && longEdge(f) >= 1280 && matchesOrient(f) && isAllowedVideoUrl(f.link),
      ) ?? files.find(
        (f) => f.quality === "hd" && f.file_type === "video/mp4" && isAllowedVideoUrl(f.link),
      ) ?? files.find(
        (f) => f.file_type === "video/mp4" && isAllowedVideoUrl(f.link),
      );
      if (preferred?.link) {
        if (!exclude?.length) return preferred.link;
        candidates.push(preferred.link);
      }
    }
    return pickExcluding(candidates, exclude);
  } catch {
    return null;
  }
}
