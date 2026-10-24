"use client";

import { useState, useCallback } from "react";
import {
  DEPARTMENT_CATALOG,
  GROUP_LABELS,
  SMB_DEFAULT_CLUSTERS,
  buildDepartmentSelection,
  getRequiredTemplateFiles,
  type ClusterId,
  type DepartmentCluster,
} from "@/lib/department-catalog";
import type { BuildPackageSlug, BuildProvider } from "@/lib/build-console/contracts";
import {
  WP_PLUGIN_CATALOG,
  resolvePluginsForPacks,
  resolveInstallableSlugsForPacks,
  resolvePaidPluginsForPacks,
  resolveConditionalPlugins,
  derivePackageSlugFromPacks,
  type WpPluginModule,
  type WpPlugin,
} from "@/lib/wp-plugin-stack-catalog";

// ── Types ─────────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4 | 5;
type OnboardProfile = "profile_b" | "profile_c";

interface ClientInfo {
  tenantSlug: string;
  clientName: string;
  customerEmail: string;
  profile: OnboardProfile;
  // Profile B
  domain: string;
  provider: BuildProvider;
  packageSlug: BuildPackageSlug;
  locale: string;
  // Profile C
  siteUrl: string;
  wpAdminUrl: string;
  // Generated
  organizationId: string;
  workspaceId: string;
  projectId: string;
  siteId: string;
  // WP Plugin Stack — additive pack model (base always-on + optional addon packs)
  selectedPacks: WpPluginModule[];
  resolvedPluginSlugs: string[];       // free auto-installable (no condition)
  resolvedConditionalPlugins: WpPlugin[]; // conditional (e.g. litespeed on LiteSpeed host only)
  resolvedPaidPlugins: WpPlugin[];     // paid, no free alt — manual upload required
  // SSH connection target — passes to wp-install-plugins task
  // (operator-supplied for existing clients; left empty when hosting adapter will provide)
  sshHost: string;
  wpPath: string;
  sshCredentialsRef: string;
}

interface ProvResult {
  ok: boolean;
  runId?: string | null;
  providers?: string[];
  error?: string;
  detail?: string;
}

// Netdata is infra-level (monitors VPS, not per-client) — intentionally excluded.
const PROVIDERS = [
  {
    id: "sentry", label: "Sentry", icon: "🔴",
    desc: "Error tracking — 建立 project + DSN",
    hintDefs: [
      { key: "sentryProjectSlug", label: "Project Slug" },
      { key: "sentryProjectName", label: "Project Name" },
    ],
  },
  {
    id: "posthog", label: "PostHog", icon: "🦔",
    desc: "Product analytics — 建立 project + API key",
    hintDefs: [
      { key: "posthogProjectName", label: "Project Name" },
    ],
  },
  {
    id: "uptime_kuma", label: "Uptime Kuma", icon: "📡",
    desc: "Uptime monitoring — 建立 HTTP monitor",
    hintDefs: [
      { key: "uptimeMonitorUrl",  label: "Monitor URL" },
      { key: "uptimeMonitorName", label: "Monitor Name" },
    ],
  },
  {
    id: "n8n", label: "n8n", icon: "⚡",
    desc: "Automation — 複製 onboarding workflow",
    hintDefs: [
      { key: "n8nWorkflowSuffix", label: "Workflow Suffix" },
    ],
  },
  {
    id: "github", label: "GitHub", icon: "🐙",
    desc: "Source control — 建立 client repo",
    hintDefs: [
      { key: "githubRepoName", label: "Repo Name" },
    ],
  },
  {
    id: "trigger", label: "Trigger.dev", icon: "🎯",
    desc: "Job runner — 建立 project + deploy token",
    hintDefs: [] as { key: string; label: string }[],
  },
  {
    id: "supabase", label: "Supabase", icon: "🌊",
    desc: "Database — 建立 cloud project + schema",
    hintDefs: [] as { key: string; label: string }[],
  },
] satisfies Array<{ id: string; label: string; icon: string; desc: string; hintDefs: { key: string; label: string }[] }>;

function getHintPlaceholders(info: ClientInfo): Record<string, string> {
  const siteUrl =
    info.profile === "profile_b"
      ? `https://${info.domain || "client.com"}`
      : info.siteUrl || "https://client.com";
  return {
    sentryProjectSlug:  info.tenantSlug  || "client-slug",
    sentryProjectName:  info.clientName  || "Client Name",
    posthogProjectName: info.clientName  || "Client Name",
    githubRepoName:     info.tenantSlug  || "client-site",
    uptimeMonitorUrl:   siteUrl,
    uptimeMonitorName:  info.clientName  || "Client Site",
    n8nWorkflowSuffix:  info.tenantSlug  || "client-name",
  };
}

const GROUP_ORDER: DepartmentCluster["group"][] = [
  "core", "revenue", "supply_chain", "platform", "support", "horizontal", "cross_border",
];

function randomUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function makeDefaultClient(): ClientInfo {
  return {
    tenantSlug: "",
    clientName: "",
    customerEmail: "",
    profile: "profile_b",
    domain: "",
    provider: "hostinger",
    packageSlug: "wp-basic",
    locale: "en_US",
    siteUrl: "",
    wpAdminUrl: "",
    organizationId: randomUUID(),
    workspaceId: randomUUID(),
    projectId: randomUUID(),
    siteId: randomUUID(),
    selectedPacks: [],
    resolvedPluginSlugs: resolveInstallableSlugsForPacks([]),
    resolvedConditionalPlugins: resolveConditionalPlugins([]),
    resolvedPaidPlugins: resolvePaidPluginsForPacks([]),
    sshHost: "",
    wpPath: "/var/www/html",
    sshCredentialsRef: "",
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepBadge({ step, current }: { step: WizardStep; current: WizardStep }) {
  const done = step < current;
  const active = step === current;
  return (
    <span
      className={`onboard-step-badge ${active ? "active" : done ? "done" : "idle"}`}
    >
      {done ? "✓" : step}
    </span>
  );
}

function StepHeader({
  step,
  current,
  label,
}: {
  step: WizardStep;
  current: WizardStep;
  label: string;
}) {
  return (
    <div className={`onboard-step-header ${current === step ? "active" : ""}`}>
      <StepBadge step={step} current={current} />
      <span>{label}</span>
    </div>
  );
}

// ── Step 1: Client Info ───────────────────────────────────────────────────────

function Step1({
  info,
  onChange,
  onNext,
}: {
  info: ClientInfo;
  onChange: (patch: Partial<ClientInfo>) => void;
  onNext: () => void;
}) {
  const valid =
    info.tenantSlug.trim() &&
    info.clientName.trim() &&
    info.customerEmail.trim() &&
    (info.profile === "profile_b" ? info.domain.trim() : info.siteUrl.trim() && info.wpAdminUrl.trim());

  return (
    <div className="onboard-step-body">
      <div className="build-form-grid">
        <div className="form-row">
          <label className="form-label">Client name</label>
          <input className="form-input" value={info.clientName}
            onChange={(e) => onChange({ clientName: e.target.value })}
            placeholder="Mongolia Travel" />
        </div>
        <div className="form-row">
          <label className="form-label">Tenant slug</label>
          <input className="form-input" value={info.tenantSlug}
            onChange={(e) => onChange({ tenantSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
            placeholder="company-mongoliatravel" />
        </div>
        <div className="form-row">
          <label className="form-label">Customer email</label>
          <input className="form-input" type="email" value={info.customerEmail}
            onChange={(e) => onChange({ customerEmail: e.target.value })}
            placeholder="client@example.com" />
        </div>
        <div className="form-row">
          <label className="form-label">Deployment profile</label>
          <select className="form-select" value={info.profile}
            onChange={(e) => onChange({ profile: e.target.value as OnboardProfile })}>
            <option value="profile_b">Profile B — New cloud WordPress</option>
            <option value="profile_c">Profile C — Adopt existing WordPress</option>
          </select>
        </div>
      </div>

      {info.profile === "profile_b" && (
        <div className="build-form-grid">
          <div className="form-row">
            <label className="form-label">Domain</label>
            <input className="form-input" value={info.domain}
              onChange={(e) => onChange({ domain: e.target.value })}
              placeholder="scenerytravelmongolia.com" />
          </div>
          <div className="form-row">
            <label className="form-label">Hosting provider</label>
            <select className="form-select" value={info.provider}
              onChange={(e) => onChange({ provider: e.target.value as BuildProvider })}>
              <option value="hostinger">Hostinger</option>
              <option value="cloudways">Cloudways</option>
              <option value="generic-wordpress">Generic WordPress</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div className="form-row">
            <label className="form-label">Locale</label>
            <input className="form-input" value={info.locale}
              onChange={(e) => onChange({ locale: e.target.value })}
              placeholder="en_US" />
          </div>
        </div>
      )}

      {info.profile === "profile_c" && (
        <div className="build-form-grid">
          <div className="form-row">
            <label className="form-label">Site URL</label>
            <input className="form-input" value={info.siteUrl}
              onChange={(e) => onChange({ siteUrl: e.target.value })}
              placeholder="https://soulfulexpression.com/" />
          </div>
          <div className="form-row">
            <label className="form-label">WP Admin URL</label>
            <input className="form-input" value={info.wpAdminUrl}
              onChange={(e) => onChange({ wpAdminUrl: e.target.value })}
              placeholder="https://soulfulexpression.com/wp-admin" />
          </div>
        </div>
      )}

      {/* ── SSH 接入（一鍵安裝外掛必填）─────────────────────────────────────── */}
      <div className="onboard-uuid-block" style={{ marginTop: 16 }}>
        <div className="section-title" style={{ marginBottom: 4 }}>SSH 接入（一鍵自動安裝外掛必填）</div>
        <p className="form-hint" style={{ marginBottom: 12 }}>
          填入後，Build Console 可用 <code>local_direct</code> 由 next-admin 直接 SSH 安裝外掛。
          Profile B 新站可留空（hosting adapter 之後會自動填）。
          憑證走 vault 引用，**不**在此貼真實 SSH key。
        </p>
        <div className="build-form-grid">
          <div className="form-row">
            <label className="form-label">SSH host {info.profile === "profile_c" ? <span style={{ color: "var(--red)" }}>*</span> : null}</label>
            <input className="form-input" value={info.sshHost}
              onChange={(e) => onChange({ sshHost: e.target.value.trim() })}
              placeholder="soulful.aware-wave.com 或 1.2.3.4" />
          </div>
          <div className="form-row">
            <label className="form-label">WP 安裝路徑</label>
            <input className="form-input" value={info.wpPath}
              onChange={(e) => onChange({ wpPath: e.target.value.trim() || "/var/www/html" })}
              placeholder="/var/www/html" />
          </div>
          <div className="form-row" style={{ gridColumn: "1 / -1" }}>
            <label className="form-label">SSH credentials vault ref（選填）</label>
            <input className="form-input" value={info.sshCredentialsRef}
              onChange={(e) => onChange({ sshCredentialsRef: e.target.value.trim() })}
              placeholder={`vault://ssh/${info.tenantSlug || "<slug>"}`} />
          </div>
        </div>
      </div>

      <div className="onboard-uuid-block">
        <div className="section-title" style={{ marginBottom: 8 }}>Auto-generated IDs（記錄到 Supabase）</div>
        <div className="build-kv-grid">
          {[
            ["organizationId", info.organizationId],
            ["workspaceId",    info.workspaceId],
            ["projectId",      info.projectId],
            ["siteId",         info.siteId],
          ].map(([k, v]) => (
            <div key={k}><span>{k}</span><strong style={{ fontSize: 11, fontFamily: "monospace" }}>{v}</strong></div>
          ))}
        </div>
        <button type="button" className="onboard-regen-btn"
          onClick={() => onChange({
            organizationId: randomUUID(),
            workspaceId: randomUUID(),
            projectId: randomUUID(),
            siteId: randomUUID(),
          })}>
          ↺ 重新生成 UUID
        </button>
      </div>

      <button type="button" className="btn-primary" disabled={!valid} onClick={onNext}
        style={{ marginTop: 20 }}>
        下一步 → 站型選擇
      </button>
    </div>
  );
}

// ── Step 2: WP Plugin Pack Selection ─────────────────────────────────────────
// SSOT: agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md §一/二/三/八.1
// 純加法模型：基礎包（必裝）+ 3 個獨立 checkbox（電商 / 旅遊 / 形象）

// Pre-computed module sizes (catalog is static)
const BASE_PACK_SIZE      = WP_PLUGIN_CATALOG.filter((p) => p.module === "base").length;      // 18 (incl. mainwp-child/manifest + wp-bridge/release-url)
const ECOMMERCE_PACK_SIZE = WP_PLUGIN_CATALOG.filter((p) => p.module === "ecommerce").length; // 13
const TOURISM_PACK_SIZE   = WP_PLUGIN_CATALOG.filter((p) => p.module === "tourism").length;   // 7 (TravelWP/Elementor/WooCommerce/CPT UI/Modula/Maps/TranslatePress)
const BRAND_PACK_SIZE     = WP_PLUGIN_CATALOG.filter((p) => p.module === "brand").length;     // 3

const ADDON_PACKS: { id: WpPluginModule; label: string; desc: string; emoji: string; count: number }[] = [
  { id: "ecommerce", label: "電商包",       desc: "WooCommerce / 金流 / CartFlows / Email Designer",  emoji: "🛒", count: ECOMMERCE_PACK_SIZE },
  { id: "tourism",   label: "旅遊包",       desc: "TravelWP 主題 / Elementor / WooCommerce / CPT UI / Modula / 地圖", emoji: "🏝️", count: TOURISM_PACK_SIZE   },
  { id: "brand",     label: "形象 / 品牌包", desc: "CPT UI / Modula Gallery / Popup Maker",             emoji: "🎨", count: BRAND_PACK_SIZE     },
];

function Step2WpType({
  info,
  onChange,
  onNext,
  onBack,
}: {
  info: ClientInfo;
  onChange: (patch: Partial<ClientInfo>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const applyPacks = (packs: WpPluginModule[]) => {
    onChange({
      selectedPacks: packs,
      resolvedPluginSlugs: resolveInstallableSlugsForPacks(packs),
      resolvedConditionalPlugins: resolveConditionalPlugins(packs),
      resolvedPaidPlugins: resolvePaidPluginsForPacks(packs),
      packageSlug: derivePackageSlugFromPacks(packs),
    });
  };

  const togglePack = (id: WpPluginModule) => {
    const next = info.selectedPacks.includes(id)
      ? info.selectedPacks.filter((p) => p !== id)
      : [...info.selectedPacks, id];
    applyPacks(next);
  };

  const allPlugins       = resolvePluginsForPacks(info.selectedPacks);
  const totalCount       = allPlugins.length;
  const autoCount        = info.resolvedPluginSlugs.length;
  const conditionalCount = info.resolvedConditionalPlugins.length;
  const paidCount        = info.resolvedPaidPlugins.length;

  // Stack breakdown rows
  const stackRows: { name: string; emoji: string; count: number; locked?: boolean }[] = [
    { name: "基礎包", emoji: "📦", count: BASE_PACK_SIZE, locked: true },
    ...ADDON_PACKS
      .filter((p) => info.selectedPacks.includes(p.id))
      .map((p) => ({ name: p.label, emoji: p.emoji, count: p.count })),
  ];

  // Plugins grouped by module
  const byModule = {
    base:      allPlugins.filter((p) => p.module === "base"),
    ecommerce: allPlugins.filter((p) => p.module === "ecommerce"),
    tourism:   allPlugins.filter((p) => p.module === "tourism"),
    brand:     allPlugins.filter((p) => p.module === "brand"),
  };

  return (
    <div className="onboard-step-body">
      <div className="build-alert build-alert-ok" style={{ marginBottom: 16 }}>
        <strong>純加法模型</strong>：基礎包（必裝 {BASE_PACK_SIZE} 個）＋ 勾選任意加購包，可疊加。
        清單依據 <code>WP_CLIENT_PLUGIN_STACK.md</code>，由 local direct build 或選配背景派工透過 WP-CLI 自動安裝。
      </div>

      {/* ── Base pack (always-on, locked) ─────────────────────────────────── */}
      <div className="dept-summary" style={{ marginBottom: 16, background: "var(--badge-green-bg)", borderColor: "var(--badge-green-bg)" }}>
        <div className="section-title" style={{ marginBottom: 6 }}>
          📦 基礎包 — 必裝 <strong style={{ color: "var(--badge-green-text)" }}>{BASE_PACK_SIZE} 個</strong>
          <span className="form-hint" style={{ marginLeft: 8 }}>（所有客戶站通用，不可取消）</span>
        </div>
        <p className="form-hint" style={{ margin: 0, fontSize: 11 }}>
          Kadence Theme / Wordfence / WPvivid / Rank Math SEO / LiteSpeed Cache / ShortPixel /
          Fluent Forms+SMTP+CRM / CleanTalk(↩Akismet) / GTM4WP / ACF / Complianz(選配) … 等
        </p>
      </div>

      {/* ── Addon pack checkboxes ─────────────────────────────────────────── */}
      <div className="section-title" style={{ marginBottom: 8 }}>加購包（獨立勾選，可多選）</div>
      <div className="dept-cluster-grid" style={{ marginBottom: 16 }}>
        {ADDON_PACKS.map(({ id, label, desc, emoji, count }) => {
          const active = info.selectedPacks.includes(id);
          return (
            <label
              key={id}
              className={`dept-cluster-card ${active ? "selected" : ""}`}
              style={{ cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => togglePack(id)}
                style={{ marginRight: 6 }}
              />
              <span className="dept-cluster-name">{emoji} {label}</span>
              <span className="dept-cluster-rows">{desc}</span>
              <span className="dept-cluster-rows" style={{ color: active ? "var(--badge-green-text)" : "var(--text-muted)", fontWeight: 600 }}>
                +{count} 個
              </span>
            </label>
          );
        })}
      </div>

      {/* ── Stack breakdown summary ───────────────────────────────────────── */}
      <div className="dept-summary" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 10 }}>
          📊 組合結果 — {stackRows.length} 個外掛包 / 共 {totalCount} 個外掛
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 12 }}>
          <tbody>
            {stackRows.map((row, i) => (
              <tr key={row.name} style={{ borderBottom: i === stackRows.length - 1 ? "2px solid var(--border-subtle)" : "1px solid var(--border)" }}>
                <td style={{ padding: "6px 8px", width: 36 }}>{row.emoji}</td>
                <td style={{ padding: "6px 8px" }}>
                  {row.name}
                  {row.locked && <span className="form-hint" style={{ marginLeft: 6 }}>（必裝）</span>}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: "var(--text-muted)" }}>
                  {i === 0 ? "  " : "+ "}{row.count}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: "8px" }} />
              <td style={{ padding: "8px", fontWeight: 700 }}>總計</td>
              <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>{totalCount} 個外掛</td>
            </tr>
          </tbody>
        </table>

        <div className="build-kv-grid">
          <div><span>🟢 自動安裝（WP.org）</span><strong style={{ color: "var(--badge-green-text)" }}>{autoCount} 個</strong></div>
          <div>
            <span>🔵 條件安裝（LiteSpeed 主機才裝）</span>
            <strong style={{ color: "var(--accent-text)" }}>{conditionalCount} 個</strong>
          </div>
          <div>
            <span>🟡 需手動上傳（付費 zip）</span>
            <strong style={{ color: paidCount > 0 ? "var(--build-risk-medium-text)" : "var(--badge-green-text)" }}>{paidCount} 個</strong>
          </div>
        </div>
        {conditionalCount > 0 && (
          <p className="form-hint" style={{ marginTop: 6, fontSize: 11, color: "var(--accent-text)" }}>
            條件外掛：{info.resolvedConditionalPlugins.map((p) => p.slug).join(", ")}
            &nbsp;— 只在 LiteSpeed 主機上安裝（Hostinger VPS 預設是 LiteSpeed；Cloudways/Nginx 不裝）
          </p>
        )}
        {paidCount > 0 && (
          <p className="form-hint" style={{ marginTop: 6, fontSize: 11 }}>
            付費外掛：{info.resolvedPaidPlugins.map((p) => p.label).join(", ")}
            <br />
            → 上線後到客戶 WP 後台 <code>Plugins → Add New → Upload Plugin</code> 手動上傳 zip
          </p>
        )}
      </div>

      {/* ── Expandable full plugin list grouped by module ──────────────── */}
      <button
        type="button"
        className="btn-secondary"
        style={{ fontSize: 12, padding: "4px 10px", marginBottom: 8 }}
        onClick={() => setExpanded((x) => !x)}
      >
        {expanded ? "▲ 收起完整外掛清單" : "▼ 展開完整外掛清單（依模組分組）"}
      </button>
      {expanded && (
        <div className="dept-summary" style={{ marginBottom: 16 }}>
          {(["base", "ecommerce", "tourism", "brand"] as const).map((mod) => {
            const list = byModule[mod];
            if (list.length === 0) return null;
            const moduleLabel =
              mod === "base"      ? `📦 基礎包（${list.length}）` :
              mod === "ecommerce" ? `🛒 電商包（${list.length}）` :
              mod === "tourism"   ? `🏝️ 旅遊包（${list.length}）` :
                                    `🎨 形象包（${list.length}）`;
            return (
              <div key={mod} style={{ marginBottom: 12 }}>
                <div className="section-title" style={{ fontSize: 12, marginBottom: 6 }}>{moduleLabel}</div>
                <div className="dept-file-list">
                  {list.map((p) => (
                    <div key={`${mod}-${p.slug}`} className="dept-file-row">
                      <code className="dept-file-path">{p.slug}</code>
                      <span className="dept-file-fields" style={{ color: !p.free && !p.alternativeSlug ? "var(--build-risk-medium-text)" : undefined }}>
                        {p.label}
                        {!p.free && p.alternativeSlug && (
                          <span className="dept-file-recommended"> ↩ {p.alternativeSlug}</span>
                        )}
                        {!p.free && !p.alternativeSlug && p.installSource !== "release-url" && " ⚠ 需手動上傳"}
                        {!p.free && !p.alternativeSlug && p.installSource === "release-url" && " ↗ GitHub release（自動）"}
                        {!p.required && " † 選配"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <button type="button" className="btn-secondary" onClick={onBack}>← 返回</button>
        <button type="button" className="btn-primary" onClick={onNext}>
          下一步 → 部門選型
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Department Selection ──────────────────────────────────────────────

function Step3Dept({
  tenantSlug,
  selected,
  onChange,
  onNext,
  onBack,
}: {
  tenantSlug: string;
  selected: Set<ClusterId>;
  onChange: (next: Set<ClusterId>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const selectedIds = Array.from(selected) as ClusterId[];
  const payload = buildDepartmentSelection(selectedIds, tenantSlug || "company-<slug>");
  const requiredFiles = getRequiredTemplateFiles(selectedIds);

  const toggle = (id: ClusterId) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  };

  const copyJson = () => {
    void navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    clusters: DEPARTMENT_CATALOG.filter((d) => d.group === group),
  }));

  return (
    <div className="onboard-step-body">
      <p className="form-hint" style={{ marginBottom: 16 }}>
        勾選客戶本次採購的能力模組。預設已選 SMB 核心 5 項。完成後複製 JSON 貼進{" "}
        <code>tenants/{tenantSlug || "<slug>"}/core/DEPARTMENT_SELECTION.json</code>。
      </p>

      <div className="dept-legend">
        <span className="dept-legend-item dept-on">SMB 預設 on</span>
        <span className="dept-legend-item dept-by-industry">視業態</span>
        <span className="dept-legend-item dept-off">預設 off</span>
      </div>

      {grouped.map(({ group, label, clusters }) => (
        <div key={group} className="dept-group">
          <div className="dept-group-label">{label}</div>
          <div className="dept-cluster-grid">
            {clusters.map((cluster) => {
              const isSelected = selected.has(cluster.clusterId);
              return (
                <label
                  key={cluster.clusterId}
                  className={`dept-cluster-card ${isSelected ? "selected" : ""} dept-smb-${cluster.smbDefault.replace("_", "-")}`}
                >
                  <input type="checkbox" checked={isSelected} onChange={() => toggle(cluster.clusterId)} />
                  <span className="dept-cluster-name">{cluster.label}</span>
                  <span className="dept-cluster-rows">{cluster.matrixRows.join(" · ")}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {requiredFiles.length > 0 && (
        <div className="dept-summary" style={{ marginTop: 16 }}>
          <div className="section-title" style={{ marginBottom: 8 }}>
            已選 {selected.size} / 20 — 需填寫 {requiredFiles.length} 個模板檔案
          </div>
          <div className="dept-file-list">
            {requiredFiles.map((f) => (
              <div key={f.path} className="dept-file-row">
                <code className="dept-file-path">{f.path}</code>
                <span className="dept-file-fields">
                  必填：{f.mandatoryFields?.join("、") || "—"}
                  {f.recommendedFields?.length ? (
                    <span className="dept-file-recommended"> ／ 建議：{f.recommendedFields.join("、")}</span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <button type="button" className="btn-secondary" onClick={onBack}>← 返回</button>
        <button type="button" className="btn-secondary" onClick={copyJson}>
          {copied ? "✓ 已複製 JSON" : "複製 DEPARTMENT_SELECTION JSON"}
        </button>
        <button type="button" className="btn-primary" onClick={onNext}>
          下一步 → 開通服務
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Service Provisioning ──────────────────────────────────────────────

function Step4Svc({
  info,
  providers,
  onProvidersChange,
  hints,
  onHintsChange,
  provResult,
  loading,
  onSubmit,
  onNext,
  onBack,
}: {
  info: ClientInfo;
  providers: string[];
  onProvidersChange: (providers: string[]) => void;
  hints: Record<string, string>;
  onHintsChange: (hints: Record<string, string>) => void;
  provResult: ProvResult | null;
  loading: boolean;
  onSubmit: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const toggle = (id: string) =>
    onProvidersChange(
      providers.includes(id) ? providers.filter((p) => p !== id) : [...providers, id]
    );

  const allIds = PROVIDERS.map((p) => p.id);
  const allSelected = allIds.every((id) => providers.includes(id));
  const placeholders = getHintPlaceholders(info);

  const setHint = (key: string, value: string) =>
    onHintsChange({ ...hints, [key]: value });

  return (
    <div className="onboard-step-body">
      <p className="form-hint" style={{ marginBottom: 12 }}>
        系統使用 master token（已存於 Trigger worker 環境）為每位客戶建立獨立 project／monitor／DSN，
        結果寫入 Supabase <code>tenant_integration_bindings</code>。
        留空 Hints 使用自動衍生值（顯示於 placeholder）。
      </p>

      {/* ── Bulk controls ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span className="section-title" style={{ marginBottom: 0 }}>
          已選 {providers.length} / {PROVIDERS.length} 個服務
        </span>
        <button type="button" className="btn-secondary"
          style={{ fontSize: 12, padding: "3px 10px" }}
          onClick={() => onProvidersChange(allSelected ? [] : allIds)}>
          {allSelected ? "全部取消" : "全選 7 個"}
        </button>
      </div>

      {/* ── Per-service cards ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {PROVIDERS.map((p) => {
          const active = providers.includes(p.id);
          return (
            <div
              key={p.id}
              style={{
                border: `1px solid ${active ? "var(--accent)" : "var(--border-subtle)"}`,
                borderLeft: `4px solid ${active ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 8,
                padding: "14px 16px",
                background: active ? "var(--ai-bg)" : "var(--surface-bg)",
                opacity: active ? 1 : 0.65,
                transition: "all 0.15s",
              }}
            >
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 20 }}>{p.icon}</span>
                    <strong style={{ fontSize: 15 }}>{p.label}</strong>
                  </div>
                  <span className="form-hint" style={{ margin: 0 }}>{p.desc}</span>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0, marginLeft: 16 }}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggle(p.id)}
                    style={{ width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: active ? "var(--accent-text)" : "var(--text-muted)" }}>
                    {active ? "✓ 開通" : "略過"}
                  </span>
                </label>
              </div>

              {/* Hint fields (always visible; disabled when not selected) */}
              {p.hintDefs.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: p.hintDefs.length > 1 ? "1fr 1fr" : "1fr",
                    gap: "8px 12px",
                    marginTop: 12,
                  }}
                >
                  {p.hintDefs.map(({ key, label }) => (
                    <div key={key} className="form-row" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: 11, marginBottom: 3 }}>{label}</label>
                      <input
                        className="form-input"
                        style={{ fontSize: 12, opacity: active ? 1 : 0.5 }}
                        value={hints[key] ?? ""}
                        onChange={(e) => setHint(key, e.target.value)}
                        placeholder={`自動：${placeholders[key] ?? "—"}`}
                        disabled={!active}
                      />
                    </div>
                  ))}
                </div>
              )}

              {p.hintDefs.length === 0 && active && (
                <p className="form-hint" style={{ margin: "10px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                  自動建立 — 不需要額外設定
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Result banner ─────────────────────────────────────────────────── */}
      {provResult && (
        <div className={`build-alert ${provResult.ok ? "build-alert-ok" : "build-alert-blocked"}`}
          style={{ marginBottom: 12 }}>
          {provResult.ok ? (
            <>
              ✓ 外部服務開通請求已送出 — runId: <code>{provResult.runId ?? "unknown"}</code>
              <br />Providers: {provResult.providers?.join(", ")}
            </>
          ) : (
            <>Error: {provResult.error}{provResult.detail ? <><br />{provResult.detail}</> : null}</>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        <button type="button" className="btn-secondary" onClick={onBack}>← 返回</button>
        <button
          type="button"
          className="btn-secondary"
          disabled={loading || providers.length === 0}
          onClick={onSubmit}
          style={{ fontWeight: 600 }}
        >
          {loading ? "開通中…" : `開通選取的 ${providers.length} 個外部服務`}
        </button>
        <button type="button" className="btn-primary" onClick={onNext}>
          {provResult?.ok ? "下一步 → 啟動 Build ✓" : "跳過 →"}
        </button>
      </div>
    </div>
  );
}

// ── Step 5: Launch ────────────────────────────────────────────────────────────

function Step5Launch({
  info,
  selectedDepts,
  providers,
  provResult,
  orgResult,
  onBack,
}: {
  info: ClientInfo;
  selectedDepts: Set<ClusterId>;
  providers: string[];
  provResult: ProvResult | null;
  orgResult: { ok: boolean; message?: string } | null;
  onBack: () => void;
}) {
  const totalPlugins = resolvePluginsForPacks(info.selectedPacks).length;
  const packLabel = info.selectedPacks.length === 0
    ? "基礎包"
    : `基礎包 + ${info.selectedPacks.map((p) => ({ ecommerce: "電商包", tourism: "旅遊包", brand: "形象包" })[p]).join(" + ")}`;

  const params = new URLSearchParams({
    profile: info.profile,
    executionMode: "local_direct",
    clientName: info.clientName,
    clientSlug: info.tenantSlug,
    environment: "staging",
    organizationId: info.organizationId,
    workspaceId: info.workspaceId,
    projectId: info.projectId,
    siteId: info.siteId,
    ...(info.profile === "profile_b"
      ? { domain: info.domain, provider: info.provider, packageSlug: info.packageSlug, locale: info.locale }
      : { siteUrl: info.siteUrl, wpAdminUrl: info.wpAdminUrl }
    ),
  });
  if (info.selectedPacks.length > 0) params.set("selectedPacks", info.selectedPacks.join(","));
  params.set("pluginSlugs", info.resolvedPluginSlugs.join(","));
  params.set("paidPluginCount", String(info.resolvedPaidPlugins.length));
  if (info.sshHost)            params.set("sshHost", info.sshHost);
  if (info.wpPath)             params.set("wpPath", info.wpPath);
  if (info.sshCredentialsRef)  params.set("sshCredentialsRef", info.sshCredentialsRef);

  const buildUrl = `/build?${params.toString()}`;

  return (
    <div className="onboard-step-body">
      <div className="build-alert build-alert-ok" style={{ marginBottom: 20 }}>
        客戶設定完成。以下是本次上線的摘要。
      </div>

      {orgResult && !orgResult.ok ? (
        <div className="build-alert build-alert-blocked" style={{ marginBottom: 20 }}>
          ⚠ organization 記錄自動建立<strong>失敗</strong>{orgResult.message ? `：${orgResult.message}` : ""}。
          Build run 會引用不存在的 organizationId — 請先手動完成下方「下一步」第 2 項（建立 organization 記錄）再啟動 Build Console。
        </div>
      ) : null}

      <div className="build-kv-grid">
        <div><span>Client</span><strong>{info.clientName || "—"}</strong></div>
        <div><span>Slug</span><strong>{info.tenantSlug || "—"}</strong></div>
        <div><span>Email</span><strong>{info.customerEmail || "—"}</strong></div>
        <div><span>Profile</span><strong>{info.profile}</strong></div>
        <div><span>外掛包組合</span><strong>{packLabel}</strong></div>
        <div>
          <span>容器 Manifest（自動）</span>
          <strong style={{ fontFamily: "monospace", fontSize: 12 }}>{info.packageSlug}</strong>
        </div>
        <div>
          <span>外掛總數</span>
          <strong>
            {totalPlugins}（可自動安裝 {info.resolvedPluginSlugs.length} / 需手動授權 {info.resolvedPaidPlugins.length}）
          </strong>
        </div>
        <div>
          <span>SSH host</span>
          <strong style={{ color: info.sshHost ? "var(--badge-green-text)" : "var(--build-risk-medium-text)", fontFamily: info.sshHost ? "monospace" : undefined, fontSize: 11 }}>
            {info.sshHost || "未填 — 一鍵安裝外掛將跳過（hosting adapter 之後可補）"}
          </strong>
        </div>
        <div><span>Departments</span><strong>{selectedDepts.size} / 20</strong></div>
        <div><span>Services</span><strong>{provResult?.ok ? `${provResult.providers?.join(", ")}` : providers.length > 0 ? "待開通" : "跳過"}</strong></div>
        <div><span>organizationId</span><strong style={{ fontSize: 11, fontFamily: "monospace" }}>{info.organizationId}</strong></div>
        <div><span>workspaceId</span><strong style={{ fontSize: 11, fontFamily: "monospace" }}>{info.workspaceId}</strong></div>
      </div>

      <div className="section-title" style={{ marginTop: 20, marginBottom: 8 }}>下一步</div>
      <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
        <li>將 <code>DEPARTMENT_SELECTION.json</code>（Step 3 複製的 JSON）貼入 <code>tenants/{info.tenantSlug || "<slug>"}/core/</code></li>
        <li>在 Supabase 建立 organization / workspace / project / site 記錄（使用上方 UUID）</li>
        <li>點擊「啟動 Build Console」→ 預設使用 <code>local_direct</code> 直接建 staging 站；需要背景派工時才改用 <code>enqueue</code></li>
      </ol>

      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button type="button" className="btn-secondary" onClick={onBack}>← 返回</button>
        <a href={buildUrl} className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
          ▶ 啟動 Build Console（{info.profile}）
        </a>
      </div>
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

const STEPS: { step: WizardStep; label: string }[] = [
  { step: 1, label: "客戶資訊" },
  { step: 2, label: "站型選擇" },
  { step: 3, label: "部門選型（M3）" },
  { step: 4, label: "開通服務" },
  { step: 5, label: "啟動 Build" },
];

export default function OnboardWizard() {
  const [step, setStep] = useState<WizardStep>(1);
  const [info, setInfo] = useState<ClientInfo>(makeDefaultClient);
  const [selectedDepts, setSelectedDepts] = useState<Set<ClusterId>>(new Set(SMB_DEFAULT_CLUSTERS));
  const [providers, setProviders] = useState<string[]>([]);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [provLoading, setProvLoading] = useState(false);
  const [provResult, setProvResult] = useState<ProvResult | null>(null);
  const [orgCreating, setOrgCreating] = useState(false);
  const [orgResult, setOrgResult] = useState<{ ok: boolean; message?: string } | null>(null);

  const patchInfo = useCallback((patch: Partial<ClientInfo>) => {
    setInfo((prev) => ({ ...prev, ...patch }));
  }, []);

  // Auto-register client in Supabase organizations table when entering Step 5.
  // Non-blocking: wizard advances regardless of result — but the outcome must be
  // VISIBLE in Step 5 (a silently missing org row breaks the build run later).
  const createOrgRecord = async () => {
    if (!info.tenantSlug.trim() || !info.clientName.trim()) {
      setOrgResult({ ok: false, message: "缺 slug / client name，未嘗試建立" });
      return;
    }
    setOrgCreating(true);
    setOrgResult(null);
    try {
      const clientConfig: Record<string, unknown> = { platform: "wordpress" };
      if (info.profile === "profile_b") {
        clientConfig.hosting_type = info.provider;
        if (info.domain) clientConfig.site_url = `https://${info.domain}`;
      } else if (info.profile === "profile_c") {
        if (info.siteUrl) clientConfig.site_url = info.siteUrl;
        if (info.wpAdminUrl) clientConfig.wp_admin_url = info.wpAdminUrl;
        clientConfig.hosting_type = info.provider;
      }
      const res = await fetch("/api/ops/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: info.organizationId,
          slug: info.tenantSlug,
          name: info.clientName,
          type: "client",
          metadata: { client_config: clientConfig },
        }),
      });
      if (res.ok) {
        setOrgResult({ ok: true });
      } else {
        const text = await res.text();
        let detail = "";
        try {
          const json = JSON.parse(text) as { error?: string; detail?: string };
          detail = json.error ?? json.detail ?? "";
        } catch {
          detail = text.slice(0, 120);
        }
        setOrgResult({
          ok: false,
          message: `HTTP ${res.status}${detail ? ` — ${detail}` : ""}${res.status === 403 ? "（此 API 需要 owner/admin 權限）" : ""}`,
        });
      }
    } catch (err) {
      setOrgResult({ ok: false, message: err instanceof Error ? err.message : "network error" });
    } finally {
      setOrgCreating(false);
    }
  };

  const goToStep5 = async () => {
    await createOrgRecord();
    setStep(5);
  };

  const submitProvisioning = async () => {
    setProvLoading(true);
    setProvResult(null);
    try {
      const res = await fetch("/api/build/provision-services", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ops-simulated-role": "operator" },
        body: JSON.stringify({
          organizationId: info.organizationId,
          workspaceId: info.workspaceId || undefined,
          customerEmail: info.customerEmail,
          providers,
          hints: Object.fromEntries(Object.entries(hints).filter(([, v]) => v.trim() !== "")),
        }),
      });
      const json = (await res.json()) as ProvResult;
      setProvResult(json);
    } catch (err) {
      setProvResult({ ok: false, error: err instanceof Error ? err.message : "request_failed" });
    } finally {
      setProvLoading(false);
    }
  };

  return (
    <div className="onboard-wizard">
      {/* Progress bar */}
      <div className="onboard-progress">
        {STEPS.map(({ step: s, label }) => (
          <div key={s} className={`onboard-progress-item ${step === s ? "active" : step > s ? "done" : ""}`}>
            <StepBadge step={s} current={step} />
            <span className="onboard-progress-label">{label}</span>
            {s < 5 && <span className="onboard-progress-sep">→</span>}
          </div>
        ))}
      </div>

      {/* Steps */}
      <div className="build-panel" style={{ marginTop: 20 }}>
        <StepHeader step={1} current={step} label="Step 1 — 客戶基本資訊" />
        {step === 1 && (
          <Step1 info={info} onChange={patchInfo} onNext={() => setStep(2)} />
        )}
      </div>

      {step >= 2 && (
        <div className="build-panel" style={{ marginTop: 16 }}>
          <StepHeader step={2} current={step} label="Step 2 — 網站類型 + 外掛堆疊" />
          {step === 2 && (
            <Step2WpType
              info={info}
              onChange={patchInfo}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
        </div>
      )}

      {step >= 3 && (
        <div className="build-panel" style={{ marginTop: 16 }}>
          <StepHeader step={3} current={step} label="Step 3 — 部門選型（M3 · 20 部門）" />
          {step === 3 && (
            <Step3Dept
              tenantSlug={info.tenantSlug}
              selected={selectedDepts}
              onChange={setSelectedDepts}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          )}
        </div>
      )}

      {step >= 4 && (
        <div className="build-panel" style={{ marginTop: 16 }}>
          <StepHeader step={4} current={step} label="Step 4 — 選配外部服務" />
          {step === 4 && (
            <Step4Svc
              info={info}
              providers={providers}
              onProvidersChange={setProviders}
              hints={hints}
              onHintsChange={setHints}
              provResult={provResult}
              loading={provLoading || orgCreating}
              onSubmit={submitProvisioning}
              onNext={() => { void goToStep5(); }}
              onBack={() => setStep(3)}
            />
          )}
        </div>
      )}

      {step >= 5 && (
        <div className="build-panel" style={{ marginTop: 16 }}>
          <StepHeader step={5} current={step} label="Step 5 — 啟動 Build Console" />
          {step === 5 && (
            <Step5Launch
              info={info}
              selectedDepts={selectedDepts}
              providers={providers}
              provResult={provResult}
              orgResult={orgResult}
              onBack={() => setStep(4)}
            />
          )}
        </div>
      )}
    </div>
  );
}
