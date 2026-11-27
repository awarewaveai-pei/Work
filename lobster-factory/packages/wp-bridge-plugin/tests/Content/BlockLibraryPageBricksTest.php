<?php
/**
 * Page bricks (section, buttons, card, styled heading/paragraph, icon list options, plugin_block,
 * shortcode, composePage). Their markup was checked byte-for-byte against the Kadence editor
 * (Kadence Blocks 3.9.1.2: parse → serialize identical, and identical after the editor mounts the blocks,
 * uniqueIDs aside); these tests pin the contracts that must not drift without a new editor check:
 *   - every Kadence block passes KadenceValidator (uniqueID present + unique, kbVersion >= 2 on layout);
 *   - colours are palette tokens only (no literal hex in any attribute);
 *   - empty style/options keep the original markup byte-identical;
 *   - untrusted names/text cannot break out of a block comment.
 */

namespace AwareWave\WpBridge\Tests\Content;

use AwareWave\WpBridge\Content\BlockLibrary;
use AwareWave\WpBridge\Validation\KadenceValidator;
use PHPUnit\Framework\TestCase;

final class BlockLibraryPageBricksTest extends TestCase {

	private function page(): array {
		return array(
			array( 'type' => 'section', 'options' => array( 'gradient' => array( 'from' => 'palette7', 'to' => 'palette9', 'shape' => 'radial' ), 'text_color' => 'palette3', 'padding' => array( 112, 'sm', 96, 'sm' ) ), 'columns' => array( array( 'blocks' => array(
				array( 'type' => 'heading', 'text' => 'Title', 'level' => 1, 'style' => array( 'color' => 'palette3', 'align' => 'center', 'size' => array( 60, 40 ) ) ),
				array( 'type' => 'paragraph', 'text' => 'Back', 'style' => array( 'color' => 'palette1', 'link' => '/back/' ) ),
				array( 'type' => 'buttons', 'buttons' => array( array( 'text' => 'Go', 'link' => '#a' ), array( 'text' => 'More', 'link' => '/m/', 'style' => 'outline' ) ) ),
			) ) ) ),
			array( 'type' => 'section', 'options' => array( 'background' => 'palette9', 'mobile_layout' => 'two-grid', 'gap' => array( 20, 12 ), 'equal_height' => true ), 'columns' => array(
				array( 'blocks' => array( array( 'type' => 'card', 'title' => 'One', 'text' => 'a', 'link' => '/1/', 'icon' => 'fe_star' ) ) ),
				array( 'blocks' => array( array( 'type' => 'card', 'title' => 'Two', 'text' => 'b', 'link' => '/2/' ) ) ),
				array( 'blocks' => array( array( 'type' => 'icon_list', 'items' => array( 'x', 'y' ), 'options' => array( 'columns' => 2, 'align' => 'center' ) ) ) ),
			) ),
			array( 'type' => 'section', 'options' => array( 'show_to' => 'members', 'max_width' => 720 ), 'columns' => array( array(
				'blocks' => array( array( 'type' => 'plugin_block', 'name' => 'aware-wave/oracle', 'attrs' => array( 'tool' => 'ziwei' ) ), array( 'type' => 'shortcode', 'text' => '[x]' ), array( 'type' => 'form', 'form_id' => 3 ) ),
				'style'  => array( 'background' => 'palette8', 'border' => 'palette7', 'radius' => 12 ),
			) ) ),
		);
	}

	/** Minimal block-comment parser → WP parse_blocks() shape (blockName/attrs/innerBlocks). */
	private function parse( string $markup ): array {
		preg_match_all( '/<!--\s+(\/)?wp:([a-z0-9\/-]+)(\s+(\{.*?\}))?\s+(\/)?-->/s', $markup, $m, PREG_SET_ORDER );
		$root  = array( 'innerBlocks' => array() );
		$stack = array( &$root );
		foreach ( $m as $t ) {
			$name = strpos( $t[2], '/' ) === false ? 'core/' . $t[2] : $t[2];
			if ( $t[1] === '/' ) {
				array_pop( $stack );
				continue;
			}
			$node = array( 'blockName' => $name, 'attrs' => isset( $t[4] ) && $t[4] !== '' ? (array) json_decode( $t[4], true ) : array(), 'innerBlocks' => array() );
			$top  = &$stack[ count( $stack ) - 1 ];
			$top['innerBlocks'][] = $node;
			if ( ( $t[5] ?? '' ) !== '/' ) {
				$stack[] = &$top['innerBlocks'][ count( $top['innerBlocks'] ) - 1 ];
			}
			unset( $top );
		}
		return $root['innerBlocks'];
	}

	public function test_page_composes_and_passes_kadence_validator(): void {
		$res = ( new BlockLibrary() )->composePage( $this->page() );
		$this->assertSame( array(), $res['unknown'] );
		$tree = $this->parse( $res['content'] );
		$this->assertCount( 3, $tree, 'three top-level sections, no wrapping row' );
		$v = ( new KadenceValidator() )->validate( $tree );
		$this->assertTrue( $v->isValid(), json_encode( $v->toArray() ) );
	}

	public function test_no_literal_hex_colour_in_any_attribute(): void {
		$content = ( new BlockLibrary() )->composePage( $this->page() )['content'];
		preg_match_all( '/<!-- wp:[a-z0-9\/-]+ (\{.*?\}) \/?-->/s', $content, $m );
		foreach ( $m[1] as $json ) {
			$this->assertDoesNotMatchRegularExpression( '/#[0-9A-Fa-f]{3,8}\b/', $json );
		}
		$this->assertStringContainsString( 'var(\u002d\u002dglobal-palette7)', $content, 'gradient uses palette CSS vars, "--" escaped' );
	}

	public function test_non_palette_colours_are_dropped(): void {
		$L   = new BlockLibrary();
		$out = $L->composePage( array( array( 'type' => 'section', 'options' => array( 'background' => '#ff0000', 'gradient' => array( 'from' => 'red', 'to' => 'palette9' ) ), 'columns' => array( array( 'blocks' => array( array( 'type' => 'heading', 'text' => 'H', 'style' => array( 'color' => '#00ff00' ) ) ) ) ) ) ) )['content'];
		$this->assertStringNotContainsString( '#ff0000', $out );
		$this->assertStringNotContainsString( '#00ff00', $out );
		$this->assertStringNotContainsString( 'gradient', $out );
	}

	public function test_layout_blocks_carry_kb_version_and_columns_the_migrated_border_width(): void {
		$out = ( new BlockLibrary() )->section( array(), array( array( 'blocks' => array() ), array( 'blocks' => array() ) ) );
		$this->assertSame( 3, substr_count( $out, '"kbVersion":2' ) );
		$this->assertStringContainsString( '"id":2', $out, 'second column carries its id; the first omits the default' );
		$this->assertSame( 2, substr_count( $out, '"borderWidth":["","","",""]' ) );
		$this->assertStringNotContainsString( '"columns":2', $out, 'two columns is the block default' );
	}

	public function test_visibility_maps_to_kadence_flags(): void {
		$L = new BlockLibrary();
		$this->assertStringContainsString( '"loggedIn":true', $L->section( array( 'show_to' => 'guests' ), array() ) );
		$this->assertStringContainsString( '"loggedOut":true', $L->section( array( 'show_to' => 'members' ), array() ) );
	}

	public function test_empty_style_keeps_original_markup(): void {
		$L = new BlockLibrary();
		$this->assertMatchesRegularExpression( '/^<!-- wp:kadence\/advancedheading \{"uniqueID":"awb[0-9a-f]{8}","htmlTag":"h2"\} -->/', $L->heading( 'H' ) );
		$this->assertMatchesRegularExpression( '/^<!-- wp:kadence\/iconlist \{"uniqueID":"awb[0-9a-f]{8}"\} -->/', $L->iconList( array( 'a' ) ) );
	}

	public function test_card_takes_theme_tokens(): void {
		$out = ( new BlockLibrary( array( 'cardBg' => 'palette8' ) ) )->card( 'T', 'x', '/t/' );
		$this->assertStringContainsString( '"containerBackground":"palette8"', $out );
		$this->assertStringContainsString( 'href="/t/"', $out );
		$this->assertStringContainsString( '"kbVersion":2', $out );
	}

	public function test_plugin_block_refuses_core_kadence_and_bad_input(): void {
		$L = new BlockLibrary();
		$this->assertSame( '<!-- wp:aware-wave/oracle {"tool":"ziwei"} /-->', $L->pluginBlock( 'aware-wave/oracle', array( 'tool' => 'ziwei' ) ) );
		$this->assertSame( '<!-- wp:aware-wave/oracle-daily /-->', $L->pluginBlock( 'aware-wave/oracle-daily' ) );
		$this->assertSame( '', $L->pluginBlock( 'core/html', array() ) );
		$this->assertSame( '', $L->pluginBlock( 'kadence/rowlayout', array() ) );
		$this->assertSame( '', $L->pluginBlock( 'x/y --> <script>', array() ) );
		$this->assertSame( '', $L->pluginBlock( 'a/b', array( 'k' => array( 'nested' ) ) ) );
		$evil = $L->pluginBlock( 'a/b', array( 'k' => '--> <script>' ) );
		$this->assertStringNotContainsString( '-->', substr( $evil, 0, -4 ), 'attribute text cannot close the comment' );
		$res = $L->composePage( array( array( 'type' => 'plugin_block', 'name' => 'core/html' ) ) );
		$this->assertSame( array( 'plugin_block:core/html' ), $res['unknown'] );
	}

	public function test_shortcode_refuses_comment_delimiters(): void {
		$L = new BlockLibrary();
		$this->assertSame( "<!-- wp:shortcode -->\n[a b=\"1\"]\n<!-- /wp:shortcode -->", $L->shortcode( ' [a b="1"] ' ) );
		$this->assertSame( '', $L->shortcode( '[a]--><!-- wp:html -->' ) );
		$this->assertSame( '', $L->shortcode( '' ) );
	}

	/** Content a caller sent is never dropped silently: it is reported so POST /post answers 422. */
	public function test_dropped_content_is_reported(): void {
		$L    = new BlockLibrary();
		$cols = array_fill( 0, 7, array( 'blocks' => array() ) );
		$this->assertContains( 'section:more_than_6_columns', $L->composePage( array( array( 'type' => 'section', 'columns' => $cols ) ) )['unknown'] );
		$this->assertContains( 'section:column_without_blocks', $L->composePage( array( array( 'type' => 'section', 'columns' => array( array( 'type' => 'heading', 'text' => 'x' ) ) ) ) )['unknown'] );
		$this->assertContains( 'buttons:item_not_an_object', $L->composePage( array( array( 'type' => 'buttons', 'buttons' => array( 'Go' ) ) ) )['unknown'] );
		$this->assertSame( array(), $L->composePage( array( array( 'type' => 'section', 'columns' => array( array(), array( 'blocks' => array() ) ) ) ) )['unknown'], 'an empty column is allowed' );
	}

	public function test_bad_values_are_dropped_without_warnings(): void {
		$L   = new BlockLibrary();
		$out = $L->composePage( array( array( 'type' => 'section', 'options' => array( 'padding' => array( array( 1 ), INF, 'sm', 'evil"' ), 'layout' => array( 'equal' ), 'anchor' => array() ), 'columns' => array( array( 'blocks' => array( array( 'type' => 'heading', 'text' => 'H', 'style' => array( 'letter_spacing' => INF ) ) ) ) ) ) ) )['content'];
		$this->assertStringContainsString( '"padding":["","","sm",""]', $out );
		$this->assertStringNotContainsString( 'letterSpacing', $out );
		$this->assertSame( '', $L->pluginBlock( 'a/b', array( 'tool' => 'x', 'n' => INF ) ) );
	}

	public function test_stray_non_array_style_keeps_original_markup(): void {
		$out = ( new BlockLibrary() )->composePage( array( array( 'type' => 'heading', 'text' => 'H', 'style' => 'bold' ), array( 'type' => 'icon_list', 'items' => array( 'a' ), 'options' => 'x' ) ) )['content'];
		$this->assertMatchesRegularExpression( '/wp:kadence\/advancedheading \{"uniqueID":"awb[0-9a-f]{8}","htmlTag":"h2"\}/', $out );
		$this->assertMatchesRegularExpression( '/wp:kadence\/iconlist \{"uniqueID":"awb[0-9a-f]{8}"\}/', $out );
	}

	public function test_desktop_layout_must_fit_the_column_count(): void {
		$L = new BlockLibrary();
		$this->assertStringContainsString( '"colLayout":"left-golden"', $L->section( array( 'layout' => 'left-golden' ), array( array(), array() ) ) );
		$this->assertStringContainsString( '"colLayout":"equal"', $L->section( array( 'layout' => 'left-golden' ), array( array(), array(), array() ) ) );
	}

	public function test_link_is_html_escaped_in_href(): void {
		$out = ( new BlockLibrary() )->paragraph( 'x', array( 'link' => '/a/?b=1&c="2"' ) );
		$this->assertStringContainsString( 'href="/a/?b=1&amp;c=&quot;2&quot;"', $out );
	}
}
