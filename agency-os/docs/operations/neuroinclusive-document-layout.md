# Neuro-inclusive document layout（研究對照摘要）

> **用途**：說明為何 `TASKS.md` 等營運文件採用「短句、清單、摺疊、留白」等作法；與個人醫療建議無關。  
> **原則**：降低認知負荷、提高可預測性、減少感官與情緒上的不必要刺激。

---

## 跨診斷共通（多數來源一致）

| 作法 | 為什麼 |
|------|--------|
| **強烈且一致的標題層級** | 讀者能立刻回答「先讀哪裡」；減少重新定位成本。（認知／注意力相關指引常見） |
| **清單優於長段落** | 每一點是獨立單元，降低工作記憶負荷。 |
| **短段落（約 3～5 行內）** | 「文字牆」常導致放棄閱讀；分段＝可呼吸。 |
| **留白與段落間距** | 視覺群組清楚，減少擁擠感與誤讀行。 |
| **左對齊；避免全文齊行** | 齊行會在字間留下不規則空隙（「河流」），干擾閱讀節奏。 |
| **易讀字型、足夠字級、適當行高（約 1.5～1.8）** | 減少解碼負擔；許多指南建議本文字級勿過小（網頁常見 ≥16px 等級）。 |
| **對比清楚；少用低對比灰字** | 減少眼睛與大腦的額外負擔。 |
| **強調方式一致**（例如粗體為主） | 「全部都是重點」等於沒有重點。 |
| **先摘要、後細節**（漸進揭露） | 支援「快速掃描」與「深入閱讀」兩種節奏。 |
| **固定詞彙描述狀態** | 降低不確定性；對需要秩序與可預測性的讀者特別友善。 |

---

## ADHD（注意力／工作記憶）

**重心**：減少分心源、讓重新進入閱讀時容易接續。

- 版面安靜：少裝飾、少並列干擾、背景單純。
- 行不要太長，減少視線往返迷失。
- 有意義的小標（回答「這段與我有何關係」），少用泛泛的 Overview。
- 支援「讀到一半被打斷」：每節開頭有一句定向。

**參考**：  
- [Designing for ADHD: High-Legibility Tips](https://www.influencers-time.com/designing-for-adhd-high-legibility-formats-and-tips/)  
- [Designing Websites for ADHD Inclusion](https://www.influencers-time.com/designing-for-adhd-and-neurodiverse-inclusion/)

---

## 自閉症譜系（結構、感官、語言）

**重心**：簡單一致、少譬喻負擔、視覺不要太擠。（正式 Easy Read 會搭配圖示與極短句，適合不同讀者族群；營運 repo 以 **Plain Language + 結構** 為主。）

- 簡單句、避免不必要成語／雙關。
- 固定版型：同層級標題長得像、列表規則一致。
- 充足留白；「一面不要塞太多段落」（Easy Read 類指引常見）。
- 部分自閉社群倡議避免「ASD」等用語；對外文件可用 **autistic / autism** 依組織政策選擇。

**參考**：  
- UK Home Office：[Designing for users on the autistic spectrum](https://www.gov.uk/government/publications/inclusive-communication/designing-for-users-on-the-autistic-spectrum)（Do / Don’t 摘要廣為引用）  
- [Autistic Self Advocacy Network — Easy Read / One idea per line](https://autisticadvocacy.org/resources-3/accessibility/easyread/)  
- [Leeds Autism AIM — neurodivergent accessible information](https://leedsautismaim.org.uk/resources/guide-to-making-information-accessible-for-neurodivergent-people/)

---

## OCD 相關敏感（秩序、不確定性、介面穩定）

**重心**：對齊、條理、可預測；減少「好像沒讀完」的模糊感。

- 資訊分區清楚；列表與標題邏輯順序一致。
- 避免計時壓力UI（文件層面：避免「必須立刻…」類語氣除非真有時效）。
- 減少會誘發反覆核對的設計：給 **單一真相區**（例如「未完成只認 `### 未完成`」）。
- 介面／文件改版時保留錨點與固定用語，降低「是不是哪裡又不一樣了」的負擔。

**參考**：  
- [Ipedis — OCD accessibility notes](https://design.ipedis.com/en/disability-guide/ocd/)  
- [myUX — OCD-related UX sensitivity](https://www.my-ux.com/en/conditions-overview/ocd)

---

## HSP（感官處理敏感）

**重心**：降低視覺與認知「音量」——與版面最直接相關的是 **視覺複雜度**。

- 少並列元素、少密集標籤；必要時用摺疊／分頁藏起細節。
- 溫和對比（過強黑白對有些人刺眼；也有人偏好紙張略米白）；避免密密麻麻的標籤與圖示牆。
- 給眼睛休息區（空白、簡短摘要）。

*註：許多 HSP 文獻偏居家環境（光、聲）；對 **文件** 的類比是「視覺噪音」與資訊密度。*

**參考**：  
- [Living Well — sensory overload & visual calm（空間設計類比視覺負荷）](https://www.livingwell-magazine.com/how-to-design-a-home-that-lowers-sensory-overload-for-hsps/)

---

## 創傷知情（含 C-PTSD）與長期壓力

**重心**：安全感、可選擇、可預測、不羞辱；內容與版面並重。

- **分段／chunking**：壓力賀爾蒙會讓資訊吸收變難；短塊＋清楚下一步。
- **語氣中立**：避免羞辱、恐嚇式 KPI；錯誤訊息類文件應說明「下一步」而非只貼錯誤碼。
- **選擇與控制**：可跳過細節、可折疊敏感段落；重要連結位置固定。
- **一致結構**：生活在混亂感中的人，對「可預期的版型」常有較高舒適度。

**參考**：  
- [UX Content Collective — Trauma-informed content design](https://uxcontent.com/a-guide-to-trauma-informed-content-design/)  
- [UX Collective / Nicole Design — Trauma-informed digital product](https://medium.com/@nicoledesign/trauma-informed-design-within-the-digital-product-ui-ux-world-5535d3ed2115)（連結若失效請搜尋標題）  
- [Microsoft Inclusive Design — Mental health cards (PDF)](https://inclusive.microsoft.design/tools-and-activities/MentalHealthCards.pdf)  
- [NCDVTMH — Trauma-informed writing (PDF)](https://ncdvtmh.org/wp-content/uploads/2022/10/NCDVTMH-TI-Writing-Guide-FINAL-Aug27.pdf)

---

## 本 repo 已對齊的實作（對照表）

| 研究共通點 | repo 作法 |
|------------|-----------|
| 短塊、清單、`###` 分明 | `TASKS.md` **`### 未完成`**、狀態 prefix、**`進度／下一步`** |
| 長規約不打臉 | `<details>` 摺疊 **`待辦原則`** |
| 單一未完成真相 | 規約：未完成區僅 `- [ ]`，已完成移到 **`已完成歷程`** |
| 可複製的一句話給代理 | **`閱讀輔助`** 區塊 |
| 超長子項遷出 | **雙機**細項 → **`docs/overview/DUAL_MACHINE_ENVIRONMENT_CHECKLIST.md`**；`TASKS` 只留一行 + 連結 |

---

## 仍可改進（若你要繼續優化）

1. ~~**雙機條目**~~：**已遷出** → **`docs/overview/DUAL_MACHINE_ENVIRONMENT_CHECKLIST.md`**；`TASKS` 只保留一行 + 連結。
2. **Plain-language 副檔**：同一隊列的 **`TASKS-PLAIN.md`**（極短句、無表格），由代理同步或每週生成——需約定 Single Owner 避免漂移。
3. **IDE**：Cursor / VS Code 使用較大字級、行距、主題對比；属使用者設定，不與 repo 衝突。

---

**Maintainer**：與 `agency-os/TASKS.md` 同步調整時，更新本檔「本 repo 已對齊」一節即可。

**治理總锚**（信任邊界、禁雙寫）：`docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md` **§4**。

## Related Documents (Auto-Synced)
- `docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`

_Last synced: 2026-10-14 00:16:07 UTC_

