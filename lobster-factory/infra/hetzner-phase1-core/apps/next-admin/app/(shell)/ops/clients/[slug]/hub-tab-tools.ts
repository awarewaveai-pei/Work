// Client hub tabs that are another product's screens (staff-tools.test.ts NEEDS_OTHER_TOOL["ops/clients"]): a staff
// member sees the tab only when that product is ticked for them, so the tab never opens onto refused calls.
export const HUB_TAB_TOOL = {
  "內容工具": "content",   // /api/content/sites
  "社群頻道": "content",   // /api/content/social-admin, /api/content/social-channels
  "知識庫": "cs",          // /api/ops/clients/[slug]/cs-knowledge*, cs-config
  "客服": "cs",            // cs-config, cs-intents, cs-eval-cases, /api/ops/cs/eval
  "資料蒐集": "collect",   // collection-sources, hci-import, cognitive-os-import
  "冷開發": "outreach",    // outreach-config
} as const satisfies Record<string, string>;
