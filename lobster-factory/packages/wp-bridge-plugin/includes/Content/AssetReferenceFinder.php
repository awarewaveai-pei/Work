<?php
/**
 * AssetReferenceFinder — which posts on this site still contain a given file URL fragment.
 *
 * The controller (next-admin lib/content/r2-delete-guard.ts) asks this before it deletes a stored image or
 * video, so a file a post still shows is never deleted. It replaces the controller's search through /wp/v2,
 * which needs an application password (a site with Wordfence "disable application passwords" cannot answer).
 *
 * Searched: post_content + post_excerpt of every post type except revisions, and every post meta value
 * (page builders, SEO images), for every status except trash and auto-draft. A match must not be followed by
 * a character that can continue an object key (same rule as contentReferences() in r2-delete-guard.ts), so
 * designs/a.png does not match designs/a.png2.webp. More candidates than MAX_CANDIDATES -> error: the
 * caller refuses the delete rather than guess.
 *
 * @package AwareWave\WpBridge\Content
 */

namespace AwareWave\WpBridge\Content;

final class AssetReferenceFinder {

	public const MAX_NEEDLES    = 8;
	public const MIN_NEEDLE_LEN = 6;
	public const MAX_NEEDLE_LEN = 300;
	public const MAX_CANDIDATES = 500;

	/** @var \wpdb|object */
	private $wpdb;

	/** @param \wpdb|object $wpdb injected so the class is testable without WordPress. */
	public function __construct( $wpdb ) {
		$this->wpdb = $wpdb;
	}

	/**
	 * The needles from a request body, or null when the body is not {"match": [strings]} within limits.
	 *
	 * @param mixed $payload decoded JSON body.
	 * @return string[]|null
	 */
	public static function needles( $payload ): ?array {
		if ( ! is_array( $payload ) || ! isset( $payload['match'] ) || ! is_array( $payload['match'] ) ) {
			return null;
		}
		$out = array();
		foreach ( $payload['match'] as $m ) {
			if ( ! is_string( $m ) ) {
				return null;
			}
			$len = strlen( $m );
			if ( $len < self::MIN_NEEDLE_LEN || $len > self::MAX_NEEDLE_LEN ) {
				return null;
			}
			$out[] = $m;
		}
		$out = array_values( array_unique( $out ) );
		return ( $out === array() || count( $out ) > self::MAX_NEEDLES ) ? null : $out;
	}

	/** True when $haystack contains a needle not followed by a key-continuing character (case-insensitive). */
	public static function references( string $haystack, array $needles ): bool {
		$hay = strtolower( $haystack );
		foreach ( $needles as $n ) {
			$needle = strtolower( $n );
			$len    = strlen( $needle );
			for ( $i = strpos( $hay, $needle ); $i !== false; $i = strpos( $hay, $needle, $i + 1 ) ) {
				$next = substr( $hay, $i + $len, 1 );
				if ( substr( $needle, -1 ) === '/' || $next === '' || ! preg_match( '/[a-z0-9._~%-]/', $next ) ) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * @param string[] $needles from needles().
	 * @return array{ok:true,references:array<int,array{id:int,type:string,status:string}>}|array{ok:false,error:string}
	 */
	public function find( array $needles ): array {
		$db    = $this->wpdb;
		$posts = $db->prefix . 'posts';
		$meta  = $db->prefix . 'postmeta';
		$likes = array();
		foreach ( $needles as $n ) {
			$likes[] = '%' . $db->esc_like( $n ) . '%';
		}
		$limit  = self::MAX_CANDIDATES + 1;
		$alive  = "p.post_type <> 'revision' AND p.post_status NOT IN ('trash','auto-draft')";
		$inBody = implode( ' OR ', array_fill( 0, count( $likes ), '(p.post_content LIKE %s OR p.post_excerpt LIKE %s)' ) );
		$inMeta = implode( ' OR ', array_fill( 0, count( $likes ), 'm.meta_value LIKE %s' ) );

		$bodyArgs = array();
		foreach ( $likes as $l ) {
			$bodyArgs[] = $l;
			$bodyArgs[] = $l;
		}
		$bodySql = $db->prepare(
			"SELECT p.ID AS id, p.post_type AS type, p.post_status AS status, CONCAT(p.post_content, ' ', p.post_excerpt) AS text FROM `{$posts}` p WHERE {$alive} AND ({$inBody}) LIMIT {$limit}",
			...$bodyArgs
		);
		$metaSql = $db->prepare(
			"SELECT p.ID AS id, p.post_type AS type, p.post_status AS status, m.meta_value AS text FROM `{$meta}` m JOIN `{$posts}` p ON p.ID = m.post_id WHERE {$alive} AND ({$inMeta}) LIMIT {$limit}",
			...$likes
		);
		if ( ! is_string( $bodySql ) || ! is_string( $metaSql ) ) {
			return array( 'ok' => false, 'error' => 'query_prepare_failed' );
		}

		$found = array();
		foreach ( array( $bodySql, $metaSql ) as $sql ) {
			$rows = $db->get_results( $sql, 'ARRAY_A' );
			if ( ! is_array( $rows ) || $db->last_error !== '' ) {
				return array( 'ok' => false, 'error' => 'query_failed' );
			}
			if ( count( $rows ) > self::MAX_CANDIDATES ) {
				return array( 'ok' => false, 'error' => 'too_many_candidates' );
			}
			foreach ( $rows as $r ) {
				$id = (int) $r['id'];
				if ( ! isset( $found[ $id ] ) && self::references( (string) $r['text'], $needles ) ) {
					$found[ $id ] = array( 'id' => $id, 'type' => (string) $r['type'], 'status' => (string) $r['status'] );
				}
			}
		}
		return array( 'ok' => true, 'references' => array_values( $found ) );
	}
}
