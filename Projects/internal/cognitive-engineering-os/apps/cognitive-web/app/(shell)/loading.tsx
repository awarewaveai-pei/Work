// Shown the moment a link is pressed, until the next page arrives (B8, 2026-10-11 walk: 直接分析 showed nothing for
// seconds). Next shows a segment's loading.tsx while that segment's child changes, so every folder here with
// subfolders re-exports this one (loading.test.ts keeps it that way).
export default function Loading() {
  return <div className="card" role="status" aria-live="polite"><p className="mt0 mb0">載入中…</p></div>;
}
