'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChartRequest, Gender, CalendarType } from '@/lib/ziwei';
import type { DayDivide } from '@/lib/dates';
import type { BirthPlace } from '@/lib/timezone';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import PlaceField, { defaultPlace } from '@/components/PlaceField';
import { PrefillNotice, useBirthPrefill } from '@/components/BirthPrefill';
import { dateText, forDateInput, timeText } from '@/lib/member/birthPrefill';

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
 * 出生地未選時不送出:onSubmit 不呼叫並提示,onChange 回報 null。
 * 登入會員在 WordPress 框內開啟時,表單初始值換成會員存的出生資料(components/BirthPrefill.tsx);
 *   prefill=false 不讀(合婚第二人)。使用者動過任何欄位就不再覆蓋。
 */
export default function BirthForm({
  dict,
  locale,
  onSubmit,
  onChange,
  prefill = true,
}: {
  dict: Dictionary;
  locale: Locale;
  onSubmit?: (req: ChartRequest) => void;
  onChange?: (req: ChartRequest | null) => void;
  prefill?: boolean;
}) {
  const t = dict.form;
  const [date, setDate] = useState('2000-08-16');
  const [time, setTime] = useState('14:30');
  const [gender, setGender] = useState<Gender>('女');
  const [calendar, setCalendar] = useState<CalendarType>('solar');
  const [isLeapMonth, setIsLeapMonth] = useState(false);
  const [useTrueSolar, setUseTrueSolar] = useState(true);
  const [place, setPlace] = useState<BirthPlace | null>(() => defaultPlace(locale));
  const [dayDivide, setDayDivide] = useState<DayDivide>('current');
  const [placeMissing, setPlaceMissing] = useState(false);
  /** PlaceField 的初始出生地與重掛鍵(預填、清除時換) */
  const [placeInit, setPlaceInit] = useState<{ key: number; place: BirthPlace | null }>({ key: 0, place: place });

  function fill(v: { date: string; time: string; gender: Gender; calendar: CalendarType; isLeapMonth: boolean; trueSolar: boolean; place: BirthPlace | null; dayDivide: DayDivide }) {
    setDate(v.date);
    setTime(v.time);
    setGender(v.gender);
    setCalendar(v.calendar);
    setIsLeapMonth(v.isLeapMonth);
    setUseTrueSolar(v.trueSolar);
    setPlace(v.place);
    setDayDivide(v.dayDivide);
    setPlaceMissing(false);
    setPlaceInit((p) => ({ key: p.key + 1, place: v.place }));
  }
  const member = useBirthPrefill(
    (stored) => {
      const b = forDateInput(stored);
      fill({ date: dateText(b), time: timeText(b), gender: b.gender, calendar: b.calendar, isLeapMonth: b.isLeapMonth, trueSolar: b.trueSolar, place: b.place, dayDivide: b.dayDivide });
    },
    prefill,
  );
  /** 使用者的操作:記下「動過了」,之後讀到的會員資料不再覆蓋 */
  const user =
    <A,>(f: (a: A) => void) =>
    (a: A) => {
      member.markTouched();
      f(a);
    };
  function clearPrefill() {
    member.markTouched();
    member.hide();
    fill({ date: '2000-08-16', time: '14:30', gender: '女', calendar: 'solar', isLeapMonth: false, trueSolar: true, place: defaultPlace(locale), dayDivide: 'current' });
  }

  function buildRequest(): ChartRequest | null {
    if (!place) return null;
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    return {
      year: y, month: m, day: d, hour: hh, minute: mm,
      gender, calendar, isLeapMonth,
      place, trueSolar: useTrueSolar, dayDivide,
    };
  }

  // 只依欄位值觸發;onChange 存 ref,外層傳 inline 函式也拿得到最新版本。
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.(buildRequest());
  }, [date, time, gender, calendar, isLeapMonth, useTrueSolar, place, dayDivide]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const req = buildRequest();
    setPlaceMissing(!req);
    if (req) onSubmit?.(req);
  }

  return (
    <form
      onSubmit={submit}
      onInputCapture={member.markTouched}
      className="glass-card p-6"
      style={{ borderRadius: "var(--radius-xl)" }}
    >
      {member.prefilled ? <PrefillNotice dict={dict} onClear={clearPrefill} /> : null}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="label-dark">{t.birthDate}</span>
          <input
            type="date"
            value={date}
            onChange={user((e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value))}
            className="field-dark"
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="label-dark">{t.birthTime}</span>
          <input
            type="time"
            value={time}
            onChange={user((e: React.ChangeEvent<HTMLInputElement>) => setTime(e.target.value))}
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
          onPick={user(setGender)}
        />

        <ChoiceGroup
          label={t.calendar}
          value={calendar}
          options={[
            { value: 'solar', text: t.solar },
            { value: 'lunar', text: t.lunar },
          ]}
          onPick={user(setCalendar)}
        />

        {calendar === 'lunar' ? (
          <label className="flex items-center gap-2 md:mt-6">
            <input
              type="checkbox"
              checked={isLeapMonth}
              onChange={user((e: React.ChangeEvent<HTMLInputElement>) => setIsLeapMonth(e.target.checked))}
              className="field-check"
            />
            <span className="label-dark">{t.leapMonth}</span>
          </label>
        ) : null}

        <div className="col-span-2 md:col-span-3">
          <PlaceField
            key={placeInit.key}
            initial={placeInit.place}
            dict={dict}
            locale={locale}
            onChange={user((p: BirthPlace | null) => {
              setPlace(p);
              if (p) setPlaceMissing(false);
            })}
          />
          {placeMissing ? <div className="error-banner mt-2">{t.placeRequired}</div> : null}
        </div>

        <label className="col-span-2 flex items-center gap-2 md:col-span-3 md:mt-1">
          <input
            type="checkbox"
            checked={useTrueSolar}
            onChange={user((e: React.ChangeEvent<HTMLInputElement>) => setUseTrueSolar(e.target.checked))}
            className="field-check"
          />
          <span className="label-dark">{t.trueSolarToggle}</span>
        </label>

        <div className="col-span-2 md:col-span-3">
          <ChoiceGroup
            label={t.lateRatHour}
            value={dayDivide}
            options={[
              { value: 'current', text: t.lateRatCurrent },
              { value: 'forward', text: t.lateRatForward },
            ]}
            onPick={user(setDayDivide)}
          />
        </div>

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
