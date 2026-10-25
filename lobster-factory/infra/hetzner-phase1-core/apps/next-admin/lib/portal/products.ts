// Product/feature delivery registry (ADR 012/017/018). New rows: scripts/new-product.mjs.
import cognitiveInventory from "./cognitive-features.json";
export type LoginSource = "local" | "awarewave-wp" | "customer-wp";
export const LOGIN_SOURCES: readonly LoginSource[] = ["local", "awarewave-wp", "customer-wp"];
// anonymous: path prefixes served with no login, on this product's own door only (pages and GET/HEAD routes;
// lib/portal/__tests__/products.test.ts reads the files under them).
// nav: a multi-page door's menu (ADR 018 §2 rule 3), rendered by app/ProductDoorShell.tsx. path: the page below the door
// ("" = its home), served from app<page>/<path>/page.tsx; staff: the staff page showing the same component, so
// useDoorHref (app/DoorContext.tsx) can turn a shared component's staff link into the door link.
export interface DoorNavItem { path: string; name: string; staff: string }
export type ProductDoor = { app: "next-admin"; page: string; api: readonly string[]; anonymous?: readonly string[]; enabled?: boolean; nav?: readonly DoorNavItem[] } | { app: "external" };
export interface ProductFeature {
  feature_key: string;
  name: string;
  limitKind: "QUOTA" | "RATE_LIMIT" | "SAFETY_GATE";
  buyout: boolean;
  billing: "contract" | "credits";
}
interface ProductDefinition {
  key: string;
  name: string;
  description: string;
  subdomain: string;
  door: ProductDoor;
  loginSources: readonly LoginSource[];
  standalone: boolean;
  status: "coming_soon" | "available";
  // Only self-signup keys must be accepted by migration 0062's CHECK.
  selfSignup: boolean;
  features: readonly ProductFeature[];
  accessChannels: readonly ("ui" | "api")[];
  // dependsOn: installed with this product (Foundry requires). optional: products some of its buttons call or bill; it
  // works without them. lib/portal/__tests__/registry-code.test.ts checks both against the code.
  modules: { dependsOn: readonly string[]; optional?: readonly string[]; manifest: string };
  staffPaths: readonly string[];
}
const quota = (feature_key: string, name: string, billing: ProductFeature["billing"] = "credits"): ProductFeature =>
  ({ feature_key, name, limitKind: "QUOTA", buyout: true, billing });
const cognitiveFeatures = cognitiveInventory.map((f) => quota(f.id, f.name, f.billing as ProductFeature["billing"]));
const PRODUCT_DEFINITIONS = [
  { key: "cognitive", name: "AI LEGO Cognitive Engineering OS", description: "組合認知方法、研究資料與專案。", subdomain: "cognitive", door: { app: "external" },
    loginSources: ["local", "awarewave-wp"], standalone: true, status: "coming_soon", selfSignup: true,
    features: cognitiveFeatures, accessChannels: ["ui"], modules: { dependsOn: ["collect"], manifest: "lib/cognitive/MODULE_MANIFEST.json" }, staffPaths: [] },
  { key: "hci", name: "HCI-30", description: "人機互動與持續監測工具。", subdomain: "hci", door: { app: "external" },
    loginSources: ["local", "awarewave-wp"], standalone: true, status: "coming_soon", selfSignup: true,
    features: [], accessChannels: ["ui"], modules: { dependsOn: [], manifest: "lib/hci/MODULE_MANIFEST.json" }, staffPaths: [] },
  { key: "social", name: "社群發文", description: "改寫、排程並派送品牌社群貼文。", subdomain: "social", door: { app: "next-admin", page: "/social", api: ["/api/social"], anonymous: ["/smartlink"] },
    loginSources: ["local", "awarewave-wp", "customer-wp"], standalone: true, status: "coming_soon", selfSignup: false,
    features: [quota("social.rewrite", "AI 多平台改寫"), quota("social.dispatch", "貼文派送", "contract"), quota("social.auto-reply", "Meta 自動回覆", "contract"), quota("social.ads", "Meta 廣告管理", "contract"), quota("social.meta", "Meta 資產設定", "contract")], accessChannels: ["ui"],
    modules: { dependsOn: [], manifest: "lib/social/MODULE_MANIFEST.json" }, staffPaths: ["tools/social"] },
  { key: "video", name: "影片製作", description: "生成腳本、場景、動態與旁白影片。", subdomain: "video", door: { app: "next-admin", page: "/video", api: ["/api/video", "/api/tools/script-forge"] },
    loginSources: ["local"], standalone: false, status: "coming_soon", selfSignup: false,
    features: [quota("video.script", "腳本生成"), quota("video.image", "場景圖生成"), quota("video.motion", "影片動態"), quota("video.tts", "付費旁白")],
    accessChannels: ["ui"], modules: { dependsOn: ["content"], optional: ["social"], manifest: "lib/video/MODULE_MANIFEST.json" }, staffPaths: ["tools/video", "tools/script-forge"] },
  { key: "tarot", name: "塔羅製圖", description: "生成塔羅圖片、提示詞與動態。", subdomain: "tarot", door: { app: "next-admin", page: "/tarot", api: ["/api/tools/tarot"] },
    loginSources: ["local"], standalone: false, status: "coming_soon", selfSignup: false,
    features: [quota("tarot.image", "塔羅圖生成"), quota("tarot.prompt", "提示詞建議")],
    accessChannels: ["ui"], modules: { dependsOn: [], manifest: "lib/tarot/MODULE_MANIFEST.json" }, staffPaths: ["tools/tarot"] },
  // tools/publish (POD listing to our own Woo store) is studio's and staff-only: no door page (step-8 card §6 D1).
  { key: "studio", name: "商品設計工作室", description: "生成商品圖片、文案與修圖素材。", subdomain: "studio", door: { app: "next-admin", page: "/studio", api: ["/api/tools/studio"] },
    loginSources: ["local"], standalone: false, status: "coming_soon", selfSignup: false,
    features: [quota("studio.image", "圖片生成"), quota("studio.product-copy", "商品文案"), quota("studio.edit-prompt", "修圖提示詞"), quota("studio.remove-bg", "去背"), quota("studio.inpaint", "局部重繪"), quota("studio.fill", "生成填補"), quota("studio.upscale", "圖片放大")],
    accessChannels: ["ui"], modules: { dependsOn: [], manifest: "lib/studio/MODULE_MANIFEST.json" }, staffPaths: ["tools/studio", "tools/publish"] },
  { key: "design", name: "設計編輯器", description: "編輯畫布、橫幅、模型圖與向量設計。", subdomain: "design", door: { app: "next-admin", page: "/design", api: ["/api/tools/presets", "/api/tools/printful/catalog"],
      nav: [{ path: "", name: "我的設計", staff: "tools/designs" }, { path: "canvas", name: "畫布", staff: "tools/canvas" },
        { path: "banner", name: "橫幅", staff: "tools/banner" }, { path: "mockup", name: "模型圖", staff: "tools/mockup" }] },
    loginSources: ["local"], standalone: false, status: "coming_soon", selfSignup: false,
    // Paid image operations belong to studio above; Fabric editing itself calls no paid model.
    features: [quota("design.edit", "畫布與向量編輯", "contract")], accessChannels: ["ui"],
    modules: { dependsOn: ["studio"], optional: ["video"], manifest: "lib/design/MODULE_MANIFEST.json" }, staffPaths: ["tools/canvas", "tools/designs", "tools/mockup", "tools/banner", "tools/vector-editor"] },
  { key: "content", name: "內容行銷", description: "產生文章、搜尋素材並安排內容發布。", subdomain: "content", door: { app: "next-admin", page: "/content", enabled: false, api: ["/api/content"],
      nav: [{ path: "", name: "內容編輯", staff: "tools/content" }, { path: "calendar", name: "行事曆", staff: "tools/content/calendar" },
        { path: "sites", name: "網站", staff: "tools/content/sites" }, { path: "events", name: "節日", staff: "tools/events" }] },
    loginSources: ["local"], standalone: false, status: "coming_soon", selfSignup: false,
    features: [quota("content.article", "文章生成"), quota("content.humanize", "文章人性化"), quota("content.seo-fix", "SEO 修正"), quota("content.brand-voice", "品牌語氣擷取"), quota("content.outline", "大綱生成"), quota("content.title", "標題建議"), quota("content.keywords", "關鍵字建議"), quota("content.hook-brief", "Hook 草稿"), quota("content.syndicate", "多平台內容改寫"), quota("content.market-analysis", "市場分析"), quota("content.plan", "每月題目規劃"), quota("content.trending", "趨勢分析"), quota("content.image", "內容配圖")],
    accessChannels: ["ui"], modules: { dependsOn: ["studio"], optional: ["video"], manifest: "lib/content/MODULE_MANIFEST.json" }, staffPaths: ["tools/content", "tools/events"] },
  // cs and collect also use /api/ops/clients/[slug]/{cs-*,collection-sources}: not a prefix a door can own; ADR 017 step 8 decides.
  { key: "cs", name: "AI 客服", description: "根據知識庫回答問題並處理客服交接。", subdomain: "cs", door: { app: "next-admin", page: "/cs", enabled: false, api: ["/api/ops/cs"] },
    loginSources: ["local"], standalone: false, status: "coming_soon", selfSignup: false,
    features: [quota("cs.intent", "意圖分類"), quota("cs.answer", "客服回答與工具呼叫"), quota("cs.eval", "回答評測"), quota("cs.exam", "客服模擬考"), quota("cs.translate", "訊息翻譯")],
    accessChannels: ["ui"], modules: { dependsOn: [], manifest: "lib/cs/MODULE_MANIFEST.json" }, staffPaths: ["ops/cs", "ops/knowledge", "cs-widget"] },
  { key: "collect", name: "資料蒐集器", description: "搜尋並蒐集外部網站與研究資料。", subdomain: "collect", door: { app: "next-admin", page: "/collect", enabled: false, api: [] },
    loginSources: ["local"], standalone: false, status: "coming_soon", selfSignup: false,
    features: [quota("collect.fetch", "資料蒐集")], accessChannels: ["ui"], modules: { dependsOn: [], manifest: "lib/collect/MODULE_MANIFEST.json" }, staffPaths: ["ops/collect"] },
  { key: "outreach", name: "行銷開發信", description: "產生開發信並管理寄送名單。", subdomain: "outreach", door: { app: "next-admin", page: "/outreach", enabled: false, api: ["/api/outreach"] },
    loginSources: ["local"], standalone: false, status: "coming_soon", selfSignup: false,
    features: [quota("outreach.draft", "AI 開發信")], accessChannels: ["ui"], modules: { dependsOn: [], manifest: "lib/outreach/MODULE_MANIFEST.json" }, staffPaths: ["outreach"] },
  // NEW_PRODUCT_ROWS: scripts/new-product.mjs inserts before this marker.
] as const satisfies readonly ProductDefinition[];
export type ProductKey = (typeof PRODUCT_DEFINITIONS)[number]["key"];
export type PortalProduct = Omit<ProductDefinition, "key"> & { key: ProductKey };
export const PRODUCTS: readonly PortalProduct[] = PRODUCT_DEFINITIONS;
export const SELF_SIGNUP_PRODUCTS = PRODUCTS.filter((p) => p.selfSignup);
export const DEFAULT_SIGNUP_PRODUCT: ProductKey = SELF_SIGNUP_PRODUCTS[0].key;
export function isSelfSignupProductKey(value: unknown): value is ProductKey {
  return typeof value === "string" && SELF_SIGNUP_PRODUCTS.some((p) => p.key === value);
}
// Staff-only pages that are not products. name: the cell on the staff permission page (lib/portal/staff-tools.ts);
// tool: grant it with another page's cell instead of a cell of its own (a redirect or a variant of that page).
export interface StaffPage { name: string; why: string; tool?: string }
export const STAFF_UTILITIES: Readonly<Record<string, StaffPage>> = {
  "tools/theme": { name: "後台外觀", why: "員工調整後台外觀，不呼叫付費 AI。" },
  "tools/ai-models": { name: "模型資料", why: "員工查閱模型資料，不呼叫付費 AI。" },
};
export const BACK_OFFICE: Readonly<Record<string, StaffPage>> = {
  "ops/clients": { name: "客戶", why: "員工管理客戶組織。" }, "ops/schedules": { name: "排程", why: "員工管理維護排程。" },
  "ops/repairs": { name: "維修", why: "員工處理服務修復。" }, "ops/integrations": { name: "串接", why: "員工管理連線設定。" },
  "ops/system-modes": { name: "系統模式", why: "員工管理系統模式。" }, "ops/approvals": { name: "簽核", why: "員工審批營運操作。" },
  "ops/backup": { name: "備份", why: "員工檢查備份。" }, "ops/inbox": { name: "告警", why: "員工處理營運告警。" },
  "ops/costs": { name: "成本", why: "員工檢查營運成本。" }, "ops/billing": { name: "帳務", why: "員工查看全部帳戶的點數合計與需要處理的帳戶，以及客戶頁的帳務分頁（唯讀）。" },
  "ops/ai-models": { name: "模型資料", why: "舊網址，轉到 /tools/ai-models 的圖片模型規格分頁。", tool: "tools/ai-models" },
  "ops/onboarding": { name: "客戶啟用", why: "員工處理客戶啟用。" },
  "ops/tools": { name: "工具清單", why: "員工維護工具清單。" }, "ops/products": { name: "產品表", why: "員工查看產品登記表：門、販售狀態、收費功能。" },
  "ops/staff": { name: "員工權限", why: "擁有者設定每位員工的角色與可用工具；其他人只能查看。" },
  "build": { name: "建站", why: "員工執行建站作業。" },
  "ops-console": { name: "營運總台", why: "員工檢視營運總台。" }, "onboard": { name: "佈建", why: "員工操作佈建流程。" },
  "api-check": { name: "API 檢查", why: "員工檢查 API 連線。" }, "api-check-client": { name: "API 檢查", why: "員工檢查客戶 API 連線。", tool: "api-check" },
};
