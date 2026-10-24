'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { OpsInboxBadge } from './(shell)/ops/inbox/components/OpsInboxBadge';
import type { SavedLayout } from '../lib/theme/tokens';

// ── Nav data ────────────────────────────────────────────────────────────────
export type NavItem =
  | { type: 'link';     href: string; icon: string; label: string; title?: string; badge?: 'ops-inbox' }
  | { type: 'ext';      href: string; icon: string; label: string }
  | { type: 'disabled'; icon: string; label: string };

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

// Order follows the work: win and build a client → keep the client running → the services we run for
// clients (content tools, marketing, outreach, knowledge, CS) → keeping the platform running.
// Labels are English only (sidebar-coverage.test.ts checks); the Chinese explanation lives in `title`.
// Every built page under app/(shell) is linked here or listed in __tests__/sidebar-coverage.test.ts
// with where it is reached from, so a new page fails that test until it is placed.
// Section ids build-onboard / repair-control are mirrored by the dashboard (app/(shell)/page.tsx).
export const DEFAULT_SECTIONS: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { type: 'link', href: '/', icon: '◈', label: 'Dashboard' },
    ],
  },
  // ── 建站三步序列（intake → 技術精靈 → 部署）刻意相鄰且照順序，對映 MASTER PLAN §1
  // 資料流：submit → generate-spec → trigger-build → create-wp-site。
  // 招新客（生新站）與下方 Clients（顧舊客）刻意分區。
  {
    id: 'build-onboard',
    label: 'Build & Onboard',
    items: [
      { type: 'link', href: '/ops/onboarding', icon: '✨', label: 'Client Intake', title: '建站第 1 步：客戶探索式問卷' },
      { type: 'link', href: '/onboard',        icon: '✦', label: 'Site Wizard',   title: '建站第 2 步：技術建站精靈' },
      { type: 'link', href: '/build',          icon: '⚡', label: 'Build Console', title: '建站第 3 步：部署執行（plan_only 或 enqueue）' },
    ],
  },
  // ── 既有客戶的監看 / 串接 / 例行工作（營運面，非新建站）
  {
    id: 'clients-ops',
    label: 'Clients',
    items: [
      { type: 'link', href: '/ops/clients',         icon: '👥', label: 'All Clients',     title: '全客戶健康狀態 + WP 外掛更新' },
      { type: 'link', href: '/tools/content/sites', icon: '🌐', label: 'WordPress Sites', title: '新增、編輯、移除客戶 WP 連線' },
      { type: 'link', href: '/ops/integrations',    icon: '⇄', label: 'Integrations',    title: '客戶工具串接狀態' },
      { type: 'link', href: '/ops/schedules',       icon: '⏱', label: 'Schedules',       title: '所有客戶的例行工作：自動爬取、網站巡檢' },
    ],
  },
  // ── Content Tools：產出內容的工具（文章、影片、塔羅、商品圖、banner、編輯器）；Marketing 負責排程與發布
  {
    id: 'content-tools',
    label: 'Content Tools',
    items: [
      { type: 'link',     href: '/tools/content',       icon: '✍', label: 'SEO Articles',  title: 'SEO/GEO 文章產出' },
      { type: 'link',     href: '/tools/video',         icon: '🎬', label: 'Video Studio',  title: '影片生成工具' },
      { type: 'link',     href: '/tools/tarot',         icon: '🔮', label: 'Tarot Studio',  title: '塔羅牌印刷檔生成工具' },
      { type: 'link',     href: '/tools/studio',        icon: '✏', label: 'POD Studio',    title: 'POD 設計生成器' },
      { type: 'link',     href: '/tools/mockup',        icon: '👕', label: 'Mockup',        title: 'AI 擬真商品照' },
      { type: 'link',     href: '/tools/banner',        icon: '🖼', label: 'Banner Studio', title: 'Social media banner 生成工具' },
      { type: 'link',     href: '/tools/canvas',        icon: '🎨', label: 'Canvas Editor', title: 'Fabric.js 快速編輯 Canvas' },
      { type: 'link',     href: '/tools/vector-editor', icon: '✒', label: 'Vector Editor', title: '向量設計工具（14 積木）' },
      { type: 'link',     href: '/tools/designs',       icon: '🗂', label: 'My Designs',    title: '已儲存設計庫（R2 持久化）' },
      { type: 'link',     href: '/tools/publish',       icon: '🛒', label: 'Publish',       title: '一鍵上架 Woo + Printful' },
      { type: 'disabled', icon: '◧', label: 'Templates' },
    ],
  },
  // ── Marketing：排程 → 找題材 → 社群發布；開發信是另一條獨立流程，緊接在後
  {
    id: 'marketing',
    label: 'Marketing',
    items: [
      { type: 'link', href: '/tools/content/calendar', icon: '🗓', label: 'Content Calendar', title: '文章排程與發布日曆' },
      { type: 'link', href: '/tools/events',           icon: '🌍', label: 'Events Calendar',  title: '全球活動行事曆：運動賽事、國家與文化節慶，找內容題材' },
      { type: 'link', href: '/tools/social',           icon: '📣', label: 'Social Posts',     title: '多品牌社群排程（ADR 016）' },
    ],
  },
  {
    id: 'cold-outreach',
    label: 'Cold Outreach',
    items: [
      { type: 'link', href: '/outreach',            icon: '📣', label: 'Outreach Dashboard', title: '冷拜訪作戰中心' },
      { type: 'link', href: '/outreach/inbox',      icon: '📥', label: 'Lead Inbox',         title: '名單收件匣（去重 + suppression）' },
      { type: 'link', href: '/outreach/leads',      icon: '🎯', label: 'Leads',              title: '冷名單庫（三分數 + 優先級）' },
      { type: 'link', href: '/outreach/review',     icon: '📝', label: 'Message Review',     title: '文案審核中心（Cold Gate + Evidence）' },
      { type: 'link', href: '/outreach/drafts',     icon: '🗒', label: 'Draft Queue',        title: '草稿審核佇列' },
      { type: 'link', href: '/outreach/followups',  icon: '⏰', label: 'Follow-ups',         title: '跟進任務（不漏）' },
      { type: 'link', href: '/outreach/replies',    icon: '💬', label: 'Replies',            title: '回覆處理（Reply Copilot）' },
      { type: 'link', href: '/outreach/connectors', icon: '🔌', label: 'Connectors',         title: '免費工具 + 客戶 BYO-key' },
      { type: 'link', href: '/outreach/settings',   icon: '⚙', label: 'Outreach Settings',  title: '服務檔 / 禁用詞 / Suppression / 同步規則' },
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
    label: 'Knowledge & Data',
    items: [
      { type: 'link', href: '/ops/collect',   icon: '🛰', label: 'Data Collection', title: '資料蒐集：選來源（網頁／Sitemap／RSS／學術／官方 API／影片／全網搜尋）、試跑、正式抓取' },
      { type: 'link', href: '/ops/knowledge', icon: '📚', label: 'Knowledge Base',  title: '所有客戶的知識文件總覽（出處標籤、版本、切片數）；編輯在 客戶中心 →「客服」分頁' },
    ],
  },
  {
    id: 'customer-service',
    label: 'Customer Service',
    items: [
      { type: 'link',     href: '/ops/cs',    icon: '💬', label: 'CS Overview',       title: 'AI 客服營運中心：意圖 / 成效 / kill-switch；知識庫在 Knowledge & Data' },
      { type: 'link',     href: '/cs-widget', icon: '🗨', label: 'CS Widget Preview', title: '客服聊天視窗試玩（假資料，尚未接 Chatwoot）' },
      { type: 'ext',      href: 'https://chatwoot.aware-wave.com/app', icon: '💭', label: 'Chatwoot' },
      { type: 'disabled', icon: '🎚', label: 'Intents & Tiers' },
      { type: 'disabled', icon: '🧪', label: 'Eval & Simulation' },
    ],
  },
  // ── AI 維修主控台 + 事件 + 全域控制閘（簽核 / kill-switch）+ 健康；與首頁 dashboard 同名區一致
  {
    id: 'repair-control',
    label: 'Repair & Control',
    items: [
      { type: 'link', href: '/ops/repairs',      icon: '🛠', label: 'Repair Center', badge: 'ops-inbox', title: 'AI 維修主控台' },
      { type: 'link', href: '/ops/inbox',        icon: '◇', label: 'Ops Inbox',            title: '事件收斂中心' },
      { type: 'link', href: '/ops/approvals',    icon: '✓', label: 'Approvals',            title: '高風險指令簽核佇列' },
      { type: 'link', href: '/ops/system-modes', icon: '◐', label: 'System Modes',         title: '全域 Kill Switch / 維護模式' },
      { type: 'link', href: '/ops/backup',       icon: '⛁', label: 'Backups',              title: '每個資料庫的備份與 R2 離機狀態' },
      { type: 'link', href: '/api-check',        icon: '⬡', label: 'API Health',           title: 'Node API 健康（server-side）' },
      { type: 'link', href: '/api-check-client', icon: '⬡', label: 'API Health (browser)', title: 'Node API 健康（browser-side）' },
    ],
  },
  {
    id: 'ai',
    label: 'AI Models & Costs',
    items: [
      { type: 'link', href: '/ops/costs',       icon: '$', label: 'AI Costs',          title: 'LLM 呼叫花費帳本' },
      { type: 'link', href: '/ops/billing',     icon: '¤', label: 'Billing',           title: '每個付費帳戶的合約、權利、點數與付款（唯讀）' },
      { type: 'link', href: '/tools/ai-models', icon: '⚖', label: 'AI Models',         title: '模型比較（價格、速度、用途）＋圖片模型規格（能讀多長、參考圖、改寫）兩個分頁' },
      { type: 'link', href: '/ops/tools',       icon: '🧰', label: 'AI Tools & Alerts', title: '外部 AI 工具清單 + 事件通知管道' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { type: 'link', href: '/ops/products', icon: '▤', label: 'Products',     title: '產品登記表：門、販售狀態、收費功能' },
      { type: 'link', href: '/ops-console',  icon: '▣', label: 'Ops Console',  title: '架構邊界 · Tenant 設定 · M3 · AI Job' },
      { type: 'link', href: '/tools/theme',  icon: '🎨', label: 'Theme Editor', title: '主題色票 + CSS token 即時編輯器' },
    ],
  },
  {
    id: 'external',
    label: 'External',
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
// A saved order applies only to the exact set it was saved against (sections, or one section's
// items). Once the defaults gain, lose or move an entry the saved order is stale and the default
// wins — otherwise an old Theme Editor save freezes every later regrouping and new entries pile up
// at the bottom.
function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && new Set(a).size === a.length && a.every(x => b.includes(x));
}

export function applyLayout(sections: NavSection[], layout: SavedLayout): NavSection[] {
  const map = new Map(sections.map(s => [s.id, s]));
  const ordered = layout.sectionOrder && sameSet(layout.sectionOrder, sections.map(s => s.id))
    ? layout.sectionOrder.map(id => map.get(id)!)
    : [...sections];

  return ordered.map(sec => {
    const itemOrder = layout.itemOrders?.[sec.id];
    const itemMap = new Map(sec.items.map(item => [itemKey(item), item]));
    if (!itemOrder || !sameSet(itemOrder, [...itemMap.keys()])) return sec;
    return { ...sec, items: itemOrder.map(k => itemMap.get(k)!) };
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
export function activeSectionId(sections: NavSection[], pathname: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const s of sections) {
    for (const item of s.items) {
      if (item.type !== 'link') continue;
      const h = item.href;
      const hit = h === '/' ? pathname === '/' : pathname === h || pathname.startsWith(h + '/');
      if (hit && (!best || h.length > best.len)) best = { id: s.id, len: h.length };
    }
  }
  return best?.id ?? null;
}

// ── Component ────────────────────────────────────────────────────────────────
// `initialLayout` is fetched server-side (app/layout.tsx) from the DB, so the saved sidebar
// order renders identically on every device. No client storage: sections start collapsed except
// the current page's one; open/closed lives in state, which survives navigation (the layout stays
// mounted) and resets on reload.
export function SidebarNav({ initialLayout }: { initialLayout?: SavedLayout | null }) {
  const sections = initialLayout ? applyLayout(DEFAULT_SECTIONS, initialLayout) : DEFAULT_SECTIONS;
  const pathname = usePathname() ?? '/';
  const active = activeSectionId(sections, pathname);
  const [open, setOpen] = useState<Set<string>>(() => new Set(active ? [active] : []));

  // Navigating into a collapsed section (e.g. from a dashboard card) opens it.
  useEffect(() => {
    if (active) setOpen(prev => (prev.has(active) ? prev : new Set(prev).add(active)));
  }, [active]);

  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <>
      {sections.map(section => {
        // A one-item section (Overview) has nothing to fold.
        const foldable = section.items.length > 1;
        const isOpen = !foldable || open.has(section.id);
        const hasBadge = section.items.some(i => i.type === 'link' && i.badge === 'ops-inbox');
        return (
        <div key={section.id} className="sidebar-section">
          {foldable ? (
            <button type="button" className="sidebar-section-label sidebar-section-toggle"
              aria-expanded={isOpen} onClick={() => toggle(section.id)}>
              <span className="sidebar-chevron" aria-hidden>{isOpen ? '▾' : '▸'}</span>
              {section.label}
              {!isOpen && hasBadge && <OpsInboxBadge />}
            </button>
          ) : (
            <div className="sidebar-section-label">{section.label}</div>
          )}
          {isOpen && section.items.map((item, i) => {
            if (item.type === 'disabled') {
              return (
                <span key={i} className="sidebar-link-disabled">
                  <span className="sidebar-icon">{item.icon}</span> {item.label}
                  <span className="sidebar-coming-soon">Soon</span>
                </span>
              );
            }
            if (item.type === 'ext') {
              return (
                <a key={item.href} href={item.href} target="_blank" rel="noreferrer" className="sidebar-link">
                  <span className="sidebar-icon">{item.icon}</span> {item.label}
                  <span className="sidebar-ext">↗</span>
                </a>
              );
            }
            return (
              <Link key={item.href} href={item.href} className="sidebar-link" title={item.title}>
                <span className="sidebar-icon">{item.icon}</span> {item.label}
                {item.badge === 'ops-inbox' && <OpsInboxBadge />}
              </Link>
            );
          })}
        </div>
        );
      })}
    </>
  );
}
