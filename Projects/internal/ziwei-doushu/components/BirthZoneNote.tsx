import { utcOffsetLabel } from '@/lib/astrologyView';
import { FIXED_UTC8 } from '@/lib/timezone';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/** 結果頁:出生地時區與出生當下的 UTC 偏移;當時實施夏令時間則註明已校正。舊口徑(固定 UTC+8)不顯示。 */
export default function BirthZoneNote({
  zone,
  dict,
}: {
  zone: { timeZone: string; utcOffsetHours: number; dst: boolean };
  dict: Dictionary;
}) {
  if (zone.timeZone === FIXED_UTC8) return null;
  return (
    <>
      <p className="no-correction-text">
        {dict.chart.utcOffset} {zone.timeZone}({utcOffsetLabel(zone.utcOffsetHours)})
      </p>
      {zone.dst ? <p className="correction-text">{dict.chart.dstApplied}</p> : null}
    </>
  );
}
