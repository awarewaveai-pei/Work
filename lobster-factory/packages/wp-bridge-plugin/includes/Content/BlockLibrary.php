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

	/**
	 * Image. With a media-library $id (after sideloading) it emits a real Kadence Image (Adv) block,
	 * matching soulful's markup; without an id it falls back to a core image referencing the URL.
	 */
	public function image( string $url, string $alt = '', int $id = 0 ): string {
		$u = htmlspecialchars( $url, ENT_QUOTES );
		$a = htmlspecialchars( $alt, ENT_QUOTES );
		if ( $id > 0 ) {
			$uid = $this->uid();
			return '<!-- wp:kadence/image {"id":' . $id . ',"sizeSlug":"full","linkDestination":"none","uniqueID":"' . $uid . '"} -->' . "\n"
				. '<figure class="wp-block-kadence-image kb-image' . $uid . ' size-full"><img src="' . $u . '" alt="' . $a . '" class="kb-img wp-image-' . $id . '"/></figure>' . "\n"
				. '<!-- /wp:kadence/image -->';
		}
		return '<!-- wp:image --><figure class="wp-block-image"><img src="' . $u . '" alt="' . $a . '"/></figure><!-- /wp:image -->';
	}

	public function spacer( int $height = 30 ): string {
		return '<!-- wp:spacer {"height":"' . $height . 'px"} --><div style="height:' . $height . 'px" aria-hidden="true" class="wp-block-spacer"></div><!-- /wp:spacer -->';
	}

	public function divider(): string {
		return '<!-- wp:separator --><hr class="wp-block-separator has-alpha-channel-opacity"/><!-- /wp:separator -->';
	}

	/** Kadence Icon List from plain-text items (matches soulful's real iconlist markup). @param string[] $items */
	public function iconList( array $items ): string {
		$listId = $this->uid();
		$li     = '';
		foreach ( $items as $text ) {
			$iid = $this->uid();
			$li .= '<!-- wp:kadence/listitem {"uniqueID":"' . $iid . '"} -->'
				. '<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-' . $iid . '"><span data-name="USE_PARENT_DEFAULT_ICON" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">' . $text . '</span></li>'
				. '<!-- /wp:kadence/listitem -->';
		}
		return '<!-- wp:kadence/iconlist {"uniqueID":"' . $listId . '"} -->' . "\n"
			. '<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items' . $listId . ' kt-svg-icon-list-columns-1 alignnone"><ul class="kt-svg-icon-list">' . $li . '</ul></div>' . "\n"
			. '<!-- /wp:kadence/iconlist -->';
	}

	/** Kadence Table from a 2D array of cell strings (first row = header). @param string[][] $rows */
	public function table( array $rows ): string {
		if ( $rows === array() ) {
			return '';
		}
		$columns = count( (array) $rows[0] );
		$tableId = $this->uid();
		$body    = '';
		foreach ( $rows as $r => $cells ) {
			$rowId = $this->uid();
			$cm    = '';
			foreach ( (array) $cells as $cell ) {
				$cid = $this->uid();
				$cm .= '<!-- wp:kadence/table-data {"uniqueID":"' . $cid . '","column":-1} -->'
					. '<!-- wp:paragraph --><p>' . (string) $cell . '</p><!-- /wp:paragraph -->'
					. '<!-- /wp:kadence/table-data -->';
			}
			$body .= '<!-- wp:kadence/table-row {"uniqueID":"' . $rowId . '","row":' . (int) $r . '} -->' . $cm . '<!-- /wp:kadence/table-row -->';
		}
		// Fixed table border: #A7A5A5, 1px, all sides (the standing default per operator instruction).
		$border = '"borderStyle":[{"top":["#A7A5A5","solid",1],"right":["#A7A5A5","solid",1],"bottom":["#A7A5A5","solid",1],"left":["#A7A5A5","solid",1],"unit":"px"}]';
		return '<!-- wp:kadence/table {"uniqueID":"' . $tableId . '","columns":' . $columns . ',"isFirstRowHeader":true,' . $border . ',"className":"is-style-stripes"} -->' . "\n"
			. $body . "\n"
			. '<!-- /wp:kadence/table -->';
	}

	/** Kadence Accordion from panes [{title, content}]. content is plain text wrapped in a paragraph. */
	public function accordion( array $panes ): string {
		$accId       = $this->uid();
		$n           = count( $panes );
		$panesMarkup = array();
		foreach ( array_values( $panes ) as $i => $pane ) {
			$pid   = $this->uid();
			$num   = $i + 1;
			$title = (string) ( $pane['title'] ?? '' );
			// Inner blocks must be serialised EXACTLY as WordPress does (newlines inside the comment
			// delimiters), or the kadence/pane InnerBlocks validation fails ("unexpected content").
			$content = "<!-- wp:paragraph -->\n<p>" . (string) ( $pane['content'] ?? '' ) . "</p>\n<!-- /wp:paragraph -->";
			// Current Kadence pane: panes 2..N carry "id":<n>; the first pane OMITS it (default id=1,
			// which Gutenberg drops). NO className. Verified byte-for-byte against a fresh editor-created
			// accordion on soulful (post 7045) — a missing "id" on panes 2+ is what made them invalid.
			$attrs = ( $num === 1 )
				? '{"uniqueID":"' . $pid . '"}'
				: '{"id":' . $num . ',"uniqueID":"' . $pid . '"}';
			$panesMarkup[] = '<!-- wp:kadence/pane ' . $attrs . ' -->' . "\n"
				. '<div class="wp-block-kadence-pane kt-accordion-pane kt-accordion-pane-' . $num . ' kt-pane' . $pid . '"><div class="kt-accordion-header-wrap"><button class="kt-blocks-accordion-header kt-acccordion-button-label-show" type="button"><span class="kt-blocks-accordion-title-wrap"><span class="kt-blocks-accordion-title">' . $title . '</span></span><span class="kt-blocks-accordion-icon-trigger"></span></button></div><div class="kt-accordion-panel"><div class="kt-accordion-panel-inner">' . $content . '</div></div></div>' . "\n"
				. '<!-- /wp:kadence/pane -->';
		}
		// Sibling panes are separated by a blank line and sit flush against the inner-wrap open/close
		// divs — byte-identical to a fresh editor-saved accordion (soulful post 7045).
		$pm = implode( "\n\n", $panesMarkup );
		return '<!-- wp:kadence/accordion {"uniqueID":"' . $accId . '","paneCount":' . $n . ',"startCollapsed":true} -->' . "\n"
			. '<div class="wp-block-kadence-accordion alignnone"><div class="kt-accordion-wrap kt-accordion-id' . $accId . ' kt-accordion-has-' . $n . '-panes kt-active-pane-0 kt-accordion-block kt-pane-header-alignment-left kt-accodion-icon-style-basic kt-accodion-icon-side-right" style="max-width:none"><div class="kt-accordion-inner-wrap" data-allow-multiple-open="false" data-start-open="none">'
			. $pm
			. '</div></div></div>' . "\n"
			. '<!-- /wp:kadence/accordion -->';
	}

	/** Kadence Info Box — uses soulful's real captured skeleton (keeps styling), swaps title/text/cta. */
	public function infobox( string $title, string $text, string $learnMore = 'Read More' ): string {
		$tpl = @file_get_contents( __DIR__ . '/skeletons/infobox.tpl' );
		if ( $tpl === false || $tpl === '' ) {
			// Fallback: a minimal valid infobox if the skeleton asset is missing.
			$id = $this->uid();
			return '<!-- wp:kadence/infobox {"uniqueID":"' . $id . '"} -->'
				. '<div id="kt-info-box' . $id . '" class="wp-block-kadence-infobox"><div class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top"><div class="kt-infobox-textcontent"><h5 class="kt-blocks-info-box-title">' . $title . '</h5><p class="kt-blocks-info-box-text">' . $text . '</p></div></div></div>'
				. '<!-- /wp:kadence/infobox -->';
		}
		$tpl = str_replace( '_7287fb-2b', $this->uid(), $tpl );
		$tpl = preg_replace_callback( '#(<h5 class="kt-blocks-info-box-title">).*?(</h5>)#s', function ( $m ) use ( $title ) {
			return $m[1] . $title . $m[2];
		}, $tpl );
		$tpl = preg_replace_callback( '#(<p class="kt-blocks-info-box-text">).*?(</p>)#s', function ( $m ) use ( $text ) {
			return $m[1] . $text . $m[2];
		}, $tpl );
		$tpl = preg_replace_callback( '#(<span class="kt-blocks-info-box-learnmore">).*?(</span>)#s', function ( $m ) use ( $learnMore ) {
			return $m[1] . $learnMore . $m[2];
		}, $tpl );
		return trim( (string) $tpl );
	}

	/** Core gallery from image URLs (reliable; Kadence Advanced Gallery needs media-library IDs). @param string[] $urls */
	public function gallery( array $urls ): string {
		$imgs = '';
		foreach ( $urls as $url ) {
			$u     = htmlspecialchars( (string) $url, ENT_QUOTES );
			$imgs .= '<!-- wp:image --><figure class="wp-block-image"><img src="' . $u . '" alt=""/></figure><!-- /wp:image -->';
		}
		return '<!-- wp:gallery {"linkTo":"none"} --><figure class="wp-block-gallery has-nested-images columns-default is-cropped">' . $imgs . '</figure><!-- /wp:gallery -->';
	}

	/**
	 * Compose a free list of block specs into full post content, wrapped in a Kadence Row Layout/Column.
	 *
	 * @param array<int,array<string,mixed>> $blocks each: {type, ...content}.
	 * @return array{content:string, unknown:string[]} content markup + any unsupported block types.
	 */
	public function compose( array $blocks ): array {
		$unknown = array();
		$inner   = $this->buildInner( $blocks, $unknown );

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

	/**
	 * Turn a list of block specs into an array of valid block-markup strings. Shared by compose() (which
	 * wraps the result in a Row/Column) and by container blocks (tabs/accordion) that nest other blocks.
	 *
	 * @param array<int,array<string,mixed>> $blocks  each: {type, ...content}.
	 * @param string[]                       $unknown collects any unsupported block types (by reference).
	 * @return string[]
	 */
	private function buildInner( array $blocks, array &$unknown ): array {
		$inner = array();
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
					$inner[] = $this->image( (string) ( $b['url'] ?? '' ), (string) ( $b['alt'] ?? '' ), (int) ( $b['id'] ?? 0 ) );
					break;
				case 'spacer':
					$inner[] = $this->spacer( (int) ( $b['height'] ?? 30 ) );
					break;
				case 'divider':
					$inner[] = $this->divider();
					break;
				case 'icon_list':
				case 'iconlist':
					$inner[] = $this->iconList( array_map( 'strval', (array) ( $b['items'] ?? array() ) ) );
					break;
				case 'table':
					$inner[] = $this->table( (array) ( $b['rows'] ?? array() ) );
					break;
				case 'accordion':
					$inner[] = $this->accordion( (array) ( $b['panes'] ?? array() ) );
					break;
				case 'tabs':
					$inner[] = $this->tabs( (array) ( $b['tabs'] ?? array() ) );
					break;
				case 'youtube':
				case 'embed':
				case 'video':
					$inner[] = $this->youtube( (string) ( $b['url'] ?? '' ) );
					break;
				case 'infobox':
				case 'info_box':
					$inner[] = $this->infobox( (string) ( $b['title'] ?? '' ), (string) ( $b['text'] ?? '' ), (string) ( $b['cta'] ?? 'Read More' ) );
					break;
				case 'gallery':
					$inner[] = $this->gallery( array_map( 'strval', (array) ( $b['urls'] ?? array() ) ) );
					break;
				default:
					$unknown[] = $type;
			}
		}
		return $inner;
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
