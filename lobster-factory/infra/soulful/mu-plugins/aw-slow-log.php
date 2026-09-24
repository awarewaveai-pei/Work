<?php
/**
 * Plugin Name: AwareWave slow-request log
 * Description: One line to PHP's error log (the container's stderr, i.e. `docker logs`) for every request
 *              slower than AW_SLOW_REQUEST_S and every outbound HTTP call slower than AW_SLOW_HTTP_S.
 *              Written after 30-300 s stalls on soulfulexpression.org that left no trace anywhere
 *              (2026-09-24). Grep `AW_SLOW` in `docker logs soulful-wp`. Source of truth:
 *              lobster-factory/infra/soulful/mu-plugins/aw-slow-log.php (repo), copied into the container.
 *
 * Logs to error_log only: a file under wp-content would be served to the public by the web server.
 */

defined( 'ABSPATH' ) || exit;

if ( ! defined( 'AW_SLOW_REQUEST_S' ) ) { define( 'AW_SLOW_REQUEST_S', 5.0 ); }
if ( ! defined( 'AW_SLOW_HTTP_S' ) ) { define( 'AW_SLOW_HTTP_S', 2.0 ); }

$GLOBALS['aw_slow_http'] = array( 'open' => array(), 'total' => 0.0, 'calls' => 0, 'slow' => array() );

// Priority 1 = start the clock before any other filter. A request another filter short-circuits never
// reaches http_api_debug; its start stays unpopped (harmless, freed at request end).
add_filter( 'pre_http_request', static function ( $pre, $args, $url ) {
	$GLOBALS['aw_slow_http']['open'][ $url ][] = microtime( true );
	return $pre;
}, 1, 3 );

add_action( 'http_api_debug', static function ( $response, $context, $class, $args, $url ) {
	$s = &$GLOBALS['aw_slow_http'];
	if ( empty( $s['open'][ $url ] ) ) {
		return;
	}
	$took = microtime( true ) - array_pop( $s['open'][ $url ] );
	$s['total'] += $took;
	$s['calls']++;
	if ( $took >= AW_SLOW_HTTP_S ) {
		$code = is_wp_error( $response ) ? $response->get_error_code() : wp_remote_retrieve_response_code( $response );
		$s['slow'][] = sprintf( '%s=%.1fs/%s', wp_parse_url( $url, PHP_URL_HOST ), $took, $code );
		error_log( sprintf( 'AW_SLOW http host=%s took=%.2fs result=%s uri=%s', wp_parse_url( $url, PHP_URL_HOST ), $took, $code, aw_slow_uri() ) );
	}
}, 10, 5 );

register_shutdown_function( static function () {
	if ( empty( $_SERVER['REQUEST_TIME_FLOAT'] ) ) {
		return;
	}
	$took = microtime( true ) - (float) $_SERVER['REQUEST_TIME_FLOAT'];
	if ( $took < AW_SLOW_REQUEST_S ) {
		return;
	}
	global $wpdb;
	$s = $GLOBALS['aw_slow_http'];
	error_log( sprintf(
		'AW_SLOW request took=%.2fs method=%s uri=%s cli=%d queries=%d http_calls=%d http_total=%.2fs peak_mb=%d slow_http=[%s]',
		$took,
		isset( $_SERVER['REQUEST_METHOD'] ) ? $_SERVER['REQUEST_METHOD'] : '-',
		aw_slow_uri(),
		defined( 'WP_CLI' ) && WP_CLI ? 1 : 0,
		isset( $wpdb->num_queries ) ? (int) $wpdb->num_queries : -1,
		$s['calls'],
		$s['total'],
		(int) ( memory_get_peak_usage( true ) / 1048576 ),
		implode( ',', $s['slow'] )
	) );
} );

function aw_slow_uri() {
	// Path only: query strings can carry nonces, tokens and e-mail addresses.
	$uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '-';
	return substr( strtok( $uri, '?' ), 0, 200 );
}
