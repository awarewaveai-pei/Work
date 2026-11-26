<?php
/**
 * Seo\TranslatedTitles with stubbed WordPress and TranslatePress functions.
 */

namespace AwareWave\Oracle\Tests;

use AwareWave\Oracle\Seo\TranslatedTitles;
use PHPUnit\Framework\TestCase;

final class SeoUnitTest extends TestCase {

	/** Defined on demand, not at file load, so one test can run without TranslatePress. */
	private static function stubs( bool $withTranslatePress ): void {
		if ( ! function_exists( 'add_filter' ) ) {
			// phpcs:ignore Squiz.PHP.Eval.Discouraged -- global stubs, test only.
			eval(
				'function add_filter( $h, $cb, $p = 10, $a = 1 ) { $GLOBALS["aw_hooks"][] = $h; return true; }
				function is_admin() { return false; }
				function is_feed() { return false; }
				function did_action( $h ) { return 1; }
				function get_query_var( $v ) { return ""; }
				function get_option( $n ) { return array( "default-language" => "zh_TW" ); }
				function trp_is_translation_editor( $value = "" ) { return false; }'
			);
		}
		if ( $withTranslatePress && ! function_exists( 'trp_translate' ) ) {
			eval(
				'function trp_translate( $content, $language = null, $prevent_over_translation = true ) {
					$GLOBALS["aw_sent"][] = $content;
					$dictionary = array( "紫微斗數" => "Zi Wei Dou Shu", "算命站" => "Oracle", "排盤說明" => "Chart guide" );
					$out        = $dictionary[ $content ] ?? $content;
					return $prevent_over_translation ? "<span data-no-translation>" . $out . "</span>" : $out;
				}'
			);
		}
		$GLOBALS['aw_hooks'] = array();
	}

	protected function tearDown(): void {
		unset( $GLOBALS['TRP_LANGUAGE'], $GLOBALS['aw_hooks'], $GLOBALS['aw_sent'] );
	}

	public function testTranslatedStringsComeOutInThePagesLanguage(): void {
		self::stubs( true );
		$GLOBALS['TRP_LANGUAGE'] = 'en_US';
		TranslatedTitles::register();
		$this->assertContains( 'document_title_parts', $GLOBALS['aw_hooks'] );
		$this->assertContains( 'rank_math/replacements', $GLOBALS['aw_hooks'] );
		$this->assertSame(
			array( '%title%' => 'Zi Wei Dou Shu', '%sep%' => '-', '%sitename%' => 'Oracle' ),
			TranslatedTitles::replacements( array( '%title%' => '紫微斗數', '%sep%' => '-', '%sitename%' => '算命站' ) )
		);
		$this->assertSame(
			array( 'title' => 'Zi Wei Dou Shu', 'site' => 'Oracle' ),
			TranslatedTitles::parts( array( 'title' => '紫微斗數', 'site' => '算命站' ) )
		);
		$this->assertSame( 'Chart guide', TranslatedTitles::text( '排盤說明' ) );
		// The later filters see the finished title: not sent to TranslatePress a second time.
		$GLOBALS['aw_sent'] = array();
		$this->assertSame( 'Zi Wei Dou Shu - Oracle', TranslatedTitles::text( 'Zi Wei Dou Shu - Oracle' ) );
		$this->assertSame( array(), $GLOBALS['aw_sent'] );
	}

	public function testStringWithoutTranslationStaysAsWritten(): void {
		self::stubs( true );
		$GLOBALS['TRP_LANGUAGE'] = 'en_US';
		$this->assertSame( '八字 &amp; 合婚', TranslatedTitles::text( '八字 &amp; 合婚' ) );
	}

	public function testDefaultLanguageStaysAsWritten(): void {
		self::stubs( true );
		$GLOBALS['TRP_LANGUAGE'] = 'zh_TW';
		$this->assertSame( '紫微斗數', TranslatedTitles::text( '紫微斗數' ) );
	}

	/**
	 * @runInSeparateProcess
	 * @preserveGlobalState disabled
	 */
	public function testNothingIsHookedWithoutTranslatePress(): void {
		self::stubs( false );
		TranslatedTitles::register();
		$this->assertSame( array(), $GLOBALS['aw_hooks'] );
	}
}
