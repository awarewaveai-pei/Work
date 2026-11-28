<?php
/**
 * The only place that talks to FluentCRM (free; verified against 3.3.5). Everything else goes through here,
 * so a FluentCRM change is fixed in one file.
 *
 * Sending = FluentCRM REST POST /fluent-crm/v2/subscribers/{id}/emails/send, called in-process with
 * rest_do_request() (ORACLE-WP-SPEC §2-8). FluentCRM requires fcrm_manage_contacts; a cron run has no user,
 * so the call runs as the site's first administrator and the previous user is restored right after.
 * FluentCRM refuses contacts that are not "subscribed" (422) and adds List-Unsubscribe itself.
 * FluentCRM forces the one-off campaign title ("Custom email to …"); the campaign is found again by its slug
 * ("oracle-daily-…", which the endpoint keeps) and retitled "oracle-daily <date>".
 *
 * @package AwareWave\Oracle\Daily
 */

namespace AwareWave\Oracle\Daily;

final class Crm {

	const SLUG_PREFIX = 'oracle-daily-';
	/** FluentCRM statuses after which nobody may be mailed again without an administrator. */
	const SUPPRESSED = array( 'unsubscribed', 'bounced', 'complained', 'spammed' );

	/** send() results */
	const SENT    = 'sent';
	const REFUSED = 'refused'; // FluentCRM said no before sending (4xx): nothing went out
	const UNKNOWN = 'unknown'; // anything else: it may have gone out

	public static function available(): bool {
		return function_exists( 'FluentCrmApi' ) && class_exists( '\FluentCrm\App\Models\Subscriber' );
	}

	/** @return array{id:int,status:string,email:string}|null */
	public static function findByEmail( string $email ): ?array {
		if ( ! self::available() ) {
			return null;
		}
		$s = \FluentCrm\App\Models\Subscriber::where( 'email', $email )->first();
		return $s ? array( 'id' => (int) $s->id, 'status' => (string) $s->status, 'email' => (string) $s->email ) : null;
	}

	/**
	 * @param array<int,int> $ids
	 * @return array<int,string> addresses of those contacts
	 */
	public static function emails( array $ids ): array {
		if ( ! self::available() || ! $ids ) {
			return array();
		}
		$out = array();
		foreach ( \FluentCrm\App\Models\Subscriber::whereIn( 'id', $ids )->get() as $s ) {
			$out[] = (string) $s->email;
		}
		return $out;
	}

	/**
	 * Create the contact as pending, or leave an existing one as it is (FluentCRM never downgrades a
	 * subscribed contact or lifts a suppressed one on a non-forced write).
	 *
	 * @return array{id:int,status:string,email:string}|null
	 */
	public static function upsertPending( string $email ): ?array {
		if ( ! self::available() ) {
			return null;
		}
		$s = FluentCrmApi( 'contacts' )->createOrUpdate(
			array(
				'email'  => $email,
				'status' => 'pending',
			)
		);
		return $s ? array( 'id' => (int) $s->id, 'status' => (string) $s->status, 'email' => (string) $s->email ) : null;
	}

	/**
	 * The person confirmed the plugin's link (POST): the contact becomes subscribed. A bounced, complained or
	 * spammed contact stays as it is (only an administrator lifts that) and the call returns false.
	 */
	public static function subscribe( int $id ): bool {
		$s = self::available() ? \FluentCrm\App\Models\Subscriber::find( $id ) : null;
		if ( ! $s || in_array( (string) $s->status, array( 'bounced', 'complained', 'spammed' ), true ) ) {
			return false;
		}
		$s->updateStatus( 'subscribed' );
		return true;
	}

	/**
	 * @param array<int,int> $ids
	 * @return array<int,string> status by id (missing contacts are absent)
	 */
	public static function statuses( array $ids ): array {
		if ( ! $ids || ! self::available() ) {
			return array();
		}
		$out = array();
		foreach ( array_chunk( $ids, 500 ) as $chunk ) {
			foreach ( \FluentCrm\App\Models\Subscriber::whereIn( 'id', $chunk )->get() as $s ) {
				$out[ (int) $s->id ] = (string) $s->status;
			}
		}
		return $out;
	}

	/**
	 * Which of these contacts still exist. FluentCRM inactive → all of them (do not purge on a guess).
	 *
	 * @param array<int,int> $ids
	 * @return array<int,int>
	 */
	public static function existing( array $ids ): array {
		return self::available() ? array_keys( self::statuses( $ids ) ) : $ids;
	}

	/** Mark the contact bounced or complained; FluentCRM's status hooks then remove the daily profile. */
	public static function suppress( string $email, string $status ): bool {
		if ( ! self::available() || ! in_array( $status, array( 'bounced', 'complained' ), true ) ) {
			return false;
		}
		$s = \FluentCrm\App\Models\Subscriber::where( 'email', $email )->first();
		if ( ! $s ) {
			return false;
		}
		$s->updateStatus( $status );
		return true;
	}

	/** One custom email to one contact; see the class comment. */
	public static function send( int $id, string $subject, string $html, string $slug, string $title ): string {
		$admin = self::sender();
		if ( $admin === 0 ) {
			return self::REFUSED;
		}
		$previous = get_current_user_id();
		wp_set_current_user( $admin );
		try {
			$req = new \WP_REST_Request( 'POST', '/fluent-crm/v2/subscribers/' . $id . '/emails/send' );
			$req->set_header( 'Content-Type', 'application/json' );
			$req->set_body(
				wp_json_encode(
					array(
						'campaign' => array(
							'email_subject' => $subject,
							'email_body'    => $html,
							'slug'          => $slug,
						),
					)
				)
			);
			$status = rest_do_request( $req )->get_status();
		} catch ( \Throwable $e ) {
			$status = 500;
		} finally {
			wp_set_current_user( $previous );
		}
		if ( $status >= 200 && $status < 300 ) {
			global $wpdb;
			$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}fc_campaigns SET title = %s WHERE slug = %s AND type = 'custom_email_campaign'", $title, $slug ) ); // phpcs:ignore WordPress.DB.PreparedSQL
			return self::SENT;
		}
		return ( $status >= 400 && $status < 500 ) ? self::REFUSED : self::UNKNOWN;
	}

	/**
	 * This plugin's one-off campaigns older than $days, with their email rows (FluentCRM's own delete), in
	 * batches until none is left or $seconds have passed. Returns [deleted, done]; not done → the caller
	 * schedules the rest (a month of letters can be thousands of rows).
	 *
	 * @return array{0:int,1:bool}
	 */
	public static function deleteOldCampaigns( int $days, int $seconds = 20, int $batch = 200 ): array {
		if ( ! self::available() || ! class_exists( '\FluentCrm\App\Models\CustomEmailCampaign' ) ) {
			return array( 0, true );
		}
		$n     = 0;
		$old   = gmdate( 'Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS );
		$until = microtime( true ) + $seconds;
		do {
			$list = \FluentCrm\App\Models\CustomEmailCampaign::where( 'slug', 'LIKE', self::SLUG_PREFIX . '%' )->where( 'created_at', '<', $old )->orderBy( 'id' )->limit( $batch )->get();
			foreach ( $list as $campaign ) {
				$campaign->deleteWithData();
				++$n;
			}
			$done = count( $list ) < $batch;
		} while ( ! $done && microtime( true ) < $until );
		return array( $n, $done );
	}

	/** The site's first administrator (lowest ID), or 0. */
	private static function sender(): int {
		$ids = get_users(
			array(
				'role'    => 'administrator',
				'number'  => 1,
				'orderby' => 'ID',
				'order'   => 'ASC',
				'fields'  => 'ID',
			)
		);
		return $ids ? (int) $ids[0] : 0;
	}
}
