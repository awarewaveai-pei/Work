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
} from "../../lib/department-catalog";
import type { BuildPackageSlug, BuildProvider } from "../../lib/build-console/contracts";
import {
  resolvePluginStack,
  resolveInstallableSlugs,
  resolvePaidPlugins,
  type WpSiteType,
  type WpPlugin,
} from "../../lib/wp-plugin-stack-catalog";

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
  // WP Plugin Stack (Phase 1)
  wpSiteType: WpSiteType;
  hasEcommerce: boolean;
  resolvedPluginSlugs: string[];
  resolvedPaidPlugins: WpPlugin[];
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

const WP_SITE_TYPE_LABELS: Record<WpSiteType, string> = {
  tourism:   "旅遊業",
  brand:     "形象 / 品牌站",
  ecommerce: "一般電商",
};

/**
 * Auto-derive packageSlug (container manifest) from Step 2 site type.
 * Single source of truth: WP_CLIENT_PLUGIN_STACK.md §八.1 boundary rule.
 *   wc-core     → enforces staging-only + backup-required (ecommerce safety)
 *   wp-business → brand sites that need fluent-crm smoke checks
 *   wp-basic    → minimal container (default)
 * This replaces the manual "Package" dropdown previously in Step 1.
 */
function derivePackageSlug(wpSiteType: WpSiteType, hasEcommerce: boolean): BuildPackageSlug {
  if (hasEcommerce || wpSiteType === "ecommerce") return "wc-core";
  if (wpSiteType === "brand") return "wp-business";
  return "wp-basic";
}

const PROVIDERS = [
  { id: "sentry",      label: "Sentry",      desc: "建立 project + DSN" },
  { id: "posthog",     label: "PostHog",      desc: "建立 project + API key" },
  { id: "uptime_kuma", label: "Uptime Kuma",  desc: "建立 HTTP monitor" },
  { id: "n8n",         label: "n8n",          desc: "複製 onboarding workflow" },
  { id: "github",      label: "GitHub",       desc: "建立 client repo" },
  { id: "trigger",     label: "Trigger.dev",  desc: "建立 project + token" },
  { id: "supabase",    label: "Supabase",     desc: "建立 cloud project" },
];

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
    packageSlug: derivePackageSlug("brand", false), // auto-derived from default wpSiteType in Step 2
    locale: "en_US",
    siteUrl: "",
    wpAdminUrl: "",
    organizationId: randomUUID(),
    workspaceId: randomUUID(),
    projectId: randomUUID(),
    siteId: randomUUID(),
    wpSiteType: "brand",
    hasEcommerce: false,
    resolvedPluginSlugs: resolveInstallableSlugs("brand", false),
    resolvedPaidPlugins: resolvePaidPlugins("brand", false),
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
          填入後，按下 Launch 會由 Trigger.dev 自動 SSH 安裝外掛。
          Profile B 新站可留空（hosting adapter 之後會自動填）。
          憑證走 vault 引用，**不**在此貼真實 SSH key。
        </p>
        <div className="build-form-grid">
          <div className="form-row">
            <label className="form-label">SSH host {info.profile === "profile_c" ? <span style={{ color: "#dc2626" }}>*</span> : null}</label>
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

// ── Step 2: WP Site Type Selection ────────────────────────────────────────────
// SSOT: agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md §一/二/三/八.1
// 外掛採疊加制：基礎包（必裝） + 站型包 + （選用）電商包

const WP_TYPE_CARDS: { type: WpSiteType; label: string; desc: string; emoji: string }[] = [
  { type: "tourism",   label: "旅遊業",        desc: "行程、地圖、多語言", emoji: "🏝️" },
  { type: "brand",     label: "形象 / 品牌站", desc: "企業形象、作品集、活動頁", emoji: "🎨" },
  { type: "ecommerce", label: "一般電商",       desc: "純 WooCommerce 電商站（自動含電商包）", emoji: "🛒" },
];

// Pre-computed module sizes (catalog is static)
const BASE_PACK_SIZE     = resolvePluginStack("brand", false).filter((p) => p.module === "base").length;     // 16
const ECOMMERCE_PACK_SIZE = resolvePluginStack("brand", true).filter((p) => p.module === "ecommerce").length; // 12
const TOURISM_PACK_SIZE  = resolvePluginStack("tourism", false).filter((p) => p.module === "tourism").length; // 5
const BRAND_PACK_SIZE    = resolvePluginStack("brand", false).filter((p) => p.module === "brand").length;     // 3

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

  const applyType = (type: WpSiteType, ecom: boolean) => {
    const effectiveEcom = type === "ecommerce" ? true : ecom;
    onChange({
      wpSiteType: type,
      hasEcommerce: effectiveEcom,
      resolvedPluginSlugs: resolveInstallableSlugs(type, effectiveEcom),
      resolvedPaidPlugins: resolvePaidPlugins(type, effectiveEcom),
      // Container manifest is auto-derived from site type — see derivePackageSlug() docstring
      packageSlug: derivePackageSlug(type, effectiveEcom),
    });
  };

  const allPlugins  = resolvePluginStack(info.wpSiteType, info.hasEcommerce);
  const totalCount  = allPlugins.length;
  const autoCount   = info.resolvedPluginSlugs.length;
  const paidCount   = info.resolvedPaidPlugins.length;
  const effectiveEcommerce = info.hasEcommerce || info.wpSiteType === "ecommerce";

  // Active pack breakdown
  const stackedPacks: { name: string; emoji: string; count: number; required: boolean; locked?: boolean }[] = [
    { name: "基礎包",   emoji: "📦", count: BASE_PACK_SIZE,     required: true, locked: true },
  ];
  if (info.wpSiteType === "tourism") {
    stackedPacks.push({ name: "旅遊包", emoji: "🏝️", count: TOURISM_PACK_SIZE, required: true });
  }
  if (info.wpSiteType === "brand") {
    stackedPacks.push({ name: "形象包", emoji: "🎨", count: BRAND_PACK_SIZE, required: true });
  }
  if (effectiveEcommerce) {
    stackedPacks.push({ name: "電商包", emoji: "🛒", count: ECOMMERCE_PACK_SIZE, required: true });
  }

  // Plugins grouped by module for expanded view
  const byModule = {
    base:      allPlugins.filter((p) => p.module === "base"),
    tourism:   allPlugins.filter((p) => p.module === "tourism"),
    brand:     allPlugins.filter((p) => p.module === "brand"),
    ecommerce: allPlugins.filter((p) => p.module === "ecommerce"),
  };

  return (
    <div className="onboard-step-body">
      <div className="build-alert build-alert-ok" style={{ marginBottom: 16 }}>
        <strong>外掛採疊加制</strong>：基礎包（必裝 16 個）+ 站型包 +（選用）電商包。
        清單依據 <code>WP_CLIENT_PLUGIN_STACK.md</code>，由 Trigger.dev 透過 WP-CLI 自動安裝。
      </div>

      {/* ── Base pack (always-on) ─────────────────────────────────────────── */}
      <div className="dept-summary" style={{ marginBottom: 16, background: "#f0fdf4", borderColor: "#bbf7d0" }}>
        <div className="section-title" style={{ marginBottom: 6 }}>
          📦 基礎包 — 必裝 <strong style={{ color: "#166534" }}>{BASE_PACK_SIZE} 個</strong>
        </div>
        <p className="form-hint" style={{ margin: 0, fontSize: 11 }}>
          Kadence Theme / Wordfence / WPvivid / Rank Math SEO / LiteSpeed Cache / ShortPixel / Fluent Forms+SMTP+CRM /
          CleanTalk(↩Akismet) / GTM4WP / ACF / Complianz(選配) … 等
        </p>
      </div>

      {/* ── Site type cards (each shows +N plugins) ────────────────────── */}
      <div className="section-title" style={{ marginBottom: 8 }}>選擇站型 — 加疊站型專屬包</div>
      <div className="dept-cluster-grid" style={{ marginBottom: 16 }}>
        {WP_TYPE_CARDS.map(({ type, label, desc, emoji }) => {
          const active = info.wpSiteType === type;
          const addOn =
            type === "tourism"   ? `+${TOURISM_PACK_SIZE} 個旅遊包` :
            type === "brand"     ? `+${BRAND_PACK_SIZE} 個形象包` :
                                   `+${ECOMMERCE_PACK_SIZE} 個電商包（含 WooCommerce）`;
          return (
            <label
              key={type}
              className={`dept-cluster-card ${active ? "selected" : ""}`}
              style={{ cursor: "pointer" }}
            >
              <input
                type="radio"
                name="wpSiteType"
                checked={active}
                onChange={() => applyType(type, info.hasEcommerce)}
                style={{ marginRight: 6 }}
              />
              <span className="dept-cluster-name">{emoji} {label}</span>
              <span className="dept-cluster-rows">{desc}</span>
              <span className="dept-cluster-rows" style={{ color: active ? "#166534" : "#64748b", fontWeight: 600 }}>
                {addOn}
              </span>
            </label>
          );
        })}
      </div>

      {/* ── Ecommerce checkbox (independent add-on for tourism/brand) ───── */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={info.hasEcommerce}
            disabled={info.wpSiteType === "ecommerce"}
            onChange={(e) => applyType(info.wpSiteType, e.target.checked)}
          />
          ☑ 同時含電商（+{ECOMMERCE_PACK_SIZE} 個電商包 — WooCommerce / 金流 / CartFlows）
          {info.wpSiteType === "ecommerce" && (
            <span className="form-hint" style={{ marginLeft: 4 }}>— 「一般電商」站型已強制啟用</span>
          )}
        </label>
      </div>

      {/* ── Stack breakdown summary (key feature: shows packs) ─────────── */}
      <div className="dept-summary" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 10 }}>📊 組合結果 — 已選 {stackedPacks.length} 個外掛包</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 12 }}>
          <tbody>
            {stackedPacks.map((p, i) => (
              <tr key={p.name} style={{ borderBottom: i === stackedPacks.length - 1 ? "2px solid var(--border-subtle)" : "1px solid #f1f5f9" }}>
                <td style={{ padding: "6px 8px", width: 36 }}>{p.emoji}</td>
                <td style={{ padding: "6px 8px" }}>
                  {p.name}
                  {p.locked && <span className="form-hint" style={{ marginLeft: 6 }}>（必裝）</span>}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", color: "#64748b" }}>
                  {i === 0 ? "  " : "+ "}{p.count}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: "8px" }}></td>
              <td style={{ padding: "8px", fontWeight: 700 }}>總計</td>
              <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, fontFamily: "monospace" }}>{totalCount} 個外掛</td>
            </tr>
          </tbody>
        </table>

        <div className="build-kv-grid">
          <div><span>🟢 自動安裝（WP.org）</span><strong style={{ color: "#166534" }}>{autoCount} 個</strong></div>
          <div>
            <span>🟡 需手動上傳（付費 zip）</span>
            <strong style={{ color: paidCount > 0 ? "#92400e" : "#166534" }}>{paidCount} 個</strong>
          </div>
        </div>
        {paidCount > 0 && (
          <p className="form-hint" style={{ marginTop: 8, fontSize: 11 }}>
            付費外掛清單：{info.resolvedPaidPlugins.map((p) => p.label).join(", ")}
            <br />
            → 上線後到該客戶 WP 後台 <code>Plugins → Add New → Upload Plugin</code> 手動上傳 zip
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
          {(["base", "tourism", "brand", "ecommerce"] as const).map((mod) => {
            const list = byModule[mod];
            if (list.length === 0) return null;
            const moduleLabel =
              mod === "base"      ? `📦 基礎包（${list.length}）` :
              mod === "tourism"   ? `🏝️ 旅遊包（${list.length}）` :
              mod === "brand"     ? `🎨 形象包（${list.length}）` :
                                    `🛒 電商包（${list.length}）`;
            return (
              <div key={mod} style={{ marginBottom: 12 }}>
                <div className="section-title" style={{ fontSize: 12, marginBottom: 6 }}>{moduleLabel}</div>
                <div className="dept-file-list">
                  {list.map((p) => (
                    <div key={`${mod}-${p.slug}`} className="dept-file-row">
                      <code className="dept-file-path">{p.slug}</code>
                      <span className="dept-file-fields" style={{ color: !p.free && !p.alternativeSlug ? "#92400e" : undefined }}>
                        {p.label}
                        {!p.free && p.alternativeSlug && (
                          <span className="dept-file-recommended"> ↩ {p.alternativeSlug}</span>
                        )}
                        {!p.free && !p.alternativeSlug && " ⚠ 需手動上傳"}
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
  const toggle = (id: string) => {
    onProvidersChange(
      providers.includes(id) ? providers.filter((p) => p !== id) : [...providers, id]
    );
  };

  return (
    <div className="onboard-step-body">
      <p className="form-hint" style={{ marginBottom: 16 }}>
        選擇要為此客戶建立的外部服務帳號。系統使用 master token（已存於 Trigger worker 環境變數），
        為每位客戶建立獨立 project／monitor／DSN，結果寫入 Supabase{" "}
        <code>tenant_integration_bindings</code>。
      </p>

      <div className="dept-cluster-grid" style={{ marginBottom: 16 }}>
        {PROVIDERS.map((p) => (
          <label
            key={p.id}
            className={`dept-cluster-card ${providers.includes(p.id) ? "selected" : ""}`}
          >
            <input type="checkbox" checked={providers.includes(p.id)} onChange={() => toggle(p.id)} />
            <span className="dept-cluster-name">{p.label}</span>
            <span className="dept-cluster-rows">{p.desc}</span>
          </label>
        ))}
      </div>

      <div className="section-title" style={{ marginBottom: 8 }}>選填 Hints（留空使用預設）</div>
      <div className="build-form-grid">
        {[
          { key: "sentryProjectSlug",   label: "Sentry project slug",  ph: "client-slug" },
          { key: "sentryProjectName",   label: "Sentry project name",  ph: info.clientName || "Client Name" },
          { key: "posthogProjectName",  label: "PostHog project name", ph: info.clientName || "Client Name" },
          { key: "githubRepoName",      label: "GitHub repo name",     ph: info.tenantSlug || "client-site" },
          { key: "uptimeMonitorUrl",    label: "Uptime monitor URL",   ph: info.profile === "profile_b" ? `https://${info.domain || "client.com"}` : info.siteUrl || "https://client.com" },
          { key: "uptimeMonitorName",   label: "Uptime monitor name",  ph: info.clientName || "Client Site" },
          { key: "n8nWorkflowSuffix",   label: "n8n workflow suffix",  ph: info.tenantSlug || "client-name" },
        ].map(({ key, label, ph }) => (
          <div key={key} className="form-row">
            <label className="form-label">{label}</label>
            <input className="form-input" value={hints[key] ?? ""}
              onChange={(e) => onHintsChange({ ...hints, [key]: e.target.value })}
              placeholder={ph} />
          </div>
        ))}
      </div>

      {provResult ? (
        <div className={`build-alert ${provResult.ok ? "build-alert-ok" : "build-alert-blocked"}`}
          style={{ marginTop: 12 }}>
          {provResult.ok ? (
            <>
              ✓ Trigger.dev 已接受 — runId: <code>{provResult.runId ?? "unknown"}</code>
              <br />Providers: {provResult.providers?.join(", ")}
            </>
          ) : (
            <>Error: {provResult.error}{provResult.detail ? <><br />{provResult.detail}</> : null}</>
          )}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
        <button type="button" className="btn-secondary" onClick={onBack}>← 返回</button>
        <button type="button" className="btn-secondary" disabled={loading || providers.length === 0} onClick={onSubmit}>
          {loading ? "開通中…" : `一鍵開通 ${providers.length} 個服務`}
        </button>
        <button type="button" className="btn-primary" onClick={onNext}>
          {provResult?.ok ? "下一步 → 啟動 Build ✓" : "跳過，直接啟動 Build →"}
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
  onBack,
}: {
  info: ClientInfo;
  selectedDepts: Set<ClusterId>;
  providers: string[];
  provResult: ProvResult | null;
  onBack: () => void;
}) {
  const totalPlugins = resolvePluginStack(info.wpSiteType, info.hasEcommerce).length;

  const params = new URLSearchParams({
    profile: info.profile,
    clientName: info.clientName,
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
  params.set("wpSiteType", info.wpSiteType);
  params.set("hasEcommerce", String(info.hasEcommerce));
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

      <div className="build-kv-grid">
        <div><span>Client</span><strong>{info.clientName || "—"}</strong></div>
        <div><span>Slug</span><strong>{info.tenantSlug || "—"}</strong></div>
        <div><span>Email</span><strong>{info.customerEmail || "—"}</strong></div>
        <div><span>Profile</span><strong>{info.profile}</strong></div>
        <div><span>網站類型</span><strong>{WP_SITE_TYPE_LABELS[info.wpSiteType]}{info.hasEcommerce && info.wpSiteType !== "ecommerce" ? " + 電商" : ""}</strong></div>
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
          <strong style={{ color: info.sshHost ? "#166534" : "#92400e", fontFamily: info.sshHost ? "monospace" : undefined, fontSize: 11 }}>
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
        <li>點擊「啟動 Build Console」→ 選擇 <code>enqueue</code> 模式執行部署（外掛將由 Trigger.dev 自動安裝）</li>
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
  const [providers, setProviders] = useState<string[]>(["sentry", "posthog", "uptime_kuma", "n8n"]);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [provLoading, setProvLoading] = useState(false);
  const [provResult, setProvResult] = useState<ProvResult | null>(null);
  const [orgCreating, setOrgCreating] = useState(false);

  const patchInfo = useCallback((patch: Partial<ClientInfo>) => {
    setInfo((prev) => ({ ...prev, ...patch }));
  }, []);

  // Auto-register client in Supabase organizations table when entering Step 5.
  // Non-blocking: wizard advances regardless of result.
  const createOrgRecord = async () => {
    if (!info.tenantSlug.trim() || !info.clientName.trim()) return;
    setOrgCreating(true);
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
      await fetch("/api/ops/organizations", {
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
    } catch {
      // non-blocking — wizard advances regardless
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
          <StepHeader step={4} current={step} label="Step 4 — 開通外部服務帳號" />
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
              onBack={() => setStep(4)}
            />
          )}
        </div>
      )}
    </div>
  );
}
