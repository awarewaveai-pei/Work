// The lists and thresholds behind collect lookups v1 (Projects/internal/cognitive-engineering-os/specs/wire/lookup.v1.json,
// R5): they live here only; the cognitive platform never sends or stores them. Ported 2026-10-04 from the engine's
// rulesets gather.registries v1 (worktree commit ceb3ac8a5) and verify.factcheck_dbs v1 (988a52e29), which move here.

/** A registry's RDAP base per top-level domain: IANA's RDAP list (data.iana.org/rdap/dns.json, 2026-09-30), copied. */
export const RDAP_BASES: Record<string, string> = {
  com: "https://rdap.verisign.com/com/v1/",
  net: "https://rdap.verisign.com/net/v1/",
  org: "https://rdap.publicinterestregistry.org/rdap/",
  info: "https://rdap.identitydigital.services/rdap/",
  news: "https://rdap.identitydigital.services/rdap/",
  media: "https://rdap.identitydigital.services/rdap/",
  asia: "https://rdap.identitydigital.services/rdap/",
  uk: "https://rdap.nominet.uk/uk/",
  xyz: "https://rdap.centralnic.com/xyz/",
  top: "https://rdap.zdnsgtld.com/top/",
  online: "https://rdap.radix.host/rdap/",
  site: "https://rdap.radix.host/rdap/",
  press: "https://rdap.radix.host/rdap/",
  app: "https://pubapi.registry.google/rdap/",
  gov: "https://rdap.nic.gov/rdap/",
};

/** On IANA's list but not reachable from collect; each says why. */
export const RDAP_NOT_LISTED: Record<string, string> = {
  // 2026-10-04 from this collector: HTTP/1.1 answers 426, HTTP/2 answers 500 「Web Page Blocked!」.
  tw: "台灣的網域註冊資料庫擋下蒐集器的連線",
};

/** Where the registrable name is three labels (bbc.co.uk, cna.com.tw), not two. */
export const SECOND_LEVEL = new Set([
  "com.tw", "org.tw", "net.tw", "edu.tw", "gov.tw", "idv.tw", "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk",
  "co.jp", "or.jp", "ac.jp", "go.jp", "com.hk", "org.hk", "edu.hk", "gov.hk", "com.cn", "com.au", "org.au", "edu.au", "gov.au",
]);

/** A registry writes the country as a two-letter code; these are shown by name, any other as the code. */
export const COUNTRIES: Record<string, string> = {
  TW: "台灣", CN: "中國", HK: "香港", MO: "澳門", SG: "新加坡", MY: "馬來西亞", JP: "日本", KR: "韓國", US: "美國",
  GB: "英國", CA: "加拿大", AU: "澳洲", NZ: "紐西蘭", IE: "愛爾蘭", DE: "德國", FR: "法國", NL: "荷蘭", RU: "俄羅斯",
  UA: "烏克蘭", IN: "印度", QA: "卡達", PA: "巴拿馬", IS: "冰島",
};

export const FACTCHECK = {
  claimreview: {
    name: "全球查核結果公開資料檔",
    feedUrl: "https://storage.googleapis.com/datacommons-feeds/factcheck/latest/data.json",
    attribution: "查核結果來自各查核組織，由 Data Commons 彙整成公開資料檔，以 CC BY 4.0 授權。",
    /** A reviewed claim is about the text when this share of the claim's 3-character pieces is in the text. */
    minOverlap: 0.6,
  },
  cofacts: {
    name: "Cofacts",
    apiUrl: "https://api.cofacts.tw/graphql",
    site: "https://cofacts.tw",
    attribution: "資料來自 Cofacts 真的假的（cofacts.tw），以 CC BY-SA 4.0 授權：用了要標出處，並用同樣方式分享。",
    minimumShouldMatch: "50%",
  },
  maxHits: 5,
} as const;
