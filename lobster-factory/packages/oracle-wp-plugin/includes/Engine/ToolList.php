<?php
/**
 * Embeddable tool slugs from the engine's GET /api/v1/systems body (WP-free).
 * The engine's system ids (`systems[].id`) are its embeddable page slugs (ziwei-doushu lib/site.ts PAGE_SLUGS);
 * a `pages: string[]` field, if the engine ever sends one, wins. Anything that is not a legal slug is dropped.
 *
 * @package AwareWave\Oracle\Engine
 */

namespace AwareWave\Oracle\Engine;

use AwareWave\Oracle\Embed\EmbedUrl;

final class ToolList {

	/**
	 * @param mixed $json decoded response body
	 * @return array<int,string>
	 */
	public static function parse( $json ): array {
		if ( ! is_array( $json ) ) {
			return array();
		}
		$raw = array();
		if ( isset( $json['pages'] ) && is_array( $json['pages'] ) ) {
			$raw = $json['pages'];
		} elseif ( isset( $json['systems'] ) && is_array( $json['systems'] ) ) {
			foreach ( $json['systems'] as $s ) {
				if ( is_array( $s ) && isset( $s['id'] ) ) {
					$raw[] = $s['id'];
				}
			}
		}
		$out = array();
		foreach ( $raw as $slug ) {
			if ( is_string( $slug ) && EmbedUrl::isSlug( $slug ) && ! in_array( $slug, $out, true ) ) {
				$out[] = $slug;
			}
		}
		return $out;
	}
}
