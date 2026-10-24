// Every staff page and API belongs to a staff tool (or to every staff member), and a tool's own pages work with that
// tool alone: what an owner ticks is enough for the pages it shows (agency-os/handoffs/2026-10-24-staff-tool-grants).
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PUBLIC_API_PATHS } from "../../../middleware";
import { BACK_OFFICE, PRODUCTS, STAFF_UTILITIES } from "../products";
import { PLATFORM_APIS, doorApis, nextAdminProducts } from "../doors";
import { STAFF_API_OWNERS, STAFF_PLATFORM, STAFF_TOOLS, covers, staffApisOf, toolsFor } from "../staff-tools";
import { ROOT, codeIndex, isRoute } from "./code-scan";

// Calls a tool's page makes into another tool, so that button needs that tool ticked too (keys are path patterns, as in
// staff-tools.ts). Declared optional modules (products.ts modules.optional) are allowed without a row here. The client
// hub embeds other products' tabs; C3 hides each one when its product is not ticked.
const NEEDS_OTHER_TOOL: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  studio: { "/api/content/seo-fix": "上架頁的 SEO 修正按鈕用內容行銷的功能" },
  tarot: { "/api/tools/studio/edit-prompt": "修圖提示詞面板用商品設計工作室的功能" },
  video: { "/api/social/posts": "ScriptForge 的「送社群」用社群發文的功能" },
  "ops/clients": {
    "/api/content/sites": "客戶中心的網站分頁用內容行銷的功能",
    "/api/content/social-admin": "客戶中心的社群連線分頁用內容行銷的功能",
    "/api/content/social-channels": "客戶中心的社群頻道分頁用內容行銷的功能",
    "/api/ops/cs/eval": "客戶中心的客服分頁用 AI 客服的功能",
    "/api/ops/clients/[x]/cs-config": "客戶中心的客服分頁用 AI 客服的功能",
    "/api/ops/clients/[x]/cs-intents": "客戶中心的客服分頁用 AI 客服的功能",
    "/api/ops/clients/[x]/cs-eval-cases": "客戶中心的客服分頁用 AI 客服的功能",
    "/api/ops/clients/[x]/cs-knowledge": "客戶中心的知識庫分頁用 AI 客服的功能",
    "/api/ops/clients/[x]/cs-knowledge-folders": "客戶中心的知識庫分頁用 AI 客服的功能",
    "/api/ops/clients/[x]/collection-sources": "客戶中心的資料蒐集分頁用資料蒐集器的功能",
    "/api/ops/clients/[x]/cognitive-os-import": "客戶中心的資料蒐集分頁用資料蒐集器的功能",
    "/api/ops/clients/[x]/hci-import": "客戶中心的資料蒐集分頁用資料蒐集器的功能",
    "/api/ops/clients/[x]/outreach-config": "客戶中心的開發信分頁用行銷開發信的功能",
  },
};

// Routes outside the staff session gate: middleware's matcher skips them, or they carry their own token.
const UNGATED_API = ["/api/webhooks", "/api/internal", "/api/auth"];
const APP = path.join(ROOT, "app");
const INDEX = codeIndex(["app", "lib", "components"]);

/** URL paths of the page.tsx / route.ts files under `dir` (route groups add no segment). */
function urls(dir: string, file: "page" | "route", base = ""): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) {
      if (e.name.startsWith("_") || e.name === "__tests__") return [];
      return urls(path.join(dir, e.name), file, e.name.startsWith("(") ? base : `${base}/${e.name}`);
    }
    return new RegExp(`^${file}\\.[cm]?[jt]sx?$`).test(e.name) ? [base || "/"] : [];
  });
}

const staffPages = () => [
  ...urls(path.join(APP, "(shell)"), "page"),
  ...nextAdminProducts().flatMap((p) => urls(path.join(APP, p.door.page.slice(1)), "page", p.door.page)),
];
const gatedApis = () => urls(path.join(APP, "api"), "route", "/api")
  .filter((u) => !UNGATED_API.some((x) => covers(x, u)) && !PUBLIC_API_PATHS.has(u));

describe("staff tools", () => {
  it("cells are unique, each has a page, and every named owner and alias is a cell", () => {
    const keys = STAFF_TOOLS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of STAFF_TOOLS) expect(t.pages.length, t.key).toBeGreaterThan(0);
    for (const [pattern, owners] of Object.entries(STAFF_API_OWNERS)) for (const k of owners) expect(keys, pattern).toContain(k);
    for (const page of Object.values({ ...BACK_OFFICE, ...STAFF_UTILITIES })) if (page.tool) expect(keys).toContain(page.tool);
    for (const from of Object.keys(NEEDS_OTHER_TOOL)) expect(keys).toContain(from);
  });

  it("every staff page belongs to a tool or to every staff member", () => {
    const loose = staffPages().filter((u) => toolsFor(u) === null);
    expect(loose).toEqual([]);
  });

  it("every session-gated API route belongs to a tool or to every staff member", () => {
    const loose = gatedApis().filter((u) => toolsFor(u) === null);
    expect(loose).toEqual([]);
  });

  it("every staff-only API pattern names a route that exists", () => {
    const routes = gatedApis();
    for (const pattern of [...Object.keys(STAFF_API_OWNERS), ...STAFF_PLATFORM.apis]) {
      expect(routes.some((u) => covers(pattern, u)), pattern).toBe(true);
    }
  });

  it("a tool's pages reach every API they call with that tool alone", () => {
    const optionalOwners = (key: string) => new Set(PRODUCTS.find((p) => p.key === key)?.modules.optional ?? []);
    const productOf = (api: string) => nextAdminProducts().filter((p) => doorApis(p).some((a) => covers(a, api))).map((p) => p.key);
    const problems: string[] = [];
    for (const tool of STAFF_TOOLS) {
      // a page path is served from app/(shell)<path> on the staff door and from app<path> on a product door
      const roots = tool.pages.flatMap((p) => [`app/(shell)${p}/`, `app${p}/`]);
      const files = INDEX.importClosure([...INDEX.files.keys()].filter((f) => roots.some((r) => f.startsWith(r)) && !isRoute(f)));
      for (const f of files) {
        const scan = INDEX.files.get(f)!;
        // a template URL is judged by its route ("/api/ops/clients/[x]/outreach-config"), not by its leading text: the
        // leading text names the broad owner and would hide the narrow one (Codex 2026-10-24, partialreview-2065404a)
        const templated = new Set(scan.templates.map((t) => t.prefix));
        const literal = scan.calls.filter((c) => !templated.has(c) || scan.calls.filter((x) => x === c).length > scan.templates.filter((t) => t.prefix === c).length);
        const targets = [...literal.map((c) => ({ call: c, prefixOnly: false })), ...scan.templates.map((t) => ({ call: t.route, prefixOnly: false, prefix: t.prefix }))];
        for (const { call, prefix } of targets as Array<{ call: string; prefix?: string }>) {
          // "/api" alone is a prefix test in a string comparison (doors.ts), not a request
          if (call === "/api" || PUBLIC_API_PATHS.has(call) || PLATFORM_APIS.some((a) => covers(a, call))) continue;
          const owners = toolsFor(call);
          if (owners === "platform" || owners?.includes(tool.key)) continue;
          // only a template whose route matches no row at all (e.g. a substituted first segment) falls back to its
          // leading text: the tool must then own some route below it
          if (prefix && owners === null && [...tool.apis, ...staffApisOf(tool.key)].some((a) => a.startsWith(`${prefix}/`) || covers(prefix, a.replace(/\$$/, "")))) continue;
          if (productOf(call).some((k) => optionalOwners(tool.key).has(k))) continue;
          if (Object.keys(NEEDS_OTHER_TOOL[tool.key] ?? {}).some((pattern) => covers(pattern, call))) continue;
          problems.push(`${tool.key}: ${f} calls ${call} (owned by ${owners === null ? "nobody" : owners.join(",")})`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("a product's API never gets a non-product owner", () => {
    const productApis = nextAdminProducts().flatMap((p) => doorApis(p)).filter((a) => !PLATFORM_APIS.includes(a));
    for (const [pattern, owners] of Object.entries(STAFF_API_OWNERS)) {
      if (!productApis.some((a) => covers(a, pattern.replace(/\$$/, "")))) continue;
      const staffOnly = owners.filter((k) => STAFF_TOOLS.find((t) => t.key === k)?.group !== "product");
      expect(staffOnly, pattern).toEqual([]);
    }
  });

  it("toolsFor matches dynamic segments, exact patterns and the platform", () => {
    expect(toolsFor("/")).toBe("platform");
    expect(toolsFor("/api/ops/build-id")).toBe("platform");
    expect(toolsFor("/api/ops/clients")).toEqual(expect.arrayContaining(["ops/clients", "design"]));
    expect(toolsFor("/api/ops/clients/acme/credentials")).toEqual(["ops/clients"]);
    // the narrow row replaces the broad one: 客戶 alone does not reach AI 客服's knowledge base
    expect(toolsFor("/api/ops/clients/acme/cs-knowledge")).toEqual(["cs"]);
    expect(toolsFor("/api/ops/clients/acme/schedules/crawl")).toEqual(expect.arrayContaining(["ops/schedules", "ops/clients"]));
    // a product API keeps its products and gains no back-office owner
    expect(toolsFor("/api/content/sites")).not.toContain("ops/clients");
    expect(toolsFor("/api/content/sites")).toEqual(expect.arrayContaining(["content", "video"]));
    expect(toolsFor("/tools/social")).toEqual(["social"]);
    expect(toolsFor("/social/brands")).toEqual(["social"]);
    expect(toolsFor("/ops/ai-models")).toEqual(["tools/ai-models"]);
    expect(toolsFor("/api/nothing-here")).toBeNull();
  });
});
