// Page tests (per-file `// @vitest-environment jsdom`) wait for async UI with testing-library's default of 1 s.
// Alone they pass; in the full suite (600+ files in parallel, and on the 2-core deploy host) a page settles later and
// a different handful times out on every run -- the deploy gate runs the full suite, so a load flake aborts a deploy
// (2026-11-19: one-click-drafts on the host; site-wiring, editor-zone and seven more on the laptop).
// One place, every jsdom test: wait up to 5 s. Assertions are unchanged; a real failure still fails, 4 s later.
// Node-environment tests skip this (no document), so they do not load testing-library.
if (typeof document !== "undefined") {
  const { configure } = await import("@testing-library/dom");
  configure({ asyncUtilTimeout: 5000 });
}

export {};
