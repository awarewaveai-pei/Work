---
name: wp-redirect
description: Create a WordPress 301/302 redirect through Rank Math on a live client site. HIGH-RISK: the ssh/WP-CLI step is additionally gated by high-risk-bash-warn.js.
argument-hint: <from> <to> [code]
---

# /wp-redirect — WordPress 301/302 轉址（Rank Math）

新增一條 URL 轉址到 soulfulexpression.org，透過 SSH + WP-CLI 直寫 Rank Math redirections 表。

## 用法

```
/wp-redirect <from> <to> [code]
```

- `from` — 舊路徑（含開頭 `/`，如 `/art-therapy-kits/`）
- `to`   — 新路徑或完整 URL（如 `/shop/` 或 `https://external.com/page/`）
- `code` — 選填，301（預設，永久）或 302（暫時）

## 執行步驟

### Step 1 — 解析參數

```
args = "<from> <to> [code]"
```

- 從 args 拆出 FROM、TO、CODE（預設 301）
- 驗證 FROM 以 `/` 開頭；TO 以 `/` 開頭或 `https://` 開頭
- 若缺 FROM 或 TO → 顯示用法並停止

### Step 2 — SSH + WP-CLI 新增轉址

```bash
ssh -i ~/.ssh/hostinger_soulful -p 65002 -o StrictHostKeyChecking=no \
  u942075013@191.101.230.176 "
WP_PATH=/home/u942075013/domains/soulfulexpression.org/public_html
wp --path=\$WP_PATH eval '
use RankMath\Redirections\DB;
\$id = DB::add([
  \"sources\"     => [[\"pattern\" => \"<FROM>\", \"comparison\" => \"exact\"]],
  \"url_to\"      => \"<TO>\",
  \"header_code\" => <CODE>,
  \"status\"      => \"active\",
]);
echo \$id > 0 ? \"OK id=\" . \$id : \"FAIL\";
' 2>&1
"
```

### Step 3 — 清 LiteSpeed Cache

```bash
ssh -i ~/.ssh/hostinger_soulful -p 65002 -o StrictHostKeyChecking=no \
  u942075013@191.101.230.176 \
  "wp --path=/home/u942075013/domains/soulfulexpression.org/public_html litespeed-purge all 2>&1"
```

### Step 4 — curl 驗證

```bash
curl -sI "https://soulfulexpression.org<FROM>" | grep -E "HTTP|Location"
```

預期輸出：`HTTP/1.1 301 Moved Permanently` + `Location: <TO>`

### Step 5 — 回報

```
✅ 轉址完成
FROM:    <FROM>
TO:      <TO>
CODE:    <CODE>
Rank Math ID: <id>
curl 驗證: HTTP 301 → <TO>
```

## 連線資訊（SSOT）

| 項目 | 值 |
|------|----|
| Host | `191.101.230.176` |
| Port | `65002` |
| User | `u942075013` |
| Key  | `~/.ssh/hostinger_soulful` |
| WP path | `/home/u942075013/domains/soulfulexpression.org/public_html` |

詳細伺服器資訊：`agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md`

## 錯誤處理

| 錯誤 | 處理 |
|------|------|
| SSH 連不上 | 顯示 SSH 錯誤，不繼續 |
| DB::add 回 0 或 false | 顯示 FAIL，讓操作者手動加 |
| curl 仍回 200 | 提示「快取可能延遲，等 30 秒再試」|
| FROM 已有轉址 | Rank Math 會新增第二條，不覆蓋舊的（可手動刪） |