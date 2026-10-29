<?php
/**
 * Delivers one queued payment event to next-admin POST <target>/api/webhooks/payments/woo, signed with
 * X-AwareWave-Payment-Signature (a reseller site with a key id adds X-AwareWave-Site and signs Ed25519, never HMAC). 2xx = done (order note). 404 (provider not switched on yet), 408, 429, 5xx and
 * 401 and network errors = retry with exponential backoff, at most MAX_ATTEMPTS sends. Any other 4xx
 * (400/409/422…) is final: the order gets a note with the error code (the server raises an ops incident for the
 * refusals it parsed). A subscription_paid whose subscription has ended by send time is dropped (job subscription_id).
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class PaymentSender {

	const ACTION       = 'awbridge_send_payment_event';
	const GROUP        = 'aware-wave-payments';
	const PATH         = '/api/webhooks/payments/woo';
	const MAX_ATTEMPTS = 20;
	const BASE_DELAY   = 60;
	const MAX_DELAY    = 21600; // 6 h; 20 sends span about 3.5 days

	/** @var HttpClient */
	private $http;
	/** @var Queue */
	private $queue;
	/** @var Shop */
	private $shop;
	/** @var callable():int */
	private $clock;

	public function __construct( HttpClient $http, Queue $queue, Shop $shop, ?callable $clock = null ) {
		$this->http  = $http;
		$this->queue = $queue;
		$this->shop  = $shop;
		$this->clock = $clock ?? 'time';
	}

	/** @return string done | retry | final */
	public static function classify( ?int $status ): string {
		if ( $status !== null && $status >= 200 && $status < 300 ) {
			return 'done';
		}
		// 401 = the two sides' secrets differ (rotation, typo): a config fault the route answers before any ops incident.
		if ( $status === null || $status < 100 || $status === 401 || $status === 404 || $status === 408 || $status === 429 || $status >= 500 ) {
			return 'retry';
		}
		return 'final';
	}

	public static function delay( int $attempt ): int {
		return (int) min( self::MAX_DELAY, self::BASE_DELAY * ( 2 ** min( $attempt, 20 ) ) );
	}

	/**
	 * @param array{event_id:string,body:string,note_id:int,attempt:int} $job
	 * @return string done | retry | final | gave_up | disabled | stale
	 */
	public function deliver( array $job, Settings $settings ): string {
		$eventId = (string) ( $job['event_id'] ?? '' );
		$noteId  = (int) ( $job['note_id'] ?? 0 );
		$attempt = (int) ( $job['attempt'] ?? 0 );
		if ( ! $settings->enabled || ! $settings->paymentsReady() ) {
			$this->shop->addNote( $noteId, 'AwareWave：付款事件開關已關或密鑰未設，事件 ' . $eventId . ' 未送出；請人工對帳。' );
			return 'disabled';
		}
		// A retry can land after the subscription ended (its cancel event already delivered); a late paid would reopen it.
		$subId = (int) ( $job['subscription_id'] ?? 0 );
		if ( $subId > 0 ) {
			$sub = $this->shop->subscription( $subId );
			if ( $sub && in_array( $sub['status'] ?? '', array( 'cancelled', 'expired' ), true ) ) {
				$this->shop->addNote( $noteId, 'AwareWave：訂閱 #' . $subId . ' 已結束，付款事件 ' . $eventId . ' 不再送出。' );
				return 'stale';
			}
		}
		$body = (string) $job['body'];
		$res  = $this->http->post(
			$settings->target . self::PATH,
			$settings->paymentHeaders( $body ),
			$body
		);
		$status  = $res['status'];
		$outcome = self::classify( $status );
		if ( $outcome === 'done' ) {
			$this->shop->addNote( $noteId, 'AwareWave：已送付款事件 ' . $eventId . '（HTTP ' . $status . '）。' );
			return 'done';
		}
		$code = $status === null ? '' : self::errorCode( $res['body'] );
		$why  = $status === null ? '網路錯誤 ' . substr( $res['error'], 0, 120 ) : 'HTTP ' . $status . ' ' . $code;
		if ( $outcome === 'final' ) {
			// The route raises an incident only for a refusal it parsed (route.ts: parse / apply codes), not for a body it could not read.
			$incident = in_array( $status, array( 400, 409, 422 ), true ) && $code !== '' && ! in_array( $code, array( 'invalid_json', 'body_too_large' ), true );
			$this->shop->addNote( $noteId, 'AwareWave：付款事件 ' . $eventId . ' 被拒（' . $why . '），不重試；' . ( $incident ? '控制面已開 ops 事件，' : '' ) . '請對帳。' );
			return 'final';
		}
		if ( $attempt + 1 >= self::MAX_ATTEMPTS ) {
			$this->shop->addNote( $noteId, 'AwareWave：付款事件 ' . $eventId . ' 已送 ' . self::MAX_ATTEMPTS . ' 次仍失敗（' . $why . '），停止重試；請人工登記。' );
			return 'gave_up';
		}
		$job['attempt'] = $attempt + 1;
		$this->queue->scheduleAt( (int) call_user_func( $this->clock ) + self::delay( $attempt ), $job );
		return 'retry';
	}

	private static function errorCode( string $body ): string {
		$decoded = json_decode( $body, true );
		$code    = is_array( $decoded ) && isset( $decoded['error'] ) && is_string( $decoded['error'] ) ? $decoded['error'] : '';
		return preg_match( '/^[a-z0-9_]{1,60}$/', $code ) ? $code : '';
	}
}
