<?php
/**
 * Server-to-engine reads. P1 needs only the tool list: GET <server engine URL>/api/v1/systems,
 * cached one day (a failed fetch is cached 10 minutes so a down engine is not hit on every page view).
 * Every call: no redirects (the engine never redirects its API; a redirect means a wrong or hijacked
 * address) and a response size cap.
 *
 * @package AwareWave\Oracle\Engine
 */

namespace AwareWave\Oracle\Engine;

use AwareWave\Oracle\Settings\Options;

final class EngineClient {

	const TOOLS_TRANSIENT = 'aworacle_tools';
	const SYSTEMS_PATH    = '/api/v1/systems';
	/** The systems list is ~21 KB today (2026-11-22); 1 MB leaves room without letting a bad address fill memory. */
	const MAX_RESPONSE_BYTES = 1048576;

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
		$cached = get_transient( self::TOOLS_TRANSIENT );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		$base = Options::serverEngineUrl();
		if ( $base === '' ) {
			return array();
		}
		$res   = wp_remote_get( $base . self::SYSTEMS_PATH, self::requestArgs() );
		$tools = array();
		if ( ! is_wp_error( $res ) && (int) wp_remote_retrieve_response_code( $res ) === 200 ) {
			$tools = ToolList::parse( json_decode( (string) wp_remote_retrieve_body( $res ), true ) );
		}
		set_transient( self::TOOLS_TRANSIENT, $tools, $tools ? DAY_IN_SECONDS : 10 * MINUTE_IN_SECONDS );
		return $tools;
	}

	public static function forgetTools(): void {
		delete_transient( self::TOOLS_TRANSIENT );
	}
}
