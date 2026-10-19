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
