# Architecture decisions（輕量 ADR）

> **何時寫**：跨系統邊界、**不可逆**或 **高成本迴轉** 的選擇（例如 manifest SSOT、主機遷移、身分方案、資料主庫）。  
> **何時不寫**：單檔 typo、小重構、明顯 bugfix——`WORKLOG` 一句即可。

## 格式（複製新建 `NNN-short-title.md`）

```markdown
# ADR NNN: 標題

- 狀態：提案 / 已接受 / 廢止（取代者：連結）
- 日期：YYYY-MM-DD

## 脈絡
（問題是什麼、約束是什麼）

## 決策
（選了什麼，一句話）

## 後果
- 正面：
- 負面／代價：
- 需跟進文件／腳本：（路徑列表）
```

## 已定案索引

| ADR | 標題 | 日期 |
|-----|------|------|
| [001-wordpress-manifest-and-shell-ssot.md](001-wordpress-manifest-and-shell-ssot.md) | WordPress manifest 與 staging install shell 的 SSOT | 2026-04-02 |
| [002-clerk-identity-boundary.md](002-clerk-identity-boundary.md) | 應用層身分預設 Clerk（邊界與非目標） | 2026-04-02 |
| [003-no-automated-manifest-dual-sync.md](003-no-automated-manifest-dual-sync.md) | 否決 manifest 自動雙邊同步（預設） | 2026-04-02 |
| [004-trigger-vs-n8n-orchestration-boundary.md](004-trigger-vs-n8n-orchestration-boundary.md) | 耐久編排 Trigger；n8n 僅黏著層 | 2026-04-02 |
| [005-supabase-sor-vs-wordpress-runtime-db.md](005-supabase-sor-vs-wordpress-runtime-db.md) | SoR 在 Supabase；WP DB 為執行期 | 2026-04-02 |
| [006-supabase-tenant-isolation-and-clerk-mapping.md](006-supabase-tenant-isolation-and-clerk-mapping.md) | 多租戶 RLS + Clerk 對照原則 | 2026-04-02 |

## 本機檢查（可選）

在 **`agency-os/`** 根目錄：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-adr-index.ps1
```

若新增 ADR 檔却未更新上表，腳本會 **FAIL**。**`verify-build-gates`**（monorepo 根）已內建此步驟，與 `system-health-check` 銜接。

## 與其他檔的關係

- **摘要與證據**：仍寫入 `WORKLOG.md`（含 PR／ticket／日期）。
- **長期憲章級原則**：`docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`
- **連動檢查**：新 ADR 若影響治理／健康閘道，照 `docs/CHANGE_IMPACT_MATRIX.md` 更新關聯檔。

## Related

- `docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`
- `docs/releases/upgrade-path.md`
