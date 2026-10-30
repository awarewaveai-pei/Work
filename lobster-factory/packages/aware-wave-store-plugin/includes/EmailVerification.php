<?php
/**
 * Member email verification (ADR 017 4b-2, critic 2026-10-25 M). WooCommerce never proves a member owns their
 * email, and next-admin creates a billing account on a first payment only when the event says email_verified:
 * true -- so the plugin proves it: a signed, 48-hour, single-use link mailed on registration and on every email
 * change. A click stores the verified ADDRESS in user meta aware_wave_email_verified; a member is verified only
 * while that meta equals their current email, so changing the email un-verifies without any extra step.
 *
 * Link token = "<uid>.<expires>.<id>.<sig>", sig = base64url(HMAC-SHA256("uid|email|expires|id", site key)).
 * The id is kept in user meta (one outstanding link; a resend replaces it) and deleted on use.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class EmailVerification {

	const META_VERIFIED = 'aware_wave_email_verified';
	const META_PENDING  = 'aware_wave_email_verify_pending';
	const QUERY_VERIFY  = 'awbridge_verify_email';
	const QUERY_RESEND  = 'awbridge_resend_verify';
	const TTL           = 172800; // 48 h

	public static function normalizeEmail( string $email ): string {
		return strtolower( trim( $email ) );
	}

	/** The only place email_verified is decided: the stored verified address is the member's current one. */
	public static function isVerified( string $verifiedEmail, string $currentEmail ): bool {
		$current = self::normalizeEmail( $currentEmail );
		return $current !== '' && self::normalizeEmail( $verifiedEmail ) === $current;
	}

	public static function makeToken( int $userId, string $email, int $expires, string $id, string $key ): string {
		return $userId . '.' . $expires . '.' . $id . '.' . self::sig( $userId, $email, $expires, $id, $key );
	}

	/**
	 * Checks a clicked token against the member as they are now.
	 *
	 * @return array{ok:bool,user_id:int,error:string} error: malformed | expired | bad_signature | used
	 */
	public static function check( string $token, string $currentEmail, string $pendingId, int $now, string $key ): array {
		if ( ! preg_match( '/^([1-9][0-9]{0,18})\.([0-9]{1,12})\.([A-Za-z0-9]{16,64})\.([A-Za-z0-9_-]{43})$/', $token, $m ) ) {
			return array( 'ok' => false, 'user_id' => 0, 'error' => 'malformed' );
		}
		$userId  = (int) $m[1];
		$expires = (int) $m[2];
		$fail    = function ( string $error ) use ( $userId ): array {
			return array( 'ok' => false, 'user_id' => $userId, 'error' => $error );
		};
		// Signature first: an email changed since mailing fails here, as does a forged id or expiry.
		if ( ! hash_equals( self::sig( $userId, $currentEmail, $expires, $m[3], $key ), $m[4] ) ) {
			return $fail( 'bad_signature' );
		}
		if ( $now > $expires ) {
			return $fail( 'expired' );
		}
		if ( $pendingId === '' || ! hash_equals( $pendingId, $m[3] ) ) {
			return $fail( 'used' );
		}
		return array( 'ok' => true, 'user_id' => $userId, 'error' => '' );
	}

	private static function sig( int $userId, string $email, int $expires, string $id, string $key ): string {
		$raw = hash_hmac( 'sha256', $userId . '|' . self::normalizeEmail( $email ) . '|' . $expires . '|' . $id, $key, true );
		return rtrim( strtr( base64_encode( $raw ), '+/', '-_' ), '=' );
	}

	// ---- WordPress wiring (not unit-tested; thin) ----

	public function register(): void {
		add_action( 'user_register', array( $this, 'onRegister' ) );
		add_action( 'profile_update', array( $this, 'onProfileUpdate' ), 10, 2 );
		add_action( 'init', array( $this, 'handleRequests' ) );
		add_action( 'woocommerce_account_dashboard', array( $this, 'dashboardNotice' ), 5 );
	}

	public function onRegister( $userId ): void {
		self::send( (int) $userId );
	}

	public function onProfileUpdate( $userId, $oldUser ): void {
		$user = get_userdata( (int) $userId );
		if ( ! $user || ! is_object( $oldUser ) ) {
			return;
		}
		if ( self::normalizeEmail( (string) $user->user_email ) !== self::normalizeEmail( (string) $oldUser->user_email ) ) {
			self::send( (int) $userId );
		}
	}

	/** Mails a fresh link (replacing any outstanding one). Returns false when there is no such member or mail failed. */
	public static function send( int $userId ): bool {
		$user = get_userdata( $userId );
		if ( ! $user || ! is_email( $user->user_email ) ) {
			return false;
		}
		$id = wp_generate_password( 32, false, false );
		update_user_meta( $userId, self::META_PENDING, $id );
		$token = self::makeToken( $userId, (string) $user->user_email, time() + self::TTL, $id, self::key() );
		$link  = add_query_arg( self::QUERY_VERIFY, rawurlencode( $token ), home_url( '/' ) );
		$body  = "你好，\n\n請按下面的連結確認這是你的信箱（48 小時內有效，只能用一次）：\n\n" . $link
			. "\n\n確認後才能購買 AwareWave 的訂閱與點數。如果不是你本人申請，請忽略這封信。\n";
		return (bool) wp_mail( $user->user_email, '請確認你的 AwareWave 帳號信箱', $body );
	}

	public static function isUserVerified( int $userId ): bool {
		$user = get_userdata( $userId );
		if ( ! $user ) {
			return false;
		}
		return self::isVerified( (string) get_user_meta( $userId, self::META_VERIFIED, true ), (string) $user->user_email );
	}

	public static function resendUrl(): string {
		return wp_nonce_url( add_query_arg( self::QUERY_RESEND, '1', home_url( '/' ) ), 'awbridge_resend_verify' );
	}

	public function handleRequests(): void {
		if ( isset( $_GET[ self::QUERY_VERIFY ] ) ) {
			$this->verifyClick( sanitize_text_field( wp_unslash( $_GET[ self::QUERY_VERIFY ] ) ) );
		} elseif ( isset( $_GET[ self::QUERY_RESEND ] ) ) {
			$this->resendClick();
		}
	}

	private function verifyClick( string $token ): void {
		$uid  = (int) strtok( $token, '.' );
		$user = $uid > 0 ? get_userdata( $uid ) : false;
		$res  = $user
			? self::check( $token, (string) $user->user_email, (string) get_user_meta( $uid, self::META_PENDING, true ), time(), self::key() )
			: array( 'ok' => false, 'error' => 'malformed' );
		if ( $res['ok'] ) {
			update_user_meta( $uid, self::META_VERIFIED, self::normalizeEmail( (string) $user->user_email ) );
			delete_user_meta( $uid, self::META_PENDING );
			do_action( WelcomeGift::VERIFIED, $uid ); // the sign-up gift, if one is set (WelcomeGift)
			$this->notice( '信箱已確認，可以購買了。', 'success' );
		} else {
			$this->notice( '這個確認連結已失效（過期、已用過，或信箱已更改）。請登入後在「我的帳號」重寄確認信。', 'error' );
		}
		wp_safe_redirect( $this->accountUrl() );
		exit;
	}

	private function resendClick(): void {
		if ( ! is_user_logged_in() || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ?? '' ) ), 'awbridge_resend_verify' ) ) {
			return;
		}
		$uid  = get_current_user_id();
		$gate = 'awbridge_verify_resent_' . $uid;
		if ( get_transient( $gate ) ) {
			$this->notice( '確認信剛寄出，請稍等一分鐘再試。', 'notice' );
		} elseif ( self::send( $uid ) ) {
			set_transient( $gate, 1, 60 );
			$this->notice( '確認信已寄出，請到信箱按連結。', 'success' );
		} else {
			$this->notice( '確認信寄送失敗，請稍後再試或聯絡我們。', 'error' );
		}
		wp_safe_redirect( $this->accountUrl() );
		exit;
	}

	public function dashboardNotice(): void {
		$uid = get_current_user_id();
		if ( $uid < 1 || self::isUserVerified( $uid ) ) {
			return;
		}
		echo '<div class="woocommerce-info">你的信箱還沒確認，確認後才能購買訂閱與點數。 <a href="' . esc_url( self::resendUrl() ) . '">重寄確認信</a></div>';
	}

	private function notice( string $message, string $type ): void {
		if ( function_exists( 'wc_add_notice' ) && function_exists( 'WC' ) && WC()->session ) {
			wc_add_notice( $message, $type );
		}
	}

	private function accountUrl(): string {
		return function_exists( 'wc_get_page_permalink' ) ? wc_get_page_permalink( 'myaccount' ) : home_url( '/' );
	}

	private static function key(): string {
		return wp_salt( 'auth' ) . '|awbridge-email-verify';
	}
}
