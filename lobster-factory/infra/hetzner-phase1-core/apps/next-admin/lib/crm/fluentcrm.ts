/** FluentCRM adapter. Campaign creation stays draft-only behind the signed, gated transport. */
import { bridgePost, type BridgeResult } from "@/lib/payments/woo";
export { isBridgeConfigured } from "@/lib/payments/woo";

export interface BridgeNewsletterResponse {
  status: string; // committed | failed
  ok?: boolean;
  campaign_id?: number;
  campaign_status?: string; // always 'draft' on success
  edit_url?: string;
  reason?: string;
  detail?: unknown;
}

export interface BridgeNewsletterSpec {
  /** Internal campaign name (operator-facing in FluentCRM). */
  title: string;
  /** Email subject line. */
  subject: string;
  /** Optional pre-header / preview text. */
  preview?: string;
  /** Email body (HTML) — already converted from the article markdown. */
  body_html: string;
  /** Optional FluentCRM design-template slug; omit to use FluentCRM's default. */
  design_template?: string;
  /** No caller picks a status or a send time: the draft is the only state this adapter creates. */
  status?: never;
  scheduled_at?: never;
}

/** The one status this adapter ever sends; the plugin (NewsletterCreator.php) sets none and refuses a non-draft row. */
export const NEWSLETTER_STATUS = "draft" as const;

/**
 * Create a FluentCRM email campaign as a DRAFT through the Bridge `/newsletter` route
 * (NewsletterCreator.php). RED LINE (governance, WP_BRIDGE_CONTROL_PLANE_DESIGN.md §I): this NEVER
 * schedules and NEVER sends. Only the content fields are copied into the payload (anything else a caller
 * smuggles in is dropped) and the status is the constant draft; an answer naming any other status is a failure,
 * never a success. The operator reviews recipients and presses send manually in FluentCRM.
 * `clientId` picks the bridge site (as upsertContact; "" / absent = default). ⚠ ALWAYS a real write.
 */
export async function createNewsletter(
  spec: BridgeNewsletterSpec,
  options: { clientId?: string } = {},
): Promise<BridgeResult<BridgeNewsletterResponse>> {
  const payload = {
    title: spec.title,
    subject: spec.subject,
    ...(spec.preview !== undefined ? { preview: spec.preview } : {}),
    body_html: spec.body_html,
    ...(spec.design_template !== undefined ? { design_template: spec.design_template } : {}),
    status: NEWSLETTER_STATUS,
  };
  const r = await bridgePost<BridgeNewsletterResponse>("/newsletter", payload, { timeoutMs: 60_000, clientId: options.clientId });
  if (r.ok && r.value.campaign_status !== NEWSLETTER_STATUS) {
    return { ok: false, error: `unexpected_non_draft_status:${String(r.value.campaign_status)}` };
  }
  return r;
}

export interface BridgeContactSpec {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  /** List / tag titles; the plugin creates the missing ones. */
  lists?: string[];
  tags?: string[];
}

export interface BridgeContactResponse {
  status: string; // committed | failed
  ok?: boolean;
  contact_id?: number;
  created?: boolean;
  contact_status?: string;
  reason?: string;
  detail?: unknown;
}

/**
 * Upsert one FluentCRM contact (email key) with lists/tags through the Bridge `/fluentcrm/contact` route
 * (ContactUpserter.php). Never starts a sequence or sends mail; an existing contact keeps its subscription status.
 * `clientId` picks the bridge site (woo.ts listBridgeClients ids; "" = default). ⚠ Always a real write.
 */
export function upsertContact(
  spec: BridgeContactSpec,
  options: { clientId?: string } = {},
): Promise<BridgeResult<BridgeContactResponse>> {
  return bridgePost<BridgeContactResponse>("/fluentcrm/contact", spec, { timeoutMs: 30_000, clientId: options.clientId });
}
