# Oracle 六類 GitHub 候選核對（2026-11-20）

輸入：操作者的 `AWARE_WAVE_ORACLE_GITHUB_RESEARCH_FOR_CLAUDE.md`。方法：`gh api repos/<r>`（授權／星數／最後 push）＋讀關鍵檔；**未下載執行任何候選程式**。分數＝該文件 §5 加權（0–5），屬判斷，非量測。

## 本站現況（決定候選有沒有用）

| 類 | 現用引擎 | 位置 | 缺口 |
|---|---|---|---|
| 紫微 | `iztro` 2.5.8（最新 2.6.5） | `lib/ziwei.ts:1`、`package.json:17` | 版本落後；2.6.1 修了酉宮太陽／太陰／七殺亮度、虛歲、晚子時運限，亮度本站直接取 iztro（`lib/ziwei/brightness.ts:46`） |
| 八字 | `lunar-javascript` 1.7.7（最新 1.7.8） | `lib/bazi.ts` | 無 |
| 塔羅 | 自寫，78 牌＋牌陣＋牌間關係 | `lib/tarot.ts:248`（`Math.random` 可注入） | 沒有牌圖（`components/TarotTool.tsx` 純文字） |
| 易經 | 自寫銅錢起卦 | `lib/iching.ts:74` | 給 AI 的 facts 只有卦名與動爻（`lib/divination/systems/iching.ts:12-24`），卦辭爻辭由模型憑記憶寫＝違反「AI 不自行產生事實」；無納甲六親 |
| 占星 | `@xalen/wasm` 0.6.0，Apache-2.0（最新 0.7.0） | `lib/astrology.ts:1` | 只有本命盤；無相位、行運、合盤（`xalen_wasm.d.ts` 無 aspect API，需自算） |
| 每日 | 自寫（八字喜用神＋黃曆宜忌） | `lib/daily.ts:66` | 無 |

## 候選（已確認＝GitHub API 或檔案親讀）

| 類 | 專案 | 授權 | 星 | 最後 push | 分 | 結論 |
|---|---|---|---:|---|---:|---|
| 紫微 | SylarLong/iztro | MIT | 4418 | 2026-11-20 | 4.6 | 已在用；升版 |
| 紫微 | x-haose/x-iztro | MIT | 8 | 2026-11-18 | 3.2 | `tests/golden/generate_*.mjs` 由 iztro 產生＝與 iztro 一致性測試，不是獨立見證；不採用 |
| 紫微 | SylarLong/react-iztro | MIT | 535 | 2026-11-17 | 3.0 | 本站已有 `components/ZiweiChart.tsx`；僅 UI 參考 |
| 紫微 | ziweiknows/ziwei-chart | GPL-3.0 | 512 | 2026-10-26 | 2.2 | GPL，不可併入；只看 UX |
| 八字 | 6tail/lunar-javascript | MIT | 1757 | 2026-11-05 | 4.3 | 已在用 |
| 八字 | cantian-ai/bazi-mcp | ISC | 435 | 2025-10-11 | 3.0 | 一年未更新；本站無 MCP 需求 |
| 八字 | 6tail/lunar-python | MIT | 702 | 2026-11-05 | 2.6 | 語言不符 |
| 塔羅 | fzlzjerry/tarot-mcp | MIT（含牌圖） | 15 | 2026-09-20 | 3.5 | `assets/ASSET_LICENSE.md`：78 張為 AI 生成、MIT、附 prompt 與雜湊；唯一來源清楚的牌圖 |
| 塔羅 | J-York/TarotWhisper | MIT（程式） | 37 | 2026-10-19 | 3.0 | 牌圖由 `scripts/download-cards.js` 抓 archive.org `rider-waite-small-jpeg`，版本未標＝權利不明 |
| 塔羅 | anois/tarot | MIT（程式） | 5 | 2026-06-18 | 2.4 | 3D 互動參考；牌圖未核 |
| 易經 | Ann1949/iching-kit | MIT | 0 | 2026-11-14 | 3.6 | TS、零依賴；64 卦辭＋384 爻辭＋用九用六（古文，公有領域，`scripts/gen-data.mjs` 註明不含英譯）＋朱熹七種變爻讀法；v0.1.0、簡體 |
| 易經 | kentang2017/ichingshifa | MIT | 315 | 2026-10-01 | 3.1 | Python 單檔 80KB＋`data.pkl`；大衍筮法與納甲規則可對照，不能直接用 |
| 易經 | JinyangWang27/ichingpy | MIT | 10 | 2026-11-10 | 2.4 | Python，解釋未完成 |
| 易經 | bonchiang96/iChing-JS | 無 LICENSE | 0 | 2026-11-17 | 1.0 | 無授權，不可用 |
| 占星 | g-battaglia/kerykeion | AGPL-3.0 | 736 | 2026-11-18 | 2.4 | AGPL＋Python；本站已有 Apache-2.0 引擎，不需要 |
| 占星 | NoahChristian/openephem | MIT | 1 | 2026-11-01 | 2.0 | 精度為作者宣稱，未驗 |
| 占星 | flatangle/flatlib | MIT | 395 | 2026-10-09 | 1.6 | 已 archived；依賴 Swiss Ephemeris |
| 每日 | （無獨立引擎） | — | — | — | — | 文件 §3.6 結論成立；本站已是確定性算法 |

文件勘誤：TarotWhisper、anois/tarot、openephem 的 GitHub 授權欄顯示 NOASSERTION，LICENSE 檔實為 MIT；kerykeion 不是本站需要的選項（文件不知道本站已用 XALEN）。

## Backlog（收益高、成本低在前）

1. **iztro 2.5.8 → 2.6.5**：修正式站上酉宮三顆主星亮度與虛歲、晚子時運限。驗：既有 `lib/ziwei.test.ts`、`lib/ziwei/analyze.test.ts`＋酉宮太陽一例前後對照。
2. **易經補原文**：卦辭、動爻爻辭與朱熹讀法進 facts（資料取自 iching-kit，MIT，註記於 `THIRD_PARTY_NOTICES.md`；簡轉繁；驗 64＋384＋2 筆數與七種變爻情況）。
3. **占星相位**：用現有行星黃經自算主要相位與容許度；之後才是行運、合盤。
4. **塔羅牌圖**：採 tarot-mcp 那副（MIT）或 1909 年原版掃描——外觀是產品決定，由操作者選。
5. 納甲六爻：獨立一張卡，規則對照 ichingshifa。

不做：Kerykeion、ziwei-chart 併入；x-iztro；任何 Python 引擎搬進站內。

## 需專業確認

- AI 生成圖在各地是否受著作權保護未定；tarot-mcp 的 MIT 授權在「有權利的範圍內」給予。
- Rider-Waite：1909 原版在美國屬公有領域；1971 年後重新上色版另有權利主張。用掃描圖前要確認是 1909 版。
