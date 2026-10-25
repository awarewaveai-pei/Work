// A host schedule (cron expression in UTC, or report-host-schedules.py's @every / @daily forms) -> Taipei-time text and
// the interval it promises. Only the shapes our cron files use are spelled out; anything else falls back to the raw
// expression and no interval, so the page never claims a cadence (or staleness) it did not parse.

const TPE_OFFSET_H = 8; // Asia/Taipei, no DST
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export interface Cadence {
  text: string;
  /** Expected time between runs; null = not parsed (no staleness check). */
  intervalMs: number | null;
}

const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);
const pad = (n: number) => String(n).padStart(2, "0");

export function cronCadence(schedule: string): Cadence {
  const s = schedule.trim();
  const every = /^@every (\d+)s$/.exec(s);
  if (every) {
    const sec = Number(every[1]);
    return sec < 3600
      ? { text: `每 ${Math.max(1, Math.round(sec / 60))} 分鐘`, intervalMs: sec * 1000 }
      : { text: `每 ${Math.round(sec / 3600)} 小時`, intervalMs: sec * 1000 };
  }
  const named: Record<string, Cadence> = {
    "@hourly": { text: "每小時", intervalMs: HOUR },
    "@daily": { text: "每天", intervalMs: DAY },
    "@weekly": { text: "每週", intervalMs: 7 * DAY },
    "@monthly": { text: "每月", intervalMs: 31 * DAY },
    "@inactive": { text: "已停止", intervalMs: null },
    // A systemd timer or an n8n trigger whose rule the reporter does not translate: shown, never judged late.
    "@timer": { text: "依觸發器設定", intervalMs: null },
  };
  if (named[s]) return named[s];

  const raw: Cadence = { text: `${s}（UTC）`, intervalMs: null };
  const f = s.split(/\s+/);
  if (f.length !== 5) return raw;
  const [m, h, dom, mon, dow] = f;
  if (mon !== "*") return raw;

  if (h === "*" && dom === "*" && dow === "*") {
    if (m === "*") return { text: "每分鐘", intervalMs: MIN };
    const step = /^\*\/(\d+)$/.exec(m);
    if (step) return { text: `每 ${step[1]} 分鐘`, intervalMs: Number(step[1]) * MIN };
    if (num(m) !== null) return { text: `每小時 ${pad(num(m)!)} 分`, intervalMs: HOUR };
    return raw;
  }
  const minute = num(m);
  if (minute === null) return raw;
  const hStep = /^\*\/(\d+)$/.exec(h);
  if (hStep && dom === "*" && dow === "*") return { text: `每 ${hStep[1]} 小時`, intervalMs: Number(hStep[1]) * HOUR };

  const hours = h.split(",").map(num);
  if (hours.some((x) => x === null)) return raw;
  // UTC hour -> Taipei hour, and whether the Taipei clock is already on the next day.
  const tpe = (hours as number[]).map((x) => ({ hh: (x + TPE_OFFSET_H) % 24, nextDay: x + TPE_OFFSET_H >= 24 }));
  const times = [...tpe].sort((a, b) => a.hh - b.hh).map((t) => `${pad(t.hh)}:${pad(minute)}`).join("、");

  if (dom === "*" && dow === "*") return { text: `每天 ${times}`, intervalMs: DAY / hours.length };
  if (hours.length !== 1) return raw;
  if (dom === "*" && num(dow) !== null) {
    const d = (num(dow)! + (tpe[0].nextDay ? 1 : 0)) % 7;
    return { text: `每週${WEEKDAY[d]} ${times}`, intervalMs: 7 * DAY };
  }
  if (dow === "*" && num(dom) !== null) {
    // Day 31 + 1 would not exist; our files only use small days, anything else stays raw.
    const d = num(dom)! + (tpe[0].nextDay ? 1 : 0);
    if (d > 28) return raw;
    return { text: `每月 ${d} 日 ${times}`, intervalMs: 31 * DAY };
  }
  return raw;
}

/** A run is late once 1.5 intervals + 30 minutes passed: one missed run shows, a slow run does not. */
export function staleAfterMs(intervalMs: number): number {
  return intervalMs * 1.5 + 30 * MIN;
}
