<?php
/**
 * Billing settings (ADR 017 4b-2): one switch, default OFF, gates payment events, the email-verification
 * checkout gate and the My Account door buttons. Secrets live only in wp_options, entered by an admin on
 * Products → AwareWave 付款; never in git.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class Settings {

	const OPT_ENABLED         = 'aware_wave_payments_enabled';
	const OPT_TARGET          = 'aware_wave_payments_target';
	const OPT_PAYMENTS_SECRET = 'aware_wave_payments_secret';
	const OPT_HANDOFF_SECRET  = 'aware_wave_handoff_secret';
	const OPT_GATEWAYS        = 'aware_wave_payments_gateways';
	// Reseller mode (ADR 017 4c-3): a key id switches the site from the shared HMAC secrets to its own Ed25519 keys.
	const OPT_SITE_KEY_ID     = 'aware_wave_site_key_id';
	const OPT_SITE_KEYPAIR    = 'aware_wave_site_keypair';
	const OPT_HANDOFF_KEYPAIR = 'aware_wave_handoff_keypair';
	// Sign-up gift (WelcomeGift): the WooCommerce product id given once to each verified member; 0 = no gift.
	const OPT_WELCOME_PRODUCT = 'aware_wave_welcome_product_id';
	const DEFAULT_TARGET      = 'https://app.aware-wave.com';

	/** @var bool */
	public $enabled;
	/** @var string base URL, no trailing slash */
	public $target;
	/** @var string */
	public $paymentsSecret;
	/** @var string */
	public $handoffSecret;
	/** @var list<string> payment method ids that take the money before the order is processing; default none */
	public $allowedGateways;
	/** @var string '' = aware-wave.com (HMAC); else the key_id registered on /ops/sellers (Ed25519) */
	public $keyId;
	/** @var string base64 sodium keypair for payment events; never leaves this site */
	public $siteKeypair;
	/** @var string base64 sodium keypair for door handoffs (a different key on purpose) */
	public $handoffKeypair;
	/** @var int sign-up gift product id; 0 = none */
	public $welcomeProductId;

	/** @param list<string> $allowedGateways */
	public function __construct( bool $enabled, string $target, string $paymentsSecret, string $handoffSecret, array $allowedGateways = array(), string $keyId = '', string $siteKeypair = '', string $handoffKeypair = '', int $welcomeProductId = 0 ) {
		$this->enabled         = $enabled;
		$this->target          = rtrim( $target, '/' );
		$this->paymentsSecret  = $paymentsSecret;
		$this->handoffSecret   = $handoffSecret;
		$this->allowedGateways = array_values( array_filter( array_map( 'strval', $allowedGateways ), 'strlen' ) );
		$this->keyId           = $keyId;
		$this->siteKeypair     = $siteKeypair;
		$this->handoffKeypair  = $handoffKeypair;
		$this->welcomeProductId = max( 0, $welcomeProductId );
	}

	public function isReseller(): bool {
		return $this->keyId !== '';
	}

	/** Can payment events be signed in the mode this site is in? */
	public function paymentsReady(): bool {
		return $this->isReseller() ? ( self::keyIdUsable( $this->keyId ) && Signature::keypairUsable( $this->siteKeypair ) ) : self::secretUsable( $this->paymentsSecret );
	}

	public function handoffReady(): bool {
		return $this->isReseller() ? ( self::keyIdUsable( $this->keyId ) && Signature::keypairUsable( $this->handoffKeypair ) ) : self::secretUsable( $this->handoffSecret );
	}

	/** @return array<string,string> headers for a payment event: with a key id Ed25519 only, never an HMAC. */
	public function paymentHeaders( string $body ): array {
		$headers = array( 'Content-Type' => 'application/json' );
		if ( $this->isReseller() ) {
			$headers[ Signature::SITE_HEADER ]    = $this->keyId;
			$headers[ Signature::PAYMENT_HEADER ] = Signature::signWithKeypair( $body, $this->siteKeypair );
		} else {
			$headers[ Signature::PAYMENT_HEADER ] = Signature::sign( $body, $this->paymentsSecret );
		}
		return $headers;
	}

	public function handoffSignature( string $body ): string {
		return $this->isReseller() ? Signature::signWithKeypair( $body, $this->handoffKeypair ) : Signature::sign( $body, $this->handoffSecret );
	}

	/** Same shape as the control plane's seller_sites.key_id check (migration 0133). */
	public static function keyIdUsable( string $keyId ): bool {
		return (bool) preg_match( '/^[a-z0-9][a-z0-9-]{1,23}$/', $keyId );
	}

	public static function fromOptions(): self {
		$target = (string) get_option( self::OPT_TARGET, '' );
		return new self(
			get_option( self::OPT_ENABLED, '' ) === '1',
			self::normalizeTarget( $target ) ?? self::DEFAULT_TARGET,
			(string) get_option( self::OPT_PAYMENTS_SECRET, '' ),
			(string) get_option( self::OPT_HANDOFF_SECRET, '' ),
			(array) get_option( self::OPT_GATEWAYS, array() ),
			(string) get_option( self::OPT_SITE_KEY_ID, '' ),
			(string) get_option( self::OPT_SITE_KEYPAIR, '' ),
			(string) get_option( self::OPT_HANDOFF_KEYPAIR, '' ),
			(int) get_option( self::OPT_WELCOME_PRODUCT, 0 )
		);
	}

	/**
	 * Printable ASCII only, ≥32: next-admin trims and requires 32 (lib/payments/hmac.ts MIN_PAYMENT_SECRET); refusing
	 * whitespace here means PHP and Node can never disagree on what the key is.
	 */
	public static function secretUsable( string $secret ): bool {
		return (bool) preg_match( '/^[\x21-\x7E]{32,512}$/', $secret );
	}

	/** https only, except a local development host. Returns the base without trailing slash, or null. */
	public static function normalizeTarget( string $url ): ?string {
		$url   = trim( $url );
		$parts = parse_url( $url );
		if ( ! is_array( $parts ) || empty( $parts['host'] ) || ! empty( $parts['query'] ) || ! empty( $parts['fragment'] ) || ! empty( $parts['user'] ) ) {
			return null;
		}
		$host   = strtolower( $parts['host'] );
		$scheme = strtolower( $parts['scheme'] ?? '' );
		$local  = $host === 'localhost' || $host === '127.0.0.1' || substr( $host, -10 ) === '.localhost';
		if ( $scheme !== 'https' && ! ( $scheme === 'http' && $local ) ) {
			return null;
		}
		$port = isset( $parts['port'] ) ? ':' . (int) $parts['port'] : '';
		$path = rtrim( $parts['path'] ?? '', '/' );
		return $scheme . '://' . $host . $port . $path;
	}
}
