// /api/social/prefs -- the signed-in person's own social page choices (lib/social/prefs.ts; not a brand's)
//   GET                     { displayTz }   no session identity = the defaults
//   PUT { displayTz }       "org" | "Asia/Taipei" | "UTC" (lib/social/time.ts DISPLAY_ZONES): how times are SHOWN only
import { callerOf } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody } from "@/lib/social/http";
import { DEFAULT_PREFS, loadPrefs, savePrefs } from "@/lib/social/prefs";
import { DISPLAY_ZONES, isDisplayZone } from "@/lib/social/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const userId = (await callerOf(req))?.userId;
    return userId ? await loadPrefs(userId) : DEFAULT_PREFS;
  });
}

export async function PUT(req: Request): Promise<Response> {
  return handle(async () => {
    const userId = (await callerOf(req))?.userId;
    if (!userId) throw new BadRequest("no signed-in user to save this for");
    const body = await jsonBody(req);
    if (!isDisplayZone(body.displayTz)) throw new BadRequest(`displayTz must be one of ${DISPLAY_ZONES.join(", ")}`);
    return await savePrefs(userId, { displayTz: body.displayTz });
  });
}
