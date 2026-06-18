'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { OpsInboxBadge } from './ops/inbox/components/OpsInboxBadge';

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
  {
    id: 'repair-os',
    label: 'Repair OS',
    items: [
      { type: 'link', href: '/ops/repairs',      icon: '🛠', label: 'Repair Center',           badge: 'ops-inbox', title: 'AI 維修主控台' },
      { type: 'link', href: '/ops/clients',      icon: '👥', label: 'Clients',                  title: '全客戶健康狀態 + WP 外掛更新' },
      { type: 'link', href: '/ops/onboarding',   icon: '✨', label: 'Onboarding（客戶 Intake）', title: '建站第 1 步：客戶探索式問卷' },
      { type: 'link', href: '/ops/integrations', icon: '⇄', label: 'Integrations',              title: '客戶工具串接狀態' },
      { type: 'link', href: '/api-check',        icon: '⬡', label: 'API Health',                title: 'Node API 健康（server-side）' },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    items: [
      { type: 'link', href: '/ops/approvals',    icon: '✓', label: 'Approvals',    title: '高風險指令簽核佇列' },
      { type: 'link', href: '/ops/system-modes', icon: '◐', label: 'System Modes', title: '全域 Kill Switch / 維護模式' },
    ],
  },
  {
    id: 'provisioning',
    label: 'Provisioning',
    items: [
      { type: 'link', href: '/onboard', icon: '✦', label: '建站精靈（技術）', title: '建站第 2 步：技術建站精靈' },
      { type: 'link', href: '/build',   icon: '⚡', label: 'Build Console',   title: '部署執行：plan_only 或 enqueue' },
    ],
  },
  {
    id: 'content-tools',
    label: 'Content Tools',
    items: [
      { type: 'link',     href: '/tools/content',      icon: '✍', label: 'SEO Content',   title: 'SEO/GEO 文章產出' },
      { type: 'link',     href: '/tools/video',         icon: '🎬', label: 'Video',          title: '影片生成工具' },
      { type: 'link',     href: '/tools/ai-models',     icon: 'AI', label: 'AI Models',      title: '文字/圖片生成模型選型' },
      { type: 'link',     href: '/tools/tarot',         icon: '🔮', label: 'Tarot',           title: '塔羅牌印刷檔生成工具' },
      { type: 'link',     href: '/tools/studio',        icon: '✏', label: 'Studio',          title: 'POD 設計生成器' },
      { type: 'link',     href: '/tools/mockup',        icon: '👕', label: 'Mockup',          title: 'AI 擬真商品照' },
      { type: 'link',     href: '/tools/canvas',        icon: '🎨', label: 'Canvas Editor',   title: 'Fabric.js 快速編輯 Canvas' },
      { type: 'link',     href: '/tools/vector-editor', icon: '✒', label: 'Vector Editor',   title: '向量設計工具（14 積木）' },
      { type: 'link',     href: '/tools/designs',       icon: '🗂', label: 'My Designs',      title: '已儲存設計庫（R2 持久化）' },
      { type: 'link',     href: '/tools/publish',       icon: '🛒', label: 'Publish',          title: '一鍵上架 Woo + Printful' },
      { type: 'disabled', icon: '◧', label: 'Templates' },
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

const LS_ORDER_KEY = 'aw-sidebar-order';

// Saved shape: { sectionOrder: string[], itemOrders: Record<sectionId, string[]> }
interface SavedLayout {
  sectionOrder?: string[];
  itemOrders?: Record<string, string[]>;
}

function loadLayout(): SavedLayout | null {
  try {
    const raw = localStorage.getItem(LS_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Migrate legacy shape: was string[] (section IDs only)
    if (Array.isArray(parsed)) return { sectionOrder: parsed };
    return parsed as SavedLayout;
  } catch { return null; }
}

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
export function SidebarNav() {
  const [sections, setSections] = useState(DEFAULT_SECTIONS);

  useEffect(() => {
    const layout = loadLayout();
    if (layout) setSections(applyLayout(DEFAULT_SECTIONS, layout));
  }, []);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === LS_ORDER_KEY && e.newValue) {
        try {
          const layout = JSON.parse(e.newValue) as SavedLayout;
          setSections(applyLayout(DEFAULT_SECTIONS, layout));
        } catch {}
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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
