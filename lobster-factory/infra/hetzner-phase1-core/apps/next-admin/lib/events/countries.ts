export type EventCountryRegion =
  | "americas"
  | "asia"
  | "south_asia"
  | "europe"
  | "mideast"
  | "africa"
  | "oceania";

export interface EventSourceCountry {
  code: string;
  region: EventCountryRegion;
}

const EAST_ASIA = ["TW", "JP", "KR", "CN", "HK", "MO"];
const SOUTHEAST_ASIA = ["SG", "MY", "TH", "VN", "ID", "PH", "KH", "LA", "MM", "BN"];
const SOUTH_ASIA = ["IN", "LK", "NP", "MV"];
const TOURISM_EUROPE = ["GB", "IE", "FR", "DE", "IT", "ES", "NL", "BE", "CH", "AT", "GR", "PT", "IS", "CZ"];
const TOURISM_AMERICAS = ["US", "CA", "MX", "BR", "AR"];
const OCEANIA = ["AU", "NZ"];
const MIDDLE_EAST_NORTH_AFRICA = ["AE", "SA", "TR", "EG", "MA"];
const TOURISM_AFRICA = ["ZA"];

const WESTERN_TRAVELER_ASIA_COUNTRY_FILTERS = [
  { value: "TH", label: "TH 泰國" },
  { value: "JP", label: "JP 日本" },
  { value: "VN", label: "VN 越南" },
  { value: "ID", label: "ID 印尼" },
  { value: "SG", label: "SG 新加坡" },
  { value: "MY", label: "MY 馬來西亞" },
  { value: "PH", label: "PH 菲律賓" },
  { value: "KH", label: "KH 柬埔寨" },
  { value: "LA", label: "LA 寮國" },
  { value: "KR", label: "KR 韓國" },
  { value: "TW", label: "TW 台灣" },
  { value: "HK", label: "HK 香港" },
  { value: "IN", label: "IN 印度" },
  { value: "LK", label: "LK 斯里蘭卡" },
  { value: "NP", label: "NP 尼泊爾" },
  { value: "MV", label: "MV 馬爾地夫" },
] as const;

const OTHER_COUNTRY_FILTERS = [
  { value: "CN", label: "CN 中國" },
  { value: "MO", label: "MO 澳門" },
  { value: "MM", label: "MM 緬甸" },
  { value: "BN", label: "BN 汶萊" },
  { value: "AU", label: "AU 澳洲" },
  { value: "NZ", label: "NZ 紐西蘭" },
  { value: "AE", label: "AE 杜拜/UAE" },
  { value: "SA", label: "SA 沙烏地阿拉伯" },
  { value: "TR", label: "TR 土耳其" },
  { value: "EG", label: "EG 埃及" },
  { value: "MA", label: "MA 摩洛哥" },
  { value: "ZA", label: "ZA 南非" },
  { value: "GB", label: "GB 英國" },
  { value: "IE", label: "IE 愛爾蘭" },
  { value: "FR", label: "FR 法國" },
  { value: "DE", label: "DE 德國" },
  { value: "IT", label: "IT 義大利" },
  { value: "ES", label: "ES 西班牙" },
  { value: "NL", label: "NL 荷蘭" },
  { value: "BE", label: "BE 比利時" },
  { value: "CH", label: "CH 瑞士" },
  { value: "AT", label: "AT 奧地利" },
  { value: "GR", label: "GR 希臘" },
  { value: "PT", label: "PT 葡萄牙" },
  { value: "IS", label: "IS 冰島" },
  { value: "CZ", label: "CZ 捷克" },
  { value: "US", label: "US 美國" },
  { value: "CA", label: "CA 加拿大" },
  { value: "MX", label: "MX 墨西哥" },
  { value: "BR", label: "BR 巴西" },
  { value: "AR", label: "AR 阿根廷" },
] as const;

/** Curated for POD/tourism inspiration: East Asia, Southeast Asia, and major tourist markets. */
export const EVENT_SOURCE_COUNTRIES: EventSourceCountry[] = [
  ...TOURISM_AMERICAS.map((code) => ({ code, region: "americas" as const })),
  ...TOURISM_EUROPE.map((code) => ({ code, region: "europe" as const })),
  ...EAST_ASIA.map((code) => ({ code, region: "asia" as const })),
  ...SOUTHEAST_ASIA.map((code) => ({ code, region: "asia" as const })),
  ...SOUTH_ASIA.map((code) => ({ code, region: "south_asia" as const })),
  ...OCEANIA.map((code) => ({ code, region: "oceania" as const })),
  { code: "AE", region: "mideast" },
  { code: "SA", region: "mideast" },
  { code: "TR", region: "mideast" },
  { code: "EG", region: "africa" },
  { code: "MA", region: "africa" },
  ...TOURISM_AFRICA.map((code) => ({ code, region: "africa" as const })),
];

export const EVENT_COUNTRY_FILTERS = [
  { value: "all", label: "全部國家" },
  { value: "global", label: "Global / 世界" },
  ...WESTERN_TRAVELER_ASIA_COUNTRY_FILTERS,
  { value: [...EAST_ASIA, ...SOUTHEAST_ASIA].join(","), label: "東亞 + 東南亞" },
  { value: EAST_ASIA.join(","), label: "東亞" },
  { value: SOUTHEAST_ASIA.join(","), label: "東南亞" },
  { value: SOUTH_ASIA.join(","), label: "南亞" },
  { value: MIDDLE_EAST_NORTH_AFRICA.join(","), label: "中東/北非" },
  { value: TOURISM_EUROPE.join(","), label: "熱門歐洲" },
  { value: TOURISM_AMERICAS.join(","), label: "熱門美洲" },
  { value: [...OCEANIA, ...TOURISM_AFRICA].join(","), label: "大洋洲/非洲" },
  ...OTHER_COUNTRY_FILTERS,
] as const;
