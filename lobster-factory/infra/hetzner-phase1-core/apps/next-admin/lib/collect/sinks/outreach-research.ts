// sink/outreach-research — one lead's research run delivers here (Outbound OS SPEC §5.1, card C3).
//
// The seam between collection and cold outreach, like sink/kb is for the knowledge base: the only file in lib/collect
// that knows co_evidence exists. Per page: a cheap model proposes up to three facts with a verbatim excerpt; code keeps
// only those whose excerpt is in the page text (lib/outreach/research-extract.ts) and stores them -- approved when the
// page is on the lead's own website (SPEC D23), pending for a person otherwise. The addresses the page publishes are
// collected for the caller (lib/outreach/research.ts decides whether the lead takes one). A per-run instance, not
// registered: it carries one lead. Besides the own site it reads exactly the documents the caller admits by URL: the
// lead's own social profile and posts (lib/outreach/social-research.ts, card C17), whose addresses the ladder keeps.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RawDoc, SinkBlock, SinkCtx, SinkReport } from "@/lib/collect/types";
import type { Grant } from "@/lib/entitlements/can";
import { OUTREACH_JSON_MODEL } from "@/lib/outreach/ai-gemini";
import { outreachJson } from "@/lib/outreach/org-ai-key";
import { autoApproves, CLAIMS_SYSTEM, claimSupport, claimsUser, excerptOnPage, pageEmailsOf, verifiedClaims, type FoundEmail }
  from "@/lib/outreach/research-extract";
import { hostOf } from "@/lib/outreach/research-extract";
import { inScope, siteScope } from "@/lib/collect/canonical";

/** co_evidence.source_url ceiling (0150 CHECK): the unique key must fit a btree entry. */
const MAX_URL = 1000;

/** Pages read by the model at once: 15 pages fit the research deadline without a burst at the vendor. */
const CONCURRENCY = 4;

export interface OutreachResearchSink extends SinkBlock {
  /** Every address found, with the page and what ranks it (research-extract.ts bestEmail chooses). */
  readonly emails: FoundEmail[];
  /** Pages the deadline left unread by the model. */
  readonly late: number;
  /** Evidence rows set stale this run: their excerpt is no longer on their page. */
  readonly stale: number;
  /** Stale rows whose excerpt is back on their page this run. */
  readonly revived: number;
  readonly approved: number;
}

export function createOutreachResearchSink(args: {
  db: SupabaseClient;
  lead: { id: string; organization_id: string | null; website: string | null };
  /** outreach.research, billed to the lead's organization (lib/outreach/research.ts). */
  grant: Grant;
  /** Epoch ms after which no page goes to the model: the run's whole time limit, extraction included. */
  deadline: number;
  /** URLs off the site that are still the business speaking (its own social profile and posts), filled by the
   *  caller before it delivers them. Matched exactly; nothing else off the site is ever read. */
  admit?: ReadonlySet<string>;
}): OutreachResearchSink {
  const siteHost = hostOf(args.lead.website);
  // The same scope the crawl was given (lib/collect/run.ts runLeadResearch): checked again on every delivered document,
  // so a page reached any other way (a renderer's own redirect) is still not read.
  const scope = args.lead.website ? siteScope(args.lead.website) : null;
  // A site under a path shares its host with others (medium.com/@biz): an address on that domain is the platform's.
  const ownDomain = scope?.pathPrefix ? null : siteHost;
  const emails: FoundEmail[] = [];
  let approved = 0;
  let late = 0;
  let offSite = 0;
  let stale = 0;
  let revived = 0;
  const decoder = new TextDecoder();

  return {
    id: "sink/outreach-research",
    title: "Outreach research (evidence + contact email)",
    emails,
    get approved() { return approved; },
    get late() { return late; },
    get stale() { return stale; },
    get revived() { return revived; },
    async run(docs: RawDoc[], ctx: SinkCtx): Promise<SinkReport> {
      let written = 0;
      let skipped = 0;
      const errors: string[] = [];
      const one = async (doc: RawDoc): Promise<void> => {
        // Only the lead's own site is read (SPEC D20): a page a redirect took elsewhere, or an oversized URL, is skipped.
        const onSite = !!scope && inScope(doc.canonicalUrl, scope);
        const admitted = !onSite && !!args.admit?.has(doc.canonicalUrl);
        if ((!onSite && !admitted) || doc.canonicalUrl.length > MAX_URL) { offSite++; skipped++; return; }
        const html = doc.raw && /html/i.test(doc.raw.mime) ? decoder.decode(doc.raw.bytes) : null;
        // One entry per address, holding its strongest sighting: a mailto on a later page upgrades a plain-text mention.
        // A social profile's addresses are the ladder's (social-research.ts profileEmails), not counted twice here.
        for (const f of admitted ? [] : pageEmailsOf({ html, text: doc.text, url: doc.canonicalUrl }, ownDomain)) {
          const prev = emails.find((e) => e.email === f.email);
          if (!prev) emails.push(f);
          else if (f.mailto && !prev.mailto) Object.assign(prev, { mailto: true, sourceUrl: f.sourceUrl });
        }

        // A page the quality gate refused (meta.aside: too short, thin) gives addresses only -- never facts, and never a
        // verdict on facts: its text may be a fragment of the page (a challenge page, a half-rendered one).
        if (typeof doc.meta?.aside === "string") { skipped++; return; }
        // A dated announcement (a social post): its facts are never approved without a person, however exact.
        const reviewOnly = doc.meta?.reviewOnly === true;

        // What this lead's evidence from this admitted page says now: a row whose excerpt has left the page goes stale
        // (generation stops citing it); a stale row whose excerpt is back returns -- approved if a person had approved
        // it (reviewed_by), else by the same rule as a new fact. Judged on the excerpt, not on what the model says
        // this time. Rejected rows are a person's decision and stay.
        const { data: existing, error: exErr } = await args.db.from("co_evidence").select("id, claim, excerpt, status, reviewed_by")
          .eq("lead_id", args.lead.id).eq("source_url", doc.canonicalUrl).in("status", ["approved", "pending", "stale"]);
        if (exErr) errors.push(`${doc.canonicalUrl}: ${exErr.message}`);
        for (const r of (existing ?? []) as Array<{ id: string; claim: string; excerpt: string | null; status: string; reviewed_by: string | null }>) {
          if (!r.excerpt) continue;
          const onPage = excerptOnPage(r.excerpt, doc.text);
          const next = onPage
            ? (r.status !== "stale" ? null : r.reviewed_by ? "approved" : !reviewOnly && autoApproves(r.claim, r.excerpt) ? "approved" : "pending")
            : (r.status === "stale" ? null : "stale");
          if (!next) continue;
          const { error: sErr } = await args.db.from("co_evidence").update({ status: next }).eq("id", r.id).eq("status", r.status);
          if (sErr) errors.push(`${doc.canonicalUrl}: ${sErr.message}`);
          else if (next === "stale") stale++;
          else revived++;
        }

        if (Date.now() > args.deadline) { late++; skipped++; return; }

        const r = await outreachJson(args.db, {
          route: "outreach/research", model: OUTREACH_JSON_MODEL, system: CLAIMS_SYSTEM, user: claimsUser({ title: doc.title, text: doc.text, url: doc.canonicalUrl }),
          maxTokens: 600, grant: args.grant, tool: "outreach", metadata: { lead_id: args.lead.id, run_id: ctx.runId },
        });
        if (r.ok === false) { errors.push(`${doc.canonicalUrl}: ${r.error}`); skipped++; return; }
        const { kept, dropped } = verifiedClaims(r.raw, doc.text);
        skipped += dropped;
        if (kept.length === 0) return;

        // The business speaking about itself, checked word for word (SPEC D23) -- approved only when the excerpt also
        // supports the claim and states its numbers, weekdays and negation exactly (research-extract.ts autoApproves);
        // otherwise it waits for a person. confidence = the coverage score.
        const rows = kept.map((c) => {
          const support = claimSupport(c.claim, c.excerpt);
          return {
            lead_id: args.lead.id, organization_id: args.lead.organization_id, claim: c.claim, excerpt: c.excerpt,
            source_url: doc.canonicalUrl, source_label: doc.collector, source_date: doc.publishedAt ? doc.publishedAt.slice(0, 10) : null,
            confidence: Math.round(support * 100) / 100, status: !reviewOnly && autoApproves(c.claim, c.excerpt) ? "approved" : "pending", created_by: "research",
          };
        });
        // Idempotent across flushes and reruns: the same fact from the same page is one row (0150 unique key).
        const { data, error } = await args.db.from("co_evidence")
          .upsert(rows, { onConflict: "lead_id,source_url,claim", ignoreDuplicates: true }).select("id, status");
        if (error) { errors.push(`${doc.canonicalUrl}: ${error.message}`); skipped += rows.length; return; }
        const inserted = (data ?? []) as Array<{ status: string }>;
        written += inserted.length;
        approved += inserted.filter((x) => x.status === "approved").length;
      };
      for (let i = 0; i < docs.length; i += CONCURRENCY) await Promise.all(docs.slice(i, i + CONCURRENCY).map(one));
      ctx.log(`sink/outreach-research: ${written} evidence row(s), ${skipped} skipped (${late} past the deadline, ${offSite} off the site), ${emails.length} address(es)`);
      return { written, skipped, errors: errors.length ? errors : undefined };
    },
  };
}
