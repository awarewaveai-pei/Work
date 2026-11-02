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
}

/**
 * Create a FluentCRM email campaign as a DRAFT through the Bridge `/newsletter` route
 * (NewsletterCreator.php). RED LINE (governance, WP_BRIDGE_CONTROL_PLANE_DESIGN.md §I): this NEVER
 * schedules and NEVER sends — the plugin's NewsletterCreator sets neither status, scheduled_at, nor
 * any send trigger, so the row can only ever be a draft. The operator reviews recipients and presses
 * send manually in FluentCRM. ⚠ ALWAYS a real write (creates a draft campaign row).
 */
export function createNewsletter(
  spec: BridgeNewsletterSpec,
): Promise<BridgeResult<BridgeNewsletterResponse>> {
  return bridgePost<BridgeNewsletterResponse>("/newsletter", spec, { timeoutMs: 60_000 });
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
