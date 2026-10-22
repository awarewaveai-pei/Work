'use client';
import Link from 'next/link';
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

export const DEFAULT_SECTIONS: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { type: 'link', href: '/', icon: '◈', label: 'Dashboard' },
    ],
  },
  // ── Build & Onboard ──────────────────────────────────────────────────────
  // 建站三步序列（intake → 技術精靈 → 部署）刻意相鄰且照順序，對映 MASTER PLAN §1
  // 資料流：submit → generate-spec → trigger-build → create-wp-site。
  // 招新客（生新站）與下方營運/維修（顧舊客）刻意分區。
  {
    id: 'build-onboard',
    label: 'Build & Onboard',
    items: [
      { type: 'link', href: '/ops/onboarding', icon: '✨', label: 'Onboarding（客戶 Intake）', title: '建站第 1 步：客戶探索式問卷' },
      { type: 'link', href: '/onboard',        icon: '✦', label: '建站精靈（技術）',          title: '建站第 2 步：技術建站精靈' },
      { type: 'link', href: '/build',          icon: '⚡', label: 'Build Console',            title: '建站第 3 步：部署執行（plan_only 或 enqueue）' },
    ],
  },
  // ── Clients & Ops ────────────────────────────────────────────────────────
  // 既有客戶的監看 / 串接 / 健康（營運面，非新建站）
  {
    id: 'clients-ops',
    label: 'Clients & Ops',
    items: [
      { type: 'link', href: '/ops/clients',      icon: '👥', label: 'Clients',      title: '全客戶健康狀態 + WP 外掛更新' },
      { type: 'link', href: '/ops/integrations', icon: '⇄', label: 'Integrations', title: '客戶工具串接狀態' },
      { type: 'link', href: '/ops/schedules',    icon: '⏱', label: '排程',          title: '所有客戶的例行工作：自動爬取、網站巡檢' },
      { type: 'link', href: '/api-check',        icon: '⬡', label: 'API Health',    title: 'Node API 健康（server-side）' },
    ],
  },
  // ── Repair & Control ─────────────────────────────────────────────────────
  // AI 維修主控台 + 全域控制閘（簽核 / kill-switch）— 與首頁 dashboard「Actions」區一致
  {
    id: 'repair-control',
    label: 'Repair & Control',
    items: [
      { type: 'link', href: '/ops/repairs',      icon: '🛠', label: 'Repair Center', badge: 'ops-inbox', title: 'AI 維修主控台' },
      { type: 'link', href: '/ops/approvals',    icon: '✓', label: 'Approvals',     title: '高風險指令簽核佇列' },
      { type: 'link', href: '/ops/system-modes', icon: '◐', label: 'System Modes',  title: '全域 Kill Switch / 維護模式' },
      { type: 'link', href: '/ops/backup',       icon: '⛁', label: 'Backups',       title: '每個資料庫的備份與 R2 離機狀態' },
    ],
  },
  {
    id: 'content-tools',
    label: 'Content Tools',
    items: [
      { type: 'link',     href: '/tools/content',      icon: '✍', label: 'SEO Content',   title: 'SEO/GEO 文章產出' },
      { type: 'link',     href: '/tools/social',       icon: '📣', label: '社群發文',       title: '多品牌社群排程（ADR 016）' },
      { type: 'link',     href: '/tools/video',         icon: '🎬', label: 'Video',          title: '影片生成工具' },
      { type: 'link',     href: '/tools/tarot',         icon: '🔮', label: 'Tarot',           title: '塔羅牌印刷檔生成工具' },
      { type: 'link',     href: '/tools/studio',        icon: '✏', label: 'Studio',          title: 'POD 設計生成器' },
      { type: 'link',     href: '/tools/mockup',        icon: '👕', label: 'Mockup',          title: 'AI 擬真商品照' },
      { type: 'link',     href: '/tools/banner',        icon: '🖼', label: 'Banner Studio',   title: 'Social media banner 生成工具' },
      { type: 'link',     href: '/tools/canvas',        icon: '🎨', label: 'Canvas Editor',   title: 'Fabric.js 快速編輯 Canvas' },
      { type: 'link',     href: '/tools/vector-editor', icon: '✒', label: 'Vector Editor',   title: '向量設計工具（14 積木）' },
      { type: 'link',     href: '/tools/designs',       icon: '🗂', label: 'My Designs',      title: '已儲存設計庫（R2 持久化）' },
      { type: 'link',     href: '/tools/publish',       icon: '🛒', label: 'Publish',          title: '一鍵上架 Woo + Printful' },
      { type: 'disabled', icon: '◧', label: 'Templates' },
    ],
  },
  {
    id: 'cold-outreach',
    label: 'Cold Outreach',
    items: [
      { type: 'link', href: '/outreach',            icon: '📣', label: 'Dashboard',      title: '冷拜訪作戰中心' },
      { type: 'link', href: '/outreach/inbox',      icon: '📥', label: 'Lead Inbox',     title: '名單收件匣（去重 + suppression）' },
      { type: 'link', href: '/outreach/leads',      icon: '🎯', label: 'Leads',          title: '冷名單庫（三分數 + 優先級）' },
      { type: 'link', href: '/outreach/review',     icon: '📝', label: 'Message Review', title: '文案審核中心（Cold Gate + Evidence）' },
      { type: 'link', href: '/outreach/drafts',     icon: '🗒', label: 'Draft Queue',    title: '草稿審核佇列' },
      { type: 'link', href: '/outreach/followups',  icon: '⏰', label: 'Follow-ups',     title: '跟進任務（不漏）' },
      { type: 'link', href: '/outreach/replies',    icon: '💬', label: 'Replies',        title: '回覆處理（Reply Copilot）' },
      { type: 'link', href: '/outreach/connectors', icon: '🔌', label: 'Connectors',     title: '免費工具 + 客戶 BYO-key' },
      { type: 'link', href: '/outreach/settings',   icon: '⚙', label: 'Settings',       title: '服務檔 / 禁用詞 / Suppression / 同步規則' },
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
      { type: 'link', href: '/ops/collect',   icon: '🛰', label: '資料蒐集', title: '選來源（網頁／Sitemap／RSS／學術／官方 API／影片／全網搜尋）、試跑、正式抓取' },
      { type: 'link', href: '/ops/knowledge', icon: '📚', label: '知識庫',   title: '所有客戶的知識文件總覽（出處標籤、版本、切片數）；編輯在 客戶中心 →「客服」分頁' },
    ],
  },
  {
    id: 'customer-service',
    label: 'Customer Service',
    items: [
      { type: 'link',     href: '/ops/cs', icon: '💬', label: '客服總覽', title: 'AI 客服營運中心：意圖 / 成效 / kill-switch；知識庫在 Knowledge & Data' },
      { type: 'disabled', icon: '🎚', label: '意圖與分級（soon）' },
      { type: 'disabled', icon: '🧪', label: 'Eval / 模擬（soon）' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { type: 'link', href: '/tools/theme',      icon: '🎨', label: 'Theme Editor',        title: '主題色票 + CSS token 即時編輯器' },
      { type: 'link', href: '/ops-console',      icon: '▣',  label: 'Ops Console',          title: '架構邊界 · Tenant 設定 · M3 · AI Job' },
      { type: 'link', href: '/ops/inbox',        icon: '◇',  label: 'Ops Inbox',            title: '事件收斂中心' },
      { type: 'link', href: '/ops/costs',        icon: '$',  label: 'AI Costs',              title: 'LLM 呼叫花費帳本' },
      { type: 'link', href: '/ops/ai-models',    icon: '◈',  label: 'AI Models',             title: '圖片模型規格：能讀多長、參考圖、改寫' },
      { type: 'link', href: '/api-check-client', icon: '⬡',  label: 'API Health (browser)', title: 'Node API 健康（browser-side）' },
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

function applyLayout(sections: NavSection[], layout: SavedLayout): NavSection[] {
  const map = new Map(sections.map(s => [s.id, s]));

  // Apply section order
  let ordered: NavSection[];
  if (layout.sectionOrder) {
    ordered = layout.sectionOrder.flatMap(id => map.has(id) ? [map.get(id)!] : []);
    sections.forEach(s => { if (!layout.sectionOrder!.includes(s.id)) ordered.push(s); });
  } else {
    ordered = [...sections];
  }

  // Apply item orders per section
  if (layout.itemOrders) {
    return ordered.map(sec => {
      const itemOrder = layout.itemOrders![sec.id];
      if (!itemOrder) return sec;
      const itemMap = new Map(sec.items.map((item, i) => [itemKey(item, i), item]));
      const reordered = itemOrder.flatMap(k => itemMap.has(k) ? [itemMap.get(k)!] : []);
      // Append any new items not in saved order
      sec.items.forEach((item, i) => {
        if (!itemOrder.includes(itemKey(item, i))) reordered.push(item);
      });
      return { ...sec, items: reordered };
    });
  }

  return ordered;
}

// Stable key for an item (href for links, label for disabled/ext)
export function itemKey(item: NavItem, fallbackIndex?: number): string {
  if (item.type === 'link' || item.type === 'ext') return item.href;
  return `disabled-${item.label}-${fallbackIndex ?? 0}`;
}

// ── Component ────────────────────────────────────────────────────────────────
// `initialLayout` is fetched server-side (app/layout.tsx) from the DB, so the saved sidebar
// order renders identically on every device. Pure function of the prop — no client storage.
export function SidebarNav({ initialLayout }: { initialLayout?: SavedLayout | null }) {
  const sections = initialLayout ? applyLayout(DEFAULT_SECTIONS, initialLayout) : DEFAULT_SECTIONS;

  return (
    <>
      {sections.map(section => (
        <div key={section.id} className="sidebar-section">
          <div className="sidebar-section-label">{section.label}</div>
          {section.items.map((item, i) => {
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
      ))}
    </>
  );
}
