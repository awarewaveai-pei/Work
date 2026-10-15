// Rotation list payload (POST /api/social/lists, PUT /api/social/lists/[id]). The database checks the same shape (0096).
import { BadRequest, uuid } from "./http";
import type { ListInput } from "./store";

export function parseListInput(body: Record<string, unknown>): ListInput {
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 120) throw new BadRequest("name must be 1..120 characters");
  const weekdays = body.weekdays ?? [];
  if (!Array.isArray(weekdays) || weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw new BadRequest("weekdays must be numbers 1 (Mon) .. 7 (Sun)");
  const sendTime = body.send_time ?? "10:00";
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
  };
}
