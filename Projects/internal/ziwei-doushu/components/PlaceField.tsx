'use client';

import { useState } from 'react';
import type { BirthPlace } from '@/lib/timezone';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/**
 * 出生地選擇。過渡版:常用地點按鈕 + 「其他」手動輸入 IANA 時區與經緯度。
 * 對外只交出 BirthPlace(lib/timezone.ts);E6 會把內部換成全球城市搜尋,外部介面不變。
 */

interface Preset {
  id: string;
  zh: string;
  en: string;
  lat: number;
  lon: number;
  zone: string;
}

/** 台灣與中國城市的經度沿用舊表(既有排盤結果不變)。 */
const PRESETS: readonly Preset[] = [
  { id: 'taipei', zh: '台北', en: 'Taipei', lat: 25.03, lon: 121.5, zone: 'Asia/Taipei' },
  { id: 'taichung', zh: '台中', en: 'Taichung', lat: 24.15, lon: 120.7, zone: 'Asia/Taipei' },
  { id: 'kaohsiung', zh: '高雄', en: 'Kaohsiung', lat: 22.63, lon: 120.3, zone: 'Asia/Taipei' },
  { id: 'tainan', zh: '台南', en: 'Tainan', lat: 22.99, lon: 120.2, zone: 'Asia/Taipei' },
  { id: 'hongkong', zh: '香港', en: 'Hong Kong', lat: 22.32, lon: 114.2, zone: 'Asia/Hong_Kong' },
  { id: 'macau', zh: '澳門', en: 'Macau', lat: 22.2, lon: 113.55, zone: 'Asia/Macau' },
  { id: 'beijing', zh: '北京', en: 'Beijing', lat: 39.9, lon: 116.4, zone: 'Asia/Shanghai' },
  { id: 'shanghai', zh: '上海', en: 'Shanghai', lat: 31.23, lon: 121.5, zone: 'Asia/Shanghai' },
  { id: 'guangzhou', zh: '廣州', en: 'Guangzhou', lat: 23.13, lon: 113.3, zone: 'Asia/Shanghai' },
  { id: 'singapore', zh: '新加坡', en: 'Singapore', lat: 1.35, lon: 103.82, zone: 'Asia/Singapore' },
  { id: 'kualalumpur', zh: '吉隆坡', en: 'Kuala Lumpur', lat: 3.14, lon: 101.69, zone: 'Asia/Kuala_Lumpur' },
  { id: 'tokyo', zh: '東京', en: 'Tokyo', lat: 35.68, lon: 139.69, zone: 'Asia/Tokyo' },
  { id: 'seoul', zh: '首爾', en: 'Seoul', lat: 37.57, lon: 126.98, zone: 'Asia/Seoul' },
  { id: 'sydney', zh: '雪梨', en: 'Sydney', lat: -33.87, lon: 151.21, zone: 'Australia/Sydney' },
  { id: 'london', zh: '倫敦', en: 'London', lat: 51.51, lon: -0.13, zone: 'Europe/London' },
  { id: 'newyork', zh: '紐約', en: 'New York', lat: 40.71, lon: -74.01, zone: 'America/New_York' },
  { id: 'losangeles', zh: '洛杉磯', en: 'Los Angeles', lat: 34.05, lon: -118.24, zone: 'America/Los_Angeles' },
];

const OTHER = 'other';

function toPlace(p: Preset, locale: Locale): BirthPlace {
  return { label: locale === 'en' ? p.en : p.zh, lat: p.lat, lon: p.lon, zone: p.zone };
}

/** 繁中介面預設台北;英文介面不預設,要使用者自己選。 */
export function defaultPlace(locale: Locale): BirthPlace | null {
  return locale === 'zh-TW' ? toPlace(PRESETS[0], locale) : null;
}

function isZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export default function PlaceField({
  dict,
  locale,
  onChange,
}: {
  dict: Dictionary;
  locale: Locale;
  /** 選定或輸入完整時給 BirthPlace,未選或手動欄位不合法時給 null */
  onChange: (place: BirthPlace | null) => void;
}) {
  const t = dict.form;
  const [picked, setPicked] = useState<string | null>(locale === 'zh-TW' ? PRESETS[0].id : null);
  const [zone, setZone] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');

  function pick(id: string) {
    setPicked(id);
    const p = PRESETS.find((x) => x.id === id);
    onChange(p ? toPlace(p, locale) : manual(zone, lat, lon));
  }

  function manual(z: string, la: string, lo: string): BirthPlace | null {
    const latN = Number(la);
    const lonN = Number(lo);
    if (!isZone(z.trim()) || la.trim() === '' || lo.trim() === '') return null;
    if (!(Math.abs(latN) <= 90 && Math.abs(lonN) <= 180)) return null;
    return { label: z.trim(), lat: latN, lon: lonN, zone: z.trim() };
  }

  function edit(z: string, la: string, lo: string) {
    setZone(z);
    setLat(la);
    setLon(lo);
    onChange(manual(z, la, lo));
  }

  const zoneBad = picked === OTHER && zone.trim() !== '' && !isZone(zone.trim());

  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-dark">{t.place}</span>
      <div role="group" aria-label={t.place} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {[...PRESETS.map((p) => ({ id: p.id, text: locale === 'en' ? p.en : p.zh })), { id: OTHER, text: t.placeOther }].map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={picked === o.id}
            onClick={() => pick(o.id)}
            className={picked === o.id ? 'btn-gold' : 'btn-violet'}
            style={{ width: 'auto' }}
          >
            {o.text}
          </button>
        ))}
      </div>
      {picked === OTHER ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3" style={{ marginTop: '0.5rem' }}>
          <label className="flex flex-col gap-1.5">
            <span className="label-dark">{t.timeZone}</span>
            <input
              type="text"
              value={zone}
              placeholder="Europe/Paris"
              onChange={(e) => edit(e.target.value, lat, lon)}
              className="field-dark"
              aria-invalid={zoneBad}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label-dark">{t.latitude}</span>
            <input type="number" step="0.01" value={lat} onChange={(e) => edit(zone, e.target.value, lon)} className="field-dark" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label-dark">{t.longitude}</span>
            <input type="number" step="0.01" value={lon} onChange={(e) => edit(zone, lat, e.target.value)} className="field-dark" />
          </label>
          <p className="no-correction-text md:col-span-3">{zoneBad ? t.timeZoneInvalid : t.timeZoneHint}</p>
        </div>
      ) : null}
    </div>
  );
}
