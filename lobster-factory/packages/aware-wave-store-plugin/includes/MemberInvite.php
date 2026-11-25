<?php
/**
 * Staff invites a member (ADR 021 D4, card M6). Staff make a one-time code for an existing account in the app; the
 * contact opens <site>/?aw_invite=<code>. Not signed in: the code rides an httponly cookie through the register or login
 * form and moves to user meta there. Signed in: user meta at once. The code is sent only once the member's CURRENT email
 * is the verified one (EmailVerification); an unverified member is sent when the verify click fires WelcomeGift::VERIFIED.
 * One signed event, POST <target>/api/webhooks/awarewave-wp-member {kind:"member_invite", wp_user_id, email,
 * email_verified, invite_code, event_id, occurred_at}, same signature and site header as the payment events
 * (Settings::paymentHeaders). event_id / occurred_at (card M10) belong to the held code: made when the member opened the
 * link, the same on every retry, so the app decides the event once and refuses it after the member was deleted; the app
 * links the member to the invited account (next-admin lib/entitlements/wp-customers.ts redeemMemberInvite) and answers.
 * The plain codes (every invite link opened, at most 3, 14 days each) live in user meta only until a success or a
 * final refusal; sent newest first; a retryable answer keeps them for 「再試一次」.
 * My Account's dashboard is the result page (one-shot for a success or refusal). A member without a code sees nothing new.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class MemberInvite {

	const QUERY       = 'aw_invite';
	const COOKIE      = 'aw_member_invite';
	/** list<array{code:string,at:int,event_id:string}>, oldest first: every invite link the member opened, at most MAX_HELD. */
	const META_CODE   = 'aware_wave_member_invite_code';
	const MAX_HELD    = 3;
	/** = next-admin lib/entitlements/identities.ts MEMBER_INVITE_DAYS (14): a code held longer is past its invite anyway,
	 *  so the plain code is dropped instead of kept forever (a member who never verifies). Change both together. */
	const CODE_TTL    = 14 * 86400;
	const META_RESULT = 'aware_wave_member_invite_result';
	const RETRY       = 'aw_member_invite_retry';
	const PATH        = '/api/webhooks/awarewave-wp-member';
	const TIMEOUT     = 5;   // runs inside login / the verify click: an app outage must not hold them long
	/** next-admin identities.ts INVITE_CODE_RE: 32 random bytes, base64url. */
	const CODE = '/^[A-Za-z0-9_-]{43}$/';

	const LINKED  = 'linked';
	const REFUSED = 'refused';
	const RETRY_VIEW = 'retry';
	const PENDING = 'pending';

	/** The app's refusal codes (wp-customers.ts) => [why, what next]; any other code reads as OTHER. */
	const REFUSALS = array(
		'invite_expired'        => array( '這個邀請已過期。', '請聯絡我們重新發一個邀請。' ),
		'invite_used'           => array( '這個邀請已經被使用過。', '如果不是你本人用的，請聯絡我們。' ),
		'invite_invalid'        => array( '這個邀請碼無效或已作廢。', '請確認連結完整；仍不行請聯絡我們重發。' ),
		'invite_email_mismatch' => array( '你的帳號 email 不是收到邀請的那一個。', '請改用收到邀請的 email 註冊或登入，或請我們把邀請改寄到這個 email。' ),
		'invite_wrong_site'     => array( '這個邀請只能在 aware-wave.com 使用。', '請到 aware-wave.com 開啟邀請連結。' ),
		'invite_org_linked'     => array( '這個單位已經有會員連上了。', '如果要換人管理，請聯絡我們。' ),
		'invite_member_linked'  => array( '你的帳號已經連在另一個單位。', '一個會員只能連一個單位，請聯絡我們處理。' ),
		'invite_not_customer'   => array( '這個單位目前不能加入會員。', '請聯絡我們確認。' ),
		'email_unverified'      => array( '你的 email 還沒確認。', '請到信箱按確認連結，確認後會自動連上。' ),
		'identity_conflict'     => array( '你的帳號和另一筆會員資料衝突。', '請聯絡我們處理。' ),
		'event_stale'           => array( '這個邀請已經不能再用（帳號狀態在那之後有變動）。', '請聯絡我們重新發一個邀請。' ),
	);
	const OTHER = array( '無法連上這個單位。', '請聯絡我們，並附上代碼：' );

	public static function isCode( string $code ): bool {
		return (bool) preg_match( self::CODE, $code );
	}

	/** A new event id for a held code: next-admin woo-billing.ts EVENT_ID shape. */
	public static function newEventId( int $userId ): string {
		return 'member_invite:' . $userId . ':' . bin2hex( random_bytes( 12 ) );
	}

	/** @return array{kind:string,wp_user_id:int,email:string,email_verified:bool,invite_code:string,event_id:string,occurred_at:string} */
	public static function body( int $userId, string $email, string $code, string $eventId, int $occurredAt ): array {
		return array(
			'kind'           => 'member_invite',
			'wp_user_id'     => $userId,
			'email'          => $email,
			'email_verified' => true,
			'invite_code'    => $code,
			'event_id'       => $eventId,
			'occurred_at'    => gmdate( 'Y-m-d\TH:i:s\Z', $occurredAt ),
		);
	}

	/**
	 * The app's answer => what the page shows. 200 = linked; the payment sender's retry class (no answer, 401, 404, 408,
	 * 429, 5xx) = retry, the code kept; any other 4xx = a final refusal with the app's code.
	 *
	 * @param array{status:int|null,body:string,error:string} $res
	 * @return array{view:string,code:string,unit:string}
	 */
	public static function outcome( array $res ): array {
		$json = json_decode( (string) $res['body'], true );
		$code = is_array( $json ) && is_string( $json['error'] ?? null ) && preg_match( '/^[a-z0-9_]{1,60}$/', $json['error'] ) ? $json['error'] : '';
		$kind = PaymentSender::classify( $res['status'] );
		if ( $kind === 'done' ) {
			$unit = is_array( $json ) && is_array( $json['organization'] ?? null ) && is_string( $json['organization']['name'] ?? null ) ? $json['organization']['name'] : '';
			return array( 'view' => self::LINKED, 'code' => '', 'unit' => $unit );
		}
		if ( $kind === 'retry' ) {
			return array( 'view' => self::RETRY_VIEW, 'code' => $code, 'unit' => '' );
		}
		return array( 'view' => self::REFUSED, 'code' => $code !== '' ? $code : 'http_' . (int) $res['status'], 'unit' => '' );
	}

	/**
	 * What the dashboard shows. A stored success or refusal wins (shown once); a code still held means not yet sent
	 * (unverified) or a retryable failure; no code and no result = nothing (a member who never had an invite).
	 *
	 * @param array{view:string,code:string,unit:string}|null $result
	 * @return array{view:string,code:string,unit:string}|null
	 */
	public static function state( ?array $result, bool $hasCode, bool $verified ): ?array {
		if ( $result !== null && in_array( $result['view'] ?? '', array( self::LINKED, self::REFUSED ), true ) ) {
			return $result;
		}
		if ( ! $hasCode ) {
			return null;
		}
		if ( ! $verified ) {
			return array( 'view' => self::PENDING, 'code' => '', 'unit' => '' );
		}
		return array( 'view' => self::RETRY_VIEW, 'code' => (string) ( $result['code'] ?? '' ), 'unit' => '' );
	}

	private static function e( string $text ): string {
		return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
	}

	/**
	 * The result block. Fixed words only, plus the unit name the app sent; everything escaped here.
	 *
	 * @param array{view:string,code:string,unit:string} $state
	 * @param array{account:string,resend:string,form:string,nonce:string} $ctx nonce = the nonce field's html
	 */
	public static function html( array $state, array $ctx ): string {
		$style = '<style>' . MyAccountDoors::CSS . '</style>';
		$box   = function ( string $inner ) use ( $style ): string {
			return $style . '<div class="awbridge-invite"><h3>單位邀請</h3>' . $inner . '</div>';
		};
		switch ( $state['view'] ) {
			case self::LINKED:
				$unit = $state['unit'] !== '' ? '〈' . self::e( $state['unit'] ) . '〉' : '你的單位';
				return $box( '<p>已連上' . $unit . '。</p><a class="button awbridge-btn" href="' . self::e( $ctx['account'] ) . '">到我的帳號</a>' );
			case self::PENDING:
				return $box( '<p>你有一個單位邀請還沒完成。請先到信箱按確認連結，確認後會自動連上。</p><a class="button awbridge-btn" href="' . self::e( $ctx['resend'] ) . '">重寄確認信</a>' );
			case self::RETRY_VIEW:
				return $box(
					'<p>暫時連不上 AwareWave，你的邀請還保留著。請稍後再試一次。</p>'
					. '<form method="post" action="' . self::e( $ctx['form'] ) . '">' . $ctx['nonce']
					. '<input type="hidden" name="action" value="' . self::e( self::RETRY ) . '">'
					. '<button type="submit" class="button awbridge-btn">再試一次</button></form>'
				);
			default:
				$known = self::REFUSALS[ $state['code'] ] ?? null;
				$lines = $known ?? array( self::OTHER[0], self::OTHER[1] . $state['code'] );
				$extra = $state['code'] === 'email_unverified' ? ' <a href="' . self::e( $ctx['resend'] ) . '">重寄確認信</a>' : '';
				return $box( '<p>' . self::e( $lines[0] ) . '</p><p>' . self::e( $lines[1] ) . $extra . '</p>' );
		}
	}

	// ---- the send, with its storage injected (tests) ----

	/** @var Settings */
	private $settings;
	/** @var HttpClient */
	private $http;
	/** @var Members */
	private $members;
	/** @var SummaryCache|null */
	private $cache;
	/** @var array{get:callable,set:callable,delete:callable} user meta */
	private $meta;
	/** @var callable():int */
	private $clock;

	/** @param array{get:callable,set:callable,delete:callable}|null $meta (uid, key[, value]) */
	public function __construct( Settings $settings, HttpClient $http, Members $members, ?SummaryCache $cache = null, ?array $meta = null, ?callable $clock = null ) {
		$this->clock    = $clock ?? 'time';
		$this->settings = $settings;
		$this->http     = $http;
		$this->members  = $members;
		$this->cache    = $cache;
		$this->meta     = $meta ?? array(
			'get'    => function ( int $uid, string $key ) {
				return get_user_meta( $uid, $key, true );
			},
			'set'    => function ( int $uid, string $key, $value ): void {
				update_user_meta( $uid, $key, $value );
			},
			'delete' => function ( int $uid, string $key ): void {
				delete_user_meta( $uid, $key );
			},
		);
	}

	private function get( int $uid, string $key ) {
		return call_user_func( $this->meta['get'], $uid, $key );
	}

	/** @param list<array{code:string,at:int,event_id:string}> $held */
	private function save( int $uid, array $held ): void {
		if ( $held === array() ) {
			call_user_func( $this->meta['delete'], $uid, self::META_CODE );
		} else {
			call_user_func( $this->meta['set'], $uid, self::META_CODE, array_values( $held ) );
		}
	}

	/** The held codes, oldest first. One older than CODE_TTL (or malformed, or with no time) is deleted here, never sent.
	 *  One held before event ids existed gets its id here, once (stored, so its retries carry the same one). */
	private function held( int $uid ): array {
		$stored = $this->get( $uid, self::META_CODE );
		if ( ! is_array( $stored ) || $stored === array() ) {
			if ( $stored !== '' && $stored !== null ) {
				$this->save( $uid, array() );
			}
			return array();
		}
		$now  = (int) call_user_func( $this->clock );
		$live = array();
		foreach ( $stored as $h ) {
			$at = is_array( $h ) ? (int) ( $h['at'] ?? 0 ) : 0;
			if ( is_array( $h ) && is_string( $h['code'] ?? null ) && self::isCode( $h['code'] ) && $at > 0 && $now - $at <= self::CODE_TTL ) {
				$id     = is_string( $h['event_id'] ?? null ) && $h['event_id'] !== '' ? $h['event_id'] : self::newEventId( $uid );
				$live[] = array( 'code' => $h['code'], 'at' => $at, 'event_id' => $id );
			}
		}
		if ( $live !== $stored ) {
			$this->save( $uid, $live );
		}
		return $live;
	}

	/**
	 * A code for this member (from the link or the cookie). Added to the list, never replacing another: a link is a bare
	 * GET, so a forged one must not push out a real code (critic 2026-11-24 m), and staff void-and-reissue (A then B) must
	 * leave B sendable (Codex 2026-11-25). Past MAX_HELD the oldest is dropped.
	 */
	public function hold( int $uid, string $code ): bool {
		if ( $uid < 1 || ! self::isCode( $code ) ) {
			return false;
		}
		$held = $this->held( $uid );
		foreach ( $held as $h ) {
			if ( hash_equals( $h['code'], $code ) ) {
				return false;
			}
		}
		$held[] = array( 'code' => $code, 'at' => (int) call_user_func( $this->clock ), 'event_id' => self::newEventId( $uid ) );
		$this->save( $uid, array_slice( $held, -self::MAX_HELD ) );
		call_user_func( $this->meta['delete'], $uid, self::META_RESULT );
		return true;
	}

	/** @return array{email:string,verified:bool}|null */
	private function member( int $uid ): ?array {
		$m = $this->members->member( $uid );
		if ( $m === null ) {
			return null;
		}
		return array( 'email' => $m['email'], 'verified' => EmailVerification::isVerified( $m['verified_email'], $m['email'] ) );
	}

	/**
	 * Sends the held codes, newest first, if the member's current email is verified. A success clears them all; a final
	 * refusal drops that code and tries the next; a retryable answer stops and keeps the rest. When all are refused the
	 * page shows the newest one's reason (the link the member just opened). null = nothing sent (no code, no member, or
	 * not verified yet: the verify click sends them). The answer is stored for the dashboard.
	 *
	 * @return array{view:string,code:string,unit:string}|null
	 */
	public function process( int $uid ): ?array {
		$held = $this->held( $uid );
		if ( $held === array() ) {
			return null;
		}
		$m = $this->member( $uid );
		if ( $m === null || ! $m['verified'] ) {
			return null;
		}
		$first = null;
		while ( $held !== array() ) {
			$top  = $held[ count( $held ) - 1 ];
			$raw  = (string) json_encode( self::body( $uid, $m['email'], $top['code'], $top['event_id'], $top['at'] ), JSON_UNESCAPED_SLASHES );
			$res  = $this->settings->paymentsReady()
				? $this->http->post( $this->settings->target . self::PATH, $this->settings->paymentHeaders( $raw ), $raw, self::TIMEOUT )
				: array( 'status' => null, 'body' => '', 'error' => 'not_configured' );
			$out  = self::outcome( $res );
			if ( $out['view'] === self::LINKED ) {
				$held = array();   // linked: the other codes are for the same member and no longer needed
				if ( $this->cache !== null ) {
					$this->cache->forget( $uid );   // My Account's summary now has a unit
				}
				break;
			}
			if ( $out['view'] === self::RETRY_VIEW ) {
				break;   // kept, this one and the older ones, for 再試一次
			}
			array_pop( $held );   // a final refusal: used up, never kept past the answer
			$first = $first ?? $out;
			$out   = $first;
		}
		$this->save( $uid, $held );
		call_user_func( $this->meta['set'], $uid, self::META_RESULT, $out );
		return $out;
	}

	/** What the dashboard draws now; a success or refusal is cleared once read. */
	public function current( int $uid ): ?array {
		$result = $this->get( $uid, self::META_RESULT );
		$result = is_array( $result ) ? $result : null;
		$m      = $this->member( $uid );
		$state  = self::state( $result, $this->held( $uid ) !== array(), $m !== null && $m['verified'] );
		if ( $state !== null && in_array( $state['view'], array( self::LINKED, self::REFUSED ), true ) ) {
			call_user_func( $this->meta['delete'], $uid, self::META_RESULT );
		}
		return $state;
	}

	// ---- WordPress wiring (thin) ----

	public function register(): void {
		add_action( 'init', array( $this, 'landing' ), 20 );
		add_action( 'user_register', array( $this, 'onRegister' ), 20 );
		add_action( 'wp_login', array( $this, 'onLogin' ), 20, 2 );
		add_action( WelcomeGift::VERIFIED, array( $this, 'process' ) );
		add_action( 'woocommerce_account_dashboard', array( $this, 'render' ), 1 );
		add_action( 'woocommerce_before_customer_login_form', array( $this, 'loginHint' ) );
		add_action( 'admin_post_' . self::RETRY, array( $this, 'retry' ) );
	}

	private function accountUrl(): string {
		return function_exists( 'wc_get_page_permalink' ) ? wc_get_page_permalink( 'myaccount' ) : home_url( '/' );
	}

	/** <site>/?aw_invite=<code>: keep the code for this member (or the browser, until they sign in), go to My Account. */
	public function landing(): void {
		if ( ! isset( $_GET[ self::QUERY ] ) ) {
			return;
		}
		$code = sanitize_text_field( wp_unslash( $_GET[ self::QUERY ] ) );
		if ( self::isCode( $code ) ) {
			$uid = get_current_user_id();
			if ( $uid > 0 ) {
				$this->hold( $uid, $code );
				$this->process( $uid );
			} else {
				setcookie( self::COOKIE, $code, array( 'expires' => time() + 3600, 'path' => '/', 'secure' => is_ssl(), 'httponly' => true, 'samesite' => 'Lax' ) );
			}
		}
		wp_safe_redirect( $this->accountUrl() );
		exit;
	}

	/** Only a member registering themself takes the browser's code (staff adding a customer in wp-admin does not). */
	public function onRegister( $userId ): void {
		if ( get_current_user_id() === 0 ) {
			$this->adoptCookie( $userId );
		}
	}

	/** Register or login carried the cookie: the code becomes the member's, the cookie is dropped. */
	public function adoptCookie( $userId ): void {
		$code = isset( $_COOKIE[ self::COOKIE ] ) ? sanitize_text_field( wp_unslash( $_COOKIE[ self::COOKIE ] ) ) : '';
		if ( $code === '' ) {
			return;
		}
		$this->hold( (int) $userId, $code );
		setcookie( self::COOKIE, '', array( 'expires' => time() - 3600, 'path' => '/', 'secure' => is_ssl(), 'httponly' => true, 'samesite' => 'Lax' ) );
		unset( $_COOKIE[ self::COOKIE ] );
	}

	public function onLogin( $login, $user ): void {
		if ( is_object( $user ) && isset( $_COOKIE[ self::COOKIE ] ) ) {
			$this->adoptCookie( (int) $user->ID );
			$this->process( (int) $user->ID );
		}
	}

	public function loginHint(): void {
		if ( isset( $_COOKIE[ self::COOKIE ] ) ) {
			echo '<div class="woocommerce-info">你正在接受一個單位邀請：請用收到邀請的 email 註冊或登入，完成後會自動連上。</div>';
		}
	}

	public function render(): void {
		$uid   = get_current_user_id();
		$state = $uid > 0 ? $this->current( $uid ) : null;
		if ( $state === null ) {
			return;
		}
		echo self::html(
			$state,
			array(
				'account' => $this->accountUrl(),
				'resend'  => EmailVerification::resendUrl(),
				'form'    => admin_url( 'admin-post.php' ),
				'nonce'   => wp_nonce_field( self::RETRY, '_wpnonce', true, false ),
			)
		); // phpcs:ignore WordPress.Security.EscapeOutput -- html() escapes every value
	}

	public function retry(): void {
		$uid = get_current_user_id();
		if ( $uid > 0 && check_admin_referer( self::RETRY ) ) {
			$this->process( $uid );
		}
		wp_safe_redirect( $this->accountUrl() );
		exit;
	}
}
