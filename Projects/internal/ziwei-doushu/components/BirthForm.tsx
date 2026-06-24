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

        <label className="flex flex-col gap-1.5">
          <span className="label-dark">{t.gender}</span>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as Gender)}
            className="field-dark"
          >
            <option value="男">{t.male}</option>
            <option value="女">{t.female}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="label-dark">{t.calendar}</span>
          <select
            value={calendar}
            onChange={(e) => setCalendar(e.target.value as CalendarType)}
            className="field-dark"
          >
            <option value="solar">{t.solar}</option>
            <option value="lunar">{t.lunar}</option>
          </select>
        </label>

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
            <label className="flex flex-col gap-1.5">
              <span className="label-dark">{t.city}</span>
              <select
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setLongitude(CITY_LON[e.target.value]);
                }}
                className="field-dark"
              >
                {Object.keys(CITY_LON).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
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

        <div className="col-span-2 md:col-span-3 mt-2">
          <button type="submit" className="btn-gold">
            {t.submit}
          </button>
        </div>
      </div>
    </form>
  );
}
