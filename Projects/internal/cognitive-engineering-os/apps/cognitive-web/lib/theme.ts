// The person's colour choice (設定 › 顏色): 淺色, 深色, or 預設 = follow the computer (app/design-system.css: the dark block
// applies under prefers-color-scheme unless <html data-theme="light">; data-theme="dark" applies it always). Kept in a
// cookie of this browser, so the root layout renders <html data-theme> on the server and the page never flashes the
// other colours first; a display preference, nothing the server stores.
export type Theme = "light" | "dark";
export const THEME_COOKIE = "cognitive_os_theme";
export const THEMES: Array<{ value: Theme | null; label: string }> = [{ value: "light", label: "淺色" }, { value: "dark", label: "深色" }, { value: null, label: "預設" }];

export const themeOf = (value: string | undefined | null): Theme | undefined => (value === "light" || value === "dark" ? value : undefined);

/** Show `theme` now and keep it for the next pages; null goes back to following the computer. */
export function chooseTheme(theme: Theme | null) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = theme
    ? `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax${secure}`
    : `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
