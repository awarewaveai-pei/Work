// public/ folders whose .js/.css are loaded by fixed URL (no build hash): next.config.ts sends them Cache-Control private,
// no-cache. lib/__tests__/public-asset-cache.test.ts fails when a public/ folder with .js/.css is missing here.
export const UNVERSIONED_PUBLIC_DIRS: readonly string[] = ["awarewave", "editor-shared", "vector-pro-dock"];
