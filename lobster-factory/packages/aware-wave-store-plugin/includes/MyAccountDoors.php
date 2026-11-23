<?php
/**
 * My Account 「進入」 buttons (ADR 017 4b-4, WordPress side). aware-wave.com members: the page draws what next-admin says
 * (Summary: POST <target>/api/auth/wp-summary -- unit, wallet, every product with its label and whether the member can
 * enter; blueprint §2A.4, ADR 021 G13), not WooCommerce orders. When the app cannot be read the page says so and keeps
 * only the workspace button; it never falls back to orders. A reseller site (key_id) has no summary yet and keeps the
 * order list (heldProducts). A press asks next-admin, server to server, POST <target>/api/auth/wp-handoff with
 * {wp_user_id, product_key, ts, nonce} signed by X-AwareWave-Handoff-Signature (its own secret,
 * aware_wave_handoff_secret; a reseller site adds key_id to the body and signs Ed25519 with aware_wave_handoff_keypair), and on {ok:true,url} sends the browser to that one-time door link. Whether the
 * member still holds the product is the server's call (403 product_not_held; the workspace, key "portal", needs no
 * product); the form's key is checked here against the summary, never trusted, and only for a member whose current
 * email is the verified one (EmailVerification).
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

	/** Why a press by a member whose summary was read is refused before any request is sent, or null (aware-wave.com). The
	 *  workspace needs no product, so it never waits on the summary; a product key must be one the summary lists as enterable. */
	public static function pressRefusal( bool $emailVerified, ?array $summary, string $key ): ?string {
		if ( ! $emailVerified ) {
			return 'email_unverified';
		}
		if ( $key === self::WORKSPACE ) {
			return null;
		}
		if ( $summary === null || ( $summary['ok'] ?? false ) !== true ) {
			return 'unavailable';
		}
		return isset( Summary::held( $summary )[ $key ] ) ? null : 'not_offered';
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

	const CSS = '.awbridge-doors{list-style:none;margin:0 0 12px;padding:0}.awbridge-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 8px}.awbridge-name{flex:1 1 12em}.awbridge-doors form{margin:0}.awbridge-actions{display:flex;flex-wrap:wrap;gap:8px}.awbridge-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;box-sizing:border-box}';

	private static function e( string $text ): string {
		return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
	}

	private static function pressForm( string $formUrl, string $nonceHtml, string $key, string $button ): string {
		return '<form method="post" action="' . self::e( $formUrl ) . '">' . $nonceHtml
			. '<input type="hidden" name="action" value="' . self::e( self::ACTION ) . '">'
			. '<input type="hidden" name="product_key" value="' . self::e( $key ) . '">'
			. '<button type="submit" class="button awbridge-btn">' . self::e( $button ) . '</button></form>';
	}

	/**
	 * The whole My Account block for one Summary::fetch() answer. Every word of a product row comes from the app's answer;
	 * the fixed words are the page's own frame and the table of refusals in the route header. Everything is escaped here.
	 *
	 * @param array{ok:bool,data?:array,view?:string,code?:string} $outcome
	 * @param array{form:string,nonce:string,resend:string,back:string,workspace:bool} $ctx nonce = the nonce field's html
	 */
	public static function html( array $outcome, array $ctx ): string {
		$style = '<style>' . self::CSS . '</style>';
		if ( ( $outcome['ok'] ?? false ) !== true ) {
			$view = (string) ( $outcome['view'] ?? Summary::FALLBACK );
			if ( $view === Summary::HIDDEN ) {
				return '';
			}
			if ( $view === Summary::UNVERIFIED ) {
				return '<p class="awbridge-doors">' . self::e( self::message( 'email_unverified' ) ) . ' <a href="' . self::e( $ctx['resend'] ) . '">重寄確認信</a></p>';
			}
			if ( $view === Summary::UNLINKED ) {
				return '<p class="awbridge-doors">尚未連結，請聯絡我們</p>';
			}
			// the app could not be read: say so, keep the workspace, offer a refresh -- never a list built from orders
			return $style . '<h3>我的 AwareWave 產品</h3><p>暫時讀不到你的產品清單。</p><div class="awbridge-actions">'
				. ( $ctx['workspace'] ? self::pressForm( $ctx['form'], $ctx['nonce'], self::WORKSPACE, '進入我的工作台' ) : '' )
				. '<a class="button awbridge-btn" href="' . self::e( $ctx['back'] ) . '">重新整理</a></div>';
		}
		$data = $outcome['data'];
		if ( $data['products'] === array() && ! $ctx['workspace'] ) {
			return '';
		}
		if ( $data['products'] === array() ) {
			return '<p class="awbridge-doors">尚未連結，請聯絡我們</p>';
		}
		$out = $style . '<h3>我的 AwareWave 產品</h3>';
		if ( $data['unit'] !== '' ) {
			$out .= '<p class="awbridge-unit">' . self::e( $data['unit'] ) . '　點數 ' . self::e( number_format( (float) $data['balance'] ) ) . ( $data['frozen'] ? '（凍結中）' : '' ) . '</p>';
		}
		$out .= '<ul class="awbridge-doors">';
		foreach ( $data['products'] as $p ) {
			$out .= '<li class="awbridge-row"><span class="awbridge-name">' . self::e( $p['name'] ) . '</span>'
				. ( $p['label'] !== '' ? ' <span class="awbridge-label">' . self::e( $p['label'] ) . '</span>' : '' )
				. ( $p['can_enter'] ? self::pressForm( $ctx['form'], $ctx['nonce'], $p['key'], '進入' ) : '' ) . '</li>';
		}
		$out .= '</ul>';
		if ( $ctx['workspace'] ) {
			$out .= self::pressForm( $ctx['form'], $ctx['nonce'], self::WORKSPACE, '進入我的工作台' );
		}
		return $out;
	}

	// ---- WordPress wiring ----

	/** @var Settings */
	private $settings;
	/** @var Shop */
	private $shop;
	/** @var HttpClient */
	private $http;
	/** @var Summary */
	private $summary;

	public function __construct( Settings $settings, Shop $shop, HttpClient $http, Summary $summary ) {
		$this->settings = $settings;
		$this->shop     = $shop;
		$this->http     = $http;
		$this->summary  = $summary;
	}

	public function register(): void {
		add_action( 'woocommerce_account_dashboard', array( $this, 'render' ) );
		add_action( 'admin_post_' . self::ACTION, array( $this, 'handle' ) );
	}

	/** Reseller sites only (their summary is not specified yet).
	 *  @return array<string,string> product_key => product name, from the member's paid orders. */
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
		$reseller = $this->settings->isReseller();
		if ( ! EmailVerification::isUserVerified( $uid ) ) {
			$outcome = array( 'ok' => false, 'view' => Summary::UNVERIFIED, 'code' => 'email_unverified' );
		} elseif ( $reseller ) {
			$rows = array();
			foreach ( self::doors( $this->heldProducts( $uid ), true ) as $key => $name ) {
				$rows[] = array( 'key' => $key, 'name' => $name, 'label' => '', 'can_enter' => true );
			}
			$outcome = array( 'ok' => true, 'data' => array( 'unit' => '', 'balance' => 0, 'frozen' => false, 'products' => $rows ) );
		} else {
			$outcome = $this->summary->fetch( $uid );
		}
		echo self::html(
			$outcome,
			array(
				'form'      => admin_url( 'admin-post.php' ),
				'nonce'     => wp_nonce_field( self::ACTION, '_wpnonce', true, false ),
				'resend'    => EmailVerification::resendUrl(),
				'back'      => function_exists( 'wc_get_page_permalink' ) ? wc_get_page_permalink( 'myaccount' ) : home_url( '/' ),
				'workspace' => ! $reseller,
			)
		); // phpcs:ignore WordPress.Security.EscapeOutput -- html() escapes every value
	}

	public function handle(): void {
		$back = function_exists( 'wc_get_page_permalink' ) ? wc_get_page_permalink( 'myaccount' ) : home_url( '/' );
		$uid  = get_current_user_id();
		if ( $uid < 1 || ! check_admin_referer( self::ACTION ) ) {
			wp_safe_redirect( $back );
			exit;
		}
		$key      = sanitize_text_field( wp_unslash( $_POST['product_key'] ?? '' ) );
		$verified = EmailVerification::isUserVerified( $uid );
		if ( ! $this->settings->handoffReady() ) {
			$why = 'not_offered';
		} elseif ( $this->settings->isReseller() ) {
			// the key is checked against the member's orders on a seller's site (no summary there yet)
			$why = self::refusal( $verified, self::doors( $this->heldProducts( $uid ), true ), $key );
		} else {
			// the form's key is only ever checked against the app's summary (the workspace needs none)
			$why = self::pressRefusal( $verified, $verified && $key !== self::WORKSPACE ? $this->summary->fetch( $uid ) : null, $key );
		}
		if ( $why !== null ) {
			$this->fail( $why, $back );
		}
		$res  = $this->settings->handoffPost( $this->http, self::PATH, self::body( $uid, $key, time(), bin2hex( random_bytes( 16 ) ), $this->settings->keyId ) );
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
