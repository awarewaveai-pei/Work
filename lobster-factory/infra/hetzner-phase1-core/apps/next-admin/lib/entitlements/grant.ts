import { AsyncLocalStorage } from "node:async_hooks";
import { can, EntitlementRequired, gateFailure, refuseBeforeVerdict, type GateDependencies, type Grant, type Subject } from "./can";
import { routeFeatureKeys } from "./route-features";
import { requestActor, resolveSubject, type AuthorizedOrg, type SubjectHint, type SubjectStore } from "./subject";

// grants: what this request's withFeature already issued, so a library grantFor for the same feature reuses it instead
// of a second verdict (a second lookup could fail into a 500, or a later report() in both places could charge twice).
interface Scope { subject: Subject | null; actor: string; grants: ReadonlyMap<string, Grant> }
const scope = new AsyncLocalStorage<Scope>();

export interface GrantContext extends SubjectHint {
  /** orgId / slug / brandId name an org straight from server data (e.g. the conversation's owner in cs); with a human
   *  caller in scope (req, or inside withFeature) they are refused unless `acting` carries the AuthorizedOrg. */
  actor?: string;
  /** From `actorFor` (social/authz): the only way to name a customer org for a staff actor. */
  acting?: AuthorizedOrg;
  deps?: GateDependencies;
  subjects?: SubjectStore;
}

const gateDeps = async (ctx: GrantContext) => ctx.deps ?? (await import("./runtime")).runtimeGateDependencies();

async function evaluate(featureKey: string, ctx: GrantContext, inherited: Scope | undefined): Promise<{ grant: Grant; subject: Subject | null; actor: string }> {
  const actor = ctx.acting?.actor ?? ctx.actor ?? (ctx.req ? requestActor(ctx.req) : inherited?.actor ?? "system");
  const d = await gateDeps(ctx);
  let subject: Subject | null = null;
  const humanCaller = Boolean(ctx.req) || (inherited !== undefined && inherited.actor !== "system");
  if (!ctx.acting && (ctx.orgId || ctx.slug || ctx.brandId) && humanCaller) {
    return { grant: await refuseBeforeVerdict(featureKey, actor, "not_authorized_for_org", d), subject, actor };
  }
  try {
    const named = ctx.acting || ctx.req || ctx.orgId || ctx.slug || ctx.brandId;
    const hint: SubjectHint = ctx.acting ? { orgId: ctx.acting.orgId } : ctx;
    subject = !named && inherited?.subject ? inherited.subject : await resolveSubject(hint, ctx.subjects);
    return { grant: await can(subject, featureKey, actor, d), subject, actor };
  } catch (error) {
    return { grant: await gateFailure(featureKey, actor, error, d, subject ?? undefined), subject, actor };
  }
}

/** For library call sites: inherits subject and actor from the enclosing `withFeature` request, else bills the internal
 *  account as `system`. Throws EntitlementRequired when refused (enforce mode only; shadow always allows). */
export async function grantFor(featureKey: string, ctx: GrantContext = {}): Promise<Grant> {
  const inherited = scope.getStore();
  const plain = !ctx.req && !ctx.orgId && !ctx.slug && !ctx.brandId && !ctx.acting && !ctx.actor;
  const issued = plain ? inherited?.grants.get(featureKey) : undefined;
  if (issued) return issued;
  const { grant } = await evaluate(featureKey, ctx, inherited);
  if (!grant.allowed) throw new EntitlementRequired(grant.reason ?? "denied");
  return grant;
}

/** The only wrapper for paid API routes: asks `can()` first, hands the handler its grant, answers 403 {code} on refusal. */
export function withFeature<R extends Request>(featureKey: string, handler: (req: R, grant: Grant) => Promise<Response>, options: { deps?: GateDependencies; subjects?: SubjectStore } = {}): (req: R) => Promise<Response> {
  if (!routeFeatureKeys().has(featureKey)) throw new Error(`withFeature: ${featureKey} is not registered in route-features.ts`);
  return async (req) => {
    const { grant, subject, actor } = await evaluate(featureKey, { req, ...options }, undefined);
    if (!grant.allowed) return Response.json({ ok: false, code: grant.reason }, { status: 403 });
    return scope.run({ subject, actor, grants: new Map([[featureKey, grant]]) }, () => handler(req, grant));
  };
}
