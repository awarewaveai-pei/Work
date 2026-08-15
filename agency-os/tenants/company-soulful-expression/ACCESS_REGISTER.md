# Access Register - Soulful Expression Art Therapy

## Accounts and Systems
| System | Account/Role | Environment | Access Level | MFA | Secret Location | Rotation Due | Approver | Last Review | Audit Evidence Link |
|--------|---------------|-------------|--------------|-----|-----------------|--------------|----------|-------------|---------------------|
| WordPress | 待補 | prod/staging | admin/editor | Y/N | vault/env | YYYY-MM-DD | 待補 |  |  |
| Hosting (Hostinger) | 待補 | prod/staging | owner/admin | Y/N | vault/env | YYYY-MM-DD | 待補 |  |  |
| DNS | 待補 | prod/staging | owner/admin | Y/N | vault/env | YYYY-MM-DD | 待補 |  |  |

## Staging URL（索引；不含憑證）
- ~~Canonical：**https://staging.soulfulexpression.org/**~~ — **已作廢（2026-08-16，`lifecycle=abandoned`）**。Hostinger hosting 2026-11-12 不續約，不在退場中的主機建 staging。新主機上線後再視需要建立。SSOT 仍為 **`core/ENVIRONMENT_REGISTRY.md`**。

## Rules
- No plain secrets in markdown.
- Least privilege only.
- Monthly access review is mandatory.
