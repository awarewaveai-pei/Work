<?php
/**
 * HttpClient over wp_remote_post. No redirects: a signed body goes only to the configured URL.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

final class WpHttpClient implements HttpClient {

	public function post( string $url, array $headers, string $body ): array {
		$res = wp_remote_post(
			$url,
			array(
				'headers'     => $headers,
				'body'        => $body,
				'timeout'     => 15,
				'redirection' => 0,
				'data_format' => 'body',
			)
		);
		if ( is_wp_error( $res ) ) {
			return array( 'status' => null, 'body' => '', 'error' => $res->get_error_message() );
		}
		return array( 'status' => (int) wp_remote_retrieve_response_code( $res ), 'body' => (string) wp_remote_retrieve_body( $res ), 'error' => '' );
	}
}
