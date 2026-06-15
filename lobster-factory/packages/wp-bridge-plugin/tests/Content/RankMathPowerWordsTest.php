<?php
/**
 * Tests for RankMathPowerWords — the Traditional-Chinese power-word list injected into Rank Math's
 * `rank_math/metabox/power_words` filter. words() and filter() are pure PHP (no WordPress), so they
 * run standalone via the fallback autoloader. register() (which calls add_filter) is not exercised
 * here — it's a one-line WP hook with no logic to test.
 */

namespace AwareWave\WpBridge\Tests\Content;

use AwareWave\WpBridge\Content\RankMathPowerWords;
use PHPUnit\Framework\TestCase;

final class RankMathPowerWordsTest extends TestCase {

	public function test_words_are_non_empty_unique_traditional_chinese(): void {
		$words = RankMathPowerWords::words();
		$this->assertNotEmpty( $words );
		$this->assertSame( array_values( array_unique( $words ) ), $words, 'no duplicates' );
		foreach ( $words as $w ) {
			$this->assertIsString( $w );
			$this->assertNotSame( '', trim( $w ) );
		}
		// SSOT anchor: a representative sample from the generator's CJK prompt must be present.
		foreach ( array( '終極', '完整', '一次搞懂', '不可不知', '突破' ) as $expected ) {
			$this->assertContains( $expected, $words, "power-word list must contain '$expected'" );
		}
	}

	public function test_excludes_ymyl_overclaim_words(): void {
		$words = RankMathPowerWords::words();
		$this->assertNotContains( '保證', $words );
		$this->assertNotContains( '治癒', $words );
	}

	public function test_filter_supplies_list_for_empty_zh_locale(): void {
		// The real no-file (zh) case: Rank Math passes [].
		$out = ( new RankMathPowerWords() )->filter( array(), 'zh_TW' );
		$this->assertSame( RankMathPowerWords::words(), array_values( array_intersect( $out, RankMathPowerWords::words() ) ) );
		$this->assertContains( '完整', $out );
	}

	public function test_filter_merges_without_dropping_or_duplicating_existing(): void {
		$existing = array( 'ultimate', 'proven', '完整' ); // '完整' overlaps our list
		$out      = ( new RankMathPowerWords() )->filter( $existing, 'en' );
		$this->assertContains( 'ultimate', $out, 'existing words preserved' );
		$this->assertContains( 'proven', $out );
		$this->assertContains( '終極', $out, 'our words added' );
		$this->assertSame( count( $out ), count( array_unique( $out ) ), 'no duplicate after merge' );
	}

	public function test_filter_tolerates_non_array_and_non_string_input(): void {
		$this->assertSame( RankMathPowerWords::words(), ( new RankMathPowerWords() )->filter( null ) );
		$mixed = ( new RankMathPowerWords() )->filter( array( 'ok', 123, null, 'fine' ) );
		$this->assertContains( 'ok', $mixed );
		$this->assertContains( 'fine', $mixed );
		$this->assertNotContains( 123, $mixed, 'non-string entries dropped' );
	}
}
