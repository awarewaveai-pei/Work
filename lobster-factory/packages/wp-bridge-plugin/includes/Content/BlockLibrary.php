<?php
/**
 * BlockLibrary — the "LEGO bricks". Each method emits ONE valid Kadence (or core) block's markup with
 * fresh uniqueIDs, captured from soulfulexpression.org's real blocks + the Kadence block reference.
 *
 * The AI composes an article FREELY: it sends a list of block specs (type + content) in whatever order
 * the content needs (heading, paragraph, table, form, ...), and compose() assembles them into valid
 * post markup wrapped in a Kadence Row Layout / Column. There is NO fixed article template — every
 * article's structure is decided by its content; the library only guarantees each block is valid.
 *
 * Pure PHP (no WordPress dependency) so it is unit-testable in isolation.
 *
 * @package AwareWave\WpBridge\Content
 */

namespace AwareWave\WpBridge\Content;

final class BlockLibrary {

	private function uid(): string {
		return 'awb' . bin2hex( random_bytes( 4 ) );
	}

	/** Kadence Advanced Text/Heading (kadence/advancedheading) — htmlTag selects h1-h6 | p. */
	private function advText( string $html, string $tag ): string {
		$id = $this->uid();
		return '<!-- wp:kadence/advancedheading {"uniqueID":"' . $id . '","htmlTag":"' . $tag . '"} -->' . "\n"
			. '<' . $tag . ' class="kt-adv-heading' . $id . ' wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading' . $id . '">' . $html . '</' . $tag . '>' . "\n"
			. '<!-- /wp:kadence/advancedheading -->';
	}

	public function heading( string $text, int $level = 2 ): string {
		$level = ( $level >= 1 && $level <= 6 ) ? $level : 2;
		return $this->advText( $text, 'h' . $level );
	}

	public function paragraph( string $html ): string {
		return $this->advText( $html, 'p' );
	}

	/** Kadence Advanced Button (kadence/advancedbtn > kadence/singlebtn). */
	public function button( string $text, string $link ): string {
		$w = $this->uid();
		$b = $this->uid();
		// json_encode escapes the text/link safely inside the block-attribute JSON.
		$attrs = '{"uniqueID":"' . $b . '","text":' . wp_json_or_php( $text ) . ',"link":' . wp_json_or_php( $link ) . ',"borderRadius":[15,15,15,15]}';
		return '<!-- wp:kadence/advancedbtn {"uniqueID":"' . $w . '"} -->' . "\n"
			. '<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns' . $w . '"><!-- wp:kadence/singlebtn ' . $attrs . ' /--></div>' . "\n"
			. '<!-- /wp:kadence/advancedbtn -->';
	}

	/** @param string[] $items */
	public function bulletList( array $items ): string {
		$li = '';
		foreach ( $items as $item ) {
			$li .= '<!-- wp:list-item --><li>' . $item . '</li><!-- /wp:list-item -->';
		}
		return '<!-- wp:list --><ul class="wp-block-list">' . $li . '</ul><!-- /wp:list -->';
	}

	public function quote( string $html ): string {
		return '<!-- wp:quote --><blockquote class="wp-block-quote"><!-- wp:paragraph --><p>' . $html . '</p><!-- /wp:paragraph --></blockquote><!-- /wp:quote -->';
	}

	/** Embed an existing Fluent Form by id via shortcode block. */
	public function form( int $formId ): string {
		return '<!-- wp:shortcode -->' . "\n" . '[fluentform id="' . $formId . '"]' . "\n" . '<!-- /wp:shortcode -->';
	}

	public function image( string $url, string $alt = '' ): string {
		$url = htmlspecialchars( $url, ENT_QUOTES );
		$alt = htmlspecialchars( $alt, ENT_QUOTES );
		return '<!-- wp:image --><figure class="wp-block-image"><img src="' . $url . '" alt="' . $alt . '"/></figure><!-- /wp:image -->';
	}

	public function spacer( int $height = 30 ): string {
		return '<!-- wp:spacer {"height":"' . $height . 'px"} --><div style="height:' . $height . 'px" aria-hidden="true" class="wp-block-spacer"></div><!-- /wp:spacer -->';
	}

	/**
	 * Compose a free list of block specs into full post content, wrapped in a Kadence Row Layout/Column.
	 *
	 * @param array<int,array<string,mixed>> $blocks each: {type, ...content}.
	 * @return array{content:string, unknown:string[]} content markup + any unsupported block types.
	 */
	public function compose( array $blocks ): array {
		$inner   = array();
		$unknown = array();
		foreach ( $blocks as $b ) {
			$type = isset( $b['type'] ) ? (string) $b['type'] : '';
			switch ( $type ) {
				case 'heading':
					$inner[] = $this->heading( (string) ( $b['text'] ?? '' ), (int) ( $b['level'] ?? 2 ) );
					break;
				case 'paragraph':
				case 'text':
					$inner[] = $this->paragraph( (string) ( $b['text'] ?? '' ) );
					break;
				case 'button':
					$inner[] = $this->button( (string) ( $b['text'] ?? '' ), (string) ( $b['link'] ?? '' ) );
					break;
				case 'list':
					$items   = array_map( 'strval', (array) ( $b['items'] ?? array() ) );
					$inner[] = $this->bulletList( $items );
					break;
				case 'quote':
					$inner[] = $this->quote( (string) ( $b['text'] ?? '' ) );
					break;
				case 'form':
					$inner[] = $this->form( (int) ( $b['form_id'] ?? 0 ) );
					break;
				case 'image':
					$inner[] = $this->image( (string) ( $b['url'] ?? '' ), (string) ( $b['alt'] ?? '' ) );
					break;
				case 'spacer':
					$inner[] = $this->spacer( (int) ( $b['height'] ?? 30 ) );
					break;
				default:
					$unknown[] = $type;
			}
		}

		$rid     = $this->uid();
		$cid     = $this->uid();
		$content = '<!-- wp:kadence/rowlayout {"uniqueID":"' . $rid . '","columns":1,"colLayout":"equal","kbVersion":2} -->' . "\n"
			. '<!-- wp:kadence/column {"uniqueID":"' . $cid . '","kbVersion":2} -->' . "\n"
			. '<div class="wp-block-kadence-column kadence-column' . $cid . '"><div class="kt-inside-inner-col">' . "\n"
			. implode( "\n\n", $inner ) . "\n"
			. '</div></div>' . "\n"
			. '<!-- /wp:kadence/column -->' . "\n"
			. '<!-- /wp:kadence/rowlayout -->';

		return array( 'content' => $content, 'unknown' => $unknown );
	}
}

/**
 * Encode a string as a JSON value, using WordPress's wp_json_encode when available (runtime) and
 * plain json_encode otherwise (unit tests). Kept as a free function so BlockLibrary stays WP-free.
 */
function wp_json_or_php( string $value ): string {
	if ( function_exists( 'wp_json_encode' ) ) {
		return (string) wp_json_encode( $value );
	}
	return (string) json_encode( $value );
}
