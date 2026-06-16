<?php
/**
 * NewsletterCreator — turns generated content into a FluentCRM email campaign saved as a DRAFT.
 *
 * RED LINE (governance): this NEVER schedules and NEVER sends. Sending a campaign emails real
 * subscribers and is irreversible (WP_BRIDGE_CONTROL_PLANE_DESIGN.md §I: "FluentCRM campaign
 * trigger / FluentSMTP send = irreversible, human-gated, never auto-rollback"). We only create the
 * draft row; the operator opens it in FluentCRM, reviews recipients, and presses send manually.
 *
 * How it stays draft-only: the FluentCRM Campaign model's `creating` boot hook auto-fills
 * status='draft', type='campaign', design_template, slug, created_by and a default settings blob.
 * We pass ONLY content fields (title/subject/preheader/body) and deliberately set neither `status`,
 * `scheduled_at`, nor any send trigger — so the row can only ever be a draft.
 *
 * @package AwareWave\WpBridge\Newsletter
 */

namespace AwareWave\WpBridge\Newsletter;

final class NewsletterCreator {

	private const CAMPAIGN_MODEL = '\FluentCrm\App\Models\Campaign';

	/**
	 * Create a draft FluentCRM campaign from a content spec.
	 *
	 * @param array<string,mixed> $spec {
	 *     @type string $title           Internal campaign name (operator-facing in FluentCRM).
	 *     @type string $subject         Email subject line.
	 *     @type string $preview         Optional pre-header / preview text.
	 *     @type string $body_html       Email body (HTML).
	 *     @type string $design_template Optional FluentCRM design template slug (else FluentCRM default).
	 * }
	 * @return array<string,mixed> status=committed|failed plus campaign_id/edit_url or reason.
	 */
	public function create( array $spec ): array {
		if ( ! class_exists( self::CAMPAIGN_MODEL ) ) {
			return array( 'status' => 'failed', 'reason' => 'fluentcrm_not_active' );
		}

		$title   = isset( $spec['title'] ) ? trim( (string) $spec['title'] ) : '';
		$subject = isset( $spec['subject'] ) ? trim( (string) $spec['subject'] ) : '';
		$body    = isset( $spec['body_html'] ) ? (string) $spec['body_html'] : '';

		if ( $title === '' || $subject === '' || trim( $body ) === '' ) {
			return array( 'status' => 'failed', 'reason' => 'title_subject_body_required' );
		}

		// FluentCRM keys campaigns by a unique title on update; keep the draft list unambiguous by
		// suffixing a duplicate name rather than silently colliding with an existing campaign.
		$title = $this->uniqueTitle( $title );

		$model = self::CAMPAIGN_MODEL;
		$data  = array(
			'title'            => $title,
			'email_subject'    => $subject,
			'email_pre_header' => isset( $spec['preview'] ) ? (string) $spec['preview'] : '',
			'email_body'       => $body,
			// status / type / design_template / slug / created_by / settings are auto-filled by the
			// Campaign model's `creating` hook. We intentionally set NONE of: status, scheduled_at,
			// recipients, or any send flag — guaranteeing a draft that cannot send itself.
		);
		if ( ! empty( $spec['design_template'] ) ) {
			$data['design_template'] = (string) $spec['design_template'];
		}

		try {
			$campaign = $model::create( $data );
		} catch ( \Throwable $e ) {
			return array( 'status' => 'failed', 'reason' => 'create_failed', 'detail' => $e->getMessage() );
		}

		if ( ! $campaign || empty( $campaign->id ) ) {
			return array( 'status' => 'failed', 'reason' => 'create_failed' );
		}

		// Red-line assertion: the row MUST be a draft. If FluentCRM ever created it in any other
		// status, treat it as a violation and report loudly rather than returning a deceptive success.
		if ( $campaign->status !== 'draft' ) {
			return array(
				'status'      => 'failed',
				'reason'      => 'unexpected_non_draft_status',
				'detail'      => (string) $campaign->status,
				'campaign_id' => (int) $campaign->id,
			);
		}

		return array(
			'status'          => 'committed',
			'campaign_id'     => (int) $campaign->id,
			'campaign_status' => (string) $campaign->status, // always 'draft'
			'edit_url'        => admin_url( 'admin.php?page=fluentcrm-admin#/email/campaigns/' . (int) $campaign->id ),
		);
	}

	/** Append a numeric suffix until the campaign title is unique (bounded; avoids an infinite loop). */
	private function uniqueTitle( string $base ): string {
		$model = self::CAMPAIGN_MODEL;
		$title = $base;
		for ( $i = 2; $i < 50; $i++ ) {
			if ( ! $model::where( 'title', $title )->exists() ) {
				return $title;
			}
			$title = $base . ' (' . $i . ')';
		}
		return $title; // give up after 48 tries; FluentCRM tolerates duplicate titles on create.
	}
}
