'use client';

import { useEffect, useState } from 'react';
import type { BirthPlace } from '@/lib/timezone';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/**
 * 出生地選擇:全球城市搜尋(/api/places,GeoNames)+「其他」手動輸入 IANA 時區與經緯度。
 * 結果是看得到的按鈕,不是下拉選單。對外只交出 BirthPlace(lib/timezone.ts)。
 */

/** 繁中介面預設台北(沿用舊表經度 121.5,既有排盤結果不變);英文介面不預設,要使用者自己選。 */
const TAIPEI: BirthPlace = { label: '台北', lat: 25.03, lon: 121.5, zone: 'Asia/Taipei' };
export function defaultPlace(locale: Locale): BirthPlace | null {
  return locale === 'zh-TW' ? TAIPEI : null;
}

const SEARCH_LIMIT = 8;
const DEBOUNCE_MS = 250;

function isZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function manualPlace(z: string, la: string, lo: string): BirthPlace | null {
  const latN = Number(la);
  const lonN = Number(lo);
  if (!isZone(z.trim()) || la.trim() === '' || lo.trim() === '') return null;
  if (!(Math.abs(latN) <= 90 && Math.abs(lonN) <= 180)) return null;
  return { label: z.trim(), lat: latN, lon: lonN, zone: z.trim() };
}

const fmt = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;

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
  const [picked, setPicked] = useState<BirthPlace | null>(() => defaultPlace(locale));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BirthPlace[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [zone, setZone] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    // 改字就清掉上一輪的結果與錯誤,避免等待期間點到舊結果
    setResults(null);
    setSearchFailed(false);
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, locale, limit: String(SEARCH_LIMIT) });
        const res = await fetch(`/api/places?${params}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error();
        // 瀏覽器內建時區資料較舊時(如不認得 Europe/Kyiv),該城市無法換算偏移,不列出
        setResults((((await res.json()) as { places?: BirthPlace[] }).places ?? []).filter((p) => isZone(p.zone)));
      } catch {
        if (ctrl.signal.aborted) return;
        setResults(null);
        setSearchFailed(true);
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, locale]);

  function pick(p: BirthPlace) {
    setPicked(p);
    setManualOpen(false);
    setQuery('');
    setResults(null);
    onChange(p);
  }

  function openManual() {
    setManualOpen(true);
    setPicked(null);
    onChange(manualPlace(zone, lat, lon));
  }

  function edit(z: string, la: string, lo: string) {
    setZone(z);
    setLat(la);
    setLon(lo);
    onChange(manualPlace(z, la, lo));
  }

  const zoneBad = manualOpen && zone.trim() !== '' && !isZone(zone.trim());

  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-dark">{t.place}</span>
      {picked ? (
        <p className="correction-text" aria-live="polite">
          {t.placeSelected} {picked.label} · {picked.zone} · {fmt(picked.lat, 'N', 'S')} {fmt(picked.lon, 'E', 'W')}
        </p>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.placeSearchPlaceholder}
          aria-label={t.placeSearch}
          className="field-dark"
          style={{ flex: '1 1 14rem' }}
          maxLength={64}
        />
        <button
          type="button"
          aria-pressed={manualOpen}
          onClick={openManual}
          className={manualOpen ? 'btn-gold' : 'btn-violet'}
          style={{ width: 'auto' }}
        >
          {t.placeOther}
        </button>
      </div>
      {query.trim() ? (
        <div role="group" aria-label={t.placeSearch} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
          {searching && !results ? <span className="no-correction-text">{t.placeSearching}</span> : null}
          {searchFailed ? <span className="no-correction-text">{t.placeSearchFailed}</span> : null}
          {results && results.length === 0 ? <span className="no-correction-text">{t.placeNoResult}</span> : null}
          {results?.map((p) => (
            <button
              key={`${p.lat},${p.lon},${p.label}`}
              type="button"
              onClick={() => pick(p)}
              className="btn-violet"
              style={{ width: 'auto', textAlign: 'left' }}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
      {manualOpen ? (
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
      <p className="no-correction-text" style={{ fontSize: '0.7rem' }}>
        {t.placeCredit}{' '}
        <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer" className="text-gold-dim">
          GeoNames
        </a>
        {' · '}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="text-gold-dim">
          CC BY 4.0
        </a>
      </p>
    </div>
  );
}
