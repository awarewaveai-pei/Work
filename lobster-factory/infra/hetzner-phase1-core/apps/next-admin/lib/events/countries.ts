export type EventCountryRegion =
  | "americas"
  | "asia"
  | "south_asia"
  | "west_asia"
  | "central_asia"
  | "europe"
  | "africa"
  | "oceania";

export interface EventSourceCountry {
  code: string;
  region: EventCountryRegion;
}

export interface EventCountryFilter {
  value: string;
  label: string;
}

export interface EventCountryFilterGroup {
  label: string;
  options: readonly EventCountryFilter[];
}

const EAST_ASIA = ["TW", "JP", "KR", "CN", "HK", "MO"];
const SOUTHEAST_ASIA = ["TH", "VN", "ID", "SG", "MY", "PH", "KH", "LA", "MM", "BN"];
const SOUTH_ASIA = ["IN", "LK", "NP", "MV"];
const WEST_ASIA = ["AE", "SA", "TR", "IL", "JO", "QA", "OM"];
const CENTRAL_ASIA = ["KZ", "UZ", "KG", "TJ", "TM"];
const TOURISM_EUROPE = ["GB", "IE", "FR", "DE", "IT", "ES", "NL", "BE", "CH", "AT", "GR", "PT", "IS", "CZ"];
const NORTH_AMERICA = ["US", "CA", "MX"];
const SOUTH_AMERICA = ["BR", "AR"];
const OCEANIA = ["AU", "NZ"];
const AFRICA = ["EG", "MA", "ZA"];

export const EVENT_ALL_COUNTRIES_FILTER: EventCountryFilter = { value: "all", label: "全部國家" };

export const EVENT_COUNTRY_FILTER_GROUPS: readonly EventCountryFilterGroup[] = [
  {
    label: "亞洲 / 東亞",
    options: [
      { value: "TW", label: "TW 台灣" },
      { value: "JP", label: "JP 日本" },
      { value: "KR", label: "KR 韓國" },
      { value: "CN", label: "CN 中國" },
      { value: "HK", label: "HK 香港" },
      { value: "MO", label: "MO 澳門" },
    ],
  },
  {
    label: "亞洲 / 東南亞",
    options: [
      { value: "TH", label: "TH 泰國" },
      { value: "VN", label: "VN 越南" },
      { value: "ID", label: "ID 印尼" },
      { value: "SG", label: "SG 新加坡" },
      { value: "MY", label: "MY 馬來西亞" },
      { value: "PH", label: "PH 菲律賓" },
      { value: "KH", label: "KH 柬埔寨" },
      { value: "LA", label: "LA 寮國" },
      { value: "MM", label: "MM 緬甸" },
      { value: "BN", label: "BN 汶萊" },
    ],
  },
  {
    label: "亞洲 / 南亞",
    options: [
      { value: "IN", label: "IN 印度" },
      { value: "LK", label: "LK 斯里蘭卡" },
      { value: "NP", label: "NP 尼泊爾" },
      { value: "MV", label: "MV 馬爾地夫" },
    ],
  },
  {
    label: "亞洲 / 西亞",
    options: [
      { value: "AE", label: "AE 阿聯酋/UAE" },
      { value: "SA", label: "SA 沙烏地阿拉伯" },
      { value: "TR", label: "TR 土耳其" },
      { value: "IL", label: "IL 以色列" },
      { value: "JO", label: "JO 約旦" },
      { value: "QA", label: "QA 卡達" },
      { value: "OM", label: "OM 阿曼" },
    ],
  },
  {
    label: "亞洲 / 中亞",
    options: [
      { value: "KZ", label: "KZ 哈薩克" },
      { value: "UZ", label: "UZ 烏茲別克" },
      { value: "KG", label: "KG 吉爾吉斯" },
      { value: "TJ", label: "TJ 塔吉克" },
      { value: "TM", label: "TM 土庫曼" },
    ],
  },
  {
    label: "歐洲",
    options: [
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
    ],
  },
  {
    label: "北美洲",
    options: [
      { value: "US", label: "US 美國" },
      { value: "CA", label: "CA 加拿大" },
      { value: "MX", label: "MX 墨西哥" },
    ],
  },
  {
    label: "南美洲",
    options: [
      { value: "BR", label: "BR 巴西" },
      { value: "AR", label: "AR 阿根廷" },
    ],
  },
  {
    label: "大洋洲",
    options: [
      { value: "AU", label: "AU 澳洲" },
      { value: "NZ", label: "NZ 紐西蘭" },
    ],
  },
  {
    label: "非洲",
    options: [
      { value: "EG", label: "EG 埃及" },
      { value: "MA", label: "MA 摩洛哥" },
      { value: "ZA", label: "ZA 南非" },
    ],
  },
] as const;

export const EVENT_COUNTRY_FILTERS: readonly EventCountryFilter[] = [
  EVENT_ALL_COUNTRIES_FILTER,
  ...EVENT_COUNTRY_FILTER_GROUPS.flatMap((group) => group.options),
];

/** Curated for POD/tourism inspiration: Asia, Europe, Americas, Oceania, and Africa. */
export const EVENT_SOURCE_COUNTRIES: EventSourceCountry[] = [
  ...NORTH_AMERICA.map((code) => ({ code, region: "americas" as const })),
  ...SOUTH_AMERICA.map((code) => ({ code, region: "americas" as const })),
  ...TOURISM_EUROPE.map((code) => ({ code, region: "europe" as const })),
  ...EAST_ASIA.map((code) => ({ code, region: "asia" as const })),
  ...SOUTHEAST_ASIA.map((code) => ({ code, region: "asia" as const })),
  ...SOUTH_ASIA.map((code) => ({ code, region: "south_asia" as const })),
  ...WEST_ASIA.map((code) => ({ code, region: "west_asia" as const })),
  ...CENTRAL_ASIA.map((code) => ({ code, region: "central_asia" as const })),
  ...OCEANIA.map((code) => ({ code, region: "oceania" as const })),
  ...AFRICA.map((code) => ({ code, region: "africa" as const })),
];
