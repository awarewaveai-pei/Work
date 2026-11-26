// The sidebar's links and its pure helpers. A plain module (not 'use client') so server code can read the list: the
// shell layout filters it by the staff member's tool grant (lib/staff-access.ts) before NavRail renders it.
import type { SavedLayout } from '../lib/theme/tokens';

// ── Nav data ────────────────────────────────────────────────────────────────
export type NavItem =
  // newTab: opens in a new tab (a full-window page under app/(full), which has no sidebar to come back by).
  // under: the href of the link this one is a sub-page of; drawn indented right below it (keep it right after it).
  | { type: 'link';     href: string; icon: string; label: string; title?: string; badge?: 'ops-inbox'; newTab?: true; under?: string }
  | { type: 'ext';      href: string; icon: string; label: string }
  | { type: 'disabled'; icon: string; label: string };

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

// Order follows the work: win and build a client → keep the client running → the services we run for
// clients (content tools, marketing, outreach, knowledge, CS) → keeping the platform running.
// Labels are Traditional Chinese (operator 2026-10-25: everything the operator reads); only the external tools' own
// names stay (sidebar-coverage.test.ts checks). The longer explanation lives in `title`.
// Every built page under app/(shell) and app/(full) is linked here or listed in __tests__/sidebar-coverage.test.ts
// with where it is reached from, so a new page fails that test until it is placed.
// Section ids build-onboard / repair-control are mirrored by the dashboard (app/(shell)/page.tsx).
export const DEFAULT_SECTIONS: NavSection[] = [
  {
    id: 'overview',
    label: '總覽',
    items: [
      { type: 'link', href: '/', icon: '◈', label: '儀表板' },
    ],
  },
  // ── 客戶建站只有一條流程：/ops/sites/new → 建站流程頁（SITE-FLOW-COMPLETION-PLAN.md §1 第 2 列）。
  // 客戶問卷是選用的需求問卷，問完帶著規格去 /ops/sites/new，不是建站的一步。
  // 招新客（生新站）與下方 Clients（顧舊客）刻意分區。
  {
    id: 'build-onboard',
    label: '建站與開通',
    items: [
      { type: 'link', href: '/ops/sites/new',  icon: '✦', label: '新增客戶網站', title: '新增客戶網站，接著在建站流程頁一步一步建好' },
      { type: 'link', href: '/ops/onboarding', icon: '✨', label: '客戶問卷', title: '選用的客戶需求問卷，問完帶著規格去新增客戶網站' },
    ],
  },
  // ── 既有客戶的監看 / 串接 / 例行工作（營運面，非新建站）
  {
    id: 'clients-ops',
    label: '客戶',
    items: [
      { type: 'link', href: '/ops/clients',         icon: '👥', label: '全部客戶',     title: '全客戶健康狀態 + WP 外掛更新' },
      { type: 'link', href: '/tools/content/sites', icon: '🌐', label: '客戶網站', title: '新增、編輯、移除客戶 WP 連線' },
      { type: 'link', href: '/ops/integrations',    icon: '⇄', label: '工具串接',    title: '客戶工具串接狀態' },
      { type: 'link', href: '/ops/schedules',       icon: '⏱', label: '例行排程',       title: '所有客戶的例行工作：自動爬取、網站巡檢' },
    ],
  },
  // ── Content Tools：產出內容的工具（文章、影片、塔羅、商品圖、banner、編輯器）；Marketing 負責排程與發布
  {
    id: 'content-tools',
    label: '內容工具',
    items: [
      { type: 'link',     href: '/tools/content',       icon: '✍', label: '寫文章',  title: 'SEO/GEO 文章產出' },
      { type: 'link',     href: '/tools/content/rewrite', icon: '·', label: '改寫', title: '把現成文字人性化或做 SEO 改寫', under: '/tools/content' },
      { type: 'link',     href: '/tools/content/drafts',  icon: '·', label: '草稿', title: '產文完成自動儲存的草稿；開啟後回到寫文章頁', under: '/tools/content' },
      { type: 'link',     href: '/tools/video',         icon: '🎬', label: '影片工作台', title: '影片工作台：腳本、做片、審片、發布（開新分頁）' },
      { type: 'link',     href: '/tools/tarot',         icon: '🔮', label: '塔羅工作台',  title: '塔羅牌印刷檔生成工具' },
      { type: 'link',     href: '/tools/studio',        icon: '✏', label: '設計工作台',    title: 'POD 設計生成器' },
      { type: 'link',     href: '/tools/mockup',        icon: '👕', label: '模型圖',        title: 'AI 擬真商品照' },
      { type: 'link',     href: '/tools/banner',        icon: '🖼', label: '橫幅', title: 'Social media banner 生成工具' },
      { type: 'link',     href: '/tools/canvas',        icon: '🎨', label: '畫布編輯器', title: 'Fabric.js Canvas Editor' },
      { type: 'link',     href: '/tools/vector-pro',    icon: '✒', label: '向量（專業版）',    title: '向量（專業版）：VectorCraft 全視窗＋10 積木，開新分頁', newTab: true },
      { type: 'link',     href: '/tools/photo-pro',     icon: '🖌', label: '修圖（專業版）',     title: '修圖（專業版）：PhotoCraft 全視窗＋積木，開新分頁', newTab: true },
      { type: 'link',     href: '/tools/designs',       icon: '🗂', label: '我的設計',    title: '已儲存設計庫（R2 持久化）' },
      { type: 'link',     href: '/tools/publish',       icon: '🛒', label: '一鍵上架',       title: '一鍵上架 Woo + Printful' },
      { type: 'disabled', icon: '◧', label: '範本' },
    ],
  },
  // ── Marketing：排程 → 找題材 → 社群發布；開發信是另一條獨立流程，緊接在後
  {
    id: 'marketing',
    label: '行銷',
    items: [
      { type: 'link', href: '/tools/content/topics',   icon: '🧭', label: '題目',     title: '全自動內容的題目：一個網站一個月的題目清單' },
      { type: 'link', href: '/tools/content/topics/steps',   icon: '·', label: '五步驟', title: '一個網站的五個步驟：熱搜 → 提案 → 挑題 → 製作 → 發布', under: '/tools/content/topics' },
      { type: 'link', href: '/tools/events',           icon: '🌍', label: '節日行事曆',  title: '全球活動行事曆：運動賽事、國家與文化節慶，找內容題材' },
      { type: 'link', href: '/tools/social',           icon: '📣', label: '社群貼文',     title: '多品牌社群排程（ADR 016）' },
    ],
  },
  {
    id: 'cold-outreach',
    label: '開發信',
    items: [
      { type: 'link', href: '/tools/outreach/guide',      icon: '📖', label: '操作指南',              title: '外聯系統從設定到寄出的完整操作步驟' },
      { type: 'link', href: '/tools/outreach',            icon: '📣', label: '外聯總覽', title: '冷拜訪作戰中心' },
      { type: 'link', href: '/tools/outreach/inbox',      icon: '📥', label: '匯入名單',         title: '名單收件匣（去重 + suppression）' },
      { type: 'link', href: '/tools/outreach/leads',      icon: '🎯', label: '名單',              title: '冷名單庫（三分數 + 優先級）' },
      { type: 'link', href: '/tools/outreach/review',     icon: '📝', label: '審核信件',     title: '文案審核中心（Cold Gate + Evidence）' },
      { type: 'link', href: '/tools/outreach/followups',  icon: '⏰', label: '追蹤',         title: '跟進任務（不漏）' },
      { type: 'link', href: '/tools/outreach/replies',    icon: '💬', label: '回信',            title: '回覆處理（Reply Copilot）' },
      { type: 'link', href: '/tools/outreach/connectors', icon: '🔌', label: '信箱與連線',         title: '免費工具 + 客戶 BYO-key' },
      { type: 'link', href: '/tools/outreach/settings',   icon: '⚙', label: '外聯設定',  title: '服務檔 / 禁用詞 / Suppression / 同步規則' },
    ],
  },
  {
    // ONE group, in pipeline order: collection brings documents in, the knowledge base is where
    // they land and where every consumer reads them from.
    //
    // Deliberately NOT under Customer Service (ADR 011). The knowledge base is a product in its own
    // right; customer service is its first consumer, with SEO writing, cold outreach and research
    // to follow. K0 spent a stage pulling lib/kb out of lib/cs — filing it back under 客服 in the
    // navigation would teach every future reader the shape we just removed.
    id: 'knowledge-data',
    label: '知識與資料',
    items: [
      { type: 'link', href: '/ops/collect',   icon: '🛰', label: '資料蒐集', title: '資料蒐集：選來源（網頁／Sitemap／RSS／學術／官方 API／影片／全網搜尋）、試跑、正式抓取' },
      { type: 'link', href: '/ops/knowledge', icon: '📚', label: '知識庫',  title: '所有客戶的知識文件總覽（出處標籤、版本、切片數）；編輯在 客戶中心 →「客服」分頁' },
    ],
  },
  {
    id: 'customer-service',
    label: '客服',
    items: [
      { type: 'link',     href: '/ops/cs',    icon: '💬', label: '客服總覽',       title: 'AI 客服營運中心：意圖 / 成效 / kill-switch；知識庫在 Knowledge & Data' },
      { type: 'link',     href: '/cs-widget', icon: '🗨', label: '客服視窗預覽', title: '客服聊天視窗試玩（假資料，尚未接 Chatwoot）' },
      { type: 'ext',      href: 'https://chatwoot.aware-wave.com/app', icon: '💭', label: 'Chatwoot' },
      { type: 'disabled', icon: '🎚', label: '意圖與分級' },
      { type: 'disabled', icon: '🧪', label: '評測與模擬' },
    ],
  },
  // ── AI 維修主控台 + 事件 + 全域控制閘（簽核 / kill-switch）+ 健康；與首頁 dashboard 同名區一致
  {
    id: 'repair-control',
    label: '維修與控制',
    items: [
      { type: 'link', href: '/ops/repairs',      icon: '🛠', label: '維修中心', badge: 'ops-inbox', title: 'AI 維修主控台' },
      { type: 'link', href: '/ops/inbox',        icon: '◇', label: '事件收件匣',            title: '事件收斂中心' },
      { type: 'link', href: '/ops/approvals',    icon: '✓', label: '簽核',            title: '高風險指令簽核佇列' },
      { type: 'link', href: '/ops/system-modes', icon: '◐', label: '系統模式',         title: '全域 Kill Switch / 維護模式' },
      { type: 'link', href: '/ops/backup',       icon: '⛁', label: '備份',              title: '每個資料庫的備份與 R2 離機狀態' },
      { type: 'link', href: '/api-check',        icon: '⬡', label: 'API 健康',           title: 'Node API 健康（server-side）' },
      { type: 'link', href: '/api-check-client', icon: '⬡', label: 'API 健康（瀏覽器）', title: 'Node API 健康（browser-side）' },
    ],
  },
  {
    id: 'ai',
    label: 'AI 模型與成本',
    items: [
      { type: 'link', href: '/ops/costs',       icon: '$', label: 'AI 成本',          title: 'LLM 呼叫花費帳本' },
      { type: 'link', href: '/ops/billing',     icon: '¤', label: '帳務',           title: '全部帳戶的合計與需要處理的帳戶；單一客戶看客戶頁的帳務分頁（唯讀）' },
      { type: 'link', href: '/ops/sellers',     icon: '⇄', label: '賣家',           title: '收銀台網站：登記、停用，每個網站一把鑰匙，由鑰匙查出賣家' },
      { type: 'link', href: '/ops/plans',       icon: '☰', label: '方案',             title: '方案：每個方案開通哪些功能、哪些用點數付（價格在 WooCommerce）' },
      { type: 'link', href: '/tools/ai-models', icon: '⚖', label: 'AI 模型',         title: '模型比較（價格、速度、用途）＋圖片模型規格（能讀多長、參考圖、改寫）兩個分頁' },
      { type: 'link', href: '/tools/edit-guide', icon: '🖼', label: '改圖指南',        title: '改圖怎麼挑：修圖專業版的 AI 面板什麼時候留空、什麼時候打字、每顆模型鈕差在哪（2026-11-09 實測對照圖）' },
      { type: 'link', href: '/ops/tools',       icon: '🧰', label: 'AI 工具與通知', title: '外部 AI 工具清單 + 事件通知管道' },
    ],
  },
  {
    id: 'system',
    label: '系統',
    items: [
      { type: 'link', href: '/ops/systems',  icon: '▦', label: '系統總控', title: '每個系統的用途、進度與下一步（擁有者／管理員）' },
      { type: 'link', href: '/ops/products', icon: '▤', label: '產品',     title: '產品登記表：門、販售狀態、收費功能' },
      { type: 'link', href: '/ops/staff',    icon: '👤', label: '員工權限', title: '員工權限：每位員工的角色與可用工具（只有擁有者能改）' },
      { type: 'link', href: '/ops-console',  icon: '▣', label: '營運主控台',  title: '架構邊界 · Tenant 設定 · M3 · AI Job' },
      { type: 'link', href: '/tools/theme',  icon: '🎨', label: '主題編輯器', title: '主題色票 + CSS token 即時編輯器' },
    ],
  },
  {
    id: 'external',
    label: '外部工具',
    items: [
      { type: 'ext', href: 'https://n8n.aware-wave.com',     icon: '⚙', label: 'n8n' },
      { type: 'ext', href: 'https://uptime.aware-wave.com',  icon: '◉', label: 'Uptime Kuma' },
      { type: 'ext', href: 'https://trigger.aware-wave.com', icon: '▶', label: 'Trigger.dev' },
      { type: 'ext', href: 'https://aware-wave.com',         icon: '◻', label: 'WordPress' },
    ],
  },
];

// Saved shape: { sectionOrder: string[], itemOrders: Record<sectionId, string[]> } — see SavedLayout in lib/theme/tokens.
//
// Section order: applies only to the exact set it was saved against; once sections are added, removed or regrouped the
// default wins (an old save must not freeze a regroup). Items inside a section: the saved order is kept for the items
// still there, items no longer in the section drop out, and each new item goes in at its default place (right after the
// item it follows in the defaults) -- adding a page keeps everyone's own order and never piles new pages at the bottom.
function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && new Set(a).size === a.length && a.every(x => b.includes(x));
}

/** A saved item order merged with the current defaults (see above). */
export function mergeItemOrder(saved: readonly string[], defaults: readonly string[]): string[] {
  const live = new Set(defaults);
  const out = saved.filter((k, i) => live.has(k) && saved.indexOf(k) === i);
  defaults.forEach((k, i) => {
    if (out.includes(k)) return;
    out.splice(i === 0 ? 0 : out.indexOf(defaults[i - 1]) + 1, 0, k);
  });
  return out;
}

export function applyLayout(sections: NavSection[], layout: SavedLayout): NavSection[] {
  const map = new Map(sections.map(s => [s.id, s]));
  const ordered = layout.sectionOrder && sameSet(layout.sectionOrder, sections.map(s => s.id))
    ? layout.sectionOrder.map(id => map.get(id)!)
    : [...sections];

  return ordered.map(sec => {
    const itemOrder = layout.itemOrders?.[sec.id];
    const itemMap = new Map(sec.items.map(item => [itemKey(item), item]));
    if (!itemOrder?.length) return sec;
    return { ...sec, items: mergeItemOrder(itemOrder, [...itemMap.keys()]).map(k => itemMap.get(k)!) };
  });
}

// Stable key for an item: href, or label for a disabled one. Never its position — the Theme Editor
// saves keys after a drag and they must match the default list on reload.
export function itemKey(item: NavItem): string {
  if (item.type === 'link' || item.type === 'ext') return item.href;
  return `disabled-${item.label}`;
}

// The section holding the current page: the link with the longest href that is the path or a
// parent of it ('/' only matches itself, or every page would land in Overview).
/** The link the current page belongs to: the longest href that is the path or a parent of it. */
export function activeLink(sections: NavSection[], pathname: string): { sectionId: string; href: string } | null {
  let best: { sectionId: string; href: string } | null = null;
  for (const s of sections) {
    for (const item of s.items) {
      if (item.type !== 'link') continue;
      const h = item.href;
      const hit = h === '/' ? pathname === '/' : pathname === h || pathname.startsWith(h + '/');
      if (hit && (!best || h.length > best.href.length)) best = { sectionId: s.id, href: h };
    }
  }
  return best;
}

export function activeSectionId(sections: NavSection[], pathname: string): string | null {
  return activeLink(sections, pathname)?.sectionId ?? null;
}

/** Keep the links a restricted staff member may open (`mayOpen`), then drop sections left empty. External and
 *  disabled entries are not tools: they show only to an unrestricted viewer (the caller passes no filter then). */
export function visibleSections(sections: NavSection[], mayOpen: (href: string) => boolean): NavSection[] {
  return sections
    .map(s => ({ ...s, items: s.items.filter(i => i.type === 'link' && mayOpen(i.href)) }))
    .filter(s => s.items.length > 0);
}
