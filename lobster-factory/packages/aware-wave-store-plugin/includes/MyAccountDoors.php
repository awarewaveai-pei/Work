<?php
/**
 * My Account 「進入」 buttons (ADR 017 4b-4, WordPress side): the member's workspace (next-admin's portal launcher, key
 * "portal": what they hold, what they can still buy, every product's works -- aware-wave.com members only, a seller's
 * members buy from the seller) and one per product the member bought (product meta _awarewave_product_key). A press asks next-admin, server to server, POST <target>/api/auth/wp-handoff with
 * {wp_user_id, product_key, ts, nonce} signed by X-AwareWave-Handoff-Signature (its own secret,
 * aware_wave_handoff_secret; a reseller site adds key_id to the body and signs Ed25519 with aware_wave_handoff_keypair), and on {ok:true,url} sends the browser to that one-time door link. Whether the
 * member still holds the product is the server's call (403 product_not_held; the workspace needs no product); the list
 * here only picks buttons, and only for a member whose current email is the verified one (EmailVerification).
 * Contract: next-admin lib/auth/sources/awarewave-wp.ts.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class MyAccountDoors {

	const ACTION = 'awbridge_door';
	/** next-admin WORKSPACE_KEY: the member's workspace (portal launcher: every product, held or not). */
	const WORKSPACE = 'portal';
	const PATH   = '/api/auth/wp-handoff';
	const KEY    = '/^[a-z0-9][a-z0-9_.-]{0,99}$/';

	/** @return array{wp_user_id:int,product_key:string,ts:int,nonce:string,key_id?:string} key_id only on a reseller site. */
	public static function body( int $userId, string $productKey, int $ts, string $nonce, string $keyId = '' ): array {
		$body = array( 'wp_user_id' => $userId, 'product_key' => $productKey, 'ts' => $ts, 'nonce' => $nonce );
		if ( $keyId !== '' ) {
			$body['key_id'] = $keyId;
		}
		return $body;
	}

	/**
	 * The 「進入」 buttons, in order: the workspace first (aware-wave.com only: a seller's members have none here, the
	 * server refuses them), then each held product. render() and handle() read this one list. A product whose key was
	 * set to the reserved "portal" is never a door (next-admin reads that key as the workspace).
	 *
	 * @param array<string,string> $held product_key => name
	 * @return array<string,string>
	 */
	public static function doors( array $held, bool $reseller ): array {
		unset( $held[ self::WORKSPACE ] );
		return $reseller ? $held : array( self::WORKSPACE => '我的工作區' ) + $held;
	}

	/** Why a press is refused before any request is sent, or null. The member's CURRENT email must be the verified one
	 *  (EmailVerification): next-admin only knows the email it verified, so a member who changed it here and skipped the
	 *  confirmation mail would otherwise still enter (Codex 2026-10-30). */
	public static function refusal( bool $emailVerified, array $doors, string $key ): ?string {
		if ( ! $emailVerified ) {
			return 'email_unverified';
		}
		return isset( $doors[ $key ] ) ? null : 'not_offered';
	}

	public static function message( string $code ): string {
		if ( $code === 'email_unverified' ) {
			return '請先到信箱確認你的 email（我的帳號頁可重寄確認信）';
		}
		if ( $code === 'product_not_held' ) {
			return '尚未開通這個產品';
		}
		if ( $code === 'not_a_member' ) {
			return '你的工作區還在開通中：剛完成 email 確認請過幾分鐘再試；一直無法進入請聯絡我們';
		}
		return '暫時無法進入，請稍後再試';
	}

	/**
	 * The door link must be https on the target's own domain (app.aware-wave.com → *.aware-wave.com), so a
	 * misconfigured or hostile answer cannot send members elsewhere.
	 */
	public static function allowedRedirect( string $url, string $target ): bool {
		$u = parse_url( $url );
		$t = parse_url( $target );
		if ( ! is_array( $u ) || ! is_array( $t ) || empty( $u['host'] ) || empty( $t['host'] ) || ! empty( $u['user'] ) ) {
			return false;
		}
		if ( strtolower( $u['scheme'] ?? '' ) !== 'https' ) {
			return false;
		}
		$host   = strtolower( $u['host'] );
		$labels = explode( '.', strtolower( $t['host'] ) );
		$parent = count( $labels ) >= 3 ? implode( '.', array_slice( $labels, 1 ) ) : implode( '.', $labels );
		return $host === $parent || substr( $host, -strlen( '.' . $parent ) ) === '.' . $parent;
	}

	// ---- WordPress wiring ----

	/** @var Settings */
	private $settings;
	/** @var Shop */
	private $shop;
	/** @var HttpClient */
	private $http;

	public function __construct( Settings $settings, Shop $shop, HttpClient $http ) {
		$this->settings = $settings;
		$this->shop     = $shop;
		$this->http     = $http;
	}

	public function register(): void {
		add_action( 'woocommerce_account_dashboard', array( $this, 'render' ) );
		add_action( 'admin_post_' . self::ACTION, array( $this, 'handle' ) );
	}

	/** @return array<string,string> product_key => product name, from the member's paid orders. */
	private function heldProducts( int $userId ): array {
		$found  = array();
		$orders = wc_get_orders( array( 'customer_id' => $userId, 'status' => array( 'wc-processing', 'wc-completed' ), 'limit' => 200 ) );
		foreach ( $orders as $order ) {
			foreach ( $order->get_items( 'line_item' ) as $item ) {
				$key = $this->shop->productMeta( (int) $item->get_product_id() )['product_key'];
				if ( preg_match( self::KEY, $key ) && ! isset( $found[ $key ] ) ) {
					$found[ $key ] = (string) $item->get_name();
				}
			}
		}
		return $found;
	}

	public function render(): void {
		$uid = get_current_user_id();
		if ( $uid < 1 || ! $this->settings->handoffReady() ) {
			return;
		}
		if ( ! EmailVerification::isUserVerified( $uid ) ) {
			echo '<p class="awbridge-doors">' . esc_html( self::message( 'email_unverified' ) ) . ' <a href="' . esc_url( EmailVerification::resendUrl() ) . '">重寄確認信</a></p>';
			return;
		}
		echo '<h3>我的 AwareWave 產品</h3><ul class="awbridge-doors" style="list-style:none;margin:0;padding:0">';
		// also for a member with nothing yet: the workspace shows what they can still get
		foreach ( self::doors( $this->heldProducts( $uid ), $this->settings->isReseller() ) as $key => $name ) {
			echo '<li style="margin:0 0 8px"><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
			wp_nonce_field( self::ACTION );
			echo '<input type="hidden" name="action" value="' . esc_attr( self::ACTION ) . '">';
			echo '<input type="hidden" name="product_key" value="' . esc_attr( $key ) . '">';
			echo esc_html( $name ) . ' <button type="submit" class="button">進入</button></form></li>';
		}
		echo '</ul>';
	}

	public function handle(): void {
		$back = function_exists( 'wc_get_page_permalink' ) ? wc_get_page_permalink( 'myaccount' ) : home_url( '/' );
		$uid  = get_current_user_id();
		if ( $uid < 1 || ! check_admin_referer( self::ACTION ) ) {
			wp_safe_redirect( $back );
			exit;
		}
		$key = sanitize_text_field( wp_unslash( $_POST['product_key'] ?? '' ) );
		// the workspace needs no order lookup (up to 200 orders); a product key does
		$doors = self::doors( $key === self::WORKSPACE ? array() : $this->heldProducts( $uid ), $this->settings->isReseller() );
		$why   = $this->settings->handoffReady() ? self::refusal( EmailVerification::isUserVerified( $uid ), $doors, $key ) : 'not_offered';
		if ( $why !== null ) {
			$this->fail( $why, $back );
		}
		$body = (string) json_encode( self::body( $uid, $key, time(), bin2hex( random_bytes( 16 ) ), $this->settings->keyId ), JSON_UNESCAPED_SLASHES );
		$res  = $this->http->post(
			$this->settings->target . self::PATH,
			array( 'Content-Type' => 'application/json', Signature::HANDOFF_HEADER => $this->settings->handoffSignature( $body ) ),
			$body
		);
		$json = json_decode( $res['body'], true );
		$url  = is_array( $json ) && ( $json['ok'] ?? false ) === true && is_string( $json['url'] ?? null ) ? $json['url'] : '';
		if ( $res['status'] === 200 && $url !== '' && self::allowedRedirect( $url, $this->settings->target ) ) {
			$host = strtolower( (string) parse_url( $url, PHP_URL_HOST ) );
			add_filter(
				'allowed_redirect_hosts',
				function ( $hosts ) use ( $host ) {
					$hosts[] = $host;
					return $hosts;
				}
			);
			wp_safe_redirect( $url, 302 );
			exit;
		}
		$this->fail( is_array( $json ) && is_string( $json['error'] ?? null ) ? $json['error'] : 'unavailable', $back );
	}

	private function fail( string $code, string $back ): void {
		if ( function_exists( 'wc_add_notice' ) ) {
			wc_add_notice( self::message( $code ), 'error' );
		}
		wp_safe_redirect( $back );
		exit;
	}
}
