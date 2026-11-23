<?php
/**
 * Server-to-engine reads. P1 needs only the tool list: GET <server engine URL>/api/v1/systems,
 * cached one day (a failed fetch is cached 10 minutes so a down engine is not hit on every page view).
 * The cache is keyed by the address it was fetched from: whatever changes Options::serverEngineUrl()
 * (any setting it derives from, the site address, a wp-cli `option patch` that skips the settings form)
 * makes the next read fetch again — no caller has to remember to clear it.
 * Every call: no redirects (the engine never redirects its API; a redirect means a wrong or hijacked
 * address) and a response size cap.
 *
 * @package AwareWave\Oracle\Engine
 */

namespace AwareWave\Oracle\Engine;

use AwareWave\Oracle\Crypto\SiteKey;
use AwareWave\Oracle\Settings\Options;

final class EngineClient {

	/** _v2: holds {base, tools}; 0.4 and earlier used aworacle_tools for a bare list (a rollback must not read this). */
	const TOOLS_TRANSIENT = 'aworacle_tools_v2';
	const SYSTEMS_PATH    = '/api/v1/systems';
	/** The systems list is ~21 KB today (2026-11-22); 1 MB leaves room without letting a bad address fill memory. */
	const MAX_RESPONSE_BYTES = 1048576;
	const BATCH_PATH = '/api/v1/batch';
	/** Engine MAX_BATCH_ITEMS (lib/http/v1.ts). */
	const BATCH_MAX = 200;
	/** A daily result is a few KB; 200 of them stay well under this. */
	const MAX_BATCH_RESPONSE_BYTES = 8388608;

	/** @return array<string,mixed> wp_remote_* arguments every engine call uses */
	public static function requestArgs(): array {
		return array(
			'timeout'             => 5,
			'redirection'         => 0,
			'limit_response_size' => self::MAX_RESPONSE_BYTES,
		);
	}

	/** @return array<int,string> */
	public static function tools(): array {
		$base = Options::serverEngineUrl();
		if ( $base === '' ) {
			return array();
		}
		$cached = get_transient( self::TOOLS_TRANSIENT );
		if ( is_array( $cached ) && ( $cached['base'] ?? null ) === $base && is_array( $cached['tools'] ?? null ) ) {
			return $cached['tools'];
		}
		$res   = wp_remote_get( $base . self::SYSTEMS_PATH, self::requestArgs() );
		$tools = array();
		if ( ! is_wp_error( $res ) && (int) wp_remote_retrieve_response_code( $res ) === 200 ) {
			$tools = ToolList::parse( json_decode( (string) wp_remote_retrieve_body( $res ), true ) );
		}
		set_transient(
			self::TOOLS_TRANSIENT,
			array(
				'base'  => $base,
				'tools' => $tools,
			),
			$tools ? DAY_IN_SECONDS : 10 * MINUTE_IN_SECONDS
		);
		return $tools;
	}

	/**
	 * POST /api/v1/batch, signed by the site key (aud "v1"). One result per input, same order; null when the
	 * call failed as a whole (no key, network, non-200, wrong shape) — the caller then sends nothing.
	 *
	 * @param array<int,array<string,mixed>> $items 1..BATCH_MAX inputs
	 * @return array<int,array<string,mixed>>|null
	 */
	public static function batch( string $system, string $locale, array $items ): ?array {
		$base = Options::serverEngineUrl();
		$s    = Options::get();
		if ( $base === '' || ! $items || count( $items ) > self::BATCH_MAX ) {
			return null;
		}
		try {
			$req = SiteKey::signedRequest(
				array(
					'system' => $system,
					'items'  => $items,
					'locale' => $locale,
				),
				SiteKey::AUD_V1,
				$s['key_id'],
				Options::keypair()
			);
		} catch ( \InvalidArgumentException $e ) {
			return null;
		}
		$args            = self::requestArgs();
		$args['timeout'] = 60;
		$args['headers'] = $req['headers'];
		$args['body']    = $req['body'];
		$args['limit_response_size'] = self::MAX_BATCH_RESPONSE_BYTES;
		$res = wp_remote_post( $base . self::BATCH_PATH, $args );
		if ( is_wp_error( $res ) || (int) wp_remote_retrieve_response_code( $res ) !== 200 ) {
			return null;
		}
		$json    = json_decode( (string) wp_remote_retrieve_body( $res ), true );
		$results = is_array( $json ) ? ( $json['results'] ?? null ) : null;
		return ( is_array( $results ) && array_keys( $results ) === array_keys( array_values( $items ) ) ) ? $results : null;
	}

	public static function forgetTools(): void {
		delete_transient( self::TOOLS_TRANSIENT );
	}
}
