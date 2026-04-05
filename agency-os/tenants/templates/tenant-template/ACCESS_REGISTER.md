# Access Register

## Accounts and Systems
| System | Account/Role | Environment | Access Level | MFA | Secret Location | Rotation Due | Approver | Last Review | Audit Evidence Link |
|--------|---------------|-------------|--------------|-----|-----------------|--------------|----------|-------------|---------------------|
| WordPress |  | prod/staging | admin/editor | Y/N | vault/env | YYYY-MM-DD |  |  |  |
| Supabase |  | prod/staging | owner/admin/read-only | Y/N | vault/env | YYYY-MM-DD |  |  |  |
| GitHub |  | repo/org | admin/write/read | Y/N | vault/env | YYYY-MM-DD |  |  |  |
| n8n |  | prod/staging | owner/editor/viewer | Y/N | vault/env | YYYY-MM-DD |  |  |  |

## 規則
- 不記錄密碼或 token 原文
- 以最小權限授權
- 每月審核一次存取權限
- 所有高權限帳號必須啟用 MFA
- 每次輪替或權限變更都要補 `Audit Evidence Link`
