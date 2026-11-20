'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChartRequest, Gender, CalendarType } from '@/lib/ziwei';
import type { Dictionary } from '@/lib/i18n/dictionaries';

const CITY_LON: Record<string, number> = {
  台北: 121.5, 台中: 120.7, 高雄: 120.3, 台南: 120.2,
  香港: 114.2, 北京: 116.4, 上海: 121.5, 廣州: 113.3,
};

/** 單選按鈕群:選項全部看得到,選中者用 btn-gold,其餘 btn-violet(同塔羅頁寫法)。 */
function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: { value: T; text: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-dark">{label}</span>
      <div role="group" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onPick(o.value)}
            className={value === o.value ? 'btn-gold' : 'btn-violet'}
            style={{ width: 'auto' }}
          >
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 出生資料表單。單人頁給 onSubmit(顯示送出鈕);多人頁(合婚)給 onChange,
 *   每次欄位變動即回報目前資料,由外層統一送出(此時不顯示送出鈕)。
 */
export default function BirthForm({
  dict,
  onSubmit,
  onChange,
}: {
  dict: Dictionary;
  onSubmit?: (req: ChartRequest) => void;
  onChange?: (req: ChartRequest) => void;
}) {
  const t = dict.form;
  const [date, setDate] = useState('2000-08-16');
  const [time, setTime] = useState('14:30');
  const [gender, setGender] = useState<Gender>('女');
  const [calendar, setCalendar] = useState<CalendarType>('solar');
  const [isLeapMonth, setIsLeapMonth] = useState(false);
  const [useTrueSolar, setUseTrueSolar] = useState(true);
  const [city, setCity] = useState('台北');
  const [longitude, setLongitude] = useState(121.5);

  function buildRequest(): ChartRequest {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    return {
      year: y, month: m, day: d, hour: hh, minute: mm,
      gender, calendar, isLeapMonth,
      trueSolar: useTrueSolar ? { longitude, tzOffsetHours: 8 } : undefined,
    };
  }

  // 只依欄位值觸發;onChange 存 ref,外層傳 inline 函式也拿得到最新版本。
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.(buildRequest());
  }, [date, time, gender, calendar, isLeapMonth, useTrueSolar, longitude]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit?.(buildRequest());
  }

  return (
    <form
      onSubmit={submit}
      className="glass-card p-6"
      style={{ borderRadius: "var(--radius-xl)" }}
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="label-dark">{t.birthDate}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="field-dark"
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="label-dark">{t.birthTime}</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="field-dark"
            required
          />
        </label>

        <ChoiceGroup
          label={t.gender}
          value={gender}
          options={[
            { value: '男', text: t.male },
            { value: '女', text: t.female },
          ]}
          onPick={setGender}
        />

        <ChoiceGroup
          label={t.calendar}
          value={calendar}
          options={[
            { value: 'solar', text: t.solar },
            { value: 'lunar', text: t.lunar },
          ]}
          onPick={setCalendar}
        />

        {calendar === 'lunar' ? (
          <label className="flex items-center gap-2 md:mt-6">
            <input
              type="checkbox"
              checked={isLeapMonth}
              onChange={(e) => setIsLeapMonth(e.target.checked)}
              className="field-check"
            />
            <span className="label-dark">{t.leapMonth}</span>
          </label>
        ) : null}

        <label className="col-span-2 flex items-center gap-2 md:col-span-3 md:mt-1">
          <input
            type="checkbox"
            checked={useTrueSolar}
            onChange={(e) => setUseTrueSolar(e.target.checked)}
            className="field-check"
          />
          <span className="label-dark">{t.trueSolarToggle}</span>
        </label>

        {useTrueSolar ? (
          <>
            <div className="col-span-2 md:col-span-3">
              <ChoiceGroup
                label={t.city}
                value={city}
                options={Object.keys(CITY_LON).map((c) => ({ value: c, text: c }))}
                onPick={(c) => {
                  setCity(c);
                  setLongitude(CITY_LON[c]);
                }}
              />
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="label-dark">{t.longitude}</span>
              <input
                type="number"
                step="0.1"
                value={longitude}
                onChange={(e) => setLongitude(Number(e.target.value))}
                className="field-dark"
              />
            </label>
          </>
        ) : null}

        {onSubmit ? (
          <div className="col-span-2 md:col-span-3 mt-2">
            <button type="submit" className="btn-gold">
              {t.submit}
            </button>
          </div>
        ) : null}
      </div>
    </form>
  );
}
