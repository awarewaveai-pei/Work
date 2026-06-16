<?php
/**
 * Tests for BlockLibrary — the server-side Kadence "LEGO" engine. Pure PHP (no WordPress), so it runs
 * standalone via the fallback autoloader. Covers three contracts:
 *   1. Backward compatibility — a no-theme BlockLibrary emits soulful's captured palette verbatim, so
 *      already-validated posts keep their styling.
 *   2. Theme parameterisation — a tenant theme re-skins tabs / table / info box without code changes.
 *   3. Self-describing manifest — manifest() lists every type compose() accepts; each example must
 *      compose with no 'unknown', which binds the manifest to the buildInner() switch (anti-drift).
 */

namespace AwareWave\WpBridge\Tests\Content;

use AwareWave\WpBridge\Content\BlockLibrary;
use PHPUnit\Framework\TestCase;

final class BlockLibraryTest extends TestCase {

	/** The 17 canonical block types compose() supports (aliases excluded). */
	private const CANONICAL = array(
		'heading', 'paragraph', 'button', 'list', 'quote', 'form', 'image', 'spacer',
		'divider', 'icon_list', 'table', 'accordion', 'tabs', 'youtube', 'infobox', 'gallery',
		'pattern',
	);

	// ---- Manifest -----------------------------------------------------------

	public function test_manifest_lists_every_canonical_type(): void {
		$types = array_column( ( new BlockLibrary() )->manifest(), 'type' );
		foreach ( self::CANONICAL as $t ) {
			$this->assertContains( $t, $types, "manifest must list canonical type '$t'" );
		}
	}

	public function test_manifest_entries_have_fields_and_example(): void {
		foreach ( ( new BlockLibrary() )->manifest() as $e ) {
			$this->assertArrayHasKey( 'type', $e );
			$this->assertArrayHasKey( 'fields', $e );
			$this->assertArrayHasKey( 'example', $e, "entry '{$e['type']}' needs an example" );
		}
	}

	/** Anti-drift: every manifest example must compose cleanly — ties the manifest to the switch. */
	public function test_every_manifest_example_composes_without_unknown(): void {
		foreach ( ( new BlockLibrary() )->manifest() as $e ) {
			$spec = array_merge( array( 'type' => $e['type'] ), $e['example'] );
			$res  = ( new BlockLibrary() )->compose( array( $spec ) );
			$this->assertSame( array(), $res['unknown'], "manifest example for '{$e['type']}' must compose" );
		}
	}

	public function test_unknown_block_type_is_reported(): void {
		$res = ( new BlockLibrary() )->compose( array( array( 'type' => 'NOPE_SENTINEL_XYZ' ) ) );
		$this->assertContains( 'NOPE_SENTINEL_XYZ', $res['unknown'] );
	}

	// ---- Backward compatibility (defaults = soulful's captured values) ------

	/** Every default colour is a palette TOKEN (live-follows the site's Global Palette), never a hex. */
	public function test_default_tabs_palette_are_inheriting_tokens(): void {
		$out = ( new BlockLibrary() )->tabs( array( array( 'title' => 'Alpha', 'content' => 'a' ) ) );
		$this->assertStringContainsString( '"titleColor":"palette9"', $out );
		$this->assertStringContainsString( '"titleBg":"palette3"', $out );
	}

	public function test_default_table_border_inherits_palette(): void {
		$out = ( new BlockLibrary() )->table( array( array( 'A' ), array( '1' ) ) );
		$this->assertStringContainsString( 'palette5', $out );
		$this->assertStringNotContainsString( '#A7A5A5', $out, 'fixed hex border replaced by inheriting token' );
	}

	/** Brand bg inherits the site's Global Palette (palette1), NOT the captured stale green hex. */
	public function test_default_infobox_bg_inherits_palette(): void {
		$out = ( new BlockLibrary() )->infobox( 'T', 'B' );
		$this->assertStringContainsString( '"containerBackground":"palette1"', $out );
		$this->assertStringNotContainsString( '#31533d', $out, 'stale soulful green must not be emitted' );
	}

	// ---- Theme parameterisation --------------------------------------------

	public function test_theme_overrides_tabs_title_color(): void {
		$out = ( new BlockLibrary( array( 'tabsTitleColor' => '#123456' ) ) )
			->tabs( array( array( 'title' => 'A', 'content' => 'a' ) ) );
		$this->assertStringContainsString( '"titleColor":"#123456"', $out );
		$this->assertStringNotContainsString( '"titleColor":"palette9"', $out );
	}

	public function test_theme_overrides_table_border(): void {
		$out = ( new BlockLibrary( array( 'tableBorder' => '#FF0000' ) ) )
			->table( array( array( 'A' ), array( '1' ) ) );
		$this->assertStringContainsString( '#FF0000', $out );
		$this->assertStringNotContainsString( '#A7A5A5', $out );
	}

	public function test_theme_overrides_infobox_brand_bg(): void {
		$out = ( new BlockLibrary( array( 'infoboxBg' => '#0000FF' ) ) )->infobox( 'T', 'B' );
		$this->assertStringContainsString( '#0000FF', $out );
		$this->assertStringNotContainsString( '#31533d', $out );
	}

	public function test_unknown_theme_keys_are_ignored(): void {
		// An unsupported key must not break composition or leak into markup.
		$out = ( new BlockLibrary( array( 'bogusKey' => 'xyz' ) ) )
			->tabs( array( array( 'title' => 'A', 'content' => 'a' ) ) );
		$this->assertStringNotContainsString( 'xyz', $out );
		$this->assertStringContainsString( '"titleColor":"palette9"', $out );
	}

	// ---- Theme value validation (injection guards) --------------------------

	/** The table border is raw-concatenated into JSON — an injection payload must be rejected. */
	public function test_table_border_injection_is_rejected(): void {
		$evil = '#fff","solid",1]}],"className":"hacked","x":["';
		$out  = ( new BlockLibrary( array( 'tableBorder' => $evil ) ) )->table( array( array( 'A' ), array( '1' ) ) );
		$this->assertStringNotContainsString( 'hacked', $out, 'injected attribute must not reach output' );
		$this->assertStringContainsString( 'palette5', $out, 'invalid border falls back to default token' );
	}

	/** The info-box bg is str_replaced into a block comment — a literal "-->" must be rejected. */
	public function test_infobox_bg_comment_break_is_rejected(): void {
		$evil = '--> <script>x</script> <!-- ';
		$out  = ( new BlockLibrary( array( 'infoboxBg' => $evil ) ) )->infobox( 'T', 'B' );
		$this->assertStringNotContainsString( '<script>', $out );
		$this->assertStringContainsString( '"containerBackground":"palette1"', $out, 'invalid bg falls back to default' );
	}

	public function test_non_string_theme_value_does_not_throw(): void {
		$out = ( new BlockLibrary( array( 'infoboxBg' => array( 'x' ) ) ) )->infobox( 'T', 'B' );
		$this->assertStringContainsString( '"containerBackground":"palette1"', $out );
	}

	/** Legitimate colour tokens (hex / palette / css var) must still be accepted. */
	public function test_legit_colour_tokens_are_accepted(): void {
		$hex = ( new BlockLibrary( array( 'tableBorder' => '#abcdef' ) ) )->table( array( array( 'A' ), array( '1' ) ) );
		$this->assertStringContainsString( '#abcdef', $hex );
		$var = ( new BlockLibrary( array( 'tabsTitleColorActive' => 'var(--global-palette7, #000000)' ) ) )
			->tabs( array( array( 'title' => 'A', 'content' => 'a' ) ) );
		$this->assertStringContainsString( 'global-palette7', $var );
	}
}
