# Method Atlas 切片：精簡版標準（2026-09-06 操作者裁定）

**通用規則以 `D:\Work\agency-os\AGENTS.md` 為準**——那份每輪自動注入，不必也不應該在這裡重複（R0/R4 查證與兩層驗證紀律、critic 深度風險分級、TASKS/WORKLOG 不重複全文，全部已在那邊）。**本檔只放 Method Atlas 切片專屬、`AGENTS.md` 沒有對應內容的檔案格式規定**——給任何要建 Method Atlas 切片的 session／agent 看的第二份文件（第一份永遠是 `AGENTS.md`）。舊的 44–48 號切片（`security.stride`～`security.dpia_pia`）文書量偏重，操作者 2026-09-06 明確裁定「該砍的都砍」——本檔是那個裁定在 Method Atlas 這個領域的落地版，**從第 49 號切片起適用**。舊切片不回改（歷史記錄）。

## 砍掉（Method Atlas 專屬文書，不影響正確性；真查證／兩層不變量／真測試不在此列——那是 `AGENTS.md` R0/R4 本體，不准砍）

1. **contract yaml 的 `description`**：舊版常常 3000+ 字散文。新標準：**5–8 行**——method_id／family／Atlas 引用行號＋一句話／是否在 EC §32 內／核心不變量是什麼＋一句話理由。不重複自我介紹「這是第 N 個 F20 成員」的完整故事。
2. **`compilation_decisions`**：舊版每條配一整段 reasoning 散文。新標準：**`question` 一句話＋`decision` 一句話**，不寫 `reasoning` 段落（除非該決策真的有反直覺、需要一句話交代「為什麼不是更明顯的做法」）。
3. **`open_questions`**：舊版每條配 owner／blocks／完整脈絡。新標準：**一行一條**，格式 `OQ-<NAME>-N: <問題>（owner: 通常是 operator）`。
4. **獨立 slice 文件**（`docs/FORTYEIGHTH_SLICE_...md` 這類）：**不再逐一開檔**。改成在 WORKLOG 條目裡用 3–5 行交代：做了什麼／real invariant 是什麼／測試結果／有沒有發現重複風險。WORKLOG 本身就是查詢紀錄，不需要第二份平行文件。
5. **每個切片獨立跑一次全套 regression／golden**：改成**每批（如 5 個平行方法）跑一次**，不是每個方法各跑一次。
6. **逐個方法維護 `method-inventory.yaml`**：**不再當必要步驟**。這份登記表已經爛了 44 個方法都沒人管，也沒因此出過任何真實問題——它不是真正的資料來源，`contract-backlog.yaml` 才是。恰好在改同一區塊時可以順手修，但不必為了它單獨開一個編輯步驟。

## 不變的產出（每個方法還是要有這 4 個檔案）

1. `methods/contracts/security.<name>.contract.yaml`（精簡版）
2. `specs/cognitive/typed-objects/<name>-record.schema.yaml`
3. `ai_lego/modules/security/<name>.py`（builder＋gate，兩層不變量）
4. `ai_lego/apps/cli/run_<name>_slice.py` ＋ `tests/unit/test_<name>.py`

## 給接手 session 的一句話版本

> 「`AGENTS.md` 的規則優先（已自動注入，不用另外讀）；Method Atlas 切片再照 `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/methods/METHOD_ATLAS_SLICE_LEAN_STANDARD.md` 補專屬規定——contract 散文說明／獨立 slice 文件／逐個跑全套 regression／逐個維護 method-inventory.yaml 都省掉。」

## 為什麼會有這份文件（背景，供稽核）

44–48 號切片（STRIDE／LINDDUN／Attack Tree／PASTA／DPIA-PIA）建立了「每個方法配一篇論文式 contract＋一份獨立 slice 文件」的先例，被後續切片機械式複製，文書量持續膨脹，但 critic 覆審持續證實：**抓到的幾乎都是揭露/引用完整性問題，不是邏輯 bug**——代表散文本身沒有在擋真的錯誤，測試才是真正的防線。操作者 2026-09-06 直接指出這個比例失衡（「該砍的都砍」），本檔是回應。
