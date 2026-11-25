// LEGO 積木目錄: every reusable piece, its fixed number, what it does and which systems (registry slugs) use it.
// Read by /ops/systems/blocks and /ops/systems/[slug]. Guarded by __tests__/blocks.test.ts (numbers, paths, coverage,
// importers ⊆ usedBy). Rules:
//  - `no` is permanent: never renumber, never reuse; a retired block keeps its number. New block = next free number.
//  - One capability = one block: its UI panel and its API/function are both in `entry`; `covers` lists the code ids
//    (register() id, panel/<file>) it absorbs so the coverage test can find them.
//  - Paths are relative to apps/next-admin; "repo:" = repo root (absent on the host; checked locally / CI).

export const TIERS = [
  { key: "block", prefix: "B", name: "功能積木", hint: "可在不同系統間共用的一個能力；前端面板與後端 API 算同一顆。" },
  { key: "module", prefix: "M", name: "產品模組", hint: "一整個產品（自己的資料、API、開關），可單獨關掉或買斷搬走（ADR 017）。" },
  { key: "method", prefix: "C", name: "認知方法族", hint: "AI LEGO 認知工程 OS 的方法庫；每一族是一組可組合的方法。" },
] as const;
export type Tier = (typeof TIERS)[number]["key"];

/** Layers of the 功能積木 tier, bottom (shared base) to top (what the user touches). */
export const BLOCK_LAYERS = [
  { key: "platform", name: "共用底座", hint: "權限、AI 成本、模型清單、訂閱通道、產品門。" },
  { key: "content", name: "內容後端", hint: "registry.ts 自我註冊，編排器按種類取用。" },
  { key: "image", name: "生圖", hint: "生圖入口、模型、風格庫。" },
  { key: "ai", name: "AI 提示詞", hint: "人話 → 給模型的英文指令。" },
  { key: "process", name: "影像處理", hint: "調色、去背、填色、印刷檔、圖庫。" },
  { key: "pod", name: "POD 電商", hint: "商品規格、WooCommerce、Printful 履約。" },
  { key: "ui", name: "前端面板", hint: "編輯器側欄面板；一個壞了只影響它自己。" },
] as const;
export type BlockLayer = (typeof BLOCK_LAYERS)[number]["key"];

export const BLOCK_STATUS = {
  registered: { label: "已註冊", badge: "badge-green" },
  pipeline: { label: "已接管線", badge: "badge-green" },
  toolkit: { label: "共用函式", badge: "badge-gray" },
  route: { label: "API", badge: "badge-gray" },
  ui: { label: "介面面板", badge: "badge-gray" },
  module: { label: "產品模組", badge: "badge-green" },
  planned: { label: "規劃中", badge: "badge-yellow" },
  retired: { label: "已退場", badge: "badge-red" },
} as const;
export type BlockStatus = keyof typeof BLOCK_STATUS;

export interface LegoBlock {
  no: string;
  tier: Tier;
  /** 功能積木 only */
  layer?: BlockLayer;
  name: string;
  status: BlockStatus[];
  purpose: string;
  /** files / folders ("/" = folder); empty only for planned or retired */
  entry: string[];
  /** code ids this block absorbs: register() ids, "panel/<file>" */
  covers?: string[];
  deps?: string[];
  /** registry system slugs, owner first */
  usedBy: string[];
  note?: string;
  /** 認知方法族: method files in the family */
  count?: number;
}

type B = Omit<LegoBlock, "tier">;
const block = (b: B): LegoBlock => ({ tier: "block", ...b });
const panel = (no: string, id: string, name: string, purpose: string, extra: Partial<B> = {}): LegoBlock =>
  block({ no, layer: "ui", name, status: ["ui"], purpose, entry: [`public/editor-shared/blocks/${id}.js`], covers: [`panel/${id}`], usedBy: ["design"], ...extra });
const PHOTO = "只在照片專業版（/photo-pro-dock）";
const retired = (no: string, id: string, name: string, purpose: string): LegoBlock =>
  block({ no, layer: "ui", name, status: ["retired"], purpose, entry: [], usedBy: ["design"],
    note: `舊向量編輯器面板 ${id}；2026-11-05 隨舊編輯器刪除，由 VectorCraft 原生功能取代（agency-os/handoffs/2026-11-04-vectorcraft-pro/R0-PLAN.md §6 C4）` });
const planned = (no: string, layer: BlockLayer, name: string, purpose: string, usedBy: string[]): LegoBlock =>
  block({ no, layer, name, status: ["planned"], purpose, entry: [], usedBy });
const productModule = (no: string, id: string, name: string, purpose: string, usedBy: string[]): LegoBlock =>
  ({ no, tier: "module", name, status: ["module"], purpose, entry: [`lib/${id}/MODULE_MANIFEST.json`], covers: [`module/${id}`], usedBy });
const COS = "repo:Projects/internal/cognitive-engineering-os/ai_lego/modules/";
const method = (no: string, family: string, name: string, count: number, purpose: string): LegoBlock =>
  ({ no, tier: "method", name, status: ["registered"], purpose, entry: [`${COS}${family}/`], covers: [`cognitive/${family}`], usedBy: ["cognitive-os"], count });

export const LEGO_BLOCKS: LegoBlock[] = [
  // ── 共用底座 ──
  block({ no: "B-001", layer: "platform", name: "許可判斷 can()", status: ["toolkit"],
    purpose: "唯一的許可問法 can(主體, feature_key, actor)：訂閱、點數、買斷、代操都走它，不另建帳本。",
    entry: ["lib/entitlements/can.ts"], deps: ["Supabase"],
    usedBy: ["commerce", "content", "outbound-os", "studio", "tarot", "video", "social", "cs", "collect", "ai-subscription-channel", "app-platform", "ops-console"] }),
  block({ no: "B-002", layer: "platform", name: "AI 成本表", status: ["toolkit"],
    purpose: "每個文字／生圖模型的單價與狀態；成本計算與模型選單都讀它。", entry: ["lib/ai/cost-model.ts"],
    usedBy: ["app-platform", "content", "video", "ops-console", "outbound-os", "social", "tarot", "studio", "commerce", "schedules", "ai-subscription-channel"] }),
  block({ no: "B-003", layer: "platform", name: "文字模型選單", status: ["toolkit"],
    purpose: "所有文字 AI 工具共用的模型按鈕（只列成本表 active 的模型）。", entry: ["lib/ai/text-model-options.ts"],
    usedBy: ["app-platform", "content", "video", "ops-console", "ai-subscription-channel", "design", "outbound-os", "social", "studio"] }),
  block({ no: "B-004", layer: "platform", name: "訂閱額度文字通道", status: ["toolkit"],
    purpose: "文字生成改走 Claude／Codex 訂閱額度，不花 API 費用並記用量。", entry: ["lib/ai/sub-text.ts"], deps: ["訂閱工人（筆電或主機）"],
    usedBy: ["ai-subscription-channel", "content", "video"] }),
  block({ no: "B-005", layer: "platform", name: "產品門登記", status: ["toolkit"],
    purpose: "每個對外產品的網址、登入來源與門；新產品先填這裡（ADR 018）。", entry: ["lib/portal/products.ts"],
    usedBy: ["commerce", "app-platform", "ops-console", "video", "outbound-os", "social", "content", "schedules"] }),

  // ── 內容後端 ──
  block({ no: "B-006", layer: "content", name: "後端積木註冊表", status: ["registered"],
    purpose: "register／byKind／byId／listAll：積木自我註冊，編排器只按種類取用。積木契約在 README。",
    entry: ["lib/content/blocks/registry.ts", "lib/content/blocks/register-all.ts", "lib/content/blocks/README.md"], usedBy: ["content", "video"] }),
  block({ no: "B-007", layer: "content", name: "內容管線編排器", status: ["pipeline"],
    purpose: "B-009 長文 → B-010 檢查 → B-011 發佈，一條龍；本身不認識任何單一積木。", entry: ["lib/content/pipeline.ts"], usedBy: ["content"] }),
  block({ no: "B-008", layer: "content", name: "熱門話題來源", status: ["registered"],
    purpose: "6 個內建來源（Google News、Reddit、PTT、Serper、Google 搜尋趨勢、YouTube 熱門）＋4 個社群熱門（Dcard、X、TikTok、Instagram，經 Apify）＋環境變數自訂 RSS＋資料庫來源，一次全跑。",
    entry: ["lib/content/trending-sources.ts"], deps: ["SERPER_API_KEY（Serper）", "APIFY_API_TOKEN（社群熱門）", "CONTENT_TRENDING_FEEDS（自訂）"],
    covers: ["search/google-news", "search/reddit", "search/ptt", "search/serper", "search/google-trends", "search/youtube-trending",
      "search/dcard", "search/x", "search/tiktok", "search/instagram"], usedBy: ["content"] }),
  block({ no: "B-009", layer: "content", name: "長文生成", status: ["registered", "pipeline"], purpose: "SEO／GEO／RankMath 長文部落格。",
    entry: ["lib/content/blocks/article-generate.ts", "lib/content/article/generate-core.ts"], covers: ["article/generate"], deps: ["ANTHROPIC_API_KEY"], usedBy: ["content"] }),
  block({ no: "B-010", layer: "content", name: "SEO 品質檢查", status: ["registered", "pipeline"], purpose: "RankMath／SEO 22 點檢測，不呼叫 AI。",
    entry: ["lib/content/blocks/seo-check.ts", "lib/content/quality/seo-check-core.ts"], covers: ["quality/check"], usedBy: ["content"] }),
  block({ no: "B-011", layer: "content", name: "發佈到 WordPress", status: ["registered", "pipeline"], purpose: "經 wp-bridge 發到客戶 WordPress，一律先存草稿。",
    entry: ["lib/content/blocks/publish-wordpress.ts", "lib/content/publish/wordpress-core.ts", "lib/content/publish/wp-post-core.ts"],
    covers: ["publish/wordpress"], deps: ["wp-bridge（WPBRIDGE_*）"], usedBy: ["content"] }),
  block({ no: "B-012", layer: "content", name: "商品文案", status: ["registered", "route"], purpose: "POD 商品文案＋SEO／GEO／AEO，RankMath 商品版評分。",
    entry: ["lib/content/blocks/product-copy.ts"], covers: ["product/copy"], deps: ["ANTHROPIC_API_KEY"], usedBy: ["content", "studio"] }),
  block({ no: "B-013", layer: "content", name: "影片管線", status: ["registered"], purpose: "圖＋旁白＋ffmpeg 組成影片。",
    entry: ["lib/content/blocks/video-pipeline.ts"], covers: ["video/pipeline"], usedBy: ["content", "video"] }),
  block({ no: "B-014", layer: "content", name: "影片草稿準備", status: ["registered"], purpose: "/api/video/draft 收斂到這一顆：準備腳本與素材。",
    entry: ["lib/content/blocks/video-prepare.ts"], covers: ["video/prepare"], usedBy: ["content", "video"] }),
  block({ no: "B-015", layer: "content", name: "影片快速輸出", status: ["registered"], purpose: "草稿與工作台快速輸出共用的渲染。",
    entry: ["lib/content/blocks/video-render.ts", "lib/content/video/draft-render.ts"], covers: ["video/render"], usedBy: ["content", "video"] }),

  // ── 生圖 ──
  block({ no: "B-016", layer: "image", name: "通用生圖", status: ["toolkit"], purpose: "17 個模型的共用生圖入口，輸出統一格式。",
    entry: ["lib/tarot/image-gen.ts"], deps: ["REPLICATE_API_TOKEN", "OPENAI_API_KEY"], usedBy: ["tarot", "studio", "content", "video"] }),
  block({ no: "B-017", layer: "image", name: "生圖模型清單", status: ["toolkit"], purpose: "生圖模型選單與每個模型可帶幾張參考圖。",
    entry: ["lib/studio/model-options.ts"], usedBy: ["studio", "design", "tarot", "app-platform"] }),
  block({ no: "B-018", layer: "image", name: "風格設計工作台", status: ["registered", "ui"],
    purpose: "選模型、風格、主角、參考圖，多模型比較後鎖定風格，輸出可重用的 styleAnchor。",
    entry: ["lib/content/blocks/image-style-design-workbench.ts", "lib/studio/style-design-workbench.ts", "app/(shell)/tools/tarot/TarotStudio.tsx"],
    covers: ["image/style-design-workbench"], deps: ["生圖供應商金鑰", "ANTHROPIC_API_KEY"], usedBy: ["studio", "tarot", "content"],
    note: "介面目前寄在塔羅 Step 1。" }),
  block({ no: "B-019", layer: "image", name: "塔羅單張生圖", status: ["route"], purpose: "塔羅單張與預覽生圖。",
    entry: ["app/api/tools/tarot/generate/route.ts"], usedBy: ["tarot"] }),
  block({ no: "B-020", layer: "image", name: "塔羅整副批次", status: ["route"], purpose: "背景批次生成整副 78 張。",
    entry: ["app/api/tools/tarot/batch/"], deps: ["Trigger.dev"], usedBy: ["tarot"] }),
  block({ no: "B-021", layer: "image", name: "商品圖生圖", status: ["route"], purpose: "Studio／POD 商品圖生圖；照片專業版 AI 修圖面板也呼叫它。",
    entry: ["app/api/tools/studio/generate/route.ts"], usedBy: ["studio", "design"] }),
  block({ no: "B-022", layer: "image", name: "內容配圖", status: ["route"], purpose: "內容工作室媒體庫生圖。",
    entry: ["app/api/content/image/route.ts"], usedBy: ["content"] }),
  block({ no: "B-023", layer: "image", name: "生圖提示詞建議", status: ["route"], purpose: "中文或英文簡述 → 英文美術指令。",
    entry: ["app/api/tools/tarot/suggest-prompt/route.ts"], deps: ["ANTHROPIC_API_KEY"], usedBy: ["tarot", "studio"] }),
  block({ no: "B-024", layer: "image", name: "藝術風格庫", status: ["toolkit"], purpose: "103 個風格（畫家、媒材、風格），中文顯示、英文進模型。",
    entry: ["public/editor-shared/art-styles.js", "app/(shell)/tools/tarot/tarotStyles.ts"], usedBy: ["design", "tarot", "studio", "video"] }),
  block({ no: "B-025", layer: "image", name: "影片風格庫", status: ["toolkit"], purpose: "B-024＋影片預設合併成影片工作台的風格清單。",
    entry: ["public/editor-shared/video-styles.js"], usedBy: ["video", "design"] }),

  // ── AI 提示詞 ──
  block({ no: "B-026", layer: "ai", name: "AI 修圖指令", status: ["registered", "route", "ui"],
    purpose: "已生成的圖＋想怎麼改 → 英文修圖指令；共用面板掛在塔羅、商品設計、模型圖。",
    entry: ["lib/content/blocks/ai-image-edit-prompt.ts", "lib/studio/image-edit-prompt.ts", "app/api/tools/studio/edit-prompt/route.ts", "components/tools/ImageEditPromptPanel.tsx"],
    covers: ["ai/image-edit-prompt"], deps: ["ANTHROPIC_API_KEY 或 OPENAI_API_KEY"], usedBy: ["studio", "tarot", "design"] }),

  // ── 影像處理 ──
  block({ no: "B-027", layer: "process", name: "網頁／印刷烘焙", status: ["route"], purpose: "套調色後輸出 WebP（網頁）或 PDF（印刷）。",
    entry: ["app/api/tools/image/process/route.ts"], deps: ["Sharp", "Ghostscript"], usedBy: ["studio"] }),
  block({ no: "B-028", layer: "process", name: "調色（伺服器烘焙）", status: ["toolkit", "ui"],
    purpose: "色相、飽和、色階、銳利度，Sharp 烘焙進商品圖與印刷檔；塔羅、商品設計用。",
    entry: ["lib/studio/color-grade.ts", "components/tools/ColorGradePanel.tsx"], usedBy: ["studio", "tarot", "design"],
    note: "與 B-029 共用同一組調色參數（drift 測試守）；這顆在伺服器烘焙，B-029 在瀏覽器即時預覽，兩個執行環境各一顆。" }),
  block({ no: "B-029", layer: "process", name: "調色（編輯器）", status: ["toolkit", "ui"],
    purpose: "畫布與專業版編輯器的調色面板：預設風格、色階、色彩平衡、Camera RAW、HSL；調整存在圖片上。",
    entry: ["public/editor-shared/color-grade.js", "public/editor-shared/blocks/color-grade.js", "lib/studio/editor-color-grade.ts"], covers: ["panel/color-grade"],
    usedBy: ["design", "studio"], note: "與 B-028 共用同一組調色參數（lib/studio/__tests__/editor-color-grade-drift.test.ts 守）。" }),
  block({ no: "B-030", layer: "process", name: "商品頁方圖", status: ["toolkit"], purpose: "輸出商品頁正方形 WebP。",
    entry: ["lib/studio/to-product-image.ts"], deps: ["Sharp"], usedBy: ["studio"] }),
  block({ no: "B-031", layer: "process", name: "印刷檔與放大", status: ["toolkit"], purpose: "POD 印刷檔與高解析放大。",
    entry: ["lib/studio/print-file.ts", "lib/studio/to-print-file.ts", "lib/studio/upscaler.ts"], deps: ["Sharp"], usedBy: ["studio"] }),
  block({ no: "B-032", layer: "process", name: "平拍合成", status: ["toolkit"], purpose: "把真設計圖忠實合成到平拍衣服上。",
    entry: ["lib/studio/flatlay.ts"], deps: ["Sharp"], usedBy: ["studio"] }),
  block({ no: "B-033", layer: "process", name: "去背", status: ["route", "ui"], purpose: "AI 去背 API＋編輯器去背面板（吸色去除、AI 去背、還原）。",
    entry: ["app/api/tools/studio/remove-bg/route.ts", "lib/studio/bg-remover.ts", "public/editor-shared/bg-remove.js", "public/editor-shared/blocks/bg-remove.js", "lib/studio/editor-bg-remove.ts"],
    covers: ["panel/bg-remove"], deps: ["Replicate"], usedBy: ["studio", "design"] }),
  block({ no: "B-034", layer: "process", name: "AI 去除／生成填色", status: ["route", "ui"], purpose: "局部重繪、物件移除、生成填色；照片專業版面板與 Studio 共用。",
    entry: ["app/api/tools/studio/genfill/route.ts", "lib/studio/generative-fill.ts", "app/api/tools/studio/inpaint/route.ts", "lib/studio/inpaint.ts", "public/editor-shared/blocks/ai-fill.js"],
    covers: ["panel/ai-fill"], deps: ["Replicate"], usedBy: ["studio", "design"] }),
  block({ no: "B-035", layer: "process", name: "My Designs 圖庫", status: ["route", "ui", "toolkit"], purpose: "設計圖存、取、刪、上傳；各工具與編輯器面板共用。",
    entry: ["app/api/tools/designs/route.ts", "lib/studio/design-upload.ts", "public/editor-shared/blocks/my-designs.js"],
    covers: ["panel/my-designs"], deps: ["R2", "Supabase"], usedBy: ["design", "studio", "tarot", "content", "video"] }),

  // ── POD 電商 ──
  block({ no: "B-036", layer: "pod", name: "商品規格表", status: ["toolkit"], purpose: "顏色 × 尺寸變體、SKU 與價格規則。",
    entry: ["lib/studio/pod-product.ts"], usedBy: ["studio"] }),
  block({ no: "B-037", layer: "pod", name: "POD 上架與履約", status: ["route"],
    purpose: "建 Woo 草稿商品、查 Printful 同步、綁變體、建 Printful 原生商品、Woo 訂單 → Printful 草稿訂單（不送印）。",
    entry: ["app/api/tools/publish/route.ts", "lib/studio/print-provider.ts"], deps: ["wp-bridge", "PRINTFUL_API_KEY"], usedBy: ["studio", "content"] }),
  block({ no: "B-038", layer: "pod", name: "Woo 訂單驗簽", status: ["toolkit"], purpose: "驗簽並解析 Woo 訂單品項。",
    entry: ["lib/studio/woo-webhook.ts"], usedBy: ["studio"] }),
  block({ no: "B-039", layer: "pod", name: "Printful 同步 API", status: ["route"], purpose: "list／get／catalog／link。",
    entry: ["app/api/tools/printful/sync/route.ts"], usedBy: ["studio", "design"] }),
  block({ no: "B-040", layer: "pod", name: "Printful 模型圖", status: ["route"], purpose: "Printful 商品模型圖生成。",
    entry: ["app/api/tools/studio/mockup/route.ts", "lib/studio/printful-mockup.ts"], usedBy: ["studio", "design"] }),

  // ── 前端面板 ──
  panel("B-041", "templates", "範本庫", "常用尺寸範本一鍵套用。"),
  panel("B-042", "webp", "匯出 WebP（≤200KB）", "自動壓到 200KB 以下輸出。"),
  panel("B-043", "qr", "QR Code", "產生向量 QR Code。"),
  panel("B-044", "barcode", "條碼", "產生向量條碼。"),
  panel("B-045", "mockup", "模型圖預覽", "把設計套到商品模型上預覽（瀏覽器端）。"),
  panel("B-046", "batch-export", "批次多尺寸匯出", "一次輸出多種尺寸。"),
  panel("B-047", "genfx", "擴圖／色調分離", "AI 擴圖與色調分離。", { note: PHOTO }),
  panel("B-048", "ai-edit", "AI 修圖", "一句話請 AI 改圖（呼叫 B-021）。", { note: PHOTO }),
  panel("B-049", "edge-mask", "邊緣遮罩", "替圖片加筆刷風格邊緣。", { note: PHOTO }),
  block({ no: "B-050", layer: "ui", name: "畫布工具組", status: ["ui"], purpose: "基本形狀、物件鎖定、下載 PNG／WebP。",
    entry: ["app/(shell)/tools/canvas/CanvasEditor.tsx"], usedBy: ["design"] }),
  block({ no: "B-051", layer: "ui", name: "塔羅輸出軌", status: ["ui"], purpose: "塔羅印刷與匯出。", entry: ["app/(shell)/tools/tarot/TarotStudio.tsx"], usedBy: ["tarot"] }),
  block({ no: "B-052", layer: "ui", name: "商品設計輸出軌", status: ["ui"], purpose: "Studio 網頁與匯出。", entry: ["app/(shell)/tools/studio/StudioWorkbench.tsx"], usedBy: ["studio"] }),
  retired("B-053", "smart-guides", "智慧磁吸對齊", "拖動時自動對齊。"),
  retired("B-054", "arc-text", "弧形文字", "環形／弧形排字。"),
  retired("B-055", "crop-marks", "出血與裁切標記", "印刷出血與裁切線。"),
  retired("B-056", "text-path", "文字沿路徑", "文字沿路徑排列。"),
  retired("B-057", "simplify", "路徑簡化", "減少路徑節點。"),

  // ── 規劃中 ──
  planned("B-058", "image", "通用生圖正式積木", "把 B-016 包成正式註冊積木。", ["tarot", "studio", "content", "video"]),
  planned("B-059", "image", "風格工作台介面轉接", "塔羅／POD／Studio 直接吃 B-018 的 styleAnchor。", ["tarot", "studio"]),
  planned("B-060", "content", "延伸品質檢查", "抄襲、內鏈、FAQ、Alt、A/B。", ["content"]),
  planned("B-061", "content", "發佈到 YouTube", "影片直接發到 YouTube。", ["content", "video"]),
  planned("B-062", "content", "發佈到 Postiz", "社群層派送。", ["content", "social"]),
  planned("B-063", "pod", "Woo 履約資料", "商品與變體寫入完整 POD 履約資料。", ["studio"]),
  planned("B-064", "pod", "履約對帳帳本", "Woo 訂單 ↔ Printful 草稿訂單對帳。", ["studio"]),
  planned("B-065", "pod", "物流回寫", "Printful 物流 webhook → WooCommerce。", ["studio"]),

  // ── 產品模組 ──
  productModule("M-01", "outreach", "外聯", "找客戶、查證據、產信、輪流寄、回信停後續。", ["outbound-os"]),
  productModule("M-02", "content", "內容", "熱門話題 → 文章／貼文 → 檢查 → 發佈。", ["content", "video"]),
  productModule("M-03", "social", "社群", "社群貼文改寫、排程、派送與數據。", ["social"]),
  productModule("M-04", "video", "影片", "腳本、鏡頭、剪輯、旁白到輸出。", ["video"]),
  productModule("M-05", "tarot", "塔羅", "塔羅牌圖片、提示詞與整副批次。", ["tarot"]),
  productModule("M-06", "studio", "商品設計", "POD 商品圖、文案、修圖與訂單收件。", ["studio"]),
  productModule("M-07", "design", "設計編輯器", "向量／照片專業版、畫布、橫幅、模型圖。", ["design"]),
  productModule("M-08", "cs", "AI 客服", "依知識庫回答，必要時交給真人。", ["cs"]),
  productModule("M-09", "collect", "資料蒐集", "蒐集外部資料，存成可引用來源。", ["collect", "cognitive-os", "outbound-os"]),
  productModule("M-10", "hci", "HCI-30", "人機互動研究與持續監測。", ["hci30"]),
  productModule("M-11", "cognitive", "認知工程", "認知方法、研究資料與專案組合平台（獨立資料庫）。", ["cognitive-os"]),

  // ── 認知方法族 ──
  method("C-01", "architecture", "架構", 10, "ADR、ATAM、DDD、事件風暴、取捨矩陣。"),
  method("C-02", "art_therapy", "藝術治療", 17, "藝術反思的觀察與詮釋。"),
  method("C-03", "association", "聯想", 6, "概念聯想與連結。"),
  method("C-04", "causal", "因果", 10, "因果推論與因果圖。"),
  method("C-05", "challenge", "挑戰", 10, "反方論證、紅隊。"),
  method("C-06", "computation", "運算", 1, "運算型分析。"),
  method("C-07", "database_data", "資料", 10, "資料建模與資料品質。"),
  method("C-08", "decision", "決策", 14, "多準則決策、決策樹。"),
  method("C-09", "decomposition", "拆解", 9, "把問題拆成可處理的部分。"),
  method("C-10", "delivery", "交付", 11, "專案交付與排程。"),
  method("C-11", "devops_sre", "DevOps／SRE", 13, "可靠性、事故檢討、SLO。"),
  method("C-12", "divergent", "發散", 16, "腦力激盪與創意發想。"),
  method("C-13", "epistemic", "知識論", 10, "證據強度與不確定性。"),
  method("C-14", "evidence", "證據", 1, "證據整理。"),
  method("C-15", "experiment", "實驗", 11, "實驗設計與 A/B。"),
  method("C-16", "feasibility", "可行性", 9, "技術與商業可行性。"),
  method("C-17", "finance", "財務", 1, "財務分析。"),
  method("C-18", "foresight", "前瞻", 14, "情境規劃與趨勢。"),
  method("C-19", "framing", "框定", 15, "重新定義問題。"),
  method("C-20", "insight", "洞察", 9, "從資料找洞察。"),
  method("C-21", "jurisdiction", "法域", 10, "法規與管轄分析。"),
  method("C-22", "knowledge", "知識", 2, "知識整理與傳遞。"),
  method("C-23", "learning", "學習", 11, "學習設計與回顧。"),
  method("C-24", "representation", "表徵", 11, "圖示化與模型化。"),
  method("C-25", "research", "研究", 17, "質性編碼、三角驗證、研究報告。"),
  method("C-26", "root_cause", "根因", 9, "5 Whys、魚骨圖。"),
  method("C-27", "security", "資安", 10, "威脅建模與資安評估。"),
  method("C-28", "stakeholders", "利害關係人", 10, "利害關係人地圖與溝通。"),
  method("C-29", "strategy", "策略", 17, "競爭策略與定位。"),
  method("C-30", "systems", "系統思考", 12, "回饋迴路與系統動力。"),
];

export const isLive = (b: LegoBlock) => !b.status.includes("planned") && !b.status.includes("retired");

/** Live 功能積木 a system uses, in number order. */
export function blocksForSystem(slug: string, blocks: LegoBlock[] = LEGO_BLOCKS): LegoBlock[] {
  return blocks.filter((b) => b.tier === "block" && isLive(b) && b.usedBy.includes(slug));
}

export function blockStats(blocks: LegoBlock[] = LEGO_BLOCKS) {
  const live = blocks.filter((b) => b.tier === "block" && isLive(b));
  return {
    live: live.length,
    shared: live.filter((b) => b.usedBy.length >= 2).length,
    planned: blocks.filter((b) => b.status.includes("planned")).length,
    retired: blocks.filter((b) => b.status.includes("retired")).length,
    modules: blocks.filter((b) => b.tier === "module").length,
    methods: blocks.filter((b) => b.tier === "method").length,
  };
}

/** /ops/systems/blocks URL. Defaults (view=systems, tier=block) are left out; every link to the page goes through here. */
export type CatalogView = "systems" | "blocks" | "diagram";
export function catalogHref(p: { view?: CatalogView; tier?: Tier; layer?: BlockLayer | null; sys?: string | null; q?: string | null } = {}): string {
  const q = new URLSearchParams();
  if (p.view && p.view !== "systems") q.set("view", p.view);
  if (p.tier && p.tier !== "block") q.set("tier", p.tier);
  if (p.layer) q.set("layer", p.layer);
  if (p.sys) q.set("sys", p.sys);
  if (p.q) q.set("q", p.q);
  const s = q.toString();
  return `/ops/systems/blocks${s ? `?${s}` : ""}`;
}
