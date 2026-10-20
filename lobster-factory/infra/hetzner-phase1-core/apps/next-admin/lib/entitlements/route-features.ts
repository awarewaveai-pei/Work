// Route -> feature_key, in code (ADR 017 §4). Step 6 API-key scopes read this table; withFeature refuses a feature
// that is not listed here, so a paid route cannot be wrapped without being registered.
export const ROUTE_FEATURES: Readonly<Record<string, string>> = {
  "/api/content/brand-voice": "content.brand-voice",
  "/api/content/hook-brief": "content.hook-brief",
  "/api/content/humanize": "content.humanize",
  "/api/content/keywords": "content.keywords",
  "/api/content/market-analysis": "content.market-analysis",
  "/api/content/outline": "content.outline",
  "/api/content/seo-fix": "content.seo-fix",
  "/api/content/syndicate": "content.syndicate",
  "/api/content/title": "content.title",
  "/api/tools/script-forge": "video.script",
  "/api/tools/tarot/suggest-prompt": "tarot.prompt",
  "/api/video/story-bibles/visual-consistency-check": "video.image",
};
export const routeFeatureKeys = (): ReadonlySet<string> => new Set(Object.values(ROUTE_FEATURES));
