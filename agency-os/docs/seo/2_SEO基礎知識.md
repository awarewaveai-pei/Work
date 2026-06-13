# SEO基礎知識

---

# 搜尋引擎最佳化 (SEO) 入門指南

  
    
    
    
  
# 搜尋引擎最佳化 (SEO) 入門指南

  
建構網站時，您可能會將使用者的需求納入考量，希望盡量讓使用者輕鬆尋找及探索內容。搜尋引擎也是這些使用者的其中一員，能幫助其他人發現您的內容。SEO 是搜尋引擎最佳化的簡稱，目的是協助搜尋引擎解讀內容、協助使用者找出網站，然後決定是否該透過搜尋引擎造訪網站。

「[搜尋基礎入門](https://developers.google.com/search/docs/essentials?hl=zh-tw)」一文概略說明了您的網站需要注意哪些重要元素，才能顯示在 Google 搜尋中。雖然無法保證任何特定網站都能編入 Google 索引，但只要遵循**「搜尋基礎入門」的做法，網站就比較有可能出現在 Google 搜尋結果中**。至於 SEO，則是指採取下一步，**設法提升網站在 Google 搜尋中的顯示情況**。本指南將逐步說明最常見的幾項措施，協助您有效提升網站能見度。

這裡不會提供秘訣，讓網站自動登上 Google 搜尋結果榜首 (抱歉！)。事實上，部分建議可能也不適用於您的業務。但只要採用本文介紹的最佳做法，便能讓搜尋引擎 (不只 Google) 更容易檢索及解讀您的網站內容，並為這些內容建立索引。

## Google 搜尋如何運作？

Google 是全自動化的搜尋引擎，會使用名為檢索器的程式不斷探索網路，尋找可加入索引的網頁。通常您不須採取任何行動，只要在網路上發布網站就行了。實際上，列入搜尋結果中的絕大多數網站都是由 Google 在檢索網路時找出並自動添加。如果您需要更多資訊，歡迎參閱我們的說明文件，瞭解 [Google 如何尋找、檢索並提供網頁](https://developers.google.com/search/docs/fundamentals/how-search-works?hl=zh-tw)。

## 多久才能在搜尋结果中看到效果？

您所做的任何變更，都需要一段時間才會反映在 Google 上。部分變更或許會在幾小時內生效，其他則可能需要費時數月。一般來說，建議您等待幾週，再評估網站是否在 Google 搜尋結果中獲得成效。要注意的是，並非所有網站變更都會對搜尋結果產生顯著影響；如果您對結果不滿意，但業務策略允許，請嘗試反覆更改，看看這些變更能否發揮效益。

## 協助 Google 找到您的內容

實際執行本節提及的操作前，請先確認 Google 是否已找到您的內容 (或許您無須採取任何行動！)。您可以嘗試在 Google 中使用 `[site: search operator](https://developers.google.com/search/docs/monitor-debug/search-operators/all-search-site?hl=zh-tw)` 搜尋您的網站。如果看到指向您網站的結果，表示網站已編入索引舉例來說，搜尋「`site:wikipedia.org`」會傳回[這些結果](https://www.google.com/search?q=site%3Awikipedia.org&hl=zh-tw)。如果沒看到網站，請查看[技術相關規定](https://developers.google.com/search/docs/essentials/technical?hl=zh-tw)，確認網站不是因技術問題而無法顯示在 Google 搜尋中，然後再返回這個頁面。

    
  
Google 主要是透過其他已檢索網頁上的連結來尋找網頁。在許多情況下，這些會是其他連結到您網頁的網站。隨著時間進展，其他網站與您的網站建立連結是自然現象，您也可以藉由[宣傳網站](#promoting)來鼓勵使用者探索您的內容。

如果您願意接受一些技術方面的挑戰，也可以[提交 Sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview?hl=zh-tw)，這個檔案包含網站上所有您重視的網址。部分內容管理系統 (CMS) 甚至可能會為您自動執行這項操作。不過，這並非強制要求，您應將重點先放在確認[其他人知道網站存在](#promoting)。

### 確認向 Google 和使用者呈現完全相同的網頁

Google 在檢索網頁時，理應[和一般使用者看到完全相同的網頁](https://developers.google.com/search/blog/2014/05/understanding-web-pages-better?hl=zh-tw)。為此，Google 需要能夠存取與使用者瀏覽器相同的資源。如果網站隱藏 [CSS](https://en.wikipedia.org/wiki/CSS) 和 [JavaScript](https://en.wikipedia.org/wiki/JavaScript) 這類重要組成元件，Google 可能就無法解讀網頁。換句話說，網頁可能不會出現在搜尋結果中，而您指定的關鍵字或許也無助提升網頁排名。

如果網頁所示資訊會因使用者實際所在位置而異，請確認您能讓 Google 根據檢索器所在位置 (通常是美國) 查看該地的相應資訊。

如要查看 Google 看到的網頁樣貌，請使用 [Search Console 中的網址檢查工具](https://support.google.com/webmasters/answer/9012289?hl=zh-tw)。

### 不希望網頁出現在 Google 搜尋結果中嗎？

能夠選擇讓網站 (整個或部分) 不要顯示在搜尋結果中，可能十分重要。舉例來說，您在貼文中說自己的新髮型不好看，或許就不會希望這篇貼文出現在搜尋結果中。Google 支援以多種方式選擇不要檢索網址及編入索引。如要禁止部分檔案、目錄、甚至整個網站顯示在 Google 搜尋中，請參閱[這篇指南](https://developers.google.com/search/docs/crawling-indexing/control-what-you-share?hl=zh-tw#how-to-block-content)，瞭解如何防止搜尋結果顯示內容。

## 整理網站

設定或重新設計網站時，建議您以符合邏輯的方式整理網站，因為這有助於搜尋引擎和使用者瞭解網頁與網站其他部分的關係。不過，這不表示要立刻捨棄所有內容並開始重整網站結構：雖然這些建議長遠來看可能有用 (尤其是在處理大型網站時)，但搜尋引擎可能仍會依現況來解讀網頁，不受網站結構影響。

### 使用描述性網址

網址的某些部分在搜尋結果中會顯示為導覽標記，因此使用者也可以根據網址判斷結果是否有用。

  這張插圖顯示 Google 搜尋中的文字搜尋結果，其中的圖說標示了特定可見網址和視覺元素，包括網域和導覽標記
  
  
  
    [網域](https://developers.google.com/search/docs/appearance/visual-elements-gallery?hl=zh-tw#domain)

  
  
  
    [導覽標記](https://developers.google.com/search/docs/appearance/visual-elements-gallery?hl=zh-tw#breadcrumb)

  

Google 會根據網址中的字詞自動理解導覽標記，但如果您想接受技術挑戰，也可以利用[結構化資料](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb?hl=zh-tw)引導 Google 解讀導覽標記。請盡量在網址中加入對使用者有幫助的字詞；例如：

`https://www.example.com/pets/cats.html`

僅含隨機 ID 的網址對使用者沒有幫助；例如：

`https://www.example.com/2/6772756D707920636174`

### 在目錄中將主題類似的網頁歸為一組

如果您的網站含有數千個網址，那麼您整理內容的方式可能會影響 Google 如何檢索網站及建立索引。具體而言，使用目錄 (或資料夾) 將類似主題分組，可讓 Google 瞭解個別目錄中的網址變更頻率。

以下列網址為例：

`https://www.example.com/policies/return-policy.html`

`https://www.example.com/promotions/new-promos.html`

`policies` 目錄中的內容幾乎不會改變，但 `promotions` 目錄中的內容可能經常變更。Google 可理解這項資訊，並以不同的頻率檢索不同目錄。如要深入瞭解哪些網站結構適合搜尋，請參閱[電子商務網站指南](https://developers.google.com/search/docs/specialty/ecommerce/help-google-understand-your-ecommerce-site-structure?hl=zh-tw)。電子商務網站往往規模龐大，網址結構良好就更加重要。

### 減少重複的內容

有些網站會在不同網址中顯示相同內容，這就是所謂的「[重複內容](https://developers.google.com/search/docs/crawling-indexing/canonicalization?hl=zh-tw)」**。搜尋引擎會針對各個內容，選擇單一網址 (也就是「標準」**網址) 向使用者顯示。

網站上出現重複的內容並不違反垃圾內容政策，但可能對使用者體驗造成負面影響，且搜尋引擎可能會將檢索資源浪費在您不重視的網址上。如果您想大膽嘗試，不妨瞭解一下能否為網頁[指定標準版本](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls?hl=zh-tw)。但假如您未自行將網址標準化，Google 會嘗試自動為您執行此操作。

進行標準化時，請盡量確保網站上的每項內容都只能透過一個網址存取。如果兩個網頁中有相同的促銷活動資訊，使用者可能會感到困惑；舉例來說，他們可能會思考哪個才是正確的網頁，以及兩者是否有差異。

如果您有多個內含相同資訊的網頁，請嘗試將非偏好網址[重新導向](https://developers.google.com/search/docs/crawling-indexing/301-redirects?hl=zh-tw)到最能代表該資訊的網址；如果無法重新導向，請改用 `[rel="canonical"](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls?hl=zh-tw)` `link` 元素。不過也不必過於擔心，在多數情況下，搜尋引擎通常可以自行解決此問題。

## 打造富有吸引力的實用網站

比起本指南的任何其他建議，如果能製作引起使用者興趣並派上用場的內容，或許更能有效提升網站在搜尋結果中的能見度。雖然「引人入勝又實用的內容」對每個人的意義不同，但這類內容一般都有某些共通特徵，例如：

  - **文字簡單易懂且條理清晰**：請使用自然流暢的語言，確保內容撰寫得當、簡單易懂，且沒有拼寫和文法錯誤。建議您將長篇內容分成多個段落和章節，並提供標題協助使用者瀏覽網頁。

  - **[內容獨一無二](https://developers.google.com/search/docs/essentials/spam-policies?hl=zh-tw#scraped-content)**：編寫新內容時，請不要拾人牙慧 (全部或部分複製都不行)；應依據您對該主題的瞭解自行製作內容，不要只是改編別人發布的內容。

  - **內容符合現況**：請檢查先前發布的內容並視需要更新，甚至可以刪除已不相關的內容。

  - **內容[實用、可靠且以使用者為優先](https://developers.google.com/search/docs/fundamentals/creating-helpful-content?hl=zh-tw)：**請務必撰寫對讀者實用可靠的內容。舉例來說，列出專家或經驗豐富的資訊來源，能夠幫助使用者瞭解文章的專業性。

### 推測讀者使用的搜尋字詞

思考一下使用者尋找您的內容時，可能搜尋哪些字詞。使用者對主題的瞭解程度可能會影響他們在搜尋查詢中使用的關鍵字。舉例來說，有些使用者可能會搜尋「熟食冷肉起司盤」，其他人則可能搜尋「起司拼盤」。事先考慮這些搜尋行為的差異，並在撰寫內容時將讀者需求納入考量，或許就能對網站在搜尋結果中的成效產生正面影響。

不過，即使您未事先考量使用者尋找內容時採取的各種方式，也請不用擔心。Google 的語言比對系統相當複雜，可以解讀網頁與各種查詢間的關聯，即使您並未明確使用完全相符的字詞也一樣。

### 避免使用擾人的廣告

廣告是構成網際網路的一環，目的是要讓使用者看見，但不得過度干擾使用者，或讓他們無法自在閱讀網站內容。這類例子包括讓網站變得難以瀏覽的廣告或[插頁](https://developers.google.com/search/docs/appearance/avoid-intrusive-interstitials?hl=zh-tw) (在您想觀看的內容出現之前或之後所顯示的頁面)。

### 相關資源的連結

如要將使用者和搜尋引擎連結至網站的其他部分，或其他網站上的相關網頁，採用連結是很適合的方法。事實上，Google 每天多半都是透過連結找到新網頁，因此請將連結視為一項重要資源，可讓 Google 更輕鬆找出您的網頁，提升在搜尋結果顯示的機會。另外，連結也可以將使用者 (和 Google) 連結至其他資源，證實您編寫的內容屬實，藉此創造更多價值。

#### 撰寫合適的連結文字

*連結文字* (也稱為*錨定文字*) 是您可以看到的連結文字部分。使用者和 Google 可以從這類文字稍微瞭解連結所導向的網頁。借助[適當的錨定文字](https://developers.google.com/search/docs/crawling-indexing/links-crawlable?hl=zh-tw#write-good-anchor-text)，使用者和搜尋引擎可在造訪之前輕鬆瞭解連結網頁的內容。

#### 在需要時提供連結

連結可為使用者和搜尋引擎提供更多有關主題的背景資訊，這可能有助於證明您對該主題的瞭解程度。不過，如果連結的網頁非由您控管 (例如其他網站的內容)，請務必確認所連結的資源值得信賴。如果您仍想連結不信任的內容，請在連結中加入 [`nofollow` 或類似註解](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links?hl=zh-tw)，以免搜尋引擎將您的網站與要連結的網站建立關聯。這有助於避免網站在 Google 搜尋中的排名受到負面影響。

如果您的網站接受使用者原創內容 (例如論壇文章或留言)，請確保 CMS 自動在使用者張貼的每個連結中加上 `nofollow` 或類似註解。在這種情況下，由於內容並非由您製作，因此您可能不希望自家網站與使用者連結到的網站草率建立關聯。注意這一點也有助於防止垃圾內容發布者濫用您的網站。

## 調整網站在 Google 搜尋中的呈現方式

  
  

典型的 Google 搜尋結果網頁包含[幾種不同的視覺元素](https://developers.google.com/search/docs/appearance/visual-elements-gallery?hl=zh-tw)，可用來協助使用者判斷是否應透過這些搜尋結果前往您的網站。本節將著重在「標題連結」**和「摘要」**，因為這些元素比較醒目。

### 調整標題連結

**「標題連結」是搜尋結果的標題部分，可協助使用者決定要點選哪個搜尋結果。Google 會透過幾個來源產生這個標題連結，包括 `<title>` 元素中的字詞 (也稱為標題文字) 和網頁上的其他標題。這些標題文字也可用於瀏覽器和書籤中顯示的標題。

  這張插圖顯示 Google 搜尋中的文字搜尋結果，其中以醒目方式顯示標題連結部分周圍的方塊
  
  
    [如何製作辣椒油](https://wikipedia.org/wiki/Chili_oil)

  

藉由撰寫優質標題，您可以調整 Google 搜尋中的標題連結。具體而言，優質標題應獨一無二、清楚簡潔，並且準確描述網頁內容。舉例來說，您可以在標題中加入網站或商家名稱、實體商家地址等其他重要資訊，或者某些說明特定網頁能為使用者提供哪些內容的資訊。我們的[標題連結說明文件](https://developers.google.com/search/docs/appearance/title-link?hl=zh-tw)提供了更多提示，可讓您瞭解如何建立優質標題，以及如何調整網站搜尋結果的標題連結。

### 管理摘要

搜尋結果通常會在標題連結下方提供目標網頁的說明，協助使用者決定是否應點選該搜尋結果。這就是所謂的「摘要」**。

  這張插圖顯示 Google 搜尋中的文字搜尋結果，其中以醒目方式顯示摘要部分周圍的方塊
  
    
    參閱這份完整的指南，瞭解如何在 5 分鐘內學會各種雞蛋烹飪方式。我們將會介紹所有料理方法，包括：單面荷包蛋、水煮蛋和水波蛋。

  

搜尋結果所連結網頁內的實際內容，就是摘要的來源，因此您可以全權控管要使用哪些字詞來產生網頁摘要。有時候，系統可能會從中繼說明標記的內容擷取摘要，這通常為一兩句簡介網頁內容的摘要。理想的中繼說明應簡短扼要且專屬於單一特定網頁，其中含有與網頁最相關的要點。如想獲得其他靈感，歡迎查看我們的提示，瞭解如何[編寫理想的中繼說明](https://developers.google.com/search/docs/appearance/snippet?hl=zh-tw#meta-descriptions)。

## 在網站上加入圖片並進行最佳化

許多使用者喜歡直觀的搜尋方式，他們首次找到您的網站時，可能就是利用圖片搜尋。舉例來說，如果您經營食譜網誌，使用者可能會搜尋「水果塔食譜」，藉由瀏覽各種水果塔的相片來找到您的內容。

在網站中加入圖片時，請確保使用者和搜尋引擎都能找到並理解圖片。

### 在相關文字附近加上高畫質圖片

使用高畫質圖片時，您可為使用者提供足夠的背景資訊和詳細資料，協助他們判斷哪張圖片最符合自身需求。舉例來說，如果使用者搜尋「雛菊」後，卻在搜尋結果中看到火絨草，這時畫質較高的圖片可協助他們區分這兩種花。

請使用清晰明亮的圖片，並將圖片放在相關文字附近。圖片旁的文字有助於 Google 更充分瞭解圖片主題，以及圖片在網頁中的意義。

舉例來說，如果網頁提供有關倫敦毛線店的評論，理想方式是在詳細介紹毛線店位置、說明和評論資訊的部分，加上該店的某張相片。這可協助 Google 和使用者將圖片與文字建立關聯，提供更多網頁主題的背景資訊。

### 為圖片新增說明替代文字

替代文字是簡短的描述性文字，用於說明圖片和內容間的關係。這可幫助搜尋引擎瞭解圖片內容，並且釐清圖片與網頁間的關係，因此撰寫[合適的替代文字](https://developers.google.com/search/docs/appearance/google-images?hl=zh-tw#descriptive-alt-text)相當重要。您可以使用 `img` 元素的 `alt` 屬性將替代文字加入 HTML 中，或是在上傳網站圖片時透過 CMS 輕鬆指定圖片說明。如要進一步瞭解如何撰寫適當的替代文字，以及如何為圖片新增這類文字，請參閱[這篇文章](https://developers.google.com/search/docs/appearance/google-images?hl=zh-tw#descriptive-alt-text)。

## 將影片調整至最佳狀態

如果網站內主要都是個別影片的網頁，那麼藉由 Google 搜尋的影片搜尋結果，使用者或許也能找到您的網站。許多圖片和文字的最佳做法也適用於影片：

  - 製作高畫質影片內容，並將影片嵌入獨立網頁中，靠近與該影片相關的文字。

  - 在影片的標題和說明欄位撰寫描述文字 (影片標題仍然是標題，因此同樣可以參考撰寫標題的最佳做法)。

如果您經營專門提供影片的網站，請繼續閱讀[這篇文章](https://developers.google.com/search/docs/appearance/video?hl=zh-tw)，進一步瞭解如何針對搜尋引擎將影片調整至最佳狀態。

## 宣傳網站

您可以藉由有效的宣傳，讓自己的新內容更快受到對該主題有興趣的人 (以及搜尋引擎) 關注。方法有很多種：

  - 社交媒體宣傳

  - 社群參與

  - 刊登離線和線上廣告

  - 口耳相傳等其他方法

口碑是[最有效持久的方法](https://www.nielsen.com/insights/2012/global-trust-in-advertising-and-brand-messages-2/)之一，也就是藉由熟悉您網站的使用者向好友推薦，讓對方也造訪您的網站。這可能需要一些時間，且您通常需先花點時間和精力採取其他做法，例如社群參與。Google 創作者專區有許多志同道合的朋友，如果您想[培養並吸引目標對象](https://creators.google/en-us/content-creation-guides/audience-engagement/?hl=zh-tw)，可以參考他們提供的實用資源。

此外，投入心力在線下宣傳您的公司或網站也很有成效。舉例來說，如果您有公司網站，請務必在商家名片、信件信頭、海報等素材中列出這個網站的網址。在獲得同意的情況下，您也可以定期傳送電子報給目標對象，介紹網站的最新內容。

就像生活大小事一樣，宣傳時如果沒有拿捏好分寸，網站信譽反而會受到傷害。使用者可能會對您的宣傳感到疲乏，搜尋引擎或許也會將某些做法視為意圖[操控搜尋結果](https://developers.google.com/search/docs/essentials/spam-policies?hl=zh-tw)。

## 不應著重的事項

隨著 SEO 發展，某些相關概念和做法也應與時俱進。以往認定的最佳做法或優先要務，可能會因搜尋引擎 (和網際網路) 長期以來的發展方式，而變得不再適用或不再有效。

為協助您專心處理真正重要的 SEO 事宜，我們收集了幾個最常在網路上流傳的關鍵主題。整體來說，建議您採取最適合自身業務的做法，詳情請見下文說明的幾個具體要點：

|  | 中繼關鍵字           Google 搜尋不會採用關鍵字中繼標記。                             濫填關鍵字                             反覆出現相同的字詞 (即使方式有所變化) 可能會讓使用者感到疲乏，而且濫填關鍵字也違反 Google 的垃圾內容政策。                             網域名稱或網址路徑中的關鍵字                    挑選網站名稱時，請採取最符合業務需求的做法。使用者會使用這個名稱找到您的網站，因此建議您遵循一般的行銷最佳做法。從排名的角度看，單獨使用網域名稱 (或網址路徑) 中的關鍵字幾乎沒有任何影響，只會顯示在導覽標記中。                                   網域名稱這個主題還有一個重點：只有在您鎖定特定國家/地區的使用者時，才需要注意 TLD (網域名稱結尾為「.com」或「.guru」)，但即使是在此情況下，影響通常也不大。舉例來說，如果您想向在瑞士搜尋的使用者銷售荷蘭起司，那麼從業務和 SEO 的角度來看，合理的做法是使用 .ch 網域名稱。否則，Google 搜尋就不會留意您使用哪個 TLD，無論是 .com、.org 還是 .asia 都一樣。                             內容長度下限或上限                    內容長度本身對排名而言並不重要，也就是說，沒有所謂效果最佳的字數目標、上限或下限，不過建議您至少提供一個字詞。如果您試著改變字詞，或者說自然地書寫而不重複，那麼網站就更有機會在 Google 搜尋中顯示，理由很簡單：因為您使用更多關鍵字。 | 子網域和子目錄          從業務的角度看，請盡量採取符合業務需求的方式。舉例來說，使用子目錄區隔網站可能較易於管理，但有時可能必須將主題劃分為子網域，具體取決於網站主題或產業別。                             PageRank                    PageRank 是 Google 的一項基本演算法，除了會使用連結之外，對 Google 搜尋的功用還不止於此。我們提供許多排名信號，而 PageRank 只是其一。                             重複內容的「人工判決處罰」                             如果某些內容可透過多個網址存取，請放心，這樣雖然效率不彰，但不會導致人工判決處罰，所以沒有關係。不過，複製他人的內容就另當別論。                             標題數量和順序                                          依語意順序排列標題，是最適合螢幕閱讀器的做法。但從 Google 搜尋的角度來說，順序錯誤也沒關係。一般而言，網路並非有效的 HTML，因此 Google 搜尋幾乎不會用到隱藏在 HTML 規格中的語意含義。                                   此外，指定網頁該有多少標題，並沒有什麼效果最好的典範標準。不過，如果您感覺太多，可能就真的不太適合。                                        將 E-E-A-T 視為排名因素                            請不要有這樣的錯誤想法。 |
| --- | --- | --- |

## 後續步驟

  - **開始使用 Search Console**：設定 Search Console 帳戶，可協助您監控網站在 Google 搜尋中的成效，並進行最佳化調整。如要瞭解如何設定帳戶，以及應先查看哪些報表，請參閱[這篇文章](https://developers.google.com/search/docs/monitor-debug/search-console-start?hl=zh-tw)。

  - **讓網站持續保有 SEO 成效**：進一步瞭解如何[管理網站長期的成效表現](https://developers.google.com/search/docs/fundamentals/get-started?hl=zh-tw)，包括更深入的 SEO 工作和情境，例如準備遷移網站，或管理多語言網站等。

  - **改善網站在 Google 搜尋結果中呈現的樣貌**：網頁只要加上有效的[結構化資料](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=zh-tw)，就能使用 Google 搜尋結果的許多特殊功能，包含評論星等、輪轉介面等。歡迎探索[搜尋結果類型資料庫](https://developers.google.com/search/docs/appearance/structured-data/search-gallery?hl=zh-tw)，瞭解您的網頁符合哪些搜尋結果類型。

### 掌握最新資訊與提問

展開 SEO 之旅的同時，歡迎參考下列資源，隨時掌握我們發布的異動和最新資源：

|  | Google 搜尋中心網誌：從 Google 搜尋中心網誌取得最新資訊。這裡提供 Google 搜尋的最新消息、最新 Search Console 功能及更多資訊。                  LinkedIn 和 X (Twitter) 上的 Google 搜尋中心帳號：           追蹤我們即可掌握 Google 搜尋的最新消息，取得有助於建立優質網站的資源。 | Google 搜尋中心說明論壇：這是專為網站擁有者設立的產品論壇，您可以就網站上的 SEO 問題發文詢問，還能查看各種打造優質網站的提示。許多經驗豐富的人士都會在這裡貢獻文章，包括幾位產品專家，Google 員工有時也會出現。         Google 搜尋中心 YouTube 頻道：觀看上百部專為網站擁有者社群製作的實用影片。 |
| --- | --- | --- |

---

# 詳盡指南：Google 搜尋的運作方式

  
    
    
    
  
# 詳盡指南：Google 搜尋的運作方式

  

  
  

Google 搜尋是全自動化的搜尋引擎，會運用一種稱為「網路檢索器」的軟體定期探索網路，找出能加入索引的網頁。實際上，我們搜尋結果列出的大多數網頁都不是由人為提交，而是網路檢索器在探索網路時找到，然後自動加入搜尋結果。本文件說明 Google 搜尋在您網站中運作的各個階段。掌握這項基本知識有助於修正檢索問題、讓網頁編入索引，以及瞭解如何最佳化網站在 Google 搜尋中的呈現方式。

## 開始前的注意事項

深入瞭解 Google 搜尋的運作方式之前，請務必注意，Google 不接受以付費的方式增加檢索某網站的頻率或提高其排名。如果有人告訴您可以這樣做，請注意這並非事實。

即使您的網頁符合 [Google 搜尋基礎入門](https://developers.google.com/search/docs/essentials?hl=zh-tw)的做法，Google 也無法保證一定會檢索您的網頁、建立索引或提供網頁。

## Google 搜尋三階段簡介

Google 搜尋分為三個階段運作，並非所有網頁都會經歷各個階段：

1. [**檢索：**](#crawling)Google 會透過稱為檢索器的自動化程式，從網際網路上找到的網頁下載文字、圖片和影片。
2. [**建立索引：**](#indexing)Google 會分析網頁上的文字、圖片和影片檔案，並將相關資訊儲存在 Google 索引 (一個大型資料庫) 中。
3. [**提供搜尋結果：**](#serving)當使用者利用 Google 搜尋資訊時，Google 會傳回與使用者查詢內容相關的資訊。

    
  

## 檢索

第一個階段是找出網路上有哪些網頁。由於世界上並沒有統一登錄網頁的地方，因此 Google 必須持續尋找新網頁，並將這些網頁加入已知網頁清單，這項程序稱為「網址搜尋」。清單中都是 Google 造訪過的網頁。Google 會擷取已知網頁的連結並連到新網頁，以此發現其他未知的網頁，例如類別網頁這種中心頁面，會連結到新的網誌文章。此外，當您提交網頁清單 ([Sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview?hl=zh-tw)) 供 Google 檢索時，我們也會找到其他網頁。

  
  

Google 找到網頁網址後，可能會造訪 (或「檢索」) 該網頁，瞭解網頁內容。我們使用大量電腦來檢索網路上數十億的網頁。用來擷取網頁的程式名為 [Googlebot](https://developers.google.com/search/docs/crawling-indexing/googlebot?hl=zh-tw)，又稱為檢索器、漫遊器或自動尋檢程式。Googlebot 會使用特定的演算程序來決定要檢索的網站、檢索頻率，以及要從每個網站擷取的網頁數量。此外，[Google 檢索器](https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers?hl=zh-tw)也經過設計，會避免檢索網站速度過快，以免網站超載。這個機制是以網站的回應為基礎 (例如 [HTTP 500 錯誤代表「放慢速度」](https://developers.google.com/search/docs/crawling-indexing/http-network-errors?hl=zh-tw#http-status-codes))。

但是，Googlebot 不會檢索所有找到的網頁。網站擁有者可能會[禁止 Googlebot 檢索部分網頁](https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt?hl=zh-tw#disallow)，有些網頁則需要登入才能存取。

在檢索期間，Google 會轉譯網頁，並使用最新版本的 [Chrome](https://www.google.com/chrome/?hl=zh-tw) [執行找到的任何 JavaScript](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics?hl=zh-tw#how-googlebot-processes-javascript)，這與瀏覽器轉譯您造訪的網頁類似。轉譯作業非常重要，因為網站通常會利用 JavaScript 將內容投放到網頁，而如果沒有經過轉譯，Google 可能無法看到這類內容。

檢索作業取決於 Google 檢索器是否能存取網站，以下列舉 Googlebot 存取網站碰到的部分常見問題：

  - [伺服器處理網站時發生問題](https://developers.google.com/search/docs/crawling-indexing/http-network-errors?hl=zh-tw#http-status-codes)

  - [網路問題](https://developers.google.com/crawling/docs/troubleshooting/dns-network-errors?hl=zh-tw)

  - [robots.txt 規則導致 Googlebot 無法存取網頁](https://developers.google.com/search/docs/crawling-indexing/robots/intro?hl=zh-tw)

## 建立索引

網頁經過檢索之後，Google 會嘗試解讀網頁內容，這個階段稱為「索引」，其中包括處理及分析文字內容和關鍵內容標記和屬性，例如 [`<title>` 元素](https://developers.google.com/search/docs/appearance/title-link?hl=zh-tw)和 alt 屬性、[圖片](https://developers.google.com/search/docs/appearance/google-images?hl=zh-tw)、[影片](https://developers.google.com/search/docs/appearance/video?hl=zh-tw)等等。

  
  

在建立索引的過程中，Google 會判斷網頁是否為[網際網路上其他網頁的重複版本或標準網頁](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls?hl=zh-tw)。
      標準網頁是指可能出現在搜尋結果中的網頁，為了選取標準網頁，我們首先會將網際網路上存在類似內容的網頁分為一組 (又稱為分群法)，然後再選取其中最具代表性的網頁。群組中的其他網頁是在不同情境下提供的替代版本，例如使用者透過行動裝置進行搜尋，或是使用者在尋找網頁叢集中的特定網頁。

此外，Google 也會收集標準網頁及其內容的相關信號，以便在下個階段用於在搜尋結果中提供網頁。例如網頁的語言、內容所在國家/地區與網頁可用性，都屬於這類信號。

系統收集到的標準網頁及其叢集相關資訊可能會儲存在 Google 索引中，這是由數千台電腦代管的大型資料庫。我們不保證一定會建立索引；並非 Google 處理過的每個網頁都會建立索引。

索引也會取決於網頁內容及其中繼資料。常見的索引問題包括：

  - [網頁內容的品質不佳](https://developers.google.com/search/docs/essentials?hl=zh-tw)

  - [Robots `meta` 規則禁止建立索引](https://developers.google.com/search/docs/crawling-indexing/block-indexing?hl=zh-tw)

  - [網站設計可能造成索引作業困難](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics?hl=zh-tw)

## 提供搜尋結果

使用者輸入查詢字詞時，我們的系統會搜尋索引資料庫，並找出符合的網頁，再傳回我們認為與使用者的查詢內容最相關且品質最佳的結果。關聯性取決於數百種因素，使用者的所在位置、語言和裝置 (電腦或手機) 等資訊都可能包含在內。舉例來說，位於巴黎和香港的使用者搜尋「單車維修店」時看到的結果就不一樣。

  
  

根據使用者的查詢，搜尋結果網頁所顯示的搜尋功能也會有所變動。舉例來說，搜尋「單車維修店」時，系統可能會顯示本地搜尋結果，而且不會顯示[圖片搜尋結果](https://developers.google.com/search/docs/appearance/visual-elements-gallery?hl=zh-tw#image-result)；不過，如果搜尋「現代單車」，則較有可能顯示圖片搜尋結果，但不太可能顯示本地搜尋結果。您可以前往[視覺元素庫](https://developers.google.com/search/docs/appearance/visual-elements-gallery?hl=zh-tw)，瀏覽 Google 網頁搜尋中最常見的 UI 元素。

Search Console 可能會告知您網頁已建立索引，但不會顯示在搜尋結果中。可能原因如下：

  - [網頁內容與使用者的查詢無關](https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=zh-tw#expect-search-terms)

  - [內容品質不佳](https://developers.google.com/search/docs/essentials?hl=zh-tw)

  - [Robots `meta` 規則禁止提供](https://developers.google.com/search/docs/crawling-indexing/block-indexing?hl=zh-tw)

雖然本指南說明了 Google 搜尋的運作方式，但我們會不斷改進演算法。
  您可以追蹤 [Google 搜尋中心網誌](https://developers.google.com/search/blog?hl=zh-tw)，隨時掌握這些變更。

---

# 建立實用、可靠且以使用者為優先的內容

  
    
    
    
  
# 建立實用、可靠且以使用者為優先的內容

  
    Google 的[自動排名系統](https://www.google.com/search/howsearchworks/how-search-works/ranking-results/?hl=zh-tw)旨在優先顯示實用可靠的資訊。這類資訊是以讓使用者受益為目的，而不是為了操縱搜尋引擎排名。這個頁面旨在協助創作者評估自己製作的是否屬於此類內容。

    
## 自我評估內容

    根據這些問題評估自己的內容，可以協助您評估自己製作的內容是否實用且可靠。除了向自己提出上述問題外，您也可以考慮請您信任、但與網站沒有關聯的人對網頁進行誠實的評估。

    另外，您也可考慮對搜尋成效下滑情形進行稽核，例如找出哪些網頁受到的影響最大，或是哪類搜尋查詢對網頁的成效影響最大。請仔細分析這些資訊，以便與此處部分問題的評估結果互相比較。

    
### 內容及品質相關問題

    

      - 內容是否提供原創的資訊、報表、研究或分析資料？

      - 內容是否針對主題提供充實、完整或詳盡的說明？

      - 內容是否提供深入分析見解，或是值得注意的資訊？

      - 如果內容借鑒了其他來源，是否力圖避免單純複製或是改寫來源內容，而是設法提供具有原創性及大量附加價值的內容？

      - 主要標題或網頁標題是否提供了敘述清晰的實用內容摘要？

      - 主要標題或網頁標題是否力圖避免使用誇飾或聳動的敘述？

      - 您會想要將這類網頁加入書籤、分享給朋友或推薦給他人嗎？

      - 您覺得紙本雜誌、百科全書或書籍有沒有可能採用或引用這項內容？

      - 比起搜尋結果中的其他頁面，這項內容是否提供了更高的價值？

      - 內容中是否有任何錯字或是樣式問題？

      - 內容製作品質是否良好？呈現出來的樣貌是否讓人覺得草率或是急就章？

      - 內容是否為源自許多創作者的大量生產內容、外包給大量創作者，或者遍布於網路上的眾多網站，導致個別網頁或網站無法獲得足夠的關注？

    

    
### 專業度相關問題

    

      - 內容呈現資訊的方式是否讓人覺得信服？舉例來說，內容是否提供了清楚的資訊來源、具備專業知識的證據、作者或文章發布網站的背景資訊 (例如作者介紹頁面或網站簡介頁面的連結)？

      - 在有人探索了製作這項內容的網站後，他們是否覺得就這個網站的主題而言，網站提供的資訊十分值得信賴，或是廣受相關權威人士的認可？

      - 這項內容是否由專業人士或明顯瞭解這個主題的專家或愛好者撰寫或審查？

      - 內容中是否有任何顯而易見的錯誤資訊？

    

    
## 提供良好的網頁體驗

    Google 的核心排名系統旨在獎勵提供良好網頁體驗的內容。網站擁有者如果希望透過此系統取得優秀排名，則不該只注重網頁體驗的一兩個層面，相對的，應該確認自己是否在各方面都提供了整體上良好的網頁體驗。如需更多建議，請參閱「[瞭解 Google 搜尋結果中的網頁體驗](https://developers.google.com/search/docs/appearance/page-experience?hl=zh-tw)」一文。

    
## 專注於使用者優先的內容

    使用者優先的內容是指專為大眾製作，而非以操控搜尋引擎排名為目標的內容。如何評估您製作的內容是否屬於使用者優先內容？如果您針對下列問題回答「是」，表示您可能正採用使用者優先的方法：

    

      - 您的業務或網站是否有既有或預期的目標對象，且這些目標對象如果直接閱讀您的內容，會覺得內容很實用？

      - 您的內容是否清楚呈現第一手專業知識及具有深度的知識 (例如因實際使用產品/服務或造訪某個地點所獲得的專業知識)？

      - 您的網站是否有主要目的或重點？

      - 使用者在閱讀完您的內容後，是否覺得他們對某個主題有足夠的瞭解，可協助他們達成目標？

      - 使用者在閱讀完您的內容後，是否覺得滿意？

    

    
## 避免建立以搜尋引擎為優先的內容

    我們建議您將重點放在製作以使用者為優先的內容，藉此在 Google 搜尋中取得理想排名，而非製作以搜尋引擎優先的內容，試圖提高搜尋引擎中的排名。
      如果您針對部分或所有問題回答「是」，表示這是一種警告跡象，意味著您應該重新評估自己建立內容的方式：

    

      - 內容是否主要是為了吸引來自搜尋引擎的造訪？

      - 您是否針對不同主題建立大量內容，希望部分內容在搜尋結果中獲得良好成效？

      - 您是否大規模運用自動化功能，針對許多主題建立內容？

      - 您主要是匯總其他人說話的內容，但其實並沒有帶來太多的價值？

      - 您之所以撰寫內容，只是因為這些內容似乎很熱門，而非為您既有的目標對象而撰寫？

      - 您的內容是否會讓讀者覺得他們需要再次搜尋，才能從其他來源取得更完善的資訊？

      - 您是否因為聽說或讀到 Google 對於撰寫的內容有偏好的字數，所以您才撰寫一定字數的內容？(不，我們沒有這種偏好)。

      - 您是否在沒有真正專業知識的情況下，決定進入某個小眾主題領域，但其實主要是因為您認為自己會獲得搜尋流量？

      - 您的內容是否承諾可以回答實際上沒有答案的問題，例如在日期未經確認的情況下，表示知道產品、電影或電視節目的推出日期？

      - 您是否變更網頁日期，想營造看起來很新的假象，但其實內容並沒有什麼更新？

      - 您之所以會加入大量新內容，或是移除大量較舊的內容，是因為您認為這樣會讓網站看起來「更新鮮」而提升網站整體搜尋排名嗎？(這麼做其實沒有效果)

    

    
### SEO 又是如何？它不是以搜尋引擎為優先的程序嗎？

    您可以採取一些特定行動，協助搜尋引擎更有效地探索及解讀您的內容，這類行動統稱為「search engine optimization」(搜尋引擎最佳化)，縮寫為 SEO。[Google 的搜尋引擎最佳化 (SEO) 指南](https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=zh-tw)介紹了一些最佳做法。如果將 SEO 應用在以使用者為優先的內容，而非以搜尋引擎為優先的內容，則這項功能會相當實用。

    
## 瞭解 E-E-A-T 和品質評分者指南

    Google 的自動化系統採用[多種因素](https://www.google.com/search/howsearchworks/how-search-works/ranking-results/?hl=zh-tw)來判斷內容的排名。找出相關內容後，Google 系統會盡可能優先顯示最實用的內容。Google 的做法是識別一些混合因素，藉此判斷哪些內容展現了實際經驗、專業性、權威性和可信度，也就是符合所謂的 E-E-A-T 標準。

    就上述層面而言，可信度最為重要。其他層面也會影響可信度，但內容不一定要呈現所有指標。舉例來說，某些內容之所以實用，可能是因為其所展現的實際經驗，而其他內容之所以有用，可能是因為它提供了專業知識。

    雖然 E-E-A-T 本身並非特定排名依據，但若使用的多種因素能找出高度符合 E-E-A-T 標準的內容，則會很有幫助。舉例來說，如果內容對健康、財務穩定性、人身安全、社會福利或福祉方面有重大影響，我們的系統會更重視內容是否符合嚴格的 E-E-A-T 標準。這就是所謂的「Your Money or Your Life」(要錢還是要命) 主題，縮寫為 YMYL。

    [搜尋品質評分者](https://www.google.com/search/howsearchworks/how-search-works/rigorous-testing/?hl=zh-tw)會針對 Google 的演算法是否能顯示適切的搜尋結果提供深入見解，以協助確認我們進行的變更是否成效良好。具體來說，評分者會接受培訓，學習判斷內容是否符合嚴格的 E-E-A-T 標準。E-E-A-T 所用標準請參閱[搜尋品質評分者指南](https://services.google.com/fh/files/misc/hsw-sqrg.pdf?hl=zh-tw)。

    
詳閱指南內容後，您就可以根據 E-E-A-T 標準來自我評估內容品質，並思考進一步提升搜索成效的方式，並且有助於瞭解自動化系統用於決定內容排名的各種指標，據此做出與自動化系統一致的評估。

    
## 詢問內容的製作者、方法和原因

    建議您根據「製作者、方法和原因」來評估內容，掌握系統決定排名的原因。

    
### 製作者 (內容的製作者)

    如果內容清楚顯示是由何者製作，有助於訪客快速瞭解內容的 E-E-A-T 指標。這就是您要考慮的「**製作者**」。製作內容時，請自我評估下列幾個問題：

    

      - 訪客可快速瞭解誰是內容製作者嗎？

      - 網頁是否在明顯的位置提供作者署名？

      - 署名是否會進一步提供作者或作者相關資訊，讓訪客瞭解作者的背景及撰寫領域？

      

    如果您能明確指出內容的製作者，應該就符合 E-E-A-T的概念，也容易獲得成功。強烈建議您加入正確的作者資訊，例如在內容的明顯位置加上作者署名。

    
### 方法 (製作內容的方法)

    如果讀者瞭解內容是由何種方法產生，對讀者會很有幫助：這就是可以考慮在內容中加入的「**方法**」。

    舉例來說，透過產品評論，讓讀者瞭解受測的產品數量、測試結果和測試方式，並且附上測試證明 (如相片)，能夠獲得讀者的信賴。我們在[撰寫優質產品評論](https://developers.google.com/search/docs/specialty/ecommerce/write-high-quality-reviews?hl=zh-tw)說明頁面中提供了更多資訊，歡迎多加利用。

    許多類型的內容都包含「方法」元素。包括自動產生、AI 產生和 AI 輔助撰寫的內容。分享內容製作程序的詳細資訊，可讓讀者和訪客更深入瞭解自動化技術在內容中扮演的角色為何，以及這項技術的獨特或實用程度。

    如果您運用自動化技術來大量產生內容，請思考以下幾個問題：

    

      - 是否能讓訪客自己清楚發現，或是用其他方式，讓訪客知道內容是使用自動化技術 (包括採用 AI 技術) 產生？

      - 您是否對訪客提供背景知識，讓他們瞭解內容使用的自動化技術或 AI 技術？

      - 您能否說明，為何認為自動化或 AI 技術是產生內容的實用方法？

    

    整體而言，如果您的內容可能會讓人疑惑「這是怎麼製作出來的？」，加入 AI 或自動化功能揭露資訊就會很有實用性。理應讓人得知這類資訊的情況下，請加入相關資訊。詳情請參閱我們的網誌文章和常見問題：[Google 搜尋如何查看 AI 產生的內容](https://developers.google.com/search/blog/2023/02/google-search-and-ai-content?hl=zh-tw)。

    
### 原因 (製作內容的原因)

    「**原因**」可能是與您內容相關的最重要問題。為什麼要著手建立這項內容？

    建立內容的主要「原因」應該是協助人群，讓訪客直接造訪您的網站時，可以取得實用內容。這麼做的話，您就符合一般的 E-E-A-T 標準，這也是[核心排名系統](https://developers.google.com/search/updates/core-updates?hl=zh-tw)決定排名的因素。

    如果您建立內容的主要「原因」是要透過內容吸引搜尋引擎造訪，就不符合 Google 系統的排名因素。如果使用自動化技術產生內容 (包括 AI 產生) 的主要目的為操控搜尋排名，則[違反我們的垃圾內容政策](https://developers.google.com/search/docs/essentials/spam-policies?hl=zh-tw#scaled-content)。

---

# 針對 Google 搜尋的生成式 AI 功能進行網站最佳化

  
    
    
    
  
# 針對 Google 搜尋的生成式 AI 功能進行網站最佳化

  

使用者的偏好演變迅速，越來越多人會使用生成式 AI 服務尋找資訊。為滿足這些不斷變化的期望，我們升級了搜尋服務，這項轉變也帶來了新的機會，讓您觸及可能更願意與網站互動、花更多時間瀏覽內容，甚至轉換為訂閱者或進行購買的使用者。本指南適用於網站擁有者，提供 Google 搜尋的官方最佳做法，說明如何在 Google 搜尋的生成式 AI 功能 (例如 AI 摘要和 AI 模式) 中取得成功。

## SEO 做法在生成式 AI 搜尋環境中是否仍有效用？

簡單來說，答案為「是」。[SEO 最佳做法](https://developers.google.com/search/docs/essentials?hl=zh-tw)仍適用於 Google 搜尋的生成式 AI 功能，因為這些功能是以 Google 搜尋的核心排名與品質系統為基礎。這些功能會運用 AI 技術，從 Google 搜尋索引中找出相關內容，例如：

  - **檢索增強生成 (RAG)**：這項技術 (也稱為「建立基準」) 會運用核心搜尋排名系統，從搜尋索引中檢索相關的最新網頁，藉此提升 AI 回覆的品質、準確度和即時性。接著，系統會審查這些網頁中的特定資訊，生成更可靠實用的回覆，並醒目顯示相關網頁的可點選連結，做為回覆內容的佐證。

  - **查詢擴展**：模型產生的一組並行相關查詢，用於要求更多資訊，並擷取其他相關搜尋結果，以解決使用者的查詢。舉例來說，如果使用者的原始查詢是「如何修復雜草叢生的草坪」，則擴展查詢可能包括「草坪最佳除草劑」、「如何不使用化學物質除草」和「如何防止草坪長出雜草」。

## 將基礎 SEO 最佳做法套用至生成式 AI 搜尋

本節著重於重新架構 SEO 最佳做法，以瞭解當今 AI 系統最重視的要素，以及如何在生成式 AI 搜尋的脈絡中實作這些做法，最終目標是提升網站在生成式 AI 搜尋體驗和整體 Google 搜尋中的曝光度。

### 為目標對象製作有價值且非同質化的內容

長期來說，比起本指南的任何其他建議，如果能製作獨特、引人入勝且實用的內容，或許更能有效提升網站在生成式 AI 搜尋結果中的能見度。雖然「與眾不同的實用優質內容」對每個人的意義不同，但這類內容一般都有某些共通特徵，例如：

  - **提供獨特的觀點**：我們的 AI 系統會查看各種來源，因此獨特的觀點有助於脫穎而出。舉例來說，第一手評論會根據個人經驗提供獨特的觀點，而現有內容摘要只是重述其他地方已提供的資訊。根據你對主題的瞭解自行創作內容，並思考如何為內容帶來深入的體驗。不要只是重複網路上其他人的說法，或使用生成式 AI 模型輕易就能產生的內容。

  - **製作[實用、可靠且以使用者為優先](https://developers.google.com/search/docs/fundamentals/creating-helpful-content?hl=zh-tw)的非同質化內容：**請務必撰寫對讀者來說實用可靠的非同質化內容。同質化內容 (例如「首次購屋者必知的 7 個訣竅」) 通常是根據一般知識，可能來自任何人，且通常不會為讀者提供獨特的見解。相較之下，非同質化內容 (例如「我們為何免除檢查並省下費用：下水道內部檢查」) 提供獨特的專家見解或實際經驗，超越一般知識和普通內容。

  - **以有助於讀者理解的方式整理內容**：請為人類讀者撰寫內容，並確保內容撰寫得當且流暢易懂。一般來說，網頁若適當分出段落和章節，並提供架構清晰的標題來引導使用者瀏覽內容，會更受歡迎。

  - **加入高品質圖片和影片**：許多人在網路上搜尋資訊時，喜歡看到圖片和影片。就 Google 搜尋整體而言，我們的生成式 AI 搜尋功能可帶入相關圖片和影片，這表示您的網站有更多機會出現在網頁連結以外的地方。情況合宜時，可在網頁上使用高品質的相關圖片和影片輔助文字內容。如果您已遵循我們的[圖片 SEO 最佳做法](https://developers.google.com/search/docs/appearance/google-images?hl=zh-tw)和[影片 SEO 說明文件](https://developers.google.com/search/docs/appearance/video?hl=zh-tw)，就表示您已針對生成式 AI 搜尋完成了最佳化。

  - **著重於使用者需求，避免過度宣傳。**雖然您可能會想針對使用者可能搜尋的各種變化建立不同的內容 (例如著重於使用者提出的其他查詢或擴展查詢)，但如果這麼做主要是為了操控 Google 搜尋中的排名或生成式 AI 回覆，則違反 Google 針對[大量內容濫用行為的垃圾內容政策](https://developers.google.com/search/docs/essentials/spam-policies?hl=zh-tw#scaled-content)。此外，這也不是有效的長期策略，因為網頁數量多並不代表網站品質高，或與使用者更相關。Google 的 AI 系統進一步提升了[瞭解網頁相關性的能力](https://blog.google/products-and-platforms/products/search/search-language-understanding-bert/?hl=zh-tw)，即使查詢與網頁主要內容不完全相符，也能判斷網頁是否相關。

  - **如果您使用生成式 AI 工具輔助製作內容**，請確保您的內容符合「[搜尋基礎入門](https://developers.google.com/search/docs/essentials?hl=zh-tw)」和[垃圾內容政策](https://developers.google.com/search/docs/essentials/spam-policies?hl=zh-tw#scaled-content)的標準。如要進一步瞭解我們的做法，請參閱 [AI 生成內容指引](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content?hl=zh-tw)。

您可以簡化做法，只專注於一項核心原則：著重於提供訪客造訪網站後會喜歡、會覺得有幫助且感到滿意的內容。如果您對網站的決策有任何疑慮，請自問：「訪客會對這些內容感到滿意嗎？」如果答案是肯定的，就代表您做對了，因為我們的系統旨在為使用者提供這類實用資訊。詳情請參閱[這份指南](https://developers.google.com/search/docs/fundamentals/creating-helpful-content?hl=zh-tw)，瞭解如何製作實用、可靠，且以使用者為優先的內容。

### 建構並維護清楚的技術架構

Google 搜尋尋找及處理網頁的方式，仍是 AI 系統存取您資料的核心。技術清晰度可確保內容已準備好供探索和建立索引，所有現有的技術性 [SEO 最佳做法](https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=zh-tw)仍值得採用，例如：

  - **符合 Google 搜尋技術相關規定：**網頁必須已編入索引、符合在 Google 搜尋中顯示摘要的資格，並遵循[搜尋技術相關規定](https://developers.google.com/search/docs/essentials/technical?hl=zh-tw)，才能在 Google 搜尋的生成式 AI 功能中顯示。

  - **遵循檢索最佳做法**。如要盡量提高網站在生成式 AI 搜尋功能中的曝光度，請確保內容可供檢索，因為 Google 搜尋生成式 AI 模型會使用可公開存取且可供檢索的內容來學習模式，並提供相關且有根據的回覆。如果網站非常龐大且經常更新，請參閱[這份指南](https://developers.google.com/crawling/docs/crawl-budget?hl=zh-tw)，瞭解如何最佳化檢索預算。

  - **使用語意式 HTML 時，請著重於提升可讀性，不必擔心程式碼是否完美：**雖然不一定要使用完美的語意 HTML (一般網頁並非有效的 HTML，但 Google 仍可解讀)，但建議盡可能使用語意 HTML，因為這有助於其他類型的使用者 (例如螢幕閱讀器) [更輕鬆地剖析及瀏覽網頁](#agentic-experiences)。

  - **如果您使用 JavaScript，請務必遵循 JavaScript SEO 最佳做法**。
    只要未遭到封鎖，Google 就能處理 JavaScript 中的內容。不過，如果網站使用 JavaScript 架構，SEO 工作通常會比其他類型的網站更複雜。請務必遵循一般 [JavaScript SEO 最佳做法](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics?hl=zh-tw)。

  - **為造訪網站的使用者提供[良好的網頁體驗](https://developers.google.com/search/docs/appearance/page-experience?hl=zh-tw)**，包括確保網站在所有裝置上都能正常顯示、減少延遲，以及讓使用者輕鬆區分網頁上的主要內容和其他元素。

  - **減少重複的內容：**重複內容可能導致使用者體驗不佳，搜尋引擎也可能會將檢索資源浪費在不重要的網址上。如有時間，請[盡量減少重複內容](https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=zh-tw#reduce-duplicate-content)。

如要快速找出並診斷潛在的技術問題，請[在 Search Console 中驗證網站](https://support.google.com/webmasters/answer/9008080?hl=zh-tw)。如要瞭解詳情，請參閱 [SEO 技術指南](https://developers.google.com/search/docs/fundamentals/get-started-developers?hl=zh-tw)和[維護網站的 SEO 成效](https://developers.google.com/search/docs/fundamentals/get-started?hl=zh-tw)。

### 最佳化當地商家和電子商務詳細資料

生成式 AI 回覆內容視情況會包含產品資訊和當地商家資訊。使用 [Merchant Center](https://merchants.google.com/?hl=zh-tw) (例如 [Merchant Center 動態饋給](https://support.google.com/merchants/answer/11586438?hl=zh-tw)) 和 [Google 商家檔案](https://business.google.com/?hl=zh-tw)等產品，有助於在 AI 回覆和其他 Google 搜尋結果中顯示產品和服務。進一步瞭解如何[在 Google 搜尋中新增及管理商家詳細資料](https://developers.google.com/search/docs/appearance/establish-business-details?hl=zh-tw)。

## 破解生成式 AI 搜尋的迷思：哪些事不需要做

隨著生成式 AI 搜尋功能發展，相關理論和做法 (有時還得加上相關的誤解) 也應與時俱進。雖然網路上常見「答案引擎最佳化」(AEO) 或「生成引擎最佳化」(GEO) 等用語，但許多建議的「訣竅」並沒有效果，或與 Google 搜尋的實際運作方式不符。

為協助您專注於網站曝光度相關事宜，我們收集了幾個最常在網路上流傳的生成式 AI 和 Google 搜尋關鍵主題。以下是對於 Google 搜尋沒有作用的幾項內容：

  - **LLMS.txt 檔案和其他「特殊」標記**：您不需要建立新的機器可讀檔案、AI 文字檔案、標記或 Markdown，即可在生成式 AI 搜尋中顯示。請注意，Google 可能會探索、檢索並為網站上[多種檔案](https://developers.google.com/search/docs/crawling-indexing/indexable-file-types?hl=zh-tw) (而不只是 HTML) 建立索引，但這不代表 Google 會以特殊方式處理這些檔案。

  - **「分塊」內容：**不必將內容分成小塊，AI 就能瞭解。Google 系統能夠瞭解網頁上多個主題的細微差異，並向使用者顯示相關內容。不過，視目標對象和主題而定，有時較短 (或較長！) 的網頁也能發揮良好效果。頁面長度沒有理想的標準值，最終原則還是要為目標對象製作網頁，而不是只為了生成式 AI 搜尋。

  - **專為 AI 系統重寫內容：**不需要專為生成式 AI 搜尋撰寫內容。AI 系統可以瞭解使用者搜尋內容的同義詞和一般意義，即使內容並未使用完全相同的字詞，系統仍會將使用者與相關內容連結。也就是說，您不必擔心沒有足夠的「長尾」關鍵字，或未考量使用者尋找類似內容時採取的各種方式。

  - **刻意追求不實的「提及」內容：**與 Google 搜尋的其他功能一樣，生成式 AI 功能可顯示網路上有關產品和服務的討論內容，包括網誌、影片和論壇上的討論。不過，在網路上刻意追求不實的「提及」內容，可能不如您想像的有用。我們的核心排名系統會著重於[優質內容](https://developers.google.com/search/docs/fundamentals/creating-helpful-content?hl=zh-tw)，其他系統則會[封鎖垃圾內容](https://developers.google.com/search/docs/essentials/spam-policies?hl=zh-tw)；生成式 AI 功能的運作取決於這兩者。

  - **過度著重結構化資料**：生成式 AI 搜尋不需要結構化資料，也不需要新增任何特殊的 schema.org 標記。不過，建議您繼續使用，做為整體 SEO 策略的一部分，因為這有助於在 Google 搜尋中顯示複合式搜尋結果。

## 探索代理功能體驗

AI 代理是自主系統，可代表使用者執行預訂或比較產品規格等工作。這些代理的形式有很多種，例如瀏覽器代理可能會存取您的網站，以收集完成這些工作所需的資料，例如分析視覺化呈現內容 (如螢幕截圖)、檢查 DOM 結構，以及解讀無障礙樹狀結構。

如果這與您的業務相關，且您有額外時間，請查看可用的代理功能體驗，並參閱[代理友善網站最佳做法](https://web.dev/articles/ai-agent-site-ux?hl=zh-tw)指南，瞭解網站如何為目前的瀏覽器代理做好準備。[通用商務通訊協定](https://ucp.dev/latest/) (UCP) 等通訊協定正在興起，可讓 Google 搜尋代理執行更多操作。

## 後續步驟：重點事項

在您打造網站的過程中，請記得，許多內容在 Google 搜尋 (包括生成式 AI 體驗) 中蓬勃發展，完全不需要任何明顯的 SEO，而且您不必完成本指南中的所有事項，也能在 Google 搜尋中獲得成功。最後，我們來複習一下本指南的重點：

  - **將 SEO 最佳做法套用至生成式 AI 搜尋：**持續優先採用 SEO 基礎最佳做法，例如[建立清楚的技術架構](#build-technical-structure)，以及[製作獨特且有價值的內容](#create-valuable-content)；這些是提升生成式 AI 搜尋體驗 (和整體 Google 搜尋) 曝光度的基礎。

  - **製作[實用、可靠且以使用者為優先](https://developers.google.com/search/docs/fundamentals/creating-helpful-content?hl=zh-tw)的非同質化內容：**
    著重於開發獨特的專家主導內容，提供超出一般知識的價值。

  - **優先採用有效的 SEO 策略，而非「AEO/GEO 秘技」：**如果是 Google 搜尋，您可以忽略「分塊」內容、建立不必要的 AI 文字檔案 (例如 llms.txt) 或追求不實提及等策略。

  - **探索代理功能體驗**：掌握新興技術的最新資訊，例如瀏覽器代理和新通訊協定，瞭解 AI 代理與網站如何透過這些技術互動。

## 掌握最新資訊與提問

如要進一步瞭解 SEO，歡迎參考下列資源，隨時掌握我們發布的異動消息和最新資源：

|  | Google 搜尋中心網誌：從 Google 搜尋中心網誌取得最新資訊。這裡提供 Google 搜尋生成式 AI 的最新消息、最新 Search Console 功能及更多資訊。                  LinkedIn 和 X (Twitter) 上的 Google 搜尋中心帳號：           追蹤我們即可掌握 Google 搜尋的最新消息，取得有助於建立優質網站的資源。 | Google 搜尋中心說明論壇：這是專為網站擁有者設立的產品論壇，您可以就網站上的 SEO 問題發文詢問，還能查看各種打造優質網站的提示。許多經驗豐富的人士都會在這裡貢獻文章，包括幾位產品專家，Google 員工有時也會出現。         Google 搜尋中心 YouTube 頻道：觀看上百部專為網站擁有者社群製作的實用影片。 |
| --- | --- | --- |

---

# Google 搜尋的生成式 AI 內容使用指南 (適用於網站)

  
    
    
    
  
# Google 搜尋的生成式 AI 內容使用指南 (適用於網站)

  
生成式 AI 在研究主題時特別實用，還可為原始內容加入結構。不過，使用生成式 AI 工具或其他類似工具產生大量無法為使用者帶來價值的網頁，可能會違反 [Google 針對大量內容濫用行為的垃圾內容政策](https://developers.google.com/search/docs/essentials/spam-policies?hl=zh-tw#scaled-content)。如果您在自家網站上使用生成式 AI 內容，請**確保您的內容符合「[搜尋基礎入門](https://developers.google.com/search/docs/essentials?hl=zh-tw)」和[垃圾內容政策](https://developers.google.com/search/docs/essentials/spam-policies?hl=zh-tw#scaled-content)的標準。**

建議參考[搜尋品質評分者指南](https://static.googleusercontent.com/media/guidelines.raterhub.com/en//searchqualityevaluatorguidelines.pdf)，瞭解如何評估大量內容濫用 (第 4.6.5 節)，以及主要內容幾乎未經處理、幾乎沒有原創性，以及幾乎沒有附加價值的情形。這些指南的作用並非提升 Google 搜尋排名，而是[搜尋評分者](https://support.google.com/websearch/answer/9281931?hl=zh-tw)用來評估[各種搜尋排名系統](https://developers.google.com/search/docs/appearance/ranking-systems-guide?hl=zh-tw)的成效，這類評分不會直接影響排名。

### 著重準確度、品質和關聯性

製作網站內容時，請著重於準確性、品質和關聯性，尤其是在自動生成內容時。這包括 [`<title>`元素](https://developers.google.com/search/docs/appearance/title-link?hl=zh-tw)、[中繼說明元素](https://developers.google.com/search/docs/appearance/snippet?hl=zh-tw)、[結構化資料](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=zh-tw)和[圖片的替代文字](https://developers.google.com/tech-writing/accessibility/self-study/write-alt-text?hl=zh-tw)等中繼資料，這些資料可能會顯示在搜尋結果中。

針對結構化資料，請務必遵循[一般規範](https://developers.google.com/search/docs/appearance/structured-data/sd-policies?hl=zh-tw)、個別搜尋功能的特定政策，並[驗證標記](https://developers.google.com/search/docs/appearance/structured-data/sd-policies?hl=zh-tw)，確保符合[搜尋結果功能](https://developers.google.com/search/docs/appearance/structured-data/search-gallery?hl=zh-tw)的使用資格。

### 向使用者提供背景資訊

分享[內容的製作方式](https://developers.google.com/search/docs/fundamentals/creating-helpful-content?hl=zh-tw#how-the-content-was-created)，有助於為讀者提供更多背景資訊。如果您採用自動生成內容，請考慮新增資訊，讓目標對象瞭解內容製作方式的合理性，例如提供更多背景資訊，說明您如何使用自動化技術，以及新增[圖片中繼資料](https://developers.google.com/search/docs/appearance/structured-data/image-license-metadata?hl=zh-tw#add-metadata)。

針對電子商務網站，Google Merchant Center 提供了 [AI 生成內容政策](https://support.google.com/merchants/answer/14743464?hl=zh-tw)。具體來說，AI 生成圖像必須包含使用 IPTC `DigitalSourceType`
  [`TrainedAlgorithmicMedia`](https://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia) 中繼資料的中繼資料。AI 生成的產品資料 (例如名稱和說明屬性) 必須個別指定，並標示為 AI 產生。

詳情請參閱[這篇討論 AI 生成內容網誌文章中的常見問題](https://developers.google.com/search/blog/2023/02/google-search-and-ai-content?hl=zh-tw)。

---

# 維護網站的搜尋引擎最佳化 (SEO) 成效

  
    
    
    
  
# 維護網站的搜尋引擎最佳化 (SEO) 成效

  
    如果您的網站已顯示在 Google 服務中，而您也熟悉[搜尋引擎最佳化 (SEO) 基礎知識](https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=zh-tw)，那麼有許多做法可以改善網站在 Google 服務中的呈現方式。管理和維護網站時，您可能會遇到更多影響 Google 搜尋的獨特情境。本指南將說明更深入的搜尋引擎最佳化 (SEO) 作業，例如準備遷移網站，或管理多語言版本網站。

    
## 控管 Google 檢索網站及建立網站索引的方式

    請參閱我們的指南，瞭解 [Google 搜尋運作方式](https://developers.google.com/search/docs/fundamentals/how-search-works?hl=zh-tw)；如果您並未充分理解 Google 檢索/建立索引/傳回搜尋結果的管道，就很難對問題執行偵錯作業，或預測 Google 搜尋對網站採取的行動。

    
### 重複的內容

    您必須瞭解[標準網頁](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls?hl=zh-tw#definition)的定義、這類網頁對於網站的檢索和索引作業有何影響。

    
### 資源

    此外，如要讓 Google 檢索特定資源 (圖片、CSS 檔案等等) 或網頁，您也必須確認 Google 可以存取這些內容；也就是說，該內容不能遭到任何 robots.txt 規則封鎖，並且應開放匿名使用者存取。[網頁索引報表](https://search.google.com/search-console/index?hl=zh-tw)不會顯示 Google 無法存取的網頁，而[網址檢查工具](https://support.google.com/webmasters/answer/9012289?hl=zh-tw)則會將這類網頁列為尚未檢索的項目。遭到封鎖的資源只會顯示在網址檢查工具中的個別網址層級。一旦網頁上有重要資源遭到封鎖，Google 就無法順利檢索該網頁，此時請透過網址檢查工具轉譯實際網頁，確認 Google 是否能按照您預期的方式檢索網頁。

    
### Robots.txt

    您可以透過 robots.txt 規則和 Sitemap 分別防止及建議 Google 檢索特定內容。如果網站上有重複的內容，或者可能因為 Google 的要求而導致伺服器過載的不重要資源 (例如圖示或標誌等常用的小型圖片)，請封鎖這些內容或資源的檢索作業。不過，請勿使用 robots.txt 做為禁止建立索引的機制，而是改用 `noindex` 標記或設置登入規定。[進一步瞭解如何封鎖內容存取權](https://developers.google.com/search/docs/crawling-indexing/control-what-you-share?hl=zh-tw)。

    
### Sitemap

    Sitemap 是一種相當重要的工具，能夠告知 Google 您的網站上有哪些重要網頁，並提供更新頻率等其他資訊，而且對於圖片或影片等非文字內容的檢索作業也會有非常大的幫助。雖然 Google 不會只檢索您在 Sitemap 中列出的網頁，但是會優先檢索這些網頁。如果網站經常變更內容，或含有可能無法透過連結找到的網頁，這種做法就顯得特別重要。只要使用 Sitemap，即可協助 Google 在您的網站上找出及優先處理需要檢索的網頁。[參閱 Sitemap 的所有相關資訊。](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview?hl=zh-tw)

    
### 國際版或多語言版本的網站

    如果您的網站含有多種語言，或是專為特定地區的使用者所設立，請參考下列做法：

    

    - 如果您的網站針對不同語言或地區提供本地化內容，請參閱[多地區和多語言版本的網站](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites?hl=zh-tw)一文的進階建議，瞭解如何管理網站。

    - [透過 hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions?hl=zh-tw) 將您網站上網頁的各種語言版本告知 Google。

    - 如果您的網站會根據要求的語言代碼調整網頁內容，請參閱[這種做法對於 Google 在您網站上的檢索作業有何影響](https://developers.google.com/search/docs/specialty/international/locale-adaptive-pages?hl=zh-tw)。

    

    
### 遷移網頁或網站

    當您可能需要遷移單一網址或整個網站時，請遵循下列規範：

    
#### 遷移單一網址

    如要將網頁永久移至其他位置，請務必[針對該網頁執行 `301` 重新導向](https://developers.google.com/search/docs/crawling-indexing/301-redirects?hl=zh-tw)。如果只是基於某些原因需要暫時遷移網址，請改為傳回 `302` 錯誤，要求 Google 繼續檢索網頁。

    當使用者要求存取已遭移除的網頁時，您可以建立自訂 `404` 網頁，藉此提供更理想的瀏覽體驗。當使用者要求存取已不存在的網頁，請確保系統會傳回真正的 `404` 錯誤，而非 [`soft 404`](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors?hl=zh-tw#soft-404-errors)。

    
#### 遷移網站

    如要遷移整個網站，請視需要實作所有 `301` 錯誤並變更 Sitemap，然後告知 Google 這項遷移作業。如此一來，我們就能開始檢索新的網站，並將您的信號轉送至該網站。
      [瞭解如何遷移網站。](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes?hl=zh-tw)

    
### 遵循檢索和建立索引的最佳做法

    

      - **[提供可檢索的連結](https://developers.google.com/search/docs/crawling-indexing/links-crawlable?hl=zh-tw#crawlable-links)。**

      - **如果是付費連結、要求登入的連結或不受信任的內容 (例如使用者提交的內容)，請[使用 `rel=nofollow`](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links?hl=zh-tw)**，避免將您的品質信號傳送給這類內容，或是防止劣質內容對您的網站造成負面影響。

      - **[管理您的檢索預算](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget?hl=zh-tw)**：如果您網站的規模特別大 (含有數億個定期變更的網頁，或數千萬個經常修改的網頁)，Google 或許無法如您預期般地頻繁檢索整個網站，因此您可能需要引導 Google 找出網站上最重要的網頁。如果您想這麼做，目前最理想的機制是在 Sitemap 中列出最近更新或最重要的網頁，並透過 robots.txt 規則隱藏較不重要的網頁。

      - **JavaScript 使用方式**：遵循 [Google 針對網站上的 JavaScript 所提出的建議](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics?hl=zh-tw)。

      - **拆分成多個網頁的文章**：如果您將同一篇文章分段發布至多個網頁，請務必提供醒目的下一頁和上一頁連結 (同時也是可檢索的連結) 讓使用者點選。如此一來，Google 就能檢索這類網頁集。

      - **無限捲動網頁**：Google 可能無法透過捲動的方式瀏覽這類網頁；如要讓 Google 檢索該網頁，請提供經過分頁處理的版本。
        [進一步瞭解易於搜尋的無限捲動網頁](https://developers.google.com/search/docs/crawling-indexing/javascript/lazy-loading?hl=zh-tw#paginated-infinite-scroll)。

      - **禁止存取會變更狀態的網址**，例如張貼留言、建立帳戶、將商品加入購物車等等。請使用 [robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro?hl=zh-tw) 封鎖這些網址。

      - 請參閱[這份清單](https://developers.google.com/search/docs/crawling-indexing/indexable-file-types?hl=zh-tw)，瞭解 Google 可建立索引的檔案類型。

      - 在少數情況下，**Google 可能會過度檢索您的網站**，這時您可以[降低網站的檢索頻率](https://developers.google.com/search/docs/crawling-indexing/reduce-crawl-rate?hl=zh-tw)，但這種情形並不常見。

      - 如果您的網站目前仍採用 HTTP，我們會建議[改用 HTTPS](https://web.dev/articles/enable-https?hl=zh-tw)，以便[保障您和使用者的安全](https://developers.google.com/search/blog/2018/12/why-how-to-secure-your-website-https?hl=zh-tw)。

    

    
## 協助 Google 瞭解您的網站

    請透過文字 (而非圖片) 形式將關鍵資訊添加到網站上。雖然 Google 可以剖析[多種檔案類型](https://developers.google.com/search/docs/crawling-indexing/indexable-file-types?hl=zh-tw)並建立索引，文字仍是最能確保系統理解網頁內容的形式。如果您使用非文字內容，或想要提供與網站內容相關的額外指引，請在網頁中加入[結構化資料](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=zh-tw)，這除了能讓我們瞭解您的內容，某些情況下還可以提供特殊搜尋功能，例如[複合式搜尋結果](https://developers.google.com/search/docs/appearance/structured-data/search-gallery?hl=zh-tw)。

    如果您對於 HTML 和基本程式設計作業相當熟悉，則可按照[開發人員指南](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=zh-tw)手動新增結構化資料。
      如需協助，您可以使用 WYSIWYG (所見即所得) 的[結構化資料標記協助工具](https://support.google.com/webmasters/answer/3069489?hl=zh-tw)，讓這項工具協助您產生基本的結構化資料。

    如果您無法在網頁中加入結構化資料，則可使用[資料螢光筆工具](https://support.google.com/webmasters/answer/2753960?hl=zh-tw)醒目顯示網頁上的部分內容，讓 Google 瞭解各個部分代表的意義，例如活動、日期或價格等資料性質。這項工具相當容易操作，但可能會在您變更網頁版面配置後失效。

    [進一步瞭解如何協助 Google 瞭解您的網站內容](https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=zh-tw#understand_your_content)。

    
## 遵守我們的指南

    
    
### 特定類型內容指南

    如果您的網站上有特定類型的內容，下列建議可讓這些內容以最理想的方式顯示在 Google 搜尋中：

    

      - **影片**：請務必遵循[影片最佳做法](https://developers.google.com/search/docs/appearance/video?hl=zh-tw)，讓 Google 能夠找到及檢索您網站上代管的影片，並將相關搜尋結果呈現給使用者。

      - **圖片**：如要讓圖片顯示在 Google 搜尋中，請遵循[圖片最佳做法](https://developers.google.com/search/docs/appearance/google-images?hl=zh-tw)。您可以在圖片所在網頁[提供圖片中繼資料](https://developers.google.com/search/docs/appearance/structured-data/image-license-metadata?hl=zh-tw)，以便在 Google 圖片中顯示與圖片相關的其他資訊。如要禁止 Google 建立圖片索引，請[使用 robots.txt 的 `Disallow` 規則](https://developers.google.com/search/docs/crawling-indexing/prevent-images-on-your-page?hl=zh-tw)。

      - **適合兒童觀看的內容：**如果您專門針對兒童提供內容，請遵守《兒童網路隱私保護法》([COPPA](https://business.ftc.gov/privacy-and-security/childrens-privacy))，[將網頁或網站標記為兒童導向內容](https://developers.google.com/search/docs/advanced/guidelines/tag-child-directed-treatment?hl=zh-tw)。

  - **成人網站**：如果您的網站或特定網頁含有僅限成人觀看的內容，建議您[將網站或網頁標記為成人內容](https://developers.google.com/search/docs/crawling-indexing/safesearch?hl=zh-tw)，讓開啟安全搜尋結果功能的使用者能夠過濾掉該網站或網頁。

      - **新聞：**如果您經營新聞網站，請考慮下列重要事項：
        

          - 如果您有新聞內容，請務必參閱 [Google Publisher Center 的說明文件](https://support.google.com/news/publisher-center/?hl=zh-tw)。

          - 此外，您也可以建立[新聞 Sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap?hl=zh-tw)，藉此加快 Google 探索內容的速度。

          - 請務必[防範您的網站上發生濫用行為](https://developers.google.com/search/docs/monitor-debug/prevent-abuse?hl=zh-tw)。

          - 如要限制未訂閱或未登入的訪客觀看網站內容的次數，請參考[彈性試閱](https://developers.google.com/search/docs/appearance/flexible-sampling?hl=zh-tw)一文說明的最佳做法，瞭解如何開放使用者存取少量內容。

          - 瞭解如何向 Google [標明網站上的訂閱和付費牆內容](https://developers.google.com/search/docs/appearance/structured-data/paywalled-content?hl=zh-tw)，並讓 Google 能夠檢索這些內容。

          - 建議您學習如何使用 `meta` 標記，[在產生搜尋結果摘要時限制文字和圖片的使用](https://developers.google.com/search/docs/crawling-indexing/special-tags?hl=zh-tw)。

          - 考慮透過 [AMP](https://amp.dev) 或[網路故事](https://amp.dev/about/stories/)快速載入內容。

      - **其他網站** (例如與商家、書籍、應用程式、學術作品有關的網站)：參考可供您張貼資訊的[其他 Google 服務](https://developers.google.com/search/docs/fundamentals/get-on-google?hl=zh-tw)。

      - 您也可以確認 [Google 是否針對您的內容類型支援特定搜尋功能](https://developers.google.com/search/docs/appearance/structured-data/search-gallery?hl=zh-tw)，包括食譜、活動和徵人啟事網站等等。

    

    
## 管理使用者體驗

    您的網站應該將提供良好的使用者體驗視為首要目標，良好的使用者體驗也是決定網站排名的因素之一。如要達到此目標，您必須考量許多要素，以下列舉其中幾項。

    [Google 建議網站採用 HTTPS](https://developers.google.com/search/blog/2018/12/why-how-to-secure-your-website-https?hl=zh-tw) (而非 HTTP)，以便改善使用者和網站的安全性。Chrome 瀏覽器可能會將採用 HTTP 的網站標示為「不安全」。
      [瞭解如何使用 HTTPS 確保網站安全無虞](https://web.dev/articles/enable-https?hl=zh-tw)。

    相較於載入速度緩慢的網頁，使用者通常更偏好速度較快的網頁。您可以透過 [Core Web Vitals 報告](https://search.google.com/search-console/core-web-vitals?hl=zh-tw)查看整個網站的效能數據，或藉由 [PageSpeed Insights](https://pagespeed.web.dev/?hl=zh-tw) 測試個別網頁的效能。此外，您也可以前往 [web.dev 網站](https://web.dev/explore/fast?hl=zh-tw)瞭解如何建立速度較快的網頁，並考慮使用 [AMP](https://amp.dev/about/stories/) 快速載入網頁。

    
### 行動版網站考量

    由於[全球超過 60% 的網際網路人口會透過行動裝置上網](https://www.statista.com/topics/779/mobile-internet/#topicOverview)，因此網站必須適合行動裝置瀏覽。Google 目前會使用行動檢索器做為網站的預設檢索器。[瞭解如何讓您的網站適合透過行動裝置瀏覽](https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing?hl=zh-tw)。

    
## 控管網站的搜尋外觀

    Google 提供[多種搜尋結果功能和體驗](https://developers.google.com/search/docs/appearance/search-result-features?hl=zh-tw)，包括評論星等與適用於活動、食譜等特定資訊類型的特殊搜尋結果類型。請確認哪些項目適合您的網站，並考慮實作這些項目。舉例來說，您可以提供要在網站搜尋結果中顯示的[網站小圖示](https://developers.google.com/search/docs/appearance/favicon-in-search?hl=zh-tw)和[文章日期](https://developers.google.com/search/docs/appearance/publication-dates?hl=zh-tw)。

    請務必參閱相關文章，瞭解如何協助 Google 提供優質的[標題連結](https://developers.google.com/search/docs/appearance/title-link?hl=zh-tw)和[搜尋結果摘要](https://developers.google.com/search/docs/appearance/snippet?hl=zh-tw)。您也可以限制摘要的長度，或者視需求完全省略這類摘要。建議您學習如何使用 `meta` 標記，[在產生搜尋結果摘要時限制文字和圖片的使用](https://developers.google.com/search/docs/appearance/snippet?hl=zh-tw#nosnippet)。

    
## 使用 Search Console

    Search Console 提供的各種報表能協助您監控網站在 Google 搜尋中的成效，並視需要進行最佳化調整。進一步瞭解[要使用哪些報表](https://developers.google.com/search/docs/advanced/guidelines/search-console?hl=zh-tw)。

---

# Google 搜尋的入門應用知識：開發人員指南

  
    
    
    
  
# Google 搜尋的入門應用知識：開發人員指南

  
    設計易於搜尋的內容至為關鍵；您的內容越好搜尋，就會有越多適合的受眾看到這些內容。這就是所謂的「搜尋引擎最佳化 (SEO)」，有助於吸引更多感興趣的使用者造訪您的網站。如果 Google 搜尋無法解讀您的網頁，您可能就會錯失重要的流量來源。

    本指南將說明開發人員要怎麼做才能確保自家網站能與 Google 搜尋搭配運作。除了本指南中提到的項目，您還必須確保網站[安全無虞](https://web.dev/explore/secure?hl=zh-tw)、[載入快速](https://web.dev/explore/fast?hl=zh-tw)、[可供所有人存取](https://web.dev/explore/accessible?hl=zh-tw)並且[能在所有裝置上運作](https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing?hl=zh-tw)。

    
## 瞭解 Google 如何檢索您的網站

    首先請透過[網址檢查工具](https://search.google.com/search-console?hl=zh-tw)或[複合式搜尋結果測試](https://search.google.com/test/rich-results?hl=zh-tw)工具來測試自己的網站，看看 Google 如何檢索您的網站。
      [Googlebot 是 Google 的網路檢索漫遊器](https://developers.google.com/search/docs/crawling-indexing/googlebot?hl=zh-tw)，可以為 Google 索引尋找新網頁和更新的網頁。如要進一步瞭解相關的檢索程序，請參閱 [Google 搜尋的運作方式](https://developers.google.com/search/docs/fundamentals/how-search-works?hl=zh-tw)。

    當您發現 Google 不一定都能檢索到瀏覽器顯示的所有項目時，也許會覺得很訝異。在以下例子中，Google 就不知道這個網頁上有圖片，因為網頁採用了 Google 未支援的 JavaScript 功能。

    
      
        使用者檢視畫面
        使用者瀏覽網頁時會看到下圖的樣子，瀏覽器中將顯示圖片和文字。

        

      
      
        Google 檢視畫面
        Google 檢索時看到的網頁則如下圖。Google 並不知道這個網頁上有圖片，因為網頁採用了 Google 未支援的 JavaScript 功能。

        

      
    
    
## 檢查您的連結

    Googlebot 會透過擷取並剖析連結、Sitemap 與重新導向，逐一按照網址進行瀏覽。Googlebot 處理網址時是將每個網址視為您網站上的第一個也是唯一一個網址。為確保 Googlebot 能找到您網站上的所有網址，請注意以下幾點：

    

      - 使用 [Google 可檢索的 `<a>` 元素](https://developers.google.com/search/docs/crawling-indexing/links-crawlable?hl=zh-tw#crawlable-links)。確定網站上的所有網頁都能從其他找得到的網頁上的連結開啟。請確保推薦連結包含與目標網頁相關的文字；如果是圖片，則應包含 alt 屬性。

      - [建立並提交 Sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?hl=zh-tw)，協助 Googlebot 以更靈活的方式檢索您的網站。「Sitemap」是一種用來提供網站資訊的檔案，您可以在其中列出網頁、影片和其他檔案的資訊，並呈現這些內容彼此間的關係。

      - 如果您的 JavaScript 應用程式只有一個 HTML 網頁，請確定每個畫面或每則內容片段都有一個網址。

    

    
## 檢查您使用 JavaScript 的方式

    雖然 Google 能夠執行 JavaScript，但您在設計網頁和應用程式時還須考量一些不同的情況和限制，讓檢索器能順利存取並轉譯您的內容。

      歡迎進一步瞭解 [JavaScript 搜尋引擎最佳化 (SEO) 基礎知識](https://developers.google.com/search/docs/guides/javascript-seo-basics?hl=zh-tw)，或如何[修正會影響搜尋體驗的 JavaScript 問題](https://developers.google.com/search/docs/guides/fix-search-javascript?hl=zh-tw)。

    如要進一步瞭解 Google 在進行檢索、轉譯及建立索引時如何處理 JavaScript，請觀看以下影片。

    
     
    

    
## 內容變更時請通知 Google

    為確保 Google 能快速找到新網頁或更新後的網頁，請執行下列動作：

    

      - [提交 Sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?hl=zh-tw)。

      - [要求 Google 重新檢索您的網址](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl?hl=zh-tw)。

    

    如果您還是無法順利為網頁建立索引，請檢查伺服器記錄是否有錯誤。

    
## 別忽略了網頁上的文字內容

    Googlebot 只能找到能以文字形式呈現的內容，舉例來說，Googlebot 無法檢索影片上的文字。為確保 Google 搜尋能解讀您的網頁內容，請注意以下幾點：

    

      - **確保您的視覺內容能以文字形式呈現。**舉例來說，假設產品類別網頁上有一系列襯衫圖片，但每張圖片都沒有文字內容，這個做法就不太理想；您應該要為產品類別網頁上的每張圖片提供一些文字說明。

      - **確保每個網頁都有[描述性標題](https://developers.google.com/search/docs/appearance/title-link?hl=zh-tw#page-titles)及[中繼說明](https://developers.google.com/search/docs/appearance/snippet?hl=zh-tw#meta-descriptions)**。獨一無二的標題和中繼說明能協助 Google 展示網頁與使用者查詢內容的關聯性，進而為您帶來更多搜尋流量。

      - **使用語意式 HTML**。Google 雖然可以為 HTML、PDF 內容、圖片和影片建立索引，但如果內容需要使用外掛程式 (例如 Java 或 Silverlight) 或運用畫布呈現，就沒辦法建立索引。因此如果可能，建議內容盡量採用語意式 HTML 標記，不要使用外掛程式。

      - **確認您的文字內容可以在 [DOM](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Introduction) 中存取。**[舉例來說，透過](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Introduction)[CSS `content` 屬性](https://developer.mozilla.org/en-US/docs/Web/CSS/content)新增的內容並不屬於 DOM，且 Google 搜尋目前會忽略這項內容。您可以在裝飾內容中使用 `content` 屬性； Google 搜尋可能不會為這類內容建立索引。

    

    
## 告知 Google 您的內容有其他版本

    Google 無法自動得知您的網站或內容有多個版本，例如行動版、電腦版或國際版。為確保 Google 能為服務者提供適當的版本，您可以採取下列做法：

    

      - [整合重複的網址](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls?hl=zh-tw)。

      - [向 Google 提供您網站的本地化版本](https://developers.google.com/search/docs/specialty/international/localized-versions?hl=zh-tw)。

      - [讓他人能夠找到您的 AMP 網頁](https://www.ampproject.org/docs/fundamentals/discovery)。

    

    
## 控制 Google 可檢索的內容

    封鎖 Googlebot 的方式有很多種：

    

      - 如要防止 Google 找到您的網頁，您可以限制只有已登入的使用者能存取內容，例如採用登入頁面，或是[設定密碼保護機制](https://developers.google.com/search/docs/crawling-indexing/control-what-you-share?hl=zh-tw)。

      - [建立 robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/create-robots-txt?hl=zh-tw) 也能禁止 Googlebot 檢索您的網頁。
        不過，

      - 如果只願意讓 Google 檢索網頁但不想建立索引，請[加入 `noindex` 標記](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag?hl=zh-tw#noindex)。

    

    如果您的內容並未如願顯示在 Google 搜尋結果，請依照以下步驟找出問題：

       

         - 使用[網址檢查工具](https://support.google.com/webmasters/answer/9012289?hl=zh-tw)確認 Googlebot 是否能存取您的網頁。

       - [測試 robot.txt 檔案](https://support.google.com/webmasters/answer/6062598?hl=zh-tw)，看看是否不小心封鎖了 Googlebot，導致系統無法檢索您的網站。

       - 檢查 HTML 的 `meta` 標記是否包含 `noindex` 規則。

    

    
## 為網站啟用複合式搜尋結果

    複合式搜尋結果可以包含樣式、圖片或其他互動功能，能讓您的網站在搜尋結果中脫穎而出。請[在網頁上使用結構化資料](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=zh-tw)，為網頁內容提供明確的線索，這樣能讓 Google 更容易解讀您的網站並顯示複合式搜尋結果。如果您不知道如何著手，不妨先[瀏覽我們的可用功能庫](https://developers.google.com/search/docs/guides/search-gallery?hl=zh-tw)。

---

# 您需要 SEO 嗎？

  
    
    
    
  
# 您需要 SEO 嗎？

  

  
  

與許多商業活動一樣，有時雇用專業人士會很有幫助。決定雇用公司或個人為您的網站在 Google 搜尋中進行[搜尋引擎最佳化 (SEO)](https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=zh-tw) 是一項重大決定，雖然有可能提升網站曝光度並節省您的時間，但也有破壞網站和聲譽的風險。因此，除了要瞭解 SEO 能帶來的好處之外，也要想想不負責任的 SEO 可能會對網站造成哪些傷害。許多 SEO、代理商和顧問都可以為網站擁有者提供實用的服務，包括：

  - 檢查網站的內容或結構

  - 網站開發的技術建議：例如，代管、重新導向、錯誤網頁、JavaScript 的使用

  - 內容開發

  - 線上商務發展活動管理

  - 關鍵字搜尋

  - SEO 訓練

  - 特定市場和地理方面的專業知識

  - 針對生成式 AI 進行最佳化

使用 Google 廣告刊登服務並不會影響您網站在我們搜尋結果中的排名。
  Google 絕對不會收受金錢來改變 Google 搜尋結果列出的網站或是更動網站排名順序，而且您不需付費就能讓網站列入我們的自然搜尋結果中。您可以透過 [Search Console](https://search.google.com/search-console?hl=zh-tw)、官方的 [Google 搜尋中心網誌](https://developers.google.com/search/blog?hl=zh-tw)和我們的[討論區](https://support.google.com/webmasters/community?hl=zh-tw)等相關資源，瞭解如何針對 Google 的非廣告搜尋結果 (通常稱為「自然搜尋」) 最佳化自己的網站。

## 判斷是否需要 SEO

如果您是地方小型事業的經營者，或許可以自行完成大部分工作。我們建議先參閱[搜尋引擎最佳化 (SEO) 入門指南](https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=zh-tw)，這份實用指南可協助您提升網站的 SEO 效能，並詳細說明 SEO 可為您提供的協助。如果您最後決定雇用專業人士為您打理一切，瞭解這些技巧對您而言還是頗有助益，這樣您就可以覺察到 SEO 專家是否會採用我們不建議，甚至是強力反對的技術。

如果您還是需要專業人士的協助，請繼續閱讀本文，瞭解如何雇用 SEO 專家。

## 雇用 SEO 專家的注意事項

與許多商業活動一樣，有時雇用專業人士會很有幫助。舉例來說，考慮重新設計網站或打算推出新網站時，就是雇用 SEO 專家的好時機 (越早越好)。因為這麼一來，您和 SEO 專家就可以確保整個網站的設計都很適合讓搜尋引擎檢索。不過，優秀的 SEO 也能協助改善現有的網站。

如果您考慮雇用專人為網站進行 SEO，請考量以下幾點：

  - **面試可能的 SEO 人選：**您可以向 SEO 提出一些實際的問題，包括：
    

      - 你們能否提供以前的案子讓我參考，或提供一些成功案例？

      - 你們是否會遵循 [Google 搜尋基礎入門](https://developers.google.com/search/docs/essentials?hl=zh-tw) (舊稱《網站管理員指南》)？

      - 你們預計有什麼樣的成果，需要多久時間？你們如何評估成果？

      - 對於我的產業，你們有哪些經驗？

      - 對於我所在的國家/地區與城市，你們有哪些經驗？

      - 你們有哪些國際網站的開發經驗？

      - 你們在這個領域服務的時間有多長？

      - 我們能夠溝通到哪些層面？你們是否會告訴我你們要對網站進行哪些變更，並且詳細說明相關建議和理由？

      - 觀察 SEO 對於您本人與您的業務是否感興趣。如果對方表現得興趣缺缺，那麼建議您尋找真正有熱誠的人士。您要找的 SEO 應該會提出下列問題：貴商家有何獨特之處、競爭對手是誰、搜尋結果會帶來什麼樣的幫助，以及顧客如何找到貴商家。

  - **請教 SEO 的業務推薦人。**向 SEO 的過往客戶詢問該 SEO 專家是否能提供有效服務、合作是否順利，以及能否為業務帶來正面成果。

  - **如果 SEO 專家提議為您進行 SEO 稽核，請務必仔細考量相關事宜，並只授予 Search Console 的讀取權限 (此階段請勿授予寫入權限)。**
    SEO 稽核應提供改善網站的實際估計數據，以及預計要進行的作業。如果有人向您保證能讓網站在搜尋結果中的排名攀升到第一位，建議您另請高明。

  - **評估 SEO 專家的建議和使用的工具。**根據第三方工具的稽核結果對網站進行重大變更前，請務必先根據 [Google 搜尋的官方指南](https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=zh-tw)檢查相關建議，審慎評估您聽到的任何聲明或建議，再做出明智的決定。

      - 他們是否引用 Google 官方文件做為建議的佐證？

      - 如果他們提供 AI 體驗最佳化 (也稱為「AEO」或「GEO」服務) 建議，這些建議是否符合[Google 搜尋的官方準則，也就是針對生成式 AI 功能進行最佳化](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide?hl=zh-tw)？

      - 他們使用的工具是否符合 Google 的準則？

  - **請當心不斷主動寄送電子郵件給您的 SEO 公司、網路顧問或服務商。**
    您絕對想不到，連我們都會收到這類垃圾郵件：

    
> 「google.com，您好：*
> 
>         *我們瀏覽過您的網站，並注意到到該網站並未列在多數主要的搜尋引擎和目錄中…」

    請將這些有關搜尋引擎的垃圾郵件視為「一夜見效」的減肥藥宣傳，或是要求協助下台獨裁者轉移資金的垃圾郵件，務必保持懷疑的態度。

  - **沒有人可以保證能在 Google 上排名第一。** 請特別提防那些宣稱可以保證排名、聲稱與 Google 有「特殊關係」，或以能夠「優先提交」內容給 Google 做為宣傳噱頭的 SEO。

  - **對於一些故做神秘或不願說明意圖的公司，請務必保持戒心。**
    如有任何不明白之處，都應該要求對方說明。如果 SEO 以您的名義建立詐騙或誤導性內容，我們可能會將您的網站從 Google 索引中徹底移除。畢竟您終究必須為受雇公司的一切行為負責，因此請確實瞭解他們所提供的「協助」。如果 SEO 可以透過 FTP 連線來存取您的伺服器，他們應該要說明在您網站上所做的一切變更。

  - **您完全不必連結至 SEO。**
    如果 SEO 聲稱能利用連結熱門配置，或者表示能將網站提交至數千個搜尋引擎，請避開這些 SEO。這類做法通常是白費工夫，不會影響您在主要搜尋引擎結果中的排名，至少沒有您想像中的正面效果。

## 報表問題

如果您認為受到 SEO 的欺騙，建議您提出檢舉。

在美國，聯邦交易委員會 (Federal Trade Commission，FTC) 會受理有關詐欺或不公平商業手段的申訴。如要提出申訴，請造訪 FTC 網站[提出線上申訴](https://www.ftc.gov/)，或撥打 1-877-FTC-HELP。

如果您的申訴對象是美國境外公司，請前往 [https://www.econsumer.gov/](https://www.econsumer.gov/) 提出申訴。

---

# Google 搜尋準則：如何使用第三方 SEO 工具、服務和建議

  
    
    
    
  
# Google 搜尋準則：如何使用第三方 SEO 工具、服務和建議

  

如果您正想改善網站的 SEO，可能也會考慮採用第三方建議，以及使用第三方 SEO 服務和工具。本指南提供評估外部 SEO 資源和工具的建議，確保其符合 Google 搜尋準則。

## 根據 Google 官方準則評估及驗證外部 SEO 建議

網路上有許多第三方提供的 SEO 建議，內容與 SEO、搜尋結果和 AI 體驗相關 (有時稱為 AEO，即「答案引擎最佳化」；或 GEO，即「生成式引擎最佳化」)。雖然有些建議很有幫助，但有人可能會誤解或宣稱「Google 說了什麼」，或是 Google 排名系統的運作方式。一般來說，好的建議會以資料或經驗為依據提出意見，或引用 Google 搜尋官方準則來佐證主張。

建議您根據[官方 SEO 準則](https://developers.google.com/search/docs?hl=zh-tw) (包括[生成式 AI 最佳化準則](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide?hl=zh-tw))，審慎評估是否要採用任何建議，並做出明智的決定。

## 審慎考慮是否使用第三方 SEO 工具和服務

如果您打算自行進行 SEO，也許正在考慮使用第三方 SEO 服務和工具，例如：

  - 協助產生 Sitemap

  - 建立索引指令

  - 提供為你生成「經過 SEO 最佳化」內容的服務

  - 提供宣稱可提升現有內容排名的建議

  - 承諾可以改善 AI 體驗和搜尋格式 (也稱為「AEO」或「GEO」工具)

部分服務可能對您的工作有幫助，但有些服務可能會宣稱或暗示他們的做法獲得 Google 搜尋的「認可」或「核准」。Google 不會評估第三方服務，因此請提防這類說法，小心這類服務的供應商。請注意，使用服務或工具不保證排名會提升。

部分第三方服務提供的資料會引起工具使用者誤解，以為是源自 Google 的資料。第三方工具無法存取我們的內部排名資料，因此無法保證成效。任何預測結果都是第三方工具自行產生，與一般預測一樣，可能不會發生。

