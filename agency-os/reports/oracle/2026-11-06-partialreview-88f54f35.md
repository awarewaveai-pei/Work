# codex-oracle review -- 2026-11-06 08:19:56 +08:00

- mode: `review`
- scope: -Path scripts/filmcraft-pro, scripts/craft-web-build/lib.sh  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `6cbcae4e5`
- context: FC.1: reproducible FilmCraft web build chain (WSL). build.sh pins upstream filmcraft + craft-fonts + wasm-bindgen + wasm-opt, applies two patches (Traditional Chinese fonts compiled into the wasm; ArtCraft wordmark removed because upstream docs/brand/LICENSE-brand.txt requires modified versions to remove the marks), assembles in a staging dir and swaps atomically. New shared function craft_brand_scan in craft-web-build/lib.sh searches 64-byte windows of every upstream brand file inside every dist file, because a mark compiled into the wasm cannot be found by a whole-file hash. Nothing here is deployed yet.
- exit: 0 | elapsed: 173390ms | answer: 967B
- files-reviewed: scripts/craft-web-build/lib.sh, scripts/filmcraft-pro/PIN.json, scripts/filmcraft-pro/README.md, scripts/filmcraft-pro/build.ps1, scripts/filmcraft-pro/build.sh, scripts/filmcraft-pro/no-artcraft-marks.patch, scripts/filmcraft-pro/tc-fonts.patch
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 產物缺少自身 `NOTICE` 指向的逐檔授權與來源清單  
  file:line   -> `scripts/filmcraft-pro/build.sh:91`  
  confidence  -> CONFIRMED  
  scenario    -> 已產生的 `46763a8-b7f3040` 產物中，`NOTICE:13` 指向 `ATTRIBUTION.md`，但產物沒有該檔；使用者無法從交付物取得其宣稱提供的逐檔作者、來源與授權資訊。  
  why missed  -> 組裝檢查只要求 `NOTICE` 與兩份 `LICENSE` 存在，沒有核對 `NOTICE` 所引用的檔案。

FINDING 2: Windows 入口會把舊產物報成這次建置結果  
  file:line   -> `scripts/filmcraft-pro/build.ps1:28`  
  confidence  -> CONFIRMED  
  scenario    -> 這次建置成功，但另一個舊版產物目錄的修改時間較新時，腳本按 `LastWriteTime` 選中舊版，印出錯誤的 `dist` 路徑與檔案清單。  
  why missed  -> `build.sh` 已算出確切的產物名稱，Windows 入口卻另用修改時間推測結果。

TOTAL: 2 findings
