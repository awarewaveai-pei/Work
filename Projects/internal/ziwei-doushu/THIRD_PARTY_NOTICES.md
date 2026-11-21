# Third-party notices

本站部分命理規則參考下列開源專案改寫。只列實際改寫採用者；未授權的參考來源不複製程式或文字。

## tarot-skill

- 來源：https://github.com/daman-ovo-0404/tarot-skill
- 授權：MIT License，Copyright (c) 2026 tarot-skill contributors
- 採用範圍：牌間關係規則（花色／元素分布、大阿爾克那比例分級、相鄰牌關係）改寫於 `lib/tarotRelations.ts`；diamond／moon／horseshoe 牌陣位置於 `lib/tarot.ts`；塔羅解讀寫法於 `lib/ai/prompts/systems.ts` 的 tarot 項。程式為本專案自行重寫，未複製原始碼。

## bazi-skill

- 來源：https://github.com/jinchenma94/bazi-skill
- 授權：MIT License，Copyright (c) 2025 jinchenma94
- 採用範圍：神煞查表口徑（`references/shensha-table.md`）、大運順逆與起運規則（`references/dayun-rules.md`）、干支合沖刑害表（`references/wuxing-tables.md`），以 TypeScript 改寫於 `lib/baziShensha.ts`、`lib/baziRelations.ts`；`scripts/pai_pan.py` 僅作測試交叉核對，未複製。

## iching-kit

- 來源：https://github.com/Ann1949/iching-kit
- 授權：MIT License，Copyright (c) 2026 I Ching Oracle；所含《周易》卦爻辭為古文，屬公有領域
- 採用範圍：`src/data/classic.ts` 的 64 卦卦辭、384 爻辭與用九用六中文原文，轉為繁體並與 ichingpy、ichingshifa 逐條校對改正後收於 `lib/iching/text.ts`；未採用其英文關鍵詞。變爻讀法（`lib/iching/reading.ts`）為本專案依朱熹《易學啟蒙》自行實作，未複製原始碼。

## tarot-mcp

- 來源：https://github.com/fzlzjerry/tarot-mcp
- 授權：MIT License，Copyright (c) 2024 Morax
- 採用範圍：`src/tarot/readings/spreads.ts` 的牌陣種類與牌位構想（愛情、事業、靈性、脈輪、曼陀羅、生命之樹、年度、十二宮位等），牌陣名稱與牌位文字為本站自寫繁中／英文，收於 `lib/tarot.ts`；亂數的拒絕取樣做法參考 `src/tarot/shared/utils.ts`，程式為本專案以 TypeScript 重寫，未複製原始碼。

## anois_tarot

- 來源：https://github.com/anois/tarot
- 授權：MIT License，Copyright (c) 2026 anois
- 採用範圍：`src/spreads/builtins.ts` 的牌陣種類與牌位構想（二選一、是非澄清、桃花、正緣、復合、曖昧、事業與財運全景等），牌位文字為本站自寫；未採用其英文牌義與牌圖座標；亂數取樣做法參考 `src/mechanics/rng.ts`，程式為本專案重寫。

## openephem

- 來源：https://github.com/NoahChristian/openephem
- 授權：MIT License，Copyright (c) 2026 Elizabeth Huston, Ph.D. and Noah Christian, Ph.D.
- 採用範圍：`src/openephem/aspects.py` 的相位判定做法（最短弧角距、日月加寬容許度、以速度判斷入相／出相），以 TypeScript 自行重寫於 `lib/astrologyAspects.ts`；未複製原始碼。

## flatlib

- 來源：https://github.com/flatangle/flatlib
- 授權：MIT License，Copyright (c) 2015 FlatAngle
- 採用範圍：`flatlib/aspects.py` 的主要相位角度與入相／出相分類方式，作為 `lib/astrologyAspects.ts` 的對照；程式為本專案自行重寫，未複製原始碼。

另：`lib/astrologyAspects.ts` 的容許度數值（合／沖／拱／刑 6°、六合 5°、日月 +1.5°）與 Kerykeion（AGPL-3.0）預設值一致；這是主流本命盤的公開慣例數值，僅取數值，未取用 Kerykeion 的任何程式或文字。

## ichingpy

- 來源：https://github.com/JinyangWang27/ichingpy
- 授權：MIT License，Copyright (c) 2024 Jinyang Wang
- 採用範圍：六爻納甲規則（`src/ichingpy/divination/six_lines.py` 的納干、納支、世應、六親、六神；`model/sexagenary_cycle.py` 的旬空算法），依京房通行口徑以 TypeScript 自行重寫於 `lib/iching/najia.ts`；八宮歸屬以 64 卦逐宮對照傳統表測試，未複製原始碼。

## MIT License 全文（上列專案共用）

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
