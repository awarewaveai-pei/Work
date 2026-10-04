"""GATHER's lists and rules (STEP2_SHARED_RULES §6): the source lists a card names, the known outlets, the grouping
rule, and which language a place speaks. Each card stores the stamp of every one it used; a change is a new version
(HISTORY). Which registry or archive answers is collect's (specs/wire/lookup.v1.json R5), not a list here."""

from __future__ import annotations

from ai_lego.platform.rulesets import Ruleset

# 列在哪一份名單上（官方、媒體、學術、查核組織、內容農場）。A list with no maintained source starts empty and says why.
# A suffix maps to the one place it is only given in, or "" when it is not tied to one place (.edu: v2).
SOURCE_LISTS = Ruleset("gather.source_lists", "GATHER", "來源名單", "2", "平台（第 2 步）；每份名單寫各自的維護者", [
    {"list": "政府網域", "category": "官方", "maintainer": "各國網域註冊單位（這些網域只發給政府機關）", "version": "2026-10",
     "suffixes": {".gov": "美國", ".gov.tw": "台灣", ".gov.uk": "英國", ".go.jp": "日本", ".gov.hk": "香港", ".gov.sg": "新加坡", ".gov.au": "澳洲", ".mil": "美國"}},
    {"list": "學術網域", "category": "學術", "maintainer": "各國網域註冊單位（這些網域只發給學校和研究機構）", "version": "2026-10",
     "suffixes": {".edu": "", ".edu.tw": "台灣", ".ac.uk": "英國", ".ac.jp": "日本", ".edu.hk": "香港", ".edu.au": "澳洲"}},
    {"list": "媒體名單", "category": "媒體", "maintainer": "還沒有", "version": "", "domains": [],
     "empty_because": "平台還沒有找到有人維護、可以引用的媒體名單，所以這份名單是空的。"},
    {"list": "查核組織名單", "category": "查核組織", "maintainer": "還沒有", "version": "", "domains": [],
     "empty_because": "國際查核聯盟（IFCN）的簽署名單只能在網頁上看，平台還沒有接上，所以這份名單是空的。"},
    {"list": "內容農場名單", "category": "內容農場", "maintainer": "還沒有", "version": "", "domains": [],
     "empty_because": "平台還沒有找到有人維護、可以引用的內容農場名單，所以這份名單是空的。"},
])

# 網站的名字像國際媒體或中立的新聞網站時，查這家媒體是不是真的存在: an outlet's own domains, from its own site.
OUTLETS = Ruleset("gather.outlets", "GATHER", "已知媒體名單", "4", "平台（第 2 步），從各媒體自己的網站抄錄網域", {
    "outlets": [
        {"name": "BBC", "names": ["BBC", "英國廣播公司"], "domains": ["bbc.com", "bbc.co.uk"], "country": "英國"},
        {"name": "路透社", "names": ["Reuters", "路透"], "domains": ["reuters.com"], "country": "英國"},
        {"name": "美聯社", "names": ["Associated Press", "AP News", "apnews", "美聯社"], "domains": ["apnews.com"], "country": "美國"},
        {"name": "法新社", "names": ["AFP", "法新社"], "domains": ["afp.com"], "country": "法國"},
        {"name": "CNN", "names": ["CNN"], "domains": ["cnn.com"], "country": "美國"},
        {"name": "紐約時報", "names": ["New York Times", "nytimes", "紐約時報"], "domains": ["nytimes.com"], "country": "美國"},
        {"name": "華盛頓郵報", "names": ["Washington Post", "華盛頓郵報"], "domains": ["washingtonpost.com"], "country": "美國"},
        {"name": "華爾街日報", "names": ["Wall Street Journal", "WSJ", "華爾街日報"], "domains": ["wsj.com"], "country": "美國"},
        {"name": "衛報", "names": ["The Guardian", "theguardian", "衛報"], "domains": ["theguardian.com"], "country": "英國"},
        {"name": "金融時報", "names": ["Financial Times", "金融時報"], "domains": ["ft.com"], "country": "英國"},
        {"name": "經濟學人", "names": ["The Economist", "經濟學人"], "domains": ["economist.com"], "country": "英國"},
        {"name": "彭博", "names": ["Bloomberg", "彭博"], "domains": ["bloomberg.com"], "country": "美國"},
        {"name": "NHK", "names": ["NHK"], "domains": ["nhk.or.jp"], "country": "日本"},
        {"name": "德國之聲", "names": ["Deutsche Welle", "德國之聲"], "domains": ["dw.com"], "country": "德國"},
        {"name": "半島電視台", "names": ["Al Jazeera", "aljazeera", "半島電視台"], "domains": ["aljazeera.com", "aljazeera.net"], "country": "卡達"},
        {"name": "美國之音", "names": ["Voice of America", "VOA", "美國之音"], "domains": ["voanews.com"], "country": "美國"},
        {"name": "法國國際廣播電台", "names": ["RFI", "法廣"], "domains": ["rfi.fr"], "country": "法國"},
        {"name": "南華早報", "names": ["South China Morning Post", "SCMP", "南華早報"], "domains": ["scmp.com"], "country": "香港"},
        {"name": "新華社", "names": ["Xinhua", "新華社", "新华社"], "domains": ["news.cn", "xinhuanet.com"], "country": "中國"},
        {"name": "人民日報", "names": ["People's Daily", "人民日報", "人民日报"], "domains": ["people.com.cn"], "country": "中國"},
        {"name": "環球時報", "names": ["Global Times", "環球時報", "环球时报"], "domains": ["globaltimes.cn", "huanqiu.com"], "country": "中國"},
        {"name": "中央社", "names": ["中央社", "中央通訊社", "Central News Agency", "Focus Taiwan"], "domains": ["cna.com.tw", "focustaiwan.tw"], "country": "台灣"},
        {"name": "公視", "names": ["公視", "公共電視", "PTS"], "domains": ["pts.org.tw"], "country": "台灣"},
        {"name": "聯合報", "names": ["聯合報", "聯合新聞網", "UDN"], "domains": ["udn.com"], "country": "台灣"},
        {"name": "自由時報", "names": ["自由時報", "Liberty Times"], "domains": ["ltn.com.tw"], "country": "台灣"},
        {"name": "中國時報", "names": ["中國時報", "中時新聞網", "China Times"], "domains": ["chinatimes.com"], "country": "台灣"},
        {"name": "報導者", "names": ["報導者", "The Reporter"], "domains": ["twreporter.org"], "country": "台灣"},
    ],
    # a site name with one of these words reads like a news outlet; one not on the list above cannot be checked
    "media_words": ["新聞", "日報", "時報", "晚報", "週刊", "周刊", "電視", "廣播", "通訊社", "News", "Times", "Post", "Daily", "Herald",
                    "Tribune", "Journal", "Gazette", "Press", "Media", "TV", "Radio"],
    # a name shorter than min_host_name is not looked for in a host (「AP」 is in every other host); one shorter than
    # prefix_from must be a whole label piece (「voa」 is not in voachinese, 「pts」 not in ptsd): v2
    "min_host_name": 3, "prefix_from": 5,
    # v4: 誰辦的 is 查到 only where the page itself says who runs it, looked for on the whole page (v3 read a copyright
    # line in the last 800 characters as the operator). A label takes a colon (「經營者：」); 由…經營 and "Published by"
    # start a sentence, after one of `own` or nothing. A © line is read only in the last footer_chars (higher up it is
    # usually a photo credit) and only to say what the page shows instead.
    "operator": {"labels": ["經營者", "發行人", "出版者"], "run_by": "經營", "by": ["Published by", "Operated by"],
                 "own": ["本網站", "本站", "本刊", "本報", "This site is", "This website is"], "footer_chars": 800},
    # v3: how a name is read (v2 took a Chinese name anywhere in the site name: 台北市中央社區大學 read as 中央社)
    "reading": [
        "網站的名字是標題的最後一段，或標題第一段整段就是一家媒體的名字，或找資料的服務查到的網域名字。",
        "英文名字要是完整的一個字。中文名字不能跟前後的中文字連在一起（「台北市中央社區大學」不是中央社），後面直接接著「新聞」「日報」這類字的除外（「中央社新聞網」）。",
        "網址裡的名字不看最後的 .com、.tv 這一段：那是網域的種類，不是網站的名字。",
        "誰辦的：網域在已知媒體名單上，就是那家媒體。不然要網頁自己寫明誰經營才算查到：「經營者：」「發行人：」「出版者：」後面的名字，或一句話開頭的「（本網站）由某某經營」「Published by」「Operated by」；整頁都找，句子中間提到的不算。",
        "只有頁尾的版權字樣（©、版權所有）不算查到：版權所有人不一定是經營者。畫面會寫出那一行字，你可以自己判斷。",
    ],
})

# 平台把「怎樣算同一組」的規則寫出來給你看: the numbers and the sentences the page shows come from here together.
GROUPING = Ruleset("gather.grouping", "GATHER", "分組規則", "4", "平台（第 2 步）", {
    "shingle": 5, "same_text": 0.8, "maybe_same": 0.5,
    # the share of the shorter page found in the longer one (an excerpt, a copy with more around it), when both pages have
    # at least contained_min_pieces different pieces. v3: v2 counted letters, so one phrase repeated was "contained"
    # in any page holding it twice
    "contained_min_pieces": 300,
    # v4: the whole text (v3 compared the first 20000 letters, so a copy below a long header was another origin). A page
    # keeps the pieces whose number is a multiple of its rate -- 1 up to sample_above letters, else keep_one_in, doubled
    # until at most max_pieces are left -- the same rule on every page, so one passage leaves the same pieces wherever it
    # sits. Two pages compare at the coarser rate; when that leaves the shorter page under min_compared pieces, its own
    # pieces are looked up in the longer page's whole text (a few pieces found by chance are no basis).
    "keep_one_in": 8, "sample_above": 2000, "max_pieces": 2500, "min_compared": 250,
    "order": ["同一篇", "同一張圖", "只互相引用", "可能同出處"],
    "rules": [
        "同一篇：兩頁的文字有八成以上一樣；或較短的一頁有八成以上出現在另一頁裡，例如摘錄、前後加了別的內容的轉貼（兩頁都要有至少 300 段不一樣的片段，同一句話重複很多次不算）。每 5 個字一段，整頁都比。",
        "很長的網頁照同一個規則挑出一部分的段來比（每頁最多 2500 段）：同樣的文字不管在哪一頁、哪個位置，挑到的段都一樣。較短的一頁挑到的段太少時，拿它自己的段到較長那一頁的全文裡找。",
        "一組要每兩頁都是同一篇，才標同一篇（就算也用了同一張圖或只互相引用，還是同一篇）。甲像乙、乙像丙，甲卻不像丙，標可能同出處。只互相引用也一樣：要每兩個網站都互相連結。",
        "可能同出處：一樣的部分在五成到八成之間（兩種比法都算）。系統拿不準是不是改寫，由你決定算不算。",
        "同一張圖：兩頁的主圖是同一個網址。",
        "只互相引用：幾個網站每兩個都互相連結，對外的連結也只連到彼此，沒有別的依據。只是單向連過去，或還連到別的網站的，不算一組（文字像的照文字分）。",
        "其他的組裡有不同的理由時，標最拿不準的那一個；每一頁寫它跟組裡哪一頁、因為什麼連在一起。",
        "只有「同一篇」的組才分原始的和轉貼的，而且只看網頁封存館存到的日期：組裡每一頁都有封存館的紀錄時，最早存到的是原始的。有一頁只有網頁自己寫的日期，就看不出誰先誰後。",
        "只互相引用、用了同一張圖、可能同出處的組，看不出誰轉貼誰。",
        "分組不是刪除。組裡每一頁都還看得到，你可以拆開。",
    ],
})

# 系統至少用兩種語言找：事情發生地的語言，加上另一方或國際通用的語言。The collector searches 中文 and English only.
PLACE_LANGUAGES = Ruleset("gather.place_languages", "GATHER", "發生地的語言", "1", "平台（第 2 步）", {
    "searched": ["zh", "en"],
    "names": {"zh": "中文", "en": "英文", "ja": "日文", "ko": "韓文", "ms": "馬來文", "id": "印尼文", "vi": "越南文", "th": "泰文",
              "fil": "菲律賓文", "hi": "印地文", "de": "德文", "fr": "法文", "es": "西班牙文", "ru": "俄文", "uk": "烏克蘭文",
              "ps": "普什圖文", "fa": "波斯文", "ar": "阿拉伯文"},
    # 台灣 uses GOVERN's list of Taiwan places (platform/safety TAIWAN_PLACES), so the two never disagree
    "places": [
        {"place": "台灣", "match": "govern.taiwan_places", "langs": ["zh"]},
        {"place": "中國", "names": ["中國", "中国", "China", "北京", "上海", "廣州", "深圳"], "langs": ["zh"]},
        {"place": "香港", "names": ["香港", "Hong Kong"], "langs": ["zh", "en"]},
        {"place": "澳門", "names": ["澳門", "澳门", "Macau", "Macao"], "langs": ["zh"]},
        {"place": "新加坡", "names": ["新加坡", "Singapore"], "langs": ["en", "zh", "ms"]},
        {"place": "美國", "names": ["美國", "美国", "United States", "USA", "U.S."], "langs": ["en"]},
        {"place": "英國", "names": ["英國", "英国", "United Kingdom", "UK", "England", "Britain"], "langs": ["en"]},
        {"place": "加拿大", "names": ["加拿大", "Canada"], "langs": ["en", "fr"]},
        {"place": "澳洲", "names": ["澳洲", "澳大利亞", "Australia"], "langs": ["en"]},
        {"place": "紐西蘭", "names": ["紐西蘭", "New Zealand"], "langs": ["en"]},
        {"place": "愛爾蘭", "names": ["愛爾蘭", "Ireland"], "langs": ["en"]},
        {"place": "日本", "names": ["日本", "Japan", "東京"], "langs": ["ja"]},
        {"place": "韓國", "names": ["韓國", "南韓", "Korea", "首爾"], "langs": ["ko"]},
        {"place": "馬來西亞", "names": ["馬來西亞", "Malaysia"], "langs": ["ms", "en", "zh"]},
        {"place": "印尼", "names": ["印尼", "Indonesia"], "langs": ["id"]},
        {"place": "越南", "names": ["越南", "Vietnam", "Viet Nam"], "langs": ["vi"]},
        {"place": "泰國", "names": ["泰國", "Thailand"], "langs": ["th"]},
        {"place": "菲律賓", "names": ["菲律賓", "Philippines"], "langs": ["fil", "en"]},
        {"place": "印度", "names": ["印度", "India"], "langs": ["hi", "en"]},
        {"place": "德國", "names": ["德國", "Germany"], "langs": ["de"]},
        {"place": "法國", "names": ["法國", "France"], "langs": ["fr"]},
        {"place": "西班牙", "names": ["西班牙", "Spain"], "langs": ["es"]},
        {"place": "俄羅斯", "names": ["俄羅斯", "Russia"], "langs": ["ru"]},
        {"place": "烏克蘭", "names": ["烏克蘭", "Ukraine"], "langs": ["uk"]},
        {"place": "阿富汗", "names": ["阿富汗", "Afghanistan"], "langs": ["ps", "fa"]},
    ],
})

RULESETS = [SOURCE_LISTS, OUTLETS, GROUPING, PLACE_LANGUAGES]

HISTORY = {
    "gather.source_lists": {"1": "475d3ede5bdb", "2": "146bfc52ca8a"},
    "gather.outlets": {"1": "a494e918033c", "2": "fb9c00d12bf6", "3": "ce6b4b77697f", "4": "515aa0caf3dd"},
    # retired 2026-10-04 (lookups moved to collect); a recorded version stays as it was (rulesets/__init__.py)
    "gather.registries": {"1": "2b04ec23212b"},
    "gather.grouping": {"1": "f34dbf8167ad", "2": "5795497cc81a", "3": "40ef446e323d", "4": "1f6e2c1413c3"},
    "gather.place_languages": {"1": "279db02ce9fe"},
}
