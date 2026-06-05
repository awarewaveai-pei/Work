<?php
/**
 * HttpRenderer — concrete Renderer that fetches a URL over HTTP and hashes a STABLE marker (the
 * <title> plus a body-length bucket), not the full volatile HTML, so dynamic noise (nonces, csrf
 * tokens) does not cause false rollbacks while a real content change still moves the hash.
 *
 * A cache-busting query arg is appended so we read fresh output rather than a cached page. (For sites
 * fronted by a CDN/object cache, the CacheStrategy purge runs first; this arg is the local belt.)
 *
 * @package AwareWave\WpBridge\Transaction\Impl
 */

namespace AwareWave\WpBridge\Transaction\Impl;

use AwareWave\WpBridge\Transaction\RenderObservation;
use AwareWave\WpBridge\Transaction\Renderer;

final class HttpRenderer implements Renderer {

	public function render( string $url ): RenderObservation {
		$bust     = ( strpos( $url, '?' ) === false ? '?' : '&' ) . 'awbridge_nocache=' . (string) time();
		$fetchUrl = $url . $bust;
		$headers  = array( 'Cache-Control' => 'no-cache' );

		// When the site must render itself via an INTERNAL address (behind a proxy / port-mapped in a
		// container, where the public host:port isn't reachable from the server itself), connect to
		// AWBRIDGE_RENDER_INTERNAL_BASE but preserve the original Host header so WordPress still sees
		// its canonical host and does not redirect. Unset in normal production (the public URL is
		// reachable from the box) — then it renders the URL as-is.
		if ( defined( 'AWBRIDGE_RENDER_INTERNAL_BASE' ) && AWBRIDGE_RENDER_INTERNAL_BASE ) {
			$parts            = wp_parse_url( $url );
			$headers['Host']  = $parts['host'] . ( isset( $parts['port'] ) ? ':' . $parts['port'] : '' );
			$pathQuery        = ( isset( $parts['path'] ) ? $parts['path'] : '/' ) . ( isset( $parts['query'] ) ? '?' . $parts['query'] : '' );
			$fetchUrl         = rtrim( (string) AWBRIDGE_RENDER_INTERNAL_BASE, '/' ) . $pathQuery . $bust;
		}

		$response = wp_remote_get(
			$fetchUrl,
			array(
				'timeout'     => 15,
				'redirection' => 0, // never follow redirects when verifying — a redirect IS a change to detect
				'sslverify'   => false, // local/staging may use self-signed certs
				'headers'     => $headers,
			)
		);

		if ( is_wp_error( $response ) ) {
			// Cannot observe -> the transaction treats this as verify failure (fail-closed).
			throw new \RuntimeException( 'render failed: ' . $response->get_error_message() );
		}

		$status = (int) wp_remote_retrieve_response_code( $response );
		$body   = (string) wp_remote_retrieve_body( $response );

		return new RenderObservation( $url, $status, $this->stableHash( $body ) );
	}

	/** Hash a stable structural marker: the <title> + a coarse body-length bucket. */
	private function stableHash( string $html ): string {
		$title = '';
		if ( preg_match( '#<title[^>]*>(.*?)</title>#is', $html, $m ) ) {
			$title = trim( $m[1] );
		}
		$lengthBucket = (string) intdiv( strlen( $html ), 256 );
		return hash( 'sha256', $title . '|' . $lengthBucket );
	}
}
