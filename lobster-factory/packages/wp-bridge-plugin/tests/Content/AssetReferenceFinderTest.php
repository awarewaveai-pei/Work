<?php
/**
 * AssetReferenceFinder with a fake $wpdb: payload limits, key-boundary matching, both queries, fail-closed.
 */

namespace AwareWave\WpBridge\Tests\Content;

use AwareWave\WpBridge\Content\AssetReferenceFinder;
use PHPUnit\Framework\TestCase;

final class FakeRefWpdb {
	public $prefix = 'wp_';
	public $last_error = '';
	/** @var array<int,mixed> one entry per get_results() call, in order. */
	public $results = array();
	public $queries = array();
	public $prepareFails = false;

	public function esc_like( $s ) {
		return addcslashes( $s, '_%\\' );
	}

	public function prepare( $query, ...$args ) {
		if ( $this->prepareFails ) {
			return null;
		}
		$this->queries[] = array( $query, $args );
		return 'SQL' . count( $this->queries );
	}

	public function get_results( $sql, $output = null ) {
		return array_shift( $this->results );
	}
}

final class AssetReferenceFinderTest extends TestCase {

	private const KEY = 'designs/2026/11/model-a.png';

	public function test_needles_accepts_a_list_of_strings_and_rejects_everything_else(): void {
		$this->assertSame( array( self::KEY ), AssetReferenceFinder::needles( array( 'match' => array( self::KEY, self::KEY ) ) ) );
		$this->assertNull( AssetReferenceFinder::needles( null ) );
		$this->assertNull( AssetReferenceFinder::needles( array( 'match' => array() ) ) );
		$this->assertNull( AssetReferenceFinder::needles( array( 'match' => 'designs/x.png' ) ) );
		$this->assertNull( AssetReferenceFinder::needles( array( 'match' => array( 'a.png' ) ) ) ); // too short: would match half the site
		$this->assertNull( AssetReferenceFinder::needles( array( 'match' => array( self::KEY, 7 ) ) ) );
		$this->assertNull( AssetReferenceFinder::needles( array( 'match' => array_map( fn( $i ) => "designs/$i.png", range( 1, 9 ) ) ) ) );
	}

	public function test_a_match_must_end_where_the_key_ends(): void {
		$n = array( self::KEY );
		$this->assertTrue( AssetReferenceFinder::references( '<img src="https://r2.example/' . self::KEY . '">', $n ) );
		$this->assertTrue( AssetReferenceFinder::references( 'https://r2.example/DESIGNS/2026/11/MODEL-A.PNG', $n ) );
		$this->assertTrue( AssetReferenceFinder::references( 'ends with ' . self::KEY, $n ) );
		$this->assertFalse( AssetReferenceFinder::references( self::KEY . '2.webp', $n ) );
		$this->assertTrue( AssetReferenceFinder::references( 'designs/2026/11/model-a.png2 and designs/2026/11/model-a.png?x=1', $n ) );
		$this->assertTrue( AssetReferenceFinder::references( 'video/abc/720p.mp4', array( 'video/abc/' ) ) );
		$this->assertFalse( AssetReferenceFinder::references( 'nothing here', $n ) );
	}

	public function test_finds_posts_by_content_and_by_meta_once_each_skipping_near_misses(): void {
		$db          = new FakeRefWpdb();
		$db->results = array(
			array(
				array( 'id' => '12', 'type' => 'post', 'status' => 'draft', 'text' => 'x ' . self::KEY . '"' ),
				array( 'id' => '13', 'type' => 'page', 'status' => 'publish', 'text' => self::KEY . '2.webp' ),
			),
			array(
				array( 'id' => '12', 'type' => 'post', 'status' => 'draft', 'text' => self::KEY ),
				array( 'id' => '40', 'type' => 'product', 'status' => 'publish', 'text' => 'a:1:{s:3:"img";s:9:"' . self::KEY . '";}' ),
			),
		);
		$r = ( new AssetReferenceFinder( $db ) )->find( array( self::KEY ) );
		$this->assertSame(
			array( 'ok' => true, 'references' => array(
				array( 'id' => 12, 'type' => 'post', 'status' => 'draft' ),
				array( 'id' => 40, 'type' => 'product', 'status' => 'publish' ),
			) ),
			$r
		);
		// Both queries skip revisions, trash and auto-drafts; the LIKE argument is escaped.
		$this->assertCount( 2, $db->queries );
		foreach ( $db->queries as $q ) {
			$this->assertStringContainsString( "p.post_type <> 'revision'", $q[0] );
			$this->assertStringContainsString( "NOT IN ('trash','auto-draft')", $q[0] );
		}
		$this->assertStringContainsString( 'wp_postmeta', $db->queries[1][0] );
		$this->assertSame( '%designs/2026/11/model-a.png%', $db->queries[1][1][0] );
	}

	public function test_a_failed_query_or_too_many_candidates_is_an_error_not_an_empty_answer(): void {
		$db             = new FakeRefWpdb();
		$db->results    = array( false );
		$this->assertSame( array( 'ok' => false, 'error' => 'query_failed' ), ( new AssetReferenceFinder( $db ) )->find( array( self::KEY ) ) );

		$db             = new FakeRefWpdb();
		$db->results    = array( array() );
		$db->last_error = 'Table missing';
		$this->assertSame( 'query_failed', ( new AssetReferenceFinder( $db ) )->find( array( self::KEY ) )['error'] );

		$db          = new FakeRefWpdb();
		$db->results = array( array_fill( 0, AssetReferenceFinder::MAX_CANDIDATES + 1, array( 'id' => 1, 'type' => 'post', 'status' => 'draft', 'text' => '' ) ) );
		$this->assertSame( 'too_many_candidates', ( new AssetReferenceFinder( $db ) )->find( array( self::KEY ) )['error'] );

		$db               = new FakeRefWpdb();
		$db->prepareFails = true;
		$this->assertSame( 'query_prepare_failed', ( new AssetReferenceFinder( $db ) )->find( array( self::KEY ) )['error'] );
	}
}
