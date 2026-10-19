// The smart link page's input rules (SOCIAL_MANAGER_PLAN.md C26), shared by the editor in the browser and the server.
// The database checks the slug again (0105 social_smart_links check): these only say what is wrong in words.

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const RESERVED_SLUGS: readonly string[] = ["go", "admin", "api", "new"];

/** What is wrong with a slug, in words; null = fine. */
export function slugProblem(slug: string): string | null {
  if (!slug) return "請填網址最後的名字。";
  if (RESERVED_SLUGS.includes(slug)) return `「${slug}」是保留字，請換一個名字。`;
  if (!SLUG_RE.test(slug)) return "名字只能用小寫英文字母、數字和 -，2 到 40 個字，開頭不能是 -。";
  return null;
}

/** A link's address, in words when it is wrong; null = fine (0105: ^https?:// and at most 2048 characters). */
export function urlProblem(url: string): string | null {
  if (!/^https?:\/\//.test(url) || url.length > 2048) return "網址要以 https:// 或 http:// 開頭。";
  try {
    return new URL(url).hostname.includes(".") ? null : "這不是一個完整的網址。";
  } catch {
    return "這不是一個完整的網址。";
  }
}
