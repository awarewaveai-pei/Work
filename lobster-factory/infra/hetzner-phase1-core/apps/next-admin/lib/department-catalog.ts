/**
 * Machine-readable mapping: 20 department clusters → matrix rows → template files.
 * Source of truth: agency-os/tenants/templates/core/DEPARTMENT_CLUSTER_CATALOG.md
 *                  agency-os/tenants/templates/core/DEPARTMENT_COVERAGE_MATRIX.md
 */

export type ClusterId =
  | "CLU_STRATEGY_GOVERN"
  | "CLU_FINANCE"
  | "CLU_SECURITY_IT"
  | "CLU_ENGINEERING"
  | "CLU_ORDER_OPS"
  | "CLU_MARKETING"
  | "CLU_PRODUCT"
  | "CLU_SALES_BD"
  | "CLU_CUSTOMER_SUCCESS"
  | "CLU_PROCUREMENT"
  | "CLU_LOGISTICS"
  | "CLU_DATA_AI"
  | "CLU_PRIVACY_RETENTION"
  | "CLU_RISK_FRAUD"
  | "CLU_TAX_TRADE"
  | "CLU_LEGAL"
  | "CLU_HR"
  | "CLU_BRAND_COMMS"
  | "CLU_REGIONAL"
  | "CLU_IR";

export type MatrixRowKey =
  | "strategy_gov"
  | "finance_ma"
  | "tax_customs"
  | "legal"
  | "security_it"
  | "procurement"
  | "hr"
  | "operations_delivery"
  | "marketing_growth"
  | "product_digital"
  | "engineering"
  | "data_privacy"
  | "risk_security"
  | "brand_comms"
  | "ir";

export type SmbDefault = "on" | "off" | "by_industry";

export interface TemplateFileRef {
  /** Relative path from tenant root, e.g. "PROFILE.md" or "core/ENVIRONMENT_REGISTRY.md" */
  path: string;
  /** Specific fields / sections that must be filled in this file */
  mandatoryFields?: string[];
  /** Fields recommended for enterprise / cross-border clients */
  recommendedFields?: string[];
}

export interface DepartmentCluster {
  clusterId: ClusterId;
  /** Display name (Chinese) */
  label: string;
  /** Category for grouping in UI */
  group: "core" | "revenue" | "supply_chain" | "platform" | "support" | "cross_border" | "horizontal";
  /** Matrix rows this cluster maps to (1 cluster may touch multiple rows) */
  matrixRows: MatrixRowKey[];
  /** smb_default: whether this cluster is on by default for a typical SMB client */
  smbDefault: SmbDefault;
  /** Template files the operator must fill when this cluster is activated */
  templateFiles: TemplateFileRef[];
}

export const DEPARTMENT_CATALOG: DepartmentCluster[] = [
  {
    clusterId: "CLU_STRATEGY_GOVERN",
    label: "董事／策略／治理",
    group: "core",
    matrixRows: ["strategy_gov"],
    smbDefault: "on",
    templateFiles: [
      {
        path: "PROFILE.md",
        mandatoryFields: ["商業目標", "Out of Scope", "風險標記"],
        recommendedFields: ["決策窗口", "升級路徑"],
      },
    ],
  },
  {
    clusterId: "CLU_FINANCE",
    label: "財務／管理會計",
    group: "core",
    matrixRows: ["finance_ma"],
    smbDefault: "on",
    templateFiles: [
      {
        path: "FINANCIAL_LEDGER.md",
        mandatoryFields: ["收入列", "成本類別", "毛利"],
        recommendedFields: ["多幣別", "付款條件", "發票抬頭"],
      },
    ],
  },
  {
    clusterId: "CLU_SECURITY_IT",
    label: "資安／身分／存取",
    group: "core",
    matrixRows: ["security_it"],
    smbDefault: "on",
    templateFiles: [
      {
        path: "ACCESS_REGISTER.md",
        mandatoryFields: ["MFA", "密鑰位置", "輪替週期"],
        recommendedFields: ["身分供應商", "稽核證據路徑"],
      },
      {
        path: "core/ENVIRONMENT_REGISTRY.md",
        mandatoryFields: ["環境 URL", "staging/prod 分離確認"],
      },
    ],
  },
  {
    clusterId: "CLU_ENGINEERING",
    label: "工程技術／IT／DevOps",
    group: "platform",
    matrixRows: ["engineering"],
    smbDefault: "on",
    templateFiles: [
      {
        path: "03_TOOLS_CONFIGURATION_GUIDE.md",
        mandatoryFields: ["工具清單", "環境變數規範"],
        recommendedFields: ["Staging 為真相", "變更證據路徑"],
      },
    ],
  },
  {
    clusterId: "CLU_ORDER_OPS",
    label: "訂單／客服／交付營運",
    group: "core",
    matrixRows: ["operations_delivery"],
    smbDefault: "on",
    templateFiles: [
      {
        path: "04_OPERATIONS_AUTOMATION_GUIDE.md",
        mandatoryFields: ["排程定義", "放行 gate"],
        recommendedFields: ["SLO", "值班與升級"],
      },
      {
        path: "core/RELEASE_GATES_CHECKLIST.md",
        mandatoryFields: ["GO/NO-GO 欄位"],
      },
    ],
  },
  {
    clusterId: "CLU_MARKETING",
    label: "市場行銷",
    group: "revenue",
    matrixRows: ["marketing_growth"],
    smbDefault: "by_industry",
    templateFiles: [
      {
        path: "sites/<slug>/OPS_GROWTH_PLAN.md",
        mandatoryFields: ["量測目標", "渠道 KPI"],
        recommendedFields: ["法遵（追蹤、同意）"],
      },
    ],
  },
  {
    clusterId: "CLU_PRODUCT",
    label: "產品管理／UX",
    group: "platform",
    matrixRows: ["product_digital"],
    smbDefault: "by_industry",
    templateFiles: [
      {
        path: "sites/<slug>/SYSTEM_REQUIREMENTS.md",
        mandatoryFields: ["關鍵流程", "頁面與功能清單"],
        recommendedFields: ["整合清單", "API 責任邊界"],
      },
    ],
  },
  {
    clusterId: "CLU_SALES_BD",
    label: "銷售／商務拓展",
    group: "revenue",
    matrixRows: ["product_digital", "strategy_gov"],
    smbDefault: "off",
    templateFiles: [
      {
        path: "PROFILE.md",
        mandatoryFields: ["商業目標"],
      },
      {
        path: "sites/<slug>/SYSTEM_REQUIREMENTS.md",
        mandatoryFields: ["CRM 整合需求"],
      },
    ],
  },
  {
    clusterId: "CLU_CUSTOMER_SUCCESS",
    label: "客戶成功／CRM／留存",
    group: "revenue",
    matrixRows: ["marketing_growth", "operations_delivery"],
    smbDefault: "by_industry",
    templateFiles: [
      {
        path: "04_OPERATIONS_AUTOMATION_GUIDE.md",
        mandatoryFields: ["客服排程", "升級路徑"],
      },
      {
        path: "sites/<slug>/OPS_GROWTH_PLAN.md",
        mandatoryFields: ["留存 KPI"],
      },
    ],
  },
  {
    clusterId: "CLU_PROCUREMENT",
    label: "採購／供應商／外包",
    group: "supply_chain",
    matrixRows: ["procurement"],
    smbDefault: "off",
    templateFiles: [
      {
        path: "FINANCIAL_LEDGER.md",
        mandatoryFields: ["外包成本列帳"],
        recommendedFields: ["子處理者清單", "主約索引"],
      },
      {
        path: "core/CROSS_BORDER_GOVERNANCE.md",
        recommendedFields: ["供應商合約邊界"],
      },
    ],
  },
  {
    clusterId: "CLU_LOGISTICS",
    label: "物流／倉儲／履約",
    group: "supply_chain",
    matrixRows: ["operations_delivery", "tax_customs"],
    smbDefault: "off",
    templateFiles: [
      {
        path: "04_OPERATIONS_AUTOMATION_GUIDE.md",
        mandatoryFields: ["履約排程"],
      },
      {
        path: "core/CROSS_BORDER_GOVERNANCE.md",
        recommendedFields: ["跨境物流稅務橋"],
      },
    ],
  },
  {
    clusterId: "CLU_DATA_AI",
    label: "數據／BI／AI",
    group: "platform",
    matrixRows: ["data_privacy", "engineering"],
    smbDefault: "off",
    templateFiles: [
      {
        path: "core/CROSS_BORDER_GOVERNANCE.md",
        recommendedFields: ["個資角色", "留存期限", "跨境傳輸機制"],
      },
      {
        path: "03_TOOLS_CONFIGURATION_GUIDE.md",
        mandatoryFields: ["BI/AI 工具與環境"],
      },
    ],
  },
  {
    clusterId: "CLU_PRIVACY_RETENTION",
    label: "資料／隱私／留存",
    group: "horizontal",
    matrixRows: ["data_privacy"],
    smbDefault: "by_industry",
    templateFiles: [
      {
        path: "core/CROSS_BORDER_GOVERNANCE.md",
        recommendedFields: ["個資角色", "留存政策", "同意管理"],
      },
      {
        path: "ACCESS_REGISTER.md",
        mandatoryFields: ["資料存取控制"],
      },
    ],
  },
  {
    clusterId: "CLU_RISK_FRAUD",
    label: "風控／反詐欺",
    group: "horizontal",
    matrixRows: ["risk_security", "finance_ma"],
    smbDefault: "off",
    templateFiles: [
      {
        path: "PROFILE.md",
        mandatoryFields: ["風險標記"],
        recommendedFields: ["事件通報鏈", "證據保存"],
      },
      {
        path: "ACCESS_REGISTER.md",
        mandatoryFields: ["稽核證據路徑"],
      },
    ],
  },
  {
    clusterId: "CLU_TAX_TRADE",
    label: "稅務／關務（資訊橋）",
    group: "cross_border",
    matrixRows: ["tax_customs"],
    smbDefault: "off",
    templateFiles: [
      {
        path: "core/CROSS_BORDER_GOVERNANCE.md",
        recommendedFields: ["課稅地", "申報責任", "外部顧問狀態"],
      },
    ],
  },
  {
    clusterId: "CLU_LEGAL",
    label: "法務／合規",
    group: "cross_border",
    matrixRows: ["legal"],
    smbDefault: "off",
    templateFiles: [
      {
        path: "core/CROSS_BORDER_GOVERNANCE.md",
        recommendedFields: ["適用法域", "DPA 狀態", "外部審閱索引"],
      },
    ],
  },
  {
    clusterId: "CLU_HR",
    label: "人力資源",
    group: "support",
    matrixRows: ["hr"],
    smbDefault: "off",
    templateFiles: [
      {
        path: "PROFILE.md",
        mandatoryFields: ["利害關係人窗口"],
        recommendedFields: ["培訓責任", "權限交接"],
      },
    ],
  },
  {
    clusterId: "CLU_BRAND_COMMS",
    label: "對外溝通／品牌",
    group: "horizontal",
    matrixRows: ["brand_comms"],
    smbDefault: "by_industry",
    templateFiles: [
      {
        path: "sites/<slug>/SITE_PROFILE.md",
        mandatoryFields: ["品牌名稱", "語系"],
        recommendedFields: ["多市場訊息責任", "品牌語氣規範"],
      },
      {
        path: "PROFILE.md",
        mandatoryFields: ["品牌與定位"],
      },
    ],
  },
  {
    clusterId: "CLU_REGIONAL",
    label: "區域／國際化營運",
    group: "cross_border",
    matrixRows: ["tax_customs", "legal", "strategy_gov"],
    smbDefault: "off",
    templateFiles: [
      {
        path: "core/CROSS_BORDER_GOVERNANCE.md",
        recommendedFields: ["法人結構", "區域 compliance", "外部顧問"],
      },
      {
        path: "PROFILE.md",
        mandatoryFields: ["目標市場", "法人地"],
      },
    ],
  },
  {
    clusterId: "CLU_IR",
    label: "投資人關係／IR",
    group: "support",
    matrixRows: ["ir"],
    smbDefault: "off",
    templateFiles: [
      {
        path: "PROFILE.md",
        recommendedFields: ["IR 窗口索引（N/A 如不適用）"],
      },
    ],
  },
];

export const SMB_DEFAULT_CLUSTERS: ClusterId[] = DEPARTMENT_CATALOG
  .filter((d) => d.smbDefault === "on")
  .map((d) => d.clusterId);

export function buildDepartmentSelection(
  selectedIds: ClusterId[],
  tenantSlug: string
) {
  return {
    schema_version: "1",
    tenant_slug_hint: tenantSlug || "company-<slug>",
    selected_cluster_ids: selectedIds,
    excluded_explicit: DEPARTMENT_CATALOG
      .filter((d) => !selectedIds.includes(d.clusterId))
      .map((d) => d.clusterId),
    planned_future: [] as ClusterId[],
    last_reviewed_iso: new Date().toISOString().split("T")[0],
    reviewed_by: "",
  };
}

export function getRequiredTemplateFiles(selectedIds: ClusterId[]): TemplateFileRef[] {
  const seen = new Set<string>();
  const result: TemplateFileRef[] = [];
  for (const cluster of DEPARTMENT_CATALOG) {
    if (!selectedIds.includes(cluster.clusterId)) continue;
    for (const file of cluster.templateFiles) {
      if (!seen.has(file.path)) {
        seen.add(file.path);
        result.push(file);
      }
    }
  }
  return result;
}

export const GROUP_LABELS: Record<DepartmentCluster["group"], string> = {
  core: "核心營運",
  revenue: "營收成長",
  supply_chain: "供應鏈",
  platform: "平台技術",
  support: "企業支援",
  cross_border: "跨境治理",
  horizontal: "橫向（全客戶）",
};
