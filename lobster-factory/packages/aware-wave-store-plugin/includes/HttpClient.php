<?php
/**
 * One JSON POST. Production: WpHttpClient (wp_remote_post).
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

interface HttpClient {

	/**
	 * status null = no HTTP answer (network error, timeout).
	 *
	 * @param array<string,string> $headers
	 * @return array{status:int|null,body:string,error:string}
	 */
	public function post( string $url, array $headers, string $body ): array;
}
