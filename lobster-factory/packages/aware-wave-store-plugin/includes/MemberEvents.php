<?php
/**
 * WordPress deleted a user or changed a user's email -> the app knows (ADR 021 G10, card M10). Every user, not only
 * members who linked to the app: the plugin cannot tell who did, the app decides (no member link = recorded, nothing to
 * undo). One signed event per change, POST <target>/api/webhooks/awarewave-wp-member:
 *   {kind:"member_deleted", wp_user_id, event_id, occurred_at}
 *   {kind:"member_email_changed", wp_user_id, old_email, new_email, event_id, occurred_at}
 * same signature and site header as the payment events (Settings::paymentHeaders). Sent through Action Scheduler like
 * the payment events (its own hook, so PaymentSender keeps its order notes), retried on PaymentSender::classify's rule
 * with PaymentSender::delay's backoff; a retry carries the same job, so the same event_id. The app answers the same
 * event_id with its first result and refuses an event older than the member's latest change (next-admin migration 0184).
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class MemberEvents {

	const ACTION       = 'awstore_send_member_event';
	const GROUP        = 'aware-wave-member-events';
	const PATH         = '/api/webhooks/awarewave-wp-member';
	const MAX_ATTEMPTS = PaymentSender::MAX_ATTEMPTS;

	/** @var Settings */
	private $settings;
	/** @var HttpClient */
	private $http;
	/** @var callable(int,array):void at (0 = as soon as possible), job */
	private $schedule;
	/** @var callable():int */
	private $clock;
	/** @var callable(string):void */
	private $log;

	public function __construct( Settings $settings, HttpClient $http, ?callable $schedule = null, ?callable $clock = null, ?callable $log = null ) {
		$this->settings = $settings;
		$this->http     = $http;
		$this->clock    = $clock ?? 'time';
		$this->log      = $log ?? function ( string $line ): void {
			error_log( $line ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions -- the only trace of a dropped event
		};
		$this->schedule = $schedule ?? function ( int $at, array $job ): void {
			if ( $at <= 0 && function_exists( 'as_enqueue_async_action' ) ) {
				as_enqueue_async_action( self::ACTION, array( $job ), self::GROUP );
			} elseif ( $at > 0 && function_exists( 'as_schedule_single_action' ) ) {
				as_schedule_single_action( $at, self::ACTION, array( $job ), self::GROUP );
			} else {
				call_user_func( $this->log, 'AwareWave: Action Scheduler unavailable, member event ' . $job['event_id'] . ' not queued.' );
			}
		};
	}

	/** next-admin woo-billing.ts EVENT_ID shape. */
	public static function eventId( string $kind, int $userId ): string {
		return $kind . ':' . $userId . ':' . bin2hex( random_bytes( 12 ) );
	}

	private function stamp( string $kind, int $userId ): array {
		return array(
			'kind'        => $kind,
			'wp_user_id'  => $userId,
			'event_id'    => self::eventId( $kind, $userId ),
			'occurred_at' => gmdate( 'Y-m-d\TH:i:s\Z', (int) call_user_func( $this->clock ) ),
		);
	}

	private function queue( array $body ): void {
		call_user_func( $this->schedule, 0, array( 'event_id' => $body['event_id'], 'body' => (string) json_encode( $body, JSON_UNESCAPED_SLASHES ), 'attempt' => 0 ) );
	}

	/** delete_user (single site) / wpmu_delete_user (multisite): only the id is sent. */
	public function onDeleteUser( $userId ): void {
		$uid = (int) $userId;
		if ( $uid > 0 && $this->settings->enabled ) {
			$this->queue( $this->stamp( 'member_deleted', $uid ) );
		}
	}

	/** profile_update: only a real change of address (case and spaces ignored) is an event. */
	public function onEmailChange( int $userId, string $oldEmail, string $newEmail ): void {
		$old = strtolower( trim( $oldEmail ) );
		$new = strtolower( trim( $newEmail ) );
		if ( $userId < 1 || ! $this->settings->enabled || $old === '' || $new === '' || $old === $new ) {
			return;
		}
		$this->queue( $this->stamp( 'member_email_changed', $userId ) + array( 'old_email' => $old, 'new_email' => $new ) );
	}

	/**
	 * One send. @param array{event_id:string,body:string,attempt:int} $job
	 * @return string done | retry | final | gave_up | disabled
	 */
	public function deliver( array $job ): string {
		$eventId = (string) ( $job['event_id'] ?? '' );
		$attempt = (int) ( $job['attempt'] ?? 0 );
		if ( ! $this->settings->enabled || ! $this->settings->paymentsReady() ) {
			call_user_func( $this->log, 'AwareWave: switch off or key unset, member event ' . $eventId . ' not sent.' );
			return 'disabled';
		}
		$body = (string) ( $job['body'] ?? '' );
		$res  = $this->http->post( $this->settings->target . self::PATH, $this->settings->paymentHeaders( $body ), $body );
		$out  = PaymentSender::classify( $res['status'] );
		if ( $out === 'done' ) {
			return 'done';
		}
		$why = $res['status'] === null ? 'network ' . substr( (string) $res['error'], 0, 120 ) : 'HTTP ' . (int) $res['status'];
		if ( $out === 'final' ) {
			call_user_func( $this->log, 'AwareWave: member event ' . $eventId . ' refused (' . $why . '), not retried.' );
			return 'final';
		}
		if ( $attempt + 1 >= self::MAX_ATTEMPTS ) {
			call_user_func( $this->log, 'AwareWave: member event ' . $eventId . ' failed ' . self::MAX_ATTEMPTS . ' times (' . $why . '), given up.' );
			return 'gave_up';
		}
		$job['attempt'] = $attempt + 1;
		call_user_func( $this->schedule, (int) call_user_func( $this->clock ) + PaymentSender::delay( $attempt ), $job );
		return 'retry';
	}

	public function register(): void {
		// Multisite: delete_user only removes the user from one site; the user is gone at wpmu_delete_user.
		add_action( function_exists( 'is_multisite' ) && is_multisite() ? 'wpmu_delete_user' : 'delete_user', array( $this, 'onDeleteUser' ), 10, 1 );
		add_action(
			'profile_update',
			function ( $userId, $oldUser, $userdata = array() ) {
				$new = is_array( $userdata ) && isset( $userdata['user_email'] ) ? (string) $userdata['user_email'] : '';
				if ( $new === '' && function_exists( 'get_userdata' ) ) {
					$u   = get_userdata( (int) $userId );
					$new = $u ? (string) $u->user_email : '';
				}
				$old = is_object( $oldUser ) && isset( $oldUser->user_email ) ? (string) $oldUser->user_email : '';
				$this->onEmailChange( (int) $userId, $old, $new );
			},
			10,
			3
		);
	}
}
