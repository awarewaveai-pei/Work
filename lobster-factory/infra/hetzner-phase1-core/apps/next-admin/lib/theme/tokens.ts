// Single source of truth for the app's themeable CSS custom properties.
// Imported by the theme editor (UI groups), the /api/theme route (validation +
// default baseline), and lib/theme/store (server read/write). Previously these
// definitions were duplicated in app/tools/theme/page.tsx and app/api/theme/route.ts.

export type TokenDef = { name: string; default: string; type: "color" | "text" };
export type TokenGroup = { label: string; tokens: TokenDef[] };

// Colors tab = only colors; Typography & Size tab = only sizes, weights, spacing and radius. Each
// token appears in exactly one group (lib/theme/__tests__/tokens-match-globals.test.ts checks).
export const COLOR_GROUPS: TokenGroup[] = [
  {
    label: "Brand",
    tokens: [
      { name: "--accent", default: "#6366f1", type: "color" },
      { name: "--accent-hover", default: "#818cf8", type: "color" },
      { name: "--btn-primary-bg", default: "#6366f1", type: "color" },
      { name: "--btn-primary-hover", default: "#4f52e0", type: "color" },
      { name: "--btn-primary-text", default: "#ffffff", type: "color" },
    ],
  },
  {
    label: "Text",
    tokens: [
      { name: "--text-primary", default: "#0d1526", type: "color" },
      { name: "--text-muted", default: "#64748b", type: "color" },
      { name: "--text-secondary", default: "#64748b", type: "color" },
    ],
  },
  {
    label: "Backgrounds",
    tokens: [
      { name: "--body-bg", default: "#f2f5fb", type: "color" },
      { name: "--card-bg", default: "#ffffff", type: "color" },
      { name: "--bg-subtle", default: "#f5f7fd", type: "color" },
      { name: "--bg-hover", default: "#eef1f9", type: "color" },
      { name: "--surface-2", default: "#f5f7fd", type: "color" },
    ],
  },
  {
    label: "Sidebar",
    tokens: [
      { name: "--sidebar-bg", default: "#f7f9fc", type: "color" },
      { name: "--sidebar-border", default: "#e6eaf4", type: "color" },
      { name: "--sidebar-text", default: "#475569", type: "color" },
      { name: "--sidebar-text-hover", default: "#0d1526", type: "color" },
      { name: "--sidebar-text-active", default: "#0d1526", type: "color" },
      { name: "--sidebar-active-bar", default: "#6366f1", type: "color" },
      { name: "--sidebar-section-label", default: "#94a3b8", type: "color" },
    ],
  },
  {
    label: "Borders",
    tokens: [
      { name: "--card-border", default: "#e6eaf4", type: "color" },
      { name: "--border", default: "#e6eaf4", type: "color" },
      { name: "--border-subtle", default: "#e6eaf4", type: "color" },
    ],
  },
  {
    label: "Status",
    tokens: [
      { name: "--green", default: "#10b981", type: "color" },
      { name: "--red", default: "#ef4444", type: "color" },
      { name: "--yellow", default: "#f59e0b", type: "color" },
      { name: "--severity-critical", default: "#dc2626", type: "color" },
      { name: "--severity-high", default: "#ea580c", type: "color" },
      { name: "--severity-medium", default: "#ca8a04", type: "color" },
      { name: "--severity-low", default: "#0284c7", type: "color" },
      { name: "--status-resolved", default: "#16a34a", type: "color" },
      { name: "--status-ignored", default: "#6b7280", type: "color" },
    ],
  },
  {
    label: "Button Secondary",
    tokens: [
      { name: "--btn-secondary-bg", default: "#ffffff", type: "color" },
      { name: "--btn-secondary-border", default: "#d4d9e8", type: "color" },
      { name: "--btn-secondary-text", default: "#0d1526", type: "color" },
    ],
  },
  {
    label: "Tabs",
    tokens: [
      { name: "--tab-color", default: "#64748b", type: "color" },
      { name: "--tab-color-hover", default: "#0d1526", type: "color" },
      { name: "--tab-color-active", default: "#6366f1", type: "color" },
      { name: "--tab-bg", default: "transparent", type: "color" },
      { name: "--tab-bg-hover", default: "rgba(99,102,241,0.05)", type: "color" },
      { name: "--tab-bg-active", default: "transparent", type: "color" },
      { name: "--tab-border-active", default: "#6366f1", type: "color" },
      { name: "--tab-bar-border", default: "#e6eaf4", type: "color" },
    ],
  },
  {
    label: "Special",
    tokens: [
      { name: "--code-bg", default: "#07101f", type: "color" },
      { name: "--ai-bg", default: "#e0f2fe", type: "color" },
      { name: "--ai-text", default: "#0369a1", type: "color" },
    ],
  },
];

export const TYPOGRAPHY_GROUPS: TokenGroup[] = [
  {
    label: "Font Sizes",
    tokens: [
      { name: "--font-size-xs", default: "11px", type: "text" },
      { name: "--font-size-sm", default: "13px", type: "text" },
      { name: "--font-size-base", default: "14px", type: "text" },
      { name: "--font-size-md", default: "15px", type: "text" },
      { name: "--font-size-lg", default: "17px", type: "text" },
      { name: "--font-size-xl", default: "22px", type: "text" },
      { name: "--sidebar-section-label-size", default: "9px", type: "text" },
      { name: "--tab-font-size", default: "14px", type: "text" },
    ],
  },
  {
    label: "Font Weights",
    tokens: [
      { name: "--font-weight-normal", default: "400", type: "text" },
      { name: "--font-weight-medium", default: "500", type: "text" },
      { name: "--font-weight-semibold", default: "600", type: "text" },
      { name: "--font-weight-bold", default: "700", type: "text" },
      { name: "--font-weight-heavy", default: "800", type: "text" },
      { name: "--tab-font-weight", default: "600", type: "text" },
    ],
  },
  {
    label: "Line Height & Spacing",
    tokens: [
      { name: "--line-height-base", default: "1.6", type: "text" },
      { name: "--line-height-tight", default: "1.3", type: "text" },
      { name: "--letter-spacing-label", default: "0.07em", type: "text" },
    ],
  },
  {
    label: "Corner Radius",
    tokens: [
      { name: "--radius", default: "12px", type: "text" },
      { name: "--radius-sm", default: "8px", type: "text" },
    ],
  },
];

export const ALL_TOKEN_GROUPS: TokenGroup[] = [...COLOR_GROUPS, ...TYPOGRAPHY_GROUPS];

// Flat name → default-value map (the baseline GET returns and validation checks against).
export const DEFAULT_TOKENS: Record<string, string> = Object.fromEntries(
  ALL_TOKEN_GROUPS.flatMap((g) => g.tokens.map((t) => [t.name, t.default] as const)),
);

export const VALID_TOKEN_NAMES: ReadonlySet<string> = new Set(Object.keys(DEFAULT_TOKENS));

// Only accept safe CSS values (no injection vectors). Mirrors the prior route.ts gate.
export const SAFE_VALUE_RE =
  /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[0-9]+(\.[0-9]+)?(px|em|rem|%|vh|vw|dvh|dvw|s|ms)?|0|inherit|transparent|[a-z][\w-]*)$/;

// Sidebar layout shape (persisted alongside tokens so reorder is cross-device too).
export interface SavedLayout {
  sectionOrder?: string[];
  itemOrders?: Record<string, string[]>;
}
