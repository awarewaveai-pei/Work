import { AsyncLocalStorage } from "node:async_hooks";
import { BACK_OFFICE_FEATURES, can, EntitlementRequired, gateFailure, refuseBeforeVerdict, type GateDependencies, type Grant, type Subject } from "./can";
import { routeFeatureKeys } from "./route-features";
import { requestActor, resolveSubject, type AuthorizedOrg, type SubjectHint, type SubjectStore } from "./subject";

// grants: what this request's withFeature already issued, so a library grantFor for the same feature reuses it instead
// of a second verdict (a second lookup could fail into a 500, or a later report() in both places could charge twice).
// org: the customer org the request was authorized for (AuthorizedOrg), so a library naming that same org is not refused.
interface Scope { subject: Subject; actor: string; org: string | null; grants: ReadonlyMap<string, Grant>; deps?: GateDependencies; subjects?: SubjectStore }
const scope = new AsyncLocalStorage<Scope>();

export interface GrantContext extends SubjectHint {
  /** orgId / slug / brandId name an org straight from server data (e.g. the conversation's owner in cs); with a human
   *  caller in scope (req, or inside withFeature) they are refused unless `acting` carries the AuthorizedOrg, or the
   *  orgId is the one the enclosing withFeature was authorized for. */
  actor?: string;
  /** From `actorFor` (social/authz): the only way to name a customer org for a staff actor. */
  acting?: AuthorizedOrg;
  deps?: GateDependencies;
  subjects?: SubjectStore;
}

const gateDeps = async (ctx: GrantContext) => ctx.deps ?? (await import("./runtime")).runtimeGateDependencies();
/** The library names nothing beyond the org the enclosing request was already authorized for. */
const sameScope = (ctx: GrantContext, inherited: Scope | undefined) =>
  !ctx.req && !ctx.slug && !ctx.brandId && !ctx.acting && !ctx.actor && (!ctx.orgId || (!!inherited?.org && ctx.orgId === inherited.org));

async function evaluate(featureKey: string, ctx: GrantContext, inherited: Scope | undefined): Promise<{ grant: Grant; subject: Subject | null; actor: string }> {
  const actor = ctx.acting?.actor ?? ctx.actor ?? (ctx.req ? requestActor(ctx.req) : inherited?.actor ?? "system");
  const d = await gateDeps({ ...ctx, deps: ctx.deps ?? inherited?.deps });
  const subjects = ctx.subjects ?? inherited?.subjects;
  let subject: Subject | null = null;
  const humanCaller = Boolean(ctx.req) || (inherited !== undefined && inherited.actor !== "system");
  if (!ctx.acting && (ctx.orgId || ctx.slug || ctx.brandId) && humanCaller && !sameScope(ctx, inherited)) {
    return { grant: await refuseBeforeVerdict(featureKey, actor, "not_authorized_for_org", d), subject, actor };
  }
  try {
    const named = ctx.acting || ctx.req || ctx.orgId || ctx.slug || ctx.brandId;
    const hint: SubjectHint = ctx.acting ? { orgId: ctx.acting.orgId } : ctx;
    // Back-office tooling a staff member uses while acting for a customer is still the internal account's cost.
    const staffTooling = BACK_OFFICE_FEATURES.has(featureKey) && !actor.startsWith("client:") && !!inherited?.subject && inherited.subject.kind !== "internal";
    subject = !named && inherited?.subject && !staffTooling ? inherited.subject : await resolveSubject(hint, subjects);
    return { grant: await can(subject, featureKey, actor, d), subject, actor };
  } catch (error) {
    return { grant: await gateFailure(featureKey, actor, error, d, subject ?? undefined), subject, actor };
  }
}

/** For library call sites: inherits subject and actor from the enclosing `withFeature` request, else bills the internal
 *  account as `system`. Throws EntitlementRequired when refused (enforce mode only; shadow always allows). */
export async function grantFor(featureKey: string, ctx: GrantContext = {}): Promise<Grant> {
  const inherited = scope.getStore();
  const issued = sameScope(ctx, inherited) && !ctx.deps ? inherited?.grants.get(featureKey) : undefined;
  if (issued) return issued;
  const { grant } = await evaluate(featureKey, ctx, inherited);
  if (!grant.allowed) throw new EntitlementRequired(grant.reason ?? "denied");
  return grant;
}

/**
 * A server job with no request (a schedule) that works for one organization: every grantFor inside `fn` bills that
 * organization as `actor`, the way withFeature scopes a request. Naming another organization inside is refused (the
 * actor is not "system", so evaluate treats it as a caller bound to this org). Never call it with an org taken from
 * user input: its caller must already know the work belongs to `organizationId`.
 */
export async function runForOrg<T>(organizationId: string, actor: string, fn: () => Promise<T>,
  opts: { deps?: GateDependencies; subjects?: SubjectStore } = {}): Promise<T> {
  if (!organizationId || !actor || actor === "system") throw new Error("runForOrg: organizationId and a named actor required");
  const subject = await resolveSubject({ orgId: organizationId }, opts.subjects);
  return scope.run({ subject, actor, org: organizationId, grants: new Map(), deps: opts.deps, subjects: opts.subjects }, fn);
}

export interface FeatureOptions<R, C> {
  deps?: GateDependencies;
  subjects?: SubjectStore;
  /** The customer org this request works for, resolved exactly as the handler resolves it (effectiveOrgId, a slug
   *  lookup), or null for none. It becomes the billing account only through `actorFor`; a staff caller without a role
   *  there is refused as not_authorized_for_org (shadow: audited and allowed). A throw is an infrastructure error. */
  org?: (req: R, ctx: C) => string | null | Promise<string | null>;
}

/** The only wrapper for paid API routes: asks `can()` first, hands the handler its grant, answers 403 {code} on refusal.
 *  Library grantFor calls inside the handler inherit its billing account and actor. */
export function withFeature<R extends Request, C = unknown>(featureKey: string, handler: (req: R, grant: Grant, ctx: C) => Promise<Response>, options: FeatureOptions<R, C> = {}): (req: R, ctx?: C) => Promise<Response> {
  if (!routeFeatureKeys().has(featureKey)) throw new Error(`withFeature: ${featureKey} is not registered in route-features.ts`);
  const { deps, subjects } = options;
  return async (req, ctx) => {
    let named: Pick<GrantContext, "acting" | "orgId"> = {};
    let failed: { error: unknown } | null = null;
    try {
      const orgId = options.org ? await options.org(req, ctx as C) : null;
      if (orgId) {
        const { actorFor, NotAuthorizedForOrgError } = await import("@/lib/social/authz");
        named = await actorFor(req, orgId).then((acting) => ({ acting }), async (e) => {
          if (!(e instanceof NotAuthorizedForOrgError)) throw e;
          // Staff need no role on the internal account itself; any other org is refused by evaluate (not_authorized_for_org).
          const own = !requestActor(req).startsWith("client:") && (await resolveSubject({ orgId }, subjects)).kind === "internal";
          return own ? {} : { orgId };
        });
      }
    } catch (error) {
      failed = { error };
    }
    const { grant, actor } = failed
      ? { grant: await gateFailure(featureKey, requestActor(req), failed.error, await gateDeps({ deps })), actor: requestActor(req) }
      : await evaluate(featureKey, { req, deps, subjects, ...named }, undefined);
    if (!grant.allowed) return Response.json({ ok: false, code: grant.reason }, { status: 403 });
    const org = named.acting?.orgId ?? null;
    // The grant's subject, `unresolved` after a shadow refusal: library asks then stay flagged instead of billing internal.
    return scope.run({ subject: grant.subject, actor, org, grants: new Map([[featureKey, grant]]), deps, subjects }, () => handler(req, grant, ctx as C));
  };
}

/** withFeature handler for the paid part of a route: `withFeature(key, thenRun, { org: () => orgId })(req, () => work())`
 *  asks after the route has resolved its org and validated the request, and runs `work` inside the scope. */
export const thenRun = (_req: Request, _grant: Grant, run: () => Promise<Response>): Promise<Response> => run();
