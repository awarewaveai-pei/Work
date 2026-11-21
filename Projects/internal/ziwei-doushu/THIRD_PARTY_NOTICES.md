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

## MIT License 全文（上列專案共用）

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
