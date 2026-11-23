<?php
/**
 * My Account's product summary: one signed POST <target>/api/auth/wp-summary (same hand-off signature as wp-handoff, via
 * Settings::handoffPost), 2 s timeout, a success kept 60 s per WordPress user id. next-admin decides what the member
 * holds and every label; this class only checks the shape and sorts a refusal into what the page shows. The one table
 * of codes is the header of next-admin app/api/auth/wp-summary/route.ts; VIEW below is its 「外掛該顯示什麼」 column.
 * A failure is never answered from WooCommerce orders (blueprint §2A.4: it would show the wrong thing).
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class Summary {

	const PATH    = '/api/auth/wp-summary';
	const TTL     = 60;
	const TIMEOUT = 2;

	/** the exit screen: 「暫時讀不到你的產品清單」 + workspace + refresh */
	const FALLBACK   = 'fallback';
	/** draw nothing: this site is not meant to show a product area */
	const HIDDEN     = 'hidden';
	const UNVERIFIED = 'unverified';
	const UNLINKED   = 'unlinked';

	/** 4xx error code => view; any other code, a 5xx, a timeout or an unreadable answer = FALLBACK. */
	const VIEW = array(
		'site_disabled'            => self::HIDDEN,
		'login_source_not_allowed' => self::HIDDEN,
		'source_disabled'          => self::HIDDEN,
		'email_unverified'         => self::UNVERIFIED,
		'not_this_account'         => self::UNLINKED,
		'brand_unit_unsupported'   => self::UNLINKED,
		'not_a_member'             => self::UNLINKED,
	);

	/** @var Settings */
	private $settings;
	/** @var HttpClient */
	private $http;
	/** @var SummaryCache */
	private $cache;
	/** @var callable():int */
	private $clock;
	/** @var callable():string */
	private $nonce;

	public function __construct( Settings $settings, HttpClient $http, SummaryCache $cache, ?callable $clock = null, ?callable $nonce = null ) {
		$this->settings = $settings;
		$this->http     = $http;
		$this->cache    = $cache;
		$this->clock    = $clock ?? 'time';
		$this->nonce    = $nonce ?? function () {
			return bin2hex( random_bytes( 16 ) );
		};
	}

	/** @return array{wp_user_id:int,ts:int,nonce:string,key_id?:string} no product_key: that would be a wp-handoff body. */
	public static function body( int $userId, int $ts, string $nonce, string $keyId = '' ): array {
		$body = array( 'wp_user_id' => $userId, 'ts' => $ts, 'nonce' => $nonce );
		if ( $keyId !== '' ) {
			$body['key_id'] = $keyId;
		}
		return $body;
	}

	/**
	 * @return array{ok:true,data:array}|array{ok:false,view:string,code:string}
	 */
	public function fetch( int $userId ): array {
		$cached = $this->cache->get( $userId );
		if ( $cached !== null && self::valid( $cached ) ) {
			return array( 'ok' => true, 'data' => $cached );
		}
		$body = self::body( $userId, (int) call_user_func( $this->clock ), (string) call_user_func( $this->nonce ), $this->settings->keyId );
		$res  = $this->settings->handoffPost( $this->http, self::PATH, $body, self::TIMEOUT );
		if ( $res['status'] === null ) {
			return array( 'ok' => false, 'view' => self::FALLBACK, 'code' => 'timeout' );
		}
		$json = json_decode( $res['body'], true );
		if ( $res['status'] === 200 && is_array( $json ) && ( $json['ok'] ?? false ) === true ) {
			$data = self::normalize( $json );
			if ( $data === null ) {
				return array( 'ok' => false, 'view' => self::FALLBACK, 'code' => 'bad_response' );
			}
			$this->cache->set( $userId, $data, self::TTL );
			return array( 'ok' => true, 'data' => $data );
		}
		$code = is_array( $json ) && is_string( $json['error'] ?? null ) && preg_match( '/^[a-z0-9_]{1,60}$/', $json['error'] ) ? $json['error'] : '';
		// a 5xx is the app being down whatever it says; only a 4xx names a member-level state
		$view = $res['status'] >= 400 && $res['status'] < 500 && isset( self::VIEW[ $code ] ) ? self::VIEW[ $code ] : self::FALLBACK;
		return array( 'ok' => false, 'view' => $view, 'code' => $code !== '' ? $code : 'http_' . $res['status'] );
	}

	/** The member's cached summary is stale (a payment event just reached the app). */
	public function forget( int $userId ): void {
		$this->cache->forget( $userId );
	}

	/** A cached value is trusted only if it still passes the shape check (a plugin upgrade may change the shape). */
	private static function valid( array $data ): bool {
		return isset( $data['unit'], $data['products'] ) && is_string( $data['unit'] ) && is_array( $data['products'] ) && isset( $data['balance'] ) && isset( $data['frozen'] );
	}

	/**
	 * Only what the page draws, and only if every part has the expected type (else null: the answer is not trusted).
	 *
	 * @return array{unit:string,balance:int|float,frozen:bool,products:list<array{key:string,name:string,label:string,can_enter:bool}>}|null
	 */
	public static function normalize( array $json ): ?array {
		$unit   = is_array( $json['unit'] ?? null ) ? ( $json['unit']['name'] ?? null ) : null;
		$wallet = $json['wallet'] ?? null;
		$rows   = $json['products'] ?? null;
		if ( ! is_string( $unit ) || ! is_array( $wallet ) || ! is_array( $rows ) ) {
			return null;
		}
		$balance = $wallet['balance'] ?? null;
		if ( ! ( is_int( $balance ) || is_float( $balance ) ) || $balance < 0 || ! is_bool( $wallet['frozen'] ?? null ) ) {
			return null;
		}
		$products = array();
		foreach ( $rows as $p ) {
			if ( ! is_array( $p ) || ! is_string( $p['key'] ?? null ) || ! preg_match( MyAccountDoors::KEY, $p['key'] ) || ! is_string( $p['name'] ?? null ) || ! is_bool( $p['can_enter'] ?? null ) ) {
				return null;
			}
			$label = is_array( $p['right'] ?? null ) ? ( $p['right']['label'] ?? null ) : null;
			if ( $label !== null && ! is_string( $label ) ) {
				return null;
			}
			$products[] = array( 'key' => $p['key'], 'name' => $p['name'], 'label' => (string) $label, 'can_enter' => $p['can_enter'] );
		}
		return array( 'unit' => $unit, 'balance' => $balance, 'frozen' => $wallet['frozen'], 'products' => $products );
	}

	/** @return array<string,string> product_key => name of every product the member can enter (the buttons' list). */
	public static function held( array $outcome ): array {
		$held = array();
		if ( ( $outcome['ok'] ?? false ) === true ) {
			foreach ( $outcome['data']['products'] as $p ) {
				if ( $p['can_enter'] ) {
					$held[ $p['key'] ] = $p['name'];
				}
			}
		}
		return $held;
	}
}
