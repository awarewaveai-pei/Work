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

	/** @param list<string> $allowedGateways */
	public function __construct( bool $enabled, string $target, string $paymentsSecret, string $handoffSecret, array $allowedGateways = array() ) {
		$this->enabled         = $enabled;
		$this->target          = rtrim( $target, '/' );
		$this->paymentsSecret  = $paymentsSecret;
		$this->handoffSecret   = $handoffSecret;
		$this->allowedGateways = array_values( array_filter( array_map( 'strval', $allowedGateways ), 'strlen' ) );
	}

	public static function fromOptions(): self {
		$target = (string) get_option( self::OPT_TARGET, '' );
		return new self(
			get_option( self::OPT_ENABLED, '' ) === '1',
			self::normalizeTarget( $target ) ?? self::DEFAULT_TARGET,
			(string) get_option( self::OPT_PAYMENTS_SECRET, '' ),
			(string) get_option( self::OPT_HANDOFF_SECRET, '' ),
			(array) get_option( self::OPT_GATEWAYS, array() )
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
