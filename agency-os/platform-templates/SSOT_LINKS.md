# Platform-templates：一站連結（相對 `agency-os/`）

> 在 IDE 裡從 **`platform-templates/`** 開檔時，用本頁跳回正本，避免路徑猜錯。

## Agency OS（治理／租戶／專案節奏）

| 主題 | 路徑 |
|------|------|
| 租戶 onboard | `tenants/NEW_TENANT_ONBOARDING_SOP.md` |
| 租戶範本索引 | `tenants/README.md` |
| 範本路徑總表 | `docs/overview/repo-template-locations.md` |
| 長期紀律（含 AI／執行節奏 §9–§10） | `docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md` |
| 專案階段精簡 checklist | `project-kit/00_MASTER_CHECKLIST.md` |
| 釋出閘道（含多租戶 DB 條款） | `tenants/templates/core/RELEASE_GATES_CHECKLIST.md` |

## 龍蝦工廠（執行權威；路徑相對 monorepo 根）

> `agency-os/platform-templates/` 向上兩層為 **monorepo 根**。

| 主題 | 路徑（自 monorepo 根） |
|------|-------------------------|
| **Manifest JSON SSOT** | `lobster-factory/packages/manifests/` |
| **Install／rollback shell SSOT** | `lobster-factory/templates/woocommerce/scripts/` |
| MCP／核准／寫入邊界 | `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` |
| WordPress 工廠執行規格 | `lobster-factory/docs/WORDPRESS_FACTORY_EXECUTION_SPEC.md` |

## ADR（不可違背的原則）

| 主題 | 路徑（相對 `agency-os/`） |
|------|---------------------------|
| Manifest／shell SSOT | `docs/architecture/decisions/001-wordpress-manifest-and-shell-ssot.md` |
| 否決自動雙邊同步 | `docs/architecture/decisions/003-no-automated-manifest-dual-sync.md` |

## 合併前閘道

- Monorepo 根：`scripts/verify-build-gates.ps1`
