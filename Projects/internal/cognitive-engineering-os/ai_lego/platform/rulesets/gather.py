"""GATHER's lists and rules (STEP2_SHARED_RULES §6): the source lists a card names, the known outlets, the registries the
platform asks who registered a site, the grouping rule, and which language a place speaks. Each card stores the
stamp of every one it used; a change is a new version (HISTORY)."""

from __future__ import annotations

from ai_lego.platform.rulesets import Ruleset

# 列在哪一份名單上（官方、媒體、學術、查核組織、內容農場）。A list with no maintained source starts empty and says why.
SOURCE_LISTS = Ruleset("gather.source_lists", "GATHER", "來源名單", "1", "平台（第 2 步）；每份名單寫各自的維護者", [
    {"list": "政府網域", "category": "官方", "maintainer": "各國網域註冊單位（這些網域只發給政府機關）", "version": "2026-10",
     "suffixes": {".gov": "美國", ".gov.tw": "台灣", ".gov.uk": "英國", ".go.jp": "日本", ".gov.hk": "香港", ".gov.sg": "新加坡", ".gov.au": "澳洲", ".mil": "美國"}},
    {"list": "學術網域", "category": "學術", "maintainer": "各國網域註冊單位（這些網域只發給學校和研究機構）", "version": "2026-10",
     "suffixes": {".edu": "美國", ".edu.tw": "台灣", ".ac.uk": "英國", ".ac.jp": "日本", ".edu.hk": "香港", ".edu.au": "澳洲"}},
    {"list": "媒體名單", "category": "媒體", "maintainer": "還沒有", "version": "", "domains": [],
     "empty_because": "平台還沒有找到有人維護、可以引用的媒體名單，所以這份名單是空的。"},
    {"list": "查核組織名單", "category": "查核組織", "maintainer": "還沒有", "version": "", "domains": [],
     "empty_because": "國際查核聯盟（IFCN）的簽署名單只能在網頁上看，平台還沒有接上，所以這份名單是空的。"},
    {"list": "內容農場名單", "category": "內容農場", "maintainer": "還沒有", "version": "", "domains": [],
     "empty_because": "平台還沒有找到有人維護、可以引用的內容農場名單，所以這份名單是空的。"},
])

# 網站的名字像國際媒體或中立的新聞網站時，查這家媒體是不是真的存在: an outlet's own domains, from its own site.
OUTLETS = Ruleset("gather.outlets", "GATHER", "已知媒體名單", "1", "平台（第 2 步），從各媒體自己的網站抄錄網域", {
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
    # a name shorter than this is not looked for inside a host (「AP」 is in every other host)
    "min_host_name": 3,
})

# 網域什麼時候註冊: the registry of each top-level domain the platform asks, from IANA's RDAP list. A domain whose
# registry is not here is 無法檢查.
REGISTRIES = Ruleset("gather.registries", "GATHER", "網域註冊資料庫", "1", "IANA 的 RDAP 名單（data.iana.org/rdap/dns.json，2026-09-30 版），平台抄錄", {
    "rdap": {
        "com": "https://rdap.verisign.com/com/v1/", "net": "https://rdap.verisign.com/net/v1/",
        "org": "https://rdap.publicinterestregistry.org/rdap/",
        "info": "https://rdap.identitydigital.services/rdap/", "news": "https://rdap.identitydigital.services/rdap/",
        "media": "https://rdap.identitydigital.services/rdap/", "asia": "https://rdap.identitydigital.services/rdap/",
        "uk": "https://rdap.nominet.uk/uk/",
        "xyz": "https://rdap.centralnic.com/xyz/",
        "top": "https://rdap.zdnsgtld.com/top/",
        "online": "https://rdap.radix.host/rdap/", "site": "https://rdap.radix.host/rdap/", "press": "https://rdap.radix.host/rdap/",
        "app": "https://pubapi.registry.google/rdap/",
        "gov": "https://rdap.nic.gov/rdap/",
    },
    # 「.tw」is on IANA's list, but its registry answers HTTP 426 to the platform's HTTP/1.1 connection (2026-10-04)
    "not_listed": {"tw": "台灣的網域註冊資料庫要求平台還不支援的連線方式（HTTP/2）"},
    # where the registrable name is three labels (bbc.co.uk, cna.com.tw), not two
    "second_level": ["com.tw", "org.tw", "net.tw", "edu.tw", "gov.tw", "idv.tw", "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk",
                     "co.jp", "or.jp", "ac.jp", "go.jp", "com.hk", "org.hk", "edu.hk", "gov.hk", "com.cn", "com.au", "org.au", "edu.au", "gov.au"],
    # a registry writes the country as a two-letter code; these are shown by name, any other as the code
    "countries": {"TW": "台灣", "CN": "中國", "HK": "香港", "MO": "澳門", "SG": "新加坡", "MY": "馬來西亞", "JP": "日本", "KR": "韓國", "US": "美國",
                  "GB": "英國", "CA": "加拿大", "AU": "澳洲", "NZ": "紐西蘭", "IE": "愛爾蘭", "DE": "德國", "FR": "法國", "NL": "荷蘭", "RU": "俄羅斯",
                  "UA": "烏克蘭", "IN": "印度", "QA": "卡達", "PA": "巴拿馬", "IS": "冰島"},
})

# 平台把「怎樣算同一組」的規則寫出來給你看: the numbers and the sentences the page shows come from here together.
GROUPING = Ruleset("gather.grouping", "GATHER", "分組規則", "1", "平台（第 2 步）", {
    "shingle": 5, "compare_chars": 20000, "same_text": 0.8, "maybe_same": 0.5,
    # two texts both longer than sample_above are compared on one in keep_one_in of their pieces (same pieces on both sides)
    "keep_one_in": 8, "sample_above": 2000,
    "order": ["同一篇", "同一張圖", "只互相引用", "可能同出處"],
    "rules": [
        "同一篇：兩頁的文字有八成以上一樣（每 5 個字一段來比，只比前 20000 字）。",
        "可能同出處：一樣的部分在五成到八成之間。系統拿不準是不是改寫，由你決定算不算。",
        "同一張圖：兩頁的主圖是同一個網址。",
        "只互相引用：幾個網站對外的連結只連到彼此，沒有別的依據。",
        "一組裡有不同的理由時，標最拿不準的那一個。",
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

RULESETS = [SOURCE_LISTS, OUTLETS, REGISTRIES, GROUPING, PLACE_LANGUAGES]

HISTORY = {
    "gather.source_lists": {"1": "475d3ede5bdb"},
    "gather.outlets": {"1": "a494e918033c"},
    "gather.registries": {"1": "2b04ec23212b"},
    "gather.grouping": {"1": "f34dbf8167ad"},
    "gather.place_languages": {"1": "279db02ce9fe"},
}
