# 在 repo 的位置（2026-11-02 搬入，先讀這段）

原始碼 2026-11-02 從交付包（原 `D:\Video\video-workbench`，已退場）搬到這裡，只在這裡改。啟動仍是雙擊 `start.cmd`（http://127.0.0.1:4178/）。外觀直接讀旁邊的 `../next-admin`，不再用 AwareWave-source 副本。

不進 git（見 `.gitignore`；D:\Work 是公開 repo）：

- `assets/image-*`、`assets/storyboards-data.json`：從參考網站 seedstar.ai 擷取的圖片與分鏡資料，只供本機參考。新機從舊機的 `apps/video-workbench/assets/` 複製過來（不在 git），分鏡靈感頁才有內容。
- `assets/vision` 的 bundle 與 wasm：`npm ci` 時由 `scripts/vendor-vision.cjs` 從 npm 套件複製並以 `sources.json` 的 SHA-256 驗證。
- `vendor/ffprobe/ffprobe.exe`：`npm ci` 時由 `scripts/vendor-ffprobe.cjs` 從 GyanD/codexffmpeg 6.1.1 essentials 下載（與 ffmpeg-static 內的 ffmpeg 同一 build），以 `vendor/ffprobe/sources.json` 的 SHA-256 驗證；非 Windows 用環境變數 `FFPROBE_PATH`。
- `.data`（作品與任務）、`node_modules`、`runtime`。
- `runtime/blender/`（3D 引擎，卡 P5，約 400 MB，選用、不隨 `npm ci` 也不進發行包）：要用 3D 工作區的渲染與動作重定向時，在本資料夾執行 `node scripts/vendor-blender.cjs`（下載 Blender 4.5.9 LTS portable，以 `vendor/blender/sources.json` 的大小與 SHA-256 驗證）；其他平台或已裝 Blender 的機器設環境變數 `BLENDER_PATH`。沒裝時 3D 頁顯示「尚未安裝 3D 引擎」與這條指令。閘門與能力表：`docs/p5-gate-20261103.md`。

進 git：`vendor/three/0.186.0/`（three.js，MIT，`node scripts/vendor-three.cjs` 依 npm sha512 產生，各檔 SHA-256 在 `VERSION.json`；3D 檢視器只讀這份靜態檔，不連 CDN）。

**計畫與需求**：排程、卡片、路線在 `docs/creative-suite-plan-20261102.md`（唯一來源）；需求逐項與驗收在 `handoff/Claude_Code_handoff_20261102.md`。2026-11-02 已把交付包最後的人物跟拍修正（`docs/follow-quality-20261102.md`）搬進來；`D:\Video` 已退場，Downloads 副本已刪（2026-11-02）；4178 跑這份，資料在本資料夾 `.data/`。

下方各段是搬入前的歷史紀錄，其中 4179、AwareWave-source 等說法以本段為準。

---

# 側邊欄點擊修正（2026-11-01，最新）

修正開啟素材庫、素材預覽、儲存設定或任務成果後，整頁浮層覆蓋側邊欄的問題。根工作台浮層限制於內容區；手機橫向導覽同樣保留。切換導覽會透過既有關閉流程結束素材選擇、停止已關閉任務視窗的輪詢，並收起設定、提示詞引用選單；不會取消伺服器中的生成任務。

`tests/sidebar-overlays.cjs` 以隔離 TEMP 資料驗證桌面／手機各 11 個導覽入口，涵蓋設定、素材預覽及成果浮層，確認點擊命中導覽、切頁完成且沒有殘留輪詢。generator-deep-actions、popover-ratios、appearance 回歸通過。實際 4179 預覽亦已操作儲存設定→應用工具、素材庫→應用工具→生成頁成功。

Claude 首次審查 approve，提出兩個 minor：引用選單改用既有關閉 helper，已修正且限定複核為 approve／零 finding；成果帶入工具時若工具載入失敗，成果視窗已關閉，但成果仍可從歷史紀錄重新開啟，此行為保留。原文、備份及凍結快照：`%TEMP%/vw-sidebar-4repghxx/`。

分鏡靈感五個專用檔案及共用 workspaces.css SHA-256 均符合修改前基線；沒有修改分鏡設計。僅根工作台 CSS、路由浮層清理及成果關閉按鍵標記有所變更。新版請使用 http://127.0.0.1:4179/ ，既有分頁需重新整理才會載入新 CSS／路由程式。

- REALTEST_EVIDENCE: tool=exec_command | cmd=node tests/sidebar-overlays.cjs | exit=0
- REVIEW_DONE: critic=Claude | verdict=approve | findings=0 | scope=引用選單關閉限定複核
- BUGHUNT_DONE: scope=video-workbench/styles/index.css,scripts/index-1.js,shared/jobs-view.js,tests | checks=overlay-hit-testing,sidebar-navigation,picker-settlement,polling-cleanup

---

# 設定關閉與新增比例（2026-11-01，最新）

- 模型、輸出、技能、字幕等設定面板新增固定可見的「完成 ×」；捲動後仍可按，關閉後焦點返回原按鍵。外側點擊、Escape、再次點原鍵仍可關閉。設定保留，不因關閉消失。儲存設定為原有獨立對話框，仍由其關閉鍵操作。
- 圖片輸出新增 4:5、4:3，支援 1K／2K／4K、草稿還原與實際本機裁切。4:5 長邊取最接近的十像素倍數，保留精確比例與偶數尺寸；例如 2K 為 1640×2050。4:3 的 2K 為 2048×1536。保留供應商原圖，放大不代表新增 AI 細節。
- 影片服務仍只接受 16:9／9:16，新比例在影片設定中明示停用；重拍可保存新比例草稿，仍未接專用服務。
- 分鏡靈感保護檔六項 SHA-256 與修改前完全相同，沒有更動其設計。

新增 `tests/popover-ratios.cjs`，以隔離 TEMP 資料與 mock provider 驗證桌面／手機關閉、焦點返回、草稿保存及六種真實 PNG 尺寸。generator-buttons、generate-parity、generate-mode-audit 回歸通過。Claude 唯讀審查 approve、零 finding；凍結差異與原文在 `%TEMP%/vw-popover-ratios-crg5vww9/`。

新版受管理預覽已啟動於 http://127.0.0.1:4179/ ，資料隔離於 `.data-4179`。原本 http://127.0.0.1:4178/ 程序保留，該程序的後端仍是舊版；請使用 4179 檢查本次新增比例。預覽沒有遷移原網址瀏覽器的素材庫。封裝仍以 start.cmd 啟動，預設 4178，需先關閉原本佔用該埠的服務。

- REALTEST_EVIDENCE: tool=exec_command | cmd=node tests/popover-ratios.cjs | exit=0
- REVIEW_DONE: critic=Claude | verdict=approve | findings=0 | scope=設定關閉與新圖片比例
- BUGHUNT_DONE: scope=video-workbench/scripts,backend,styles,tests | checks=popover-close,focus-return,ratio-restore,provider-orientation,image-dimensions

---

# 深層操作校正（2026-11-01，最新）

本次接續實際操作官網的素材替換／預覽／清除復原、既有成果的工具與帶入分支、導演諮詢→腳本→生成設定、商品解析→素材→提案→逐鏡腳本、圖片局部編輯。此段更新前輪「尚未解析／尚未進入後續畫面」的紀錄；下面舊段落保留為歷史。

- 導演改為真正的多輪文字服務；圖片以視覺輸入送入 Responses，包含用途標籤。支援建議回覆、複製、重新回覆、修改腳本、帶入全能參考、保存對話與生成前確認。生成階段分開顯示模型／比例／時長／畫質／技能。舊草稿仍可開啟。
- 商品網址可讀取公開 HTTPS 頁面，擷取標題、價格 metadata、文字與圖片候選。已以與官網同一公開 Apple 商品頁實測：AirPods Pro 3、12 張圖候選、12 段文字。這是本機公開頁擷取，沒有複製官網私有解析器；需登入、受網站封鎖或依賴 JavaScript 的內容可手動補充。候選圖選取後先匯入本機，最多選九張。
- 商品提案只送已選文字；確認提案後由文字服務展開具體腳本，取代固定三段範本。每鏡有時間／畫面／口白，風格可編輯；可縮短至目標秒數、強化開場、讓口吻更自然，新增／刪除分鏡並估算口白時長。生成設定與技能明確顯示。
- 素材補立即單選替換、保留編號、預覽與下載、多選清除勾選。清除全部後八秒內可復原；清除後若已有新輸入，不覆蓋新草稿。口播人物、聲音各自可清除。
- 成功成果補完整參數、提示詞複製、還原設定，以及首幀／動作／口播／局部編輯／配音帶入。這些操作只準備草稿，不會直接新增影像生成任務。模仿動作目前進入本機對應工作區，尚非官網結果上的同款彈窗。
- 局部編輯保留最多八區，新增逐區指令、移動、八方向縮放、雙擊選區聚焦指令、逐區刪除；整體指令選填。區域座標、指令與 PNG 遮罩實際一起送出。重設保留原圖。

**分鏡靈感維持使用者原設計**：五個專用檔案與共用 `styles/workspaces.css` 均以修改前 SHA-256 驗證不變；基線在 `tests/storyboards-design-baseline.json`。外觀繼續讀取 AwareWave 主系統 tokens，沒有修改主系統或部署。

本機自用不做平台扣點，既有用量／報價／主系統 adapter 接點保留。後續訂閱、app.aware-wave.com 及 WordPress aware-wave.com 正式串接尚未部署。本包不含金鑰或使用者資料。

仍不能稱為官網全部功能相同：官網專有模型、影片重拍、動作轉移、人物對嘴、字幕燒錄、平台／授權角色庫、雲端創作畫布及長片合成仍需接入對應服務。影片目前依服務能力提供 4／8／12 秒；不支援的選項明示停用。導演音訊素材與官網全部更多選單尚未重現。商品解析尚未完整對應官網的品牌／庫存／評價等結構化資料。免費官網文字流程和公開解析已核實，沒有送出官網最終影片／圖片生成，亦未驗收付費成片。

驗證採 TEMP 隔離資料庫與供應商攔截，不寫入使用者 `.data`。新增測試：`tests/director-conversation.cjs`、`tests/product-script.cjs`、`tests/product-inspect.cjs`、`tests/generator-deep-actions.cjs`；`tests/generation-flows.cjs` 改為隔離伺服器並加入區域移動／縮放／指令驗證。Responses 視覺輸入依官方文件：https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses 。公開頁擷取遵循 AwareWave collect/net 的逐次轉址檢查、DNS 位址固定連線及容量／逾時上限原則。


本輪測試通過：director-conversation、product-script、product-inspect、generator-deep-actions、generation-flows、generator-buttons、backend、generate-parity、generate-mode-audit、appearance、host-adapter、startup、restored-ui。原 generate-parity 的「商品技能隱藏所以不套用」舊斷言，已隨商品頁新增明確可見的技能控制，更新為驗證顯示並實際套用。

Claude 首次審查提出成果還原與導演生命週期等五項問題，已修正並新增回歸；限定修正複核為 approve、零 finding。完整原文與凍結快照在 `%TEMP%/vw-deep-review-3w3bjtps/`。無 Git repo，未建立虛構 Git ORACLE 紀錄。分鏡保護雜湊全部符合基線。

- REALTEST_EVIDENCE: tool=exec_command | cmd=node tests/director-conversation.cjs | exit=0
- REVIEW_DONE: critic=Claude | verdict=approve | findings=0 | scope=本輪深層流程及審查修正
- BUGHUNT_DONE: scope=video-workbench/scripts,shared,backend,styles,tests | checks=restore-routing,conversation-reset,stale-reply,duration,region-mask,public-url

啟動狀態：原本 4178 的程序仍在運作；本輪重啟與另開背景服務的命令均遭工具政策拒絕（blocked by policy），未能套用新後端到該執行中程序。新程式碼與封裝已寫入磁碟；要使用新後端，請關閉原啟動視窗，再執行此版本的 `start.cmd`。不要把原程序仍回應 HTTP 200 當成新後端已部署。

---

# 生成頁按鍵核對（2026-11-01）

本輪實際開啟 `https://seedstar.ai/generate`，逐一切換七種生成模式，展開模型、輸出、技能、字幕、設定、素材來源、引用、人物與聲音面板。核對範圍為生成頁及其面板；官網需扣點的生成／商品解析未送出，因此未驗證其後續畫面。這份紀錄不宣稱官網全站或所有付費功能已重現。

| 按鍵／畫面 | 實際差異與修正 |
|---|---|
| 字幕 | 補七種語言（最多二種、保留先後順序）、六種樣式、三種大小、四種位置與預覽；設定隨模式草稿、生成設定保存。字幕服務未接，開啟後送出會在付費前拒絕。 |
| 技能 | 補系統／自訂分頁、依選取順序複選最多五個、不套用及管理入口；真正把選定指引送入生成。內建八項為本機撰寫指引，並非官網二十項技能的複製或完整替代。舊單技能設定可還原，舊設定沒有字幕樣式時還原預設樣式。 |
| 素材庫 | 生成器圖片選擇補我的素材／我的角色／平台角色庫／授權角色分頁、預覽與返回。前兩者讀既有 store；平台與授權來源未接，明示空白原因，不把示範角色當作已授權素材。影片可依長度篩選，長度未知只列全部。 |
| 插入 @ | 改為提示詞旁的引用選單，亦可直接輸入 @ 搜尋；可引用已選素材或從本機素材庫加入，支援上下鍵、Enter、Escape。 |
| 拍片輸出 | 獨立的比例單選與 480p／720p／1080p 草稿設定，移除不屬於重拍的時長／聲音／浮水印；仍未接重拍供應商。 |
| 動作參考 | 朝向跟影片最長 30 秒、朝向跟照片最長 10 秒的提示隨切換更新；保留照片／影片、畫質、原聲與補充描述。專用服務未接。 |
| 口播 | 人物分頁改為我的角色／授權角色庫／從素材庫；聲音面板只顯示六種既有內建選擇，移除不對應官網的聲音來源分頁。口播 @ 按鍵進入人物素材庫；台詞直接輸入 @ 不切換面板或搶走焦點。人物對嘴仍未接。 |
| 面板關閉 | 修正輸出面板遮住原按鍵，及面板容器誤被當成觸發按鍵的問題；面板按觸發按鍵定位，再點原鍵、點外側、Escape 或切換模式可關閉。 |
| 其他既有按鍵 | 六種卡通風格、導演初始／腳本操作、商品四步驟、圖片尺寸、儲存／套用預設、上傳、清除、音軌擷取由既有及新增回歸覆蓋。商品解析、對嘴、動作轉移及官網模型仍受服務邊界限制。 |

驗證：`node tests/generator-buttons.cjs`、`node tests/generate-parity.cjs`、`node tests/generate-mode-audit.cjs`、`node tests/restored-ui.cjs` 通過；合約型別檢查與 `node tests/appearance.cjs`、`node tests/generation-flows.cjs` 通過。測試採隔離暫存資料與供應商攔截；沒有呼叫付費生成。另以實際 4178 工作台目視確認字幕面板；隔離桌面截圖在 `%TEMP%/vw-buttons-visual-CnWwjU/`。外觀延用 AwareWave tokens，沒有改主系統或部署。

跨模型審查：Claude 唯讀檢查九個改動檔，提出舊設定字幕值殘留與口播 @ 焦點問題；均修正並由實測驗證。最後限定焦點守衛複核為 `approve`，保留一項不影響功能的測試顯式斷言建議；不把限定複核當全站驗收。審查原文 `review-answer.json`、`verify-answer.json`、`focus-answer.json` 均在下述備份目錄。

- REALTEST_EVIDENCE: tool=Bash | cmd=node tests/generator-buttons.cjs | exit=0 | ms=9119
- REVIEW_DONE: critic=Standard | verdict=pass | findings=0c/0m/1n
- BUGHUNT_DONE: scope=video-workbench/scripts,video-workbench/shared,video-workbench/styles,video-workbench/tests,D:/Work/agency-os,D:/Work/scripts | grep=subtitleOptions,generatorMentions,generatorSkillCatalogue,data-picker-source,dataset.activePanel | hits=31
- BUGHUNT_SCOPE_NARROW: D:/Work 僅唯讀核對；所有功能修改限本機交付資料夾。

測試截圖：`%TEMP%/vw-buttons-test-0ZkleY/`；其他證據：`vw-generate-parity-T1fHTR`、`vw-mode-audit-Js5O36`、`vw-restored-ui-DFs93Z`。修改前備份與審查快照：`%TEMP%/vw-buttons-cbb16ced8d1e42a88895f234cb1da62f/`。復原時先停止服務，以該備份對應檔案復原；不要覆蓋 `.data`。此目錄無 Git，不建立 repo 或分支。

---

# 生成頁校正（2026-10-30）

## 第二次並排核對：更正上一輪遺漏

操作者指出交付仍未對齊。重新在同一瀏覽器並排檢視 `https://seedstar.ai/generate` 與 `http://127.0.0.1:4179/`，實際切換七個分頁、三種參考模式，展開人物、聲音、輸出設定。未送出官網 AI 任務；對話後續的付費生成未驗收，不能宣稱官網所有功能已重現。

| 官網實際操作 | 上一輪交付差異 | 本輪處理 |
|---|---|---|
| 初始開啟為智能參考體 | 本機預設為導演 | 改為智能參考；桌面七頁籤同列、手機三欄 |
| 導演有新增圖片 0/6；空白不能開始；初始無共用生成 dock | 缺上傳入口、空白可開始、多出 dock | 補回上傳／預覽及空白守衛，隱藏錯置 dock |
| 參考體首幀必填、尾幀選填；上傳後能預覽 | 未標必填，也未阻擋空首幀；僅顯示名稱 | 補必填標示、前後端守衛、媒體預覽與 @ 編號 |
| 動作參考是獨立頁面：照片、影片、朝向、720p／1080p、原聲、補充描述；不顯示共用提示詞及 dock | 上一輪只從拍片刪掉錯位控制，沒有移回動作參考 | 全組控制放回動作參考，切換與草稿恢復可保留。專用服務仍未接入，不假裝可生成 |
| 拍片：一支來源影片、28 張參考素材及標籤 | 這組已補回，但被誤當成動作轉移 | 保持拍片與動作參考分開，未引入被操作者排除的模型 |
| 卡通六種風格、影片輸出 | 名稱仍有誤字；選過的卡通風格會混入其他模式請求 | 更正名稱；只在卡通任務附加風格 |
| 網址生成先貼網址，四步驟內完成；無共用 dock | 多出重複大標、手動表單搶先、共用 dock | 網址先行，手動補資料後置，保留四步驟，移除重複區塊。網址解析仍未接入 |
| 口播加入參考圖能進素材來源 | 本機會嘗試開啟不存在的 spoken/images，直接報錯 | 導向人物選擇器的素材庫分頁。人物對嘴服務仍未接入，輸出仍為配音 |
| 圖片預設 1:1，單選比例，1K／2K／4K及明確尺寸 | 與影片共用比例、只有 1K；16:9 也可能實際拿到 3:2 | 圖片設定獨立，實際輸出符合尺寸；本機置中裁切及縮放，保留並提供供應商原圖下載。2K／4K不是新增AI細節 |

本輪測試：`npm run test:modes`（實際瀏覽器／檔案結果驗證）、`npm run test:generate`、`npm run test:backend`，外觀橋接、復原 UI 與 HTTP adapter 回歸也通過。`test:modes` 讀取真實 PNG IHDR，確認 2K 橫式為 2048×1152、4K 直式為 2304×4096；另注入 FFmpeg 失敗，驗證原圖仍可下載，工作台與歷史重試均經 `generations.retry` 改走本機 `image-output`，不再次呼叫 AI。作品帶入保留既有 2K 設定。API 回應使用 mock，尺寸轉換為真實 FFmpeg；未呼叫付費供應商。最新證據：`%TEMP%/vw-mode-audit-zo2VBG/`。`shared/contracts.d.ts` 以 strict/noEmit、`types: []` 獨立檢查通過，避免無關的 Node ambient types 版本衝突；未修改主系統 TypeScript 設定。上一輪紀錄保留在下方，不能據此推論已和官網全功能相同。

圖片轉換失敗仍標記失敗，並明示目前提供的是供應商原圖，不能把錯誤尺寸宣稱為完成。原圖的 `sourceUrl` 留在任務結果；本機轉換重試只需生成檔案來源與原設定，不需要供應商金鑰。「檢查最新狀態」只查詢和顯示，不建立任務；只有明確選擇再次執行才可重跑 AI。網路中斷、逾時或 2xx 格式不符會保留為 submissionUnconfirmed，不能直接重送；明確 HTTP 拒絕則可重試。

第二輪驗證紀錄：

- REALTEST_EVIDENCE: tool=Bash | cmd=node tests/generate-mode-audit.cjs | exit=0 | ms=17406
- REVIEW_DONE: critic=Standard | verdict=pass | findings=0c/0m/0n
- BUGHUNT_DONE: scope=video-workbench/scripts,video-workbench/shared,video-workbench/backend,video-workbench/tests,D:/Work/agency-os,D:/Work/scripts | grep=generatorSwitchMode,generatorMotionWorkspace,image-output,normalizeImage,submissionUnconfirmed,generations.refresh | hits=28
- BUGHUNT_SCOPE_NARROW: 主系統僅唯讀核對；改動仍限本機工作台，未部署。

最後一次完整模式測試證據：`%TEMP%/vw-mode-audit-UsCFBe/`。HTTP 測試另驗證 422 明確拒絕可重試；網路錯誤、格式不符與 504 閘道逾時不重送。Claude 的初審、逐項複核及最後剩餘問題的限定範圍 `approve` 原文皆保存在 `%TEMP%/vw-mode-review-i7k8mpkf/`；靜態審查沒有代替上述真實測試。第二輪修改前備份：`%TEMP%/vw-second-audit-ba422fc6-2e72-4b61-a7d4-02d65bba1ad1/`，只還原對應原始碼，不覆寫 `.data`；本輪新檔僅 `tests/generate-mode-audit.cjs`。

---

## 第一次修改紀錄（有遺漏，以上方第二次核對為準）

第一次曾開啟 [VideoWorkbench 生成頁](https://seedstar.ai/generate)，但未完成逐項對齊就交付，導致上方所列缺口。以下是當時的修改紀錄，不是全功能核對完成的證據。

| 項目 | 本輪變更 |
|---|---|
| 拍片 | 補回單支來源影片、28 張參考圖、人物／場景／未標標籤與素材庫；移除錯置的角色朝向及 818 點。重拍服務未接入，可保存草稿。 |
| 卡通 | 修正成影片任務，保留六種風格；未選風格不能送出。使用已設定的影片模型。 |
| 輸出 | 比例複選，各自生成獨立任務，逐項呈現失敗；先檢查整批參數。可選範圍由服務能力決定。 |
| 設定 | 儲存、套用、刪除、指定／取消預設，按生成方式保存；提示詞與素材不包含在設定內。 |
| 引用 | @ 選擇目前模式實際加入的素材，插入游標位置；切換素材模式不再送出隱藏模式的參考檔。 |
| 音訊 | 從影片擷取真實 MP3，完成後可加入參考音訊；擷取不等於音樂／人聲分離。 |
| 商品 | 移除假商品圖、未實作的扣點承諾及外觀鎖定承諾；選項改成可見按鈕，重繪不丟失選擇，時長符合服務能力。 |
| 導演／口播 | 導演送出比例、字幕等完整設定；口播朗讀指示可恢復。人物對嘴尚未接入，目前仍是配音輸出。 |
| 真實能力 | 字幕燒錄、靜音、生成時浮水印、尾幀／動作控制等尚未接入，停用或在送出前拒絕；後端也會檢查，不再忽略選項。 |
| 主系統服務 | 能力查詢與生成、資料保存共用同一 adapter，不再固定從本機 API 查能力。模型顯示採服務端設定。 |

本機 OpenAI adapter 仍限定單張影片參考圖、16:9／9:16、720p、4／8／12 秒；圖片編輯最多四張參考圖。官網較多模型的專用能力未被這些 UI 修改取代。官網的帳戶、點數、供應商與素材使用權不屬於本機交付。

## 接入 app 與 WordPress 的邊界

操作者確認兩種用途都需要：WordPress 會員使用工具，以及生成成果送往 WordPress。依現有 AwareWave 架構：

- **員工**從 `app.aware-wave.com` 的影音工具進入；**會員**由 `aware-wave.com` 現有的一次性入口進產品門。延用 `lib/portal/products.ts` 已登記的 `video` 產品與 feature keys，不新增另一套登入或點數帳本。
- **外觀**仍以主系統 DB 外觀設定為準，經 `AwareWaveThemeFrame` 同步。`AwareWave-source` 是來源匯出；不得把它當主系統修改或部署。
- **正式服務**使用 `config.js` 的 `mode: "http"` 及同來源 `apiBaseUrl`。GET `/capabilities`、GET/PUT `/state`、POST `/uploads`、POST `/generations/quote`、POST `/generations`、GET `/generations/:id`、POST `/generations/:id/cancel` 由主系統 adapter 映射。`/state` 必須在伺服器端依登入者及組織隔離；actor、on_behalf_of、權限與扣點均由主系統驗證，不能信任瀏覽器自報。
- **WordPress 交付**須由既有服務端 WordPress adapter 接收批准成果並建立文章／媒體草稿，記錄來源作品與外部 ID。憑證留在服務端。工作台不得直接呼叫 WordPress 管理 API；不能將 `127.0.0.1/generated` 網址當公開媒體交付。
- **上線狀態**：這份目錄仍是本機交付。尚未把 `/state` 映射到正式資料庫、接通產品權限／共用錢包或 WordPress 交付，也未部署。現有 `tools/seedstar` 匯出頁只允許 loopback HTTP，不是公網託管頁。正式整合須在主系統原始碼完成並驗收登入、租戶隔離、扣點與網站草稿回執。

此處接線依據為主系統 `lib/portal/products.ts`、`agency-os/docs/architecture/decisions/017-entitlements-and-self-hosted-modules.md` 與 `agency-os/docs/video_generator/MEDIA_PRODUCTION_LEGO_PLATFORM_PLAN.md`；沿用現有系統，沒有以本機 contract 宣稱正式系統已實作。

本輪可重跑：`npm run test:generate`、`npm run test:host`、`node tests/appearance.cjs`、`npm run test:backend`、`node tests/startup.cjs`、`node tests/restored-ui.cjs`。所有新測試採暫存資料目錄；付費供應商均攔截或 mock。`test:generate` 的音軌擷取使用真實 FFmpeg。

驗證紀錄：上述六組皆通過。Claude 初審提出 2 個 medium、2 個 low，查證後全部修正，複核 `approve / findings: []`。審查快照及原文保存在 `%TEMP%/vw-review-5zfd13mx/`；生成流程截圖與測試證據在 `%TEMP%/vw-generate-parity-lkzle3/`。審查工具只讀檔；測試由本機 Node／Edge／FFmpeg 實際執行。

- REALTEST_EVIDENCE: tool=Bash | cmd=node tests/generate-parity.cjs | exit=0 | ms=8151
- REVIEW_DONE: critic=Standard | verdict=pass | findings=0c/0m/0n
- BUGHUNT_DONE: scope=video-workbench/scripts,video-workbench/shared,video-workbench/backend,video-workbench/tests,video-workbench/README.md,D:/Work/agency-os,D:/Work/scripts | grep=generatorNormalizeSettings,generatorSubmit,generatorPresetKey,generationPolicy,service-request,data-storyboard-reference | hits=25
- BUGHUNT_SCOPE_NARROW: 主系統僅唯讀核對；本輪改動限本機工作台及共享操作者記憶，未修改或部署 D:/Work。

復原：修改前備份位於 `%TEMP%/vw-before-62c3ca10-d39f-4da0-ab08-49e785e37c0d/video-workbench/`。如需回復，先停止此目錄服務，再以備份對應原始碼取代改動檔並移除本輪新檔 `scripts/generator-controls.js`、`backend/generation-policy.cjs`、`tests/generate-parity.cjs`、`tests/host-adapter.cjs`；不要覆寫 `.data`。此目錄不是 Git repo，未建立 repo／分支或宣稱已提交。

---

# 前輪功能恢復紀錄（2026-10-30）

以 seedstar.ai 公開功能頁及找回的 16,290,997 bytes 完整整合版原檔核對。前一輪只拿兩份重構後檔案互相比較，漏掉重構前被刪除的操作。

本版已恢復：
- 口播：人物／聲音選擇面板與分頁、畫面／表演指示、字數與預估秒數；接共用角色與素材資料，設定可保存成草稿。配音仍用現有內建聲音；人物對嘴、聲音複製尚缺專用服務。
- 影片剪輯：恢復新建剪輯專案及既有草稿清單，同時保留目前可用的裁切功能。多軌時間軸尚未接入。
- 影音增強：恢復畫面頁及完整音訊選項；未接入的處理保留選項、說明原因並禁止誤送。
- CTA：恢復顯示方式與淡入淡出；靜態、淡入、彈出均以真實 FFmpeg 影片逐格驗證。
- 導演：恢復生成分鏡圖與確認／調整／取消操作；分鏡圖透過既有圖片生成服務送出，不再顯示示範成功。舊草稿若停在生成／結果階段，可返回設定或歷史紀錄。

驗證：11 個導覽入口、7 種生成方式與 15 個工具逐項核對；既有 6 組瀏覽器測試、後端真實 FFmpeg、外觀橋接及新增復原測試均在暫存資料環境執行。付費生成一律使用攔截或 mock，沒有呼叫付費 API。官網只讀取公開頁面，未登入、未生成，不宣稱已驗收官網登入後的功能。

官網有節點式工作流、素材資料夾／封存／批次選取等本機尚未完成的功能；這些不能由現有原檔證明是本次刪除，未列為已恢復。下方原有服務限制仍適用。

新增回歸：`node tests/restored-ui.cjs`、`node tests/cta-effects.cjs`。所有測試產物寫入系統暫存目錄。

---

# VideoWorkbench 可操作本機版

請執行 `start.cmd`。直接開啟 `index.html` 會顯示啟動說明；本機服務成功啟動後才會開瀏覽器。若 4178 已被舊版占用，啟動視窗會顯示原因並停止，避免誤開另一份程式；既有服務及資料不會被關閉或更動。

解壓縮整個壓縮檔後執行 video-workbench/start.cmd。離線交付包已附 Windows Node.js 與 FFmpeg；若使用不含 runtime 與 node_modules 的原始碼資料夾，需安裝 Node.js 18 以上，首次啟動會安裝依賴。成功後開啟 http://127.0.0.1:4178，啟動視窗使用期間保持開啟。

這次已補上素材庫、技能、工作流、歷史紀錄、導演草稿、統一素材選擇器與持久檔案上傳；角色／專案／模板可以互相引用素材。工具設定按工具分別保存，重新整理可恢復。

本機不使用原型畫面的 90 點餘額，不會模擬生成成功。需要 AI 的功能會使用後端供應商，按實際 API 用量計費。

## 已實作的功能

| 功能 | 現況 |
|---|---|
| 素材 | 上傳、篩選、搜尋、預覽、下載、改名、移除、帶入生成 |
| 角色 | 手動／文字 AI 建立、參考圖、服裝配件、收藏、素材引用、AI 圖片與候選聲音；成果可套用後儲存 |
| 專案 | 建立、角色／場景／道具、AI 分鏡、空白鏡頭、逐鏡／批次圖片生成、帶入影片生成、JSON 匯出 |
| 模板 | 收藏、建立本機草稿、替換參考素材、帶入生成頁；沒有公開發佈／分潤 |
| 技能與工作流 | 儲存與套用提示詞；工作流逐步帶入，由使用者檢查後送出，並非無人值守排程 |
| 歷史與草稿 | 任務狀態、錯誤、重試、下載成果、還原提示詞；導演草稿保存與恢復 |
| 本機影片處理 | 片段裁切、音軌擷取 MP3、浮水印、CTA、Lanczos 尺寸調整、基礎音訊降噪／均衡／壓縮 |
| 圖片區域編輯 | 拖曳選區、產生 PNG alpha 遮罩、送交圖片編輯 API |
| 語音與字幕 | AI 配音、檔案語音辨識、SRT／VTT 匯入、手動校對與雙向匯出 |

## AI 服務設定

金鑰只讀取伺服器程序的 `OPENAI_API_KEY` 環境變數，沒有放在 HTML、JavaScript、ZIP 或 localStorage。設定或更換環境變數後，重開啟動視窗。

可覆寫 `VW_TEXT_MODEL`、`VW_IMAGE_MODEL`、`VW_VIDEO_MODEL`、`VW_TTS_MODEL`。預設為 gpt-5.4-mini、gpt-image-2.5-flare、gemini-omni-1.2-flash（Google 直連，`GEMINI_API_KEY`，含原生音訊；沒有該金鑰時改 veo-3-1-fast，Replicate，`REPLICATE_API_TOKEN`；`VW_VIDEO_MODEL` 接受 `backend/gemini-video.cjs` 或 next-admin `lib/ai/video-motion-models.ts` 的 id，能跑才採用；Sora 2 已於 2026-09-24 停止服務）、gemini-3.8-flash-lite-tts。配音（`backend/speech.cjs`）與字幕辨識（`backend/transcribe.cjs`）各有一份供應商清單，頁面用按鈕選、各標價，過了 registry `retireOn` 的自動消失：配音 Edge 免費（`VW_TTS_SERVICE_URL`／`VW_TTS_SERVICE_TOKEN`，經 video-service `/tts`，失敗自動改 Gemini）／Gemini（`GEMINI_API_KEY`）／OpenAI（到 2027-01-06）；辨識 自家主機 whisper（`VW_TRANSCRIBE_WORKER_URL`／`VW_TRANSCRIBE_WORKER_TOKEN`）／Gemini／OpenAI whisper-1（到 2027-02-26）。`VW_TTS_MODEL`、`VW_TRANSCRIBE_ENGINE` 改預設。可使用的模型取決於該金鑰權限及供應商供應情況。實作依據：[OpenAI 官方文件](https://developers.openai.com/api/docs/guides/image-generation)。

目前影片服務依模型支援的秒數（預設 Gemini Omni 1.2 Flash：4／6／8／10／15 秒；Veo 3.1 Fast：4／6／8 秒）、16:9 或 9:16、單張 PNG/JPEG/WebP 參考圖；不支援影片／音訊參考及人物聲音複製。口播頁目前輸出配音音檔，人物對嘴影片尚缺專用服務。語音辨識檔案上限 25MB。

## 尚未完成的專用服務

已加入字幕逐行校對／翻譯／本機燒錄、依字幕分析短影音與人工選段、五軌影片剪輯／文字／轉場／音訊混合，以及 CTA 去白底與即時位置預覽。影片編輯器可輸出 1080P／720P、30fps、16:9／9:16／1:1／4:5／4:3。詳細對照與未完成項目見 docs/tools-reference-audit-20261101.md。

畫面內容自動選段、音樂／音效生成、配樂／人聲模型分離、隱私人臉追蹤、深度影片、重拍、人物對嘴、AI 去背／畫面修復、逐字卡拉 OK、剪贅字與關鍵影格仍需對應服務。未接服務明示原因，不把一般媒體處理冒充專用 AI。商品網址與原創歌詞已接現有服務；尚未部署到正式站。

解析度調整是重新取樣，不是 AI 細節修復；降噪是 FFmpeg 基礎處理，不是人聲／背景音的模型分離。部分原型示意圖、卡片資料及舊說明仍保留，不能視為已授權角色庫或已接入的模型供應商。

## 檔案與備份

角色、專案、技能等資料由共用 store 保存於該瀏覽器的 localStorage。上傳及生成的實體檔案位於 `.data/generated`，任務帳本位於 `.data/jobs.json`。可用 `VW_DATA_DIR` 更換儲存位置；生成檔仍透過 `/generated/…` 讀取。

介面的 JSON 備份包含資料與檔案 URL，**不包含媒體實體檔案**。搬電腦時請另備份 `.data`，並匯入 JSON。交付 ZIP 不含使用者 `.data`；原始 `VideoWorkbench_完整整合版.html` 和舊 ZIP 保留。

本機服務只綁定 127.0.0.1。這不是正式多人服務；正式串接仍需登入／權限、物件儲存、扣點與帳務、資料庫及協作衝突控制。勿直接作為公開伺服器部署。

## 維護與測試

`backend/api.cjs` 管理供應商與任務，`backend/media.cjs` 管理 FFmpeg。`shared/` 管理模型、adapter、store、postMessage、素材選擇、任務與 HTML 清理；`scripts/` 管理頁面流程；五個頁面位於 `pages/`。

外觀單一來源為 AwareWave 主系統。`awarewave-source.json` 指向本機主系統目錄（可用 `AWAREWAVE_APP_DIR` 覆寫）；`/awarewave/theme.css` 每次讀取主系統 `app/globals.css` 的預設 tokens，`/awarewave/forms.css` 直接讀取主系統共用表單 CSS。下載版不再維護獨立色票。整包另附由同一來源自動匯出的 `AwareWave-source`；本機未安裝主系統時使用這份發行快照，並以 `build-manifest.json` 記錄來源雜湊。重新打包會重新匯出，不另行維護色碼。明確設定 `AWAREWAVE_APP_DIR` 時只使用指定來源。

主系統「外觀管理 → 影音工作台」（`/tools/seedstar`）嵌入本機服務，沿用主系統既有的已儲存外觀與側欄；工作台內的功能導覽改為頂部工具列。主系統透過來源與視窗雙重驗證的訊息，同步目前 tokens 到工作台及其子頁。表單背景在外觀管理的 `Form Controls / --form-input-bg` 調整，文字使用 `Text / --text-primary`。單獨開啟本機服務時使用主系統的出廠預設；不會讀取線上 DB 或另存一份主題。主系統入口尚需部署後才會出現在線上，本次只修改本機。

下拉選單自動套用共用 `form-select`，不需逐頁更改 class。修改後端或來源路徑後，重開 `start.cmd`；修改樣式後重新整理即可。`tests/appearance.cjs` 使用真實主系統主題橋接元件與瀏覽器，驗證選單對比、跨兩層子頁同步、動態重繪及重新連線；資料與截圖只寫入系統暫存目錄，禁止供應商呼叫。

開發測試先執行 `npm ci`，另開 `npm start`，再執行 `npm run test:ui`、`test:services`、`test:layouts`、`test:regressions`、`test:completion`、`test:flows`、`test:backend`。瀏覽器測試需要 Microsoft Edge。AI 生成測試使用攔截／供應商 mock；媒體測試用真實 FFmpeg 產出新檔。沒有把 mock 成功當成付費圖片／影音供應商的實機驗收。


正式後端 adapter 的 State 定義見 `shared/contracts.d.ts`。`config.js` 設 `mode: "http"` 與 `apiBaseUrl` 後，會呼叫 GET/PUT `/state` 及 `/generations`、`/generations/:id`、`/generations/:id/cancel` 等路由。正式服務需實作或映射這些 contract；HTTP 失敗不會偷偷改用本機資料。

任務帳本預設保留最近 2000 筆已結束任務及尚未結束的任務；可用 `VW_JOB_HISTORY_LIMIT` 調整。舊媒體不會自動刪除，清理前請先備份。


2026-11-01 補充修正：所有 JSON 模式文字請求明確帶入 JSON 回覆指令，修正 input messages 缺少 json 的 OpenAI 400。已以合成台詞完成一次真實 API 驗證，詳見 docs/json-mode-fix-20261101.md。


人物跟拍已加入本機人物偵測、點人追蹤與指定時間修正、預覽與保留原音的 9:16 動態裁切；採 Google EfficientDet-Lite0，並沿用 FilmCraft 的裁切平滑計算與 MIT 授權。詳細功能與驗證見 docs/follow-tracking-20261101.md。
