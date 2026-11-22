// The sidebar component moved to app/NavRail.tsx (K5). This file only re-exports sidebar-sections for its two remaining
// importers, both in the theme session's files (app/__tests__/sidebar-coverage.test.ts, app/(shell)/tools/theme/page.tsx);
// card U13, coordinated with the theme session, points them at ./sidebar-sections and deletes this file.
export { DEFAULT_SECTIONS, activeLink, activeSectionId, applyLayout, itemKey, visibleSections, type NavItem, type NavSection } from './sidebar-sections';
