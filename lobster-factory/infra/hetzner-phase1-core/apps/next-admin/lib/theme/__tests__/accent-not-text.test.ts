import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// Operator 2026-10-25: palette colors are surfaces, never text. Words in the accent role read
// var(--accent-text); var(--accent) as a text color would turn unreadable under a pastel preset.
const ROOT = path.resolve(__dirname, "../../..");
const DIRECT = /(?<![-\w])color\s*:\s*['"]?var\(--accent\)/;
const CONDITIONAL = /(?<![-\w])color\s*:\s*[^,;{}\n]*?\?[^,;{}\n]*?var\(--accent\)/;

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === "__tests__" ? [] : walk(p);
    return /\.(tsx?|css)$/.test(e.name) ? [p] : [];
  });

describe("accent color is not used for text", () => {
  it("no style paints text with var(--accent)", () => {
    const hits = ["app", "components", "lib"]
      .flatMap((d) => walk(path.join(ROOT, d)))
      .flatMap((f) =>
        fs.readFileSync(f, "utf8").split("\n").flatMap((line, i) =>
          DIRECT.test(line) || CONDITIONAL.test(line) ? [`${path.relative(ROOT, f)}:${i + 1}`] : []));
    expect(hits).toEqual([]);
  });

  // A text token is only guaranteed on the surface it was derived for (critic 2026-10-25 M2/m1):
  // words on the AI box read --ai-text; words on a solid accent fill read --btn-primary-text.
  it("text on the AI box or on a solid accent fill uses that surface's own ink", () => {
    const SOLID_ACCENT_BG = /background\s*:[^;{}\n]*?(?<!srgb, )var\(--accent\)/;
    const FIXED_WHITE = /(?<![-\w])color\s*:\s*['"]?(#fff\b|#ffffff\b|white\b|var\(--accent-contrast)/i;
    // Judged per style object / CSS rule block ({...} with no nested braces), so two elements sharing
    // one long line are not mixed up.
    const hits = ["app", "components", "lib"]
      .flatMap((d) => walk(path.join(ROOT, d)))
      .flatMap((f) => {
        const src = fs.readFileSync(f, "utf8");
        return [...src.matchAll(/\{[^{}]*\}/g)].flatMap((m) => {
          const block = m[0];
          const where = `${path.relative(ROOT, f)}:${src.slice(0, m.index).split("\n").length}`;
          return [
            block.includes("var(--ai-bg)") && block.includes("var(--accent-text)") ? [`${where} accent-text on ai-bg`] : [],
            SOLID_ACCENT_BG.test(block) && FIXED_WHITE.test(block) ? [`${where} fixed white on accent`] : [],
          ].flat();
        });
      });
    expect(hits).toEqual([]);
  });

  // Tighter: inside a solid accent block ANY color other than --btn-primary-text is a violation.
  // Debt found when this rule was tightened (2026-11-22): fix the file, then delete its entry. New files may not join.
  const KNOWN_DEBT = ["ops/clients/[slug]/CsIntentsCard.tsx", "ops/clients/[slug]/CustomerServiceTab.tsx", "tools/content/ContentStudio.tsx", "tools/content/topics/TopicsBoard.tsx", "app/globals.css"];
  it("a solid accent fill carries only --btn-primary-text as ink", () => {
    const SOLID_ACCENT_BG = /background\s*:[^;{}\n]*?(?<!srgb, )var\(--accent\)(?![-\w])/;
    const COLORS = /(?<![-\w])color\s*:\s*([^;,{}\n]*)/g;
    const hits = ["app", "components", "lib"]
      .flatMap((d) => walk(path.join(ROOT, d)))
      .flatMap((f) => {
        const src = fs.readFileSync(f, "utf8");
        return [...src.matchAll(/\{[^{}]*\}/g)].flatMap((m) => {
          if (!SOLID_ACCENT_BG.test(m[0])) return [];
          const bad = [...m[0].matchAll(COLORS)].filter((c) => !/var\(--btn-primary-text\)/.test(c[1]));
          return bad.length ? [`${path.relative(ROOT, f)}:${src.slice(0, m.index).split("\n").length} ${bad[0][0].trim()}`] : [];
        });
      });
    expect(hits.filter((h) => !KNOWN_DEBT.some((k) => h.split(path.sep).join("/").includes(k)))).toEqual([]);
  });
});

// --red / --green / --yellow are dots and borders; as words they are 2.15–3.76:1 on white (blueprint §19.6 #5). Words read
// --badge-red-text / --badge-green-text / --badge-yellow-text.
describe("status colors are not used for text", () => {
  // Uses that predate the rule, counted per file. Only goes down: fix some, lower the number; no file may join or grow.
  const STATUS_TEXT_DEBT: Record<string, number> = {
    "app/(shell)/ops/backup/page.tsx": 2,
    "app/(shell)/ops/clients/[slug]/AccountsCard.tsx": 4,
    "app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx": 28,
    "app/(shell)/ops/clients/[slug]/CsIntentsCard.tsx": 12,
    "app/(shell)/ops/clients/[slug]/CustomerServiceTab.tsx": 2,
    "app/(shell)/ops/clients/[slug]/DepartmentsTab.tsx": 1,
    "app/(shell)/ops/clients/[slug]/ExternalServicesTab.tsx": 3,
    "app/(shell)/ops/clients/[slug]/KnowledgeDetailModal.tsx": 1,
    "app/(shell)/ops/clients/[slug]/SiteWatchCard.tsx": 2,
    "app/(shell)/ops/clients/page.tsx": 1,
    "app/(shell)/ops/collect/page.tsx": 1,
    "app/(shell)/ops/costs/CodexQuotaCard.tsx": 2,
    "app/(shell)/ops/costs/CostsTabs.tsx": 1,
    "app/(shell)/ops/costs/FreeQuotaCard.tsx": 1,
    "app/(shell)/ops/schedules/ScheduleTable.tsx": 5,
    "app/(shell)/ops/staff/StaffAccess.tsx": 3,
    "app/(shell)/ops/system-modes/page.tsx": 2,
    "app/(shell)/ops/tools/OpsToolsPageClient.tsx": 4,
    "app/(shell)/tools/banner/BannerStudio.tsx": 6,
    "app/(shell)/tools/canvas/CanvasEditor.tsx": 2,
    "app/(shell)/tools/content/CoverPreview.tsx": 1,
    "app/(shell)/tools/content/SeoCheckPanel.tsx": 3,
    "app/(shell)/tools/content/sites/DailyTrendButtons.tsx": 2,
    "app/(shell)/tools/content/sites/IntroStyleButtons.tsx": 1,
    "app/(shell)/tools/content/sites/PublishModeButtons.tsx": 1,
    "app/(shell)/tools/content/sites/RequiredBlocksField.tsx": 3,
    "app/(shell)/tools/content/sites/SiteManager.tsx": 7,
    "app/(shell)/tools/content/sites/TextModelButtons.tsx": 1,
    "app/(shell)/tools/content/sites/TopicModeButtons.tsx": 1,
    "app/(shell)/tools/content/sites/YoutubePrivacyButtons.tsx": 1,
    "app/(shell)/tools/content/topics/AutoContentOverview.tsx": 2,
    "app/(shell)/tools/content/topics/TopicsBoard.tsx": 9,
    "app/(shell)/tools/designs/DesignsGallery.tsx": 1,
    "app/(shell)/tools/mockup/MockupStudio.tsx": 5,
    "app/(shell)/tools/mockup/ModelLibraryStudio.tsx": 6,
    "app/(shell)/tools/mockup/ModelMockupPanel.tsx": 3,
    "app/(shell)/tools/publish/PublishWizard.tsx": 23,
    "app/(shell)/tools/social/(sections)/analytics/analytics.css": 2,
    "app/(shell)/tools/social/(sections)/inbox/Inbox.tsx": 1,
    "app/(shell)/tools/social/compose/compose.css": 1,
    "app/(shell)/tools/social/social.css": 5,
    "app/(shell)/tools/studio/StudioWorkbench.tsx": 11,
    "app/(shell)/tools/tarot/TarotStudio.tsx": 11,
    "app/(shell)/tools/video/ReleaseDeliveryPanel.tsx": 3,
    "app/(shell)/tools/video/StoryBibleWorkbench.tsx": 1,
    "app/content/topics/DoorTopicsBoard.tsx": 1,
    "app/globals.css": 6,
    "app/login/set-password/SetPasswordForm.tsx": 1,
    "components/tools/panel-primitives.ts": 1,
  };
  // Over the whole source, not line by line: the declaration (or either branch of a ternary) may wrap. It ends at , ; { }.
  const statusTextUses = (src: string): number =>
    [...src.matchAll(/(?<![-\w])color\s*:[^,;{}]*/g)].filter((m) => /var\(--(red|green|yellow)[,)]/.test(m[0])).length;

  it("catches a declaration written over two lines", () => {
    expect(statusTextUses('style={{ color:\n  "var(--red)" }}')).toBe(1);
    expect(statusTextUses(".x {\n  color:\n    var(--green);\n}")).toBe(1);
    expect(statusTextUses('{ color: ok\n  ? "var(--text-muted)"\n  : "var(--yellow)", margin: 0 }')).toBe(1);
    expect(statusTextUses('{ borderColor: "var(--red)", color: "var(--badge-red-text)",\n background: "var(--red)" }')).toBe(0);
  });

  it("no new style paints text with var(--red) / var(--green) / var(--yellow)", () => {
    const found: Record<string, number> = {};
    for (const f of ["app", "components", "lib"].flatMap((d) => walk(path.join(ROOT, d)))) {
      const n = statusTextUses(fs.readFileSync(f, "utf8"));
      if (n) found[path.relative(ROOT, f).split(path.sep).join("/")] = n;
    }
    expect(found).toEqual(STATUS_TEXT_DEBT);
  });
});
