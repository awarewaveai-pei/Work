<?php
/**
 * Server-to-engine reads. P1 needs only the tool list: GET <server engine URL>/api/v1/systems,
 * cached one day (a failed fetch is cached 10 minutes so a down engine is not hit on every page view).
 *
 * @package AwareWave\Oracle\Engine
 */

namespace AwareWave\Oracle\Engine;

use AwareWave\Oracle\Settings\Options;

final class EngineClient {

	const TOOLS_TRANSIENT = 'aworacle_tools';
	const SYSTEMS_PATH    = '/api/v1/systems';

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
		$res   = wp_remote_get( $base . self::SYSTEMS_PATH, array( 'timeout' => 5 ) );
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
