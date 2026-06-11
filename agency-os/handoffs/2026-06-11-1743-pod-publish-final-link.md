---
slug: pod-publish-final-link
created_utc: 2026-06-11T09:43:31Z
hint: "POD 一鍵上架最後一步：#7164 進 Printful 後跑 ③sync ④綁印刷檔（link 寫路徑首驗）"
source_session_summary: "2026-06-11 全日：P2a→P2c+Mockup+P2d+一鍵上架鏈全部上線 app.aware-wave.com；#7164 已 publish，只差 Printful 匯入後的綁定。"
---

# 任務目標
完成 POD 一鍵上架鏈的**最後一塊未實測拼圖**：把已發布的測試商品 #7164「REALTEST Publish Chain Tee」綁上 Printful 印刷檔（`PUT /sync/variants/{id}` 寫路徑首次真實執行）。

# 為什麼做
全鏈其餘節點（生成/去背/mockup/儲存/放大/建商品）都已上線且 REALTEST 過；只有「綁定」這節因 Printful 不即時匯入 Woo 商品而未能當場驗。綁定通了 = 整條 POD 生產線端到端閉環。

# 已試過
- #7164 已由操作者 publish（前台可加購物車）；`GET /sync/products?status=all` 仍只有 Bloom（438286779）→ **Woo 端新商品要等 Printful 匯入或 dashboard 觸發**。
- 印刷檔已備：`https://pub-a88b06f569bd41a3b9e27e29644d520e.r2.dev/print/2026-06/7a1e0399-c4de-4ab2-8d9e-b31527531620.png`（⚠ 僅 680px — 測試綁定 OK，真賣要换大設計重放大）。
- 全部工具已部署：`app.aware-wave.com/tools/publish`（deploy `a4fd0e95`，WPBRIDGE/PRINTFUL/POD env 容器內已驗）。

# 下一步指令
1. **操作者**：開 Printful Dashboard → Stores → Soulful Expression → 確認/觸發「REALTEST Publish Chain Tee」匯入（Woo 商品出現在清單）。
2. **Claude**：`GET /sync/products?status=all` 看到 ext:7164 → 用 Publish 頁 ③④（或 API `action:link`，printFileUrl=上面那顆）綁全部 4 變體 → 驗 `GET /sync/products/{id}` 每變體 files 含 front + catalog variant_id 正確（White/Black × S/M → 4017/4018/4016/4019 系）。
3. 綁定成功 → WORKLOG 記 link 寫路徑首驗 PASS → 視情況刪 #7164 或留作樣品 → 下一里程碑 = **P4 試單對帳**（下一筆測試單 → Printful 自動接單）。

# 相關資源
- 計畫：`.claude/plans/pod-studio-p2a-p4-execution-PLAN.md`；WORKLOG 2026-06-11 全日各段
- code：`apps/next-admin/app/api/tools/publish/route.ts`（link 動作）+ `lib/studio/print-provider.ts`
- 地雷：①wp-bridge `/product` 無 dry-run（每次 create 都是真寫）②Printful 只同步已發布商品 ③Replicate 餘額 <$5 節流
