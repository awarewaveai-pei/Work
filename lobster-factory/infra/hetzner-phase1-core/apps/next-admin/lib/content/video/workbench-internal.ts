import { timingSafeEqual } from "@/lib/security/timingSafeEqual";

/** video-workbench's server-to-server calls (api/internal/video/workbench/*): Bearer = VW_INTERNAL_TOKEN; unset = every
 *  call refused. The org a call names is the workbench's own (it holds one org); each route still scopes every read and
 *  every paid ask to that org. */
export function workbenchAuthorized(req: Request): boolean {
  const expected = process.env.VW_INTERNAL_TOKEN;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return !!expected && !!bearer && timingSafeEqual(bearer, expected);
}
