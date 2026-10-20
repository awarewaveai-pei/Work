// Rotation list payload (POST /api/social/lists, PUT /api/social/lists/[id]). The database checks the same shape (0096).
import { BadRequest, uuid } from "./http";
import type { ListInput, ListSlot } from "./store";

const MAX_SLOTS = 7 * 24;   // a grid of one slot per hour per weekday is already more than a brand posts

/** C23: the weekday x time grid. HH:MM or HH:MM:00 in, HH:MM out; the same weekday+time twice is one slot (the table's
 *  primary key says so); sorted by weekday then time so the saved grid reads the same however it was clicked. */
export function parseSlots(raw: unknown): ListSlot[] {
  if (!Array.isArray(raw)) throw new BadRequest("slots must be an array");
  if (raw.length > MAX_SLOTS) throw new BadRequest(`slots: at most ${MAX_SLOTS}`);
  const seen = new Map<string, ListSlot>();
  raw.forEach((s, i) => {
    const o = s as { weekday?: unknown; send_time?: unknown } | null;
    if (!o || typeof o !== "object" || !Number.isInteger(o.weekday) || (o.weekday as number) < 1 || (o.weekday as number) > 7) {
      throw new BadRequest(`slots[${i}].weekday must be a number 1 (Mon) .. 7 (Sun)`);
    }
    const m = typeof o.send_time === "string" ? /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/.exec(o.send_time) : null;
    if (!m) throw new BadRequest(`slots[${i}].send_time must be HH:MM`);
    const slot = { weekday: o.weekday as number, send_time: `${m[1]}:${m[2]}` };
    seen.set(`${slot.weekday} ${slot.send_time}`, slot);
  });
  return [...seen.values()].sort((a, b) => a.weekday - b.weekday || a.send_time.localeCompare(b.send_time));
}

export function parseListInput(body: Record<string, unknown>): ListInput {
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 120) throw new BadRequest("name must be 1..120 characters");
  const slots = body.slots === undefined || body.slots === null ? undefined : parseSlots(body.slots);
  // with slots, weekdays / send_time are derived from them (the database does the same: 0105 social_save_list)
  const weekdays = slots ? [...new Set(slots.map((s) => s.weekday))] : (body.weekdays ?? []);
  if (!Array.isArray(weekdays) || weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw new BadRequest("weekdays must be numbers 1 (Mon) .. 7 (Sun)");
  const sendTime = slots?.length ? slots.map((s) => s.send_time).sort()[0] : (body.send_time ?? "10:00");
  if (typeof sendTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(sendTime)) throw new BadRequest("send_time must be HH:MM");
  const active = body.active ?? false;
  if (typeof active !== "boolean") throw new BadRequest("active must be a boolean");
  if (active && weekdays.length === 0) throw new BadRequest("an active list needs at least one weekday");
  const accounts = body.account_ids ?? [];
  if (!Array.isArray(accounts)) throw new BadRequest("account_ids must be an array");
  return {
    name: body.name.trim(),
    weekdays: [...new Set(weekdays as number[])].sort(),
    send_time: sendTime,
    active,
    account_ids: [...new Set(accounts.map((a, i) => uuid(a, `account_ids[${i}]`)))],
    ...(slots ? { slots } : {}),
  };
}
