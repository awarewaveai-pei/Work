'use client';

import { useState } from 'react';
import type { ChartRequest, Gender, CalendarType } from '@/lib/ziwei';
import type { Dictionary } from '@/lib/i18n/dictionaries';

const CITY_LON: Record<string, number> = {
  台北: 121.5, 台中: 120.7, 高雄: 120.3, 台南: 120.2,
  香港: 114.2, 北京: 116.4, 上海: 121.5, 廣州: 113.3,
};

export default function BirthForm({
  dict,
  onSubmit,
}: {
  dict: Dictionary;
  onSubmit: (req: ChartRequest) => void;
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    onSubmit({
      year: y, month: m, day: d, hour: hh, minute: mm,
      gender, calendar, isLeapMonth,
      trueSolar: useTrueSolar ? { longitude, tzOffsetHours: 8 } : undefined,
    });
  }

  const field = 'rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none';

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-500">{t.birthDate}</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-500">{t.birthTime}</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} required />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-500">{t.gender}</span>
        <select value={gender} onChange={(e) => setGender(e.target.value as Gender)} className={field}>
          <option value="男">{t.male}</option>
          <option value="女">{t.female}</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-500">{t.calendar}</span>
        <select value={calendar} onChange={(e) => setCalendar(e.target.value as CalendarType)} className={field}>
          <option value="solar">{t.solar}</option>
          <option value="lunar">{t.lunar}</option>
        </select>
      </label>

      {calendar === 'lunar' ? (
        <label className="flex items-center gap-2 text-sm md:mt-6">
          <input type="checkbox" checked={isLeapMonth} onChange={(e) => setIsLeapMonth(e.target.checked)} />
          <span className="text-slate-600">{t.leapMonth}</span>
        </label>
      ) : null}

      <label className="col-span-2 flex items-center gap-2 text-sm md:col-span-3 md:mt-2">
        <input type="checkbox" checked={useTrueSolar} onChange={(e) => setUseTrueSolar(e.target.checked)} />
        <span className="text-slate-600">{t.trueSolarToggle}</span>
      </label>

      {useTrueSolar ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">{t.city}</span>
            <select
              value={city}
              onChange={(e) => { setCity(e.target.value); setLongitude(CITY_LON[e.target.value]); }}
              className={field}
            >
              {Object.keys(CITY_LON).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500">{t.longitude}</span>
            <input
              type="number" step="0.1" value={longitude}
              onChange={(e) => setLongitude(Number(e.target.value))} className={field}
            />
          </label>
        </>
      ) : null}

      <div className="col-span-2 md:col-span-3">
        <button
          type="submit"
          className="w-full rounded-md bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          {t.submit}
        </button>
      </div>
    </form>
  );
}
