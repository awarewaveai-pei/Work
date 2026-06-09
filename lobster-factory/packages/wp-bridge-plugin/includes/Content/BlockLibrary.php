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

	/**
	 * Default styling tokens. The defaults are the exact values captured verbatim from soulful's real
	 * blocks, so a no-theme BlockLibrary() emits byte-identical markup to v0.5.6 (backward compat).
	 * A caller (e.g. another tenant) passes overrides to __construct() to re-skin without touching code.
	 */
	private const DEFAULT_THEME = array(
		// Kadence Tabs — title pill palette (Kadence "paletteN" tokens or literal #hex / CSS var).
		'tabsTitleColor'        => '#ffffff',
		'tabsTitleColorHover'   => 'palette1',
		'tabsTitleColorActive'  => 'var(--global-palette5, #444444)',
		'tabsTitleBg'           => 'palette3',
		'tabsTitleBgHover'      => 'palette2',
		'tabsTitleBgActive'     => 'palette2',
		'tabsTitleBorder'       => 'palette1',
		'tabsTitleBorderHover'  => 'palette2',
		'tabsTitleBorderActive' => 'palette2',
		'tabsContentBorder'     => '#bdbdbd',
		// Kadence Table — cell border colour (all four sides).
		'tableBorder'           => '#A7A5A5',
		// Kadence Info Box — brand container background (the most tenant-identifying colour).
		'infoboxBg'             => '#31533d',
	);

	/** @var array<string,string> resolved theme = DEFAULT_THEME overlaid with caller overrides. */
	private $theme;

	/**
	 * @param array<string,string> $theme optional style overrides; unknown keys are ignored.
	 *
	 * Each override value is validated against a strict colour-token allowlist (#hex / Kadence paletteN /
	 * CSS var() / rgb(a)) BEFORE it is merged. This is the single guard for every styling sink: the table
	 * border is built by raw string concatenation and the info-box brand colour by str_replace into a
	 * block-comment template, so an unvalidated value could inject block attributes or a literal "-->"
	 * that breaks Kadence block parsing. Anything that is not a safe colour token (or not a string) is
	 * dropped and the trusted default is used instead.
	 */
	public function __construct( array $theme = array() ) {
		$clean = array();
		foreach ( $theme as $key => $value ) {
			if ( is_string( $value ) && $this->isSafeColorToken( $value ) ) {
				$clean[ $key ] = $value;
			}
		}
		$this->theme = array_merge( self::DEFAULT_THEME, $clean );
	}

	/** True if $v is a safe CSS colour token: #hex(3/4/6/8) | Kadence paletteN | var(--x[, #hex]) | rgb(a)(). */
	private function isSafeColorToken( string $v ): bool {
		return (bool) preg_match( '/^#[0-9A-Fa-f]{3,8}$/', $v )
			|| (bool) preg_match( '/^palette[0-9]$/', $v )
			|| (bool) preg_match( '/^var\(--[A-Za-z0-9_-]+(,\s*#?[0-9A-Fa-f]{3,8})?\)$/', $v )
			|| (bool) preg_match( '/^rgba?\([0-9,.\s]+\)$/', $v );
	}

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
		// Table border: 1px solid all sides. Colour defaults to #A7A5A5 (the standing default per operator
		// instruction); a tenant theme can override via 'tableBorder'.
		$bc     = $this->theme['tableBorder'];
		$border = '"borderStyle":[{"top":["' . $bc . '","solid",1],"right":["' . $bc . '","solid",1],"bottom":["' . $bc . '","solid",1],"left":["' . $bc . '","solid",1],"unit":"px"}]';
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

	/**
	 * Serialise block attributes into the exact form WordPress writes inside a block comment
	 * (<, >, & and -- escaped as \u00xx). Uses core's serialize_block_attributes at runtime; falls
	 * back to an equivalent json_encode for unit tests. The kadence/tabs `titles` array carries inline
	 * HTML (<strong>…</strong>), so this escaping is required or the comment breaks block parsing.
	 */
	private function attrsJson( array $attrs ): string {
		if ( function_exists( 'serialize_block_attributes' ) ) {
			return (string) serialize_block_attributes( $attrs );
		}
		$json = (string) json_encode( $attrs, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
		$json = preg_replace( '/\\\\"/', '\\u0022', $json );
		$json = preg_replace( '/--/', '\\u002d\\u002d', $json );
		return (string) $json;
	}

	/** Core YouTube/video embed (core/embed). Pass the share/watch URL on its own line. */
	public function youtube( string $url ): string {
		$attrs = '{"url":' . wp_json_or_php( $url ) . ',"type":"video","providerNameSlug":"youtube","responsive":true,"className":"wp-embed-aspect-16-9 wp-has-aspect-ratio"}';
		return '<!-- wp:embed ' . $attrs . ' -->' . "\n"
			. '<figure class="wp-block-embed is-type-video is-provider-youtube wp-block-embed-youtube wp-embed-aspect-16-9 wp-has-aspect-ratio"><div class="wp-block-embed__wrapper">' . "\n"
			. $url . "\n"
			. '</div></figure>' . "\n"
			. '<!-- /wp:embed -->';
	}

	/**
	 * Kadence Tabs (kadence/tabs > kadence/tab). Each tab: {title, content} (one paragraph) or
	 * {title, blocks:[…]} (any composed blocks). The title list <ul> is rendered to match Kadence's
	 * save() for the captured styling attrs from soulful; the tab anchor slug + the "id" pattern on
	 * tabs 2..N mirror a fresh editor-saved tabs block (post 7045). English titles only — the slug
	 * strips non-ASCII, so CJK titles would not round-trip.
	 *
	 * @param array<int,array<string,mixed>> $tabs
	 */
	public function tabs( array $tabs ): string {
		$tid        = $this->uid();
		$n          = count( $tabs );
		$currentTab = 1;
		$titlesArr  = array();
		$liMarkup   = array();
		$tabMarkup  = array();
		$unknown    = array();
		foreach ( array_values( $tabs ) as $i => $tab ) {
			$num   = $i + 1;
			$title = (string) ( $tab['title'] ?? '' );
			$slug  = strtolower( (string) preg_replace( '/[^a-zA-Z0-9]/', '', $title ) );
			$titlesArr[] = array( 'text' => $title, 'icon' => '', 'iconSide' => 'right', 'onlyIcon' => false, 'subText' => '', 'anchor' => '' );
			$state = ( $num === $currentTab ) ? 'active' : 'inactive';
			$liMarkup[] = '<li id="tab-' . $slug . '" class="kt-title-item kt-title-item-' . $num . ' kt-tabs-svg-show-always kt-tabs-icon-side-right kt-tab-title-' . $state . '"><a href="#tab-' . $slug . '" data-tab="' . $num . '" class="kt-tab-title kt-tab-title-' . $num . ' "><span class="kt-title-text">' . $title . '</span></a></li>';

			if ( isset( $tab['blocks'] ) && is_array( $tab['blocks'] ) ) {
				$innerArr = $this->buildInner( $tab['blocks'], $unknown );
			} else {
				$innerArr = array( $this->paragraph( (string) ( $tab['content'] ?? '' ) ) );
			}
			$inner = implode( "\n\n", $innerArr );

			$pid       = $this->uid();
			$tabAttrs  = ( $num === 1 ) ? '{"uniqueID":"' . $pid . '"}' : '{"id":' . $num . ',"uniqueID":"' . $pid . '"}';
			$tabMarkup[] = '<!-- wp:kadence/tab ' . $tabAttrs . ' -->' . "\n"
				. '<div class="wp-block-kadence-tab kt-tab-inner-content kt-inner-tab-' . $num . ' kt-inner-tab' . $pid . '"><div class="kt-tab-inner-content-inner">' . $inner . '</div></div>' . "\n"
				. '<!-- /wp:kadence/tab -->';
		}

		// Styling attrs captured verbatim from soulful's tabs block; key order mirrors the stored block.
		// Palette values come from $this->theme (defaults = soulful's captured values → no-theme is
		// byte-identical; a tenant theme re-skins the title pills without code changes).
		$cb        = $this->theme['tabsContentBorder'];
		$wrapAttrs = array(
			'uniqueID'            => $tid,
			'mobileLayout'        => 'accordion',
			'currentTab'          => $currentTab,
			'minHeight'           => 400,
			'contentBorderStyles' => array( array( 'top' => array( $cb, '', 1 ), 'right' => array( $cb, '', 1 ), 'bottom' => array( $cb, '', 1 ), 'left' => array( $cb, '', 1 ), 'unit' => 'px' ) ),
			'titles'              => $titlesArr,
			'titleColor'          => $this->theme['tabsTitleColor'],
			'titleColorHover'     => $this->theme['tabsTitleColorHover'],
			'titleColorActive'    => $this->theme['tabsTitleColorActive'],
			'titleBg'             => $this->theme['tabsTitleBg'],
			'titleBgHover'        => $this->theme['tabsTitleBgHover'],
			'titleBgActive'       => $this->theme['tabsTitleBgActive'],
			'titleBorder'         => $this->theme['tabsTitleBorder'],
			'titleBorderHover'    => $this->theme['tabsTitleBorderHover'],
			'titleBorderActive'   => $this->theme['tabsTitleBorderActive'],
			'titleBorderWidth'    => array( 4, 0, 4, 4 ),
			'titleBorderRadius'   => array( 10, 0, 0, 10 ),
			'titlePadding'        => array( 12, 8, 12, 20 ),
			'titleMargin'         => array( 0, -4, 10, 0 ),
			'sizeType'            => 'em',
			'lineHeight'          => 1.4,
			'lineType'            => 'em',
		);

		return '<!-- wp:kadence/tabs ' . $this->attrsJson( $wrapAttrs ) . ' -->' . "\n"
			. '<div class="wp-block-kadence-tabs alignnone"><div class="kt-tabs-wrap kt-tabs-id' . $tid . ' kt-tabs-has-' . $n . '-tabs kt-active-tab-' . $currentTab . ' kt-tabs-layout-tabs kt-tabs-tablet-layout-inherit kt-tabs-mobile-layout-accordion kt-tab-alignment-left kt-create-accordion"><ul class="kt-tabs-title-list">'
			. implode( '', $liMarkup )
			. '</ul><div class="kt-tabs-content-wrap">'
			. implode( "\n\n", $tabMarkup )
			. '</div></div></div>' . "\n"
			. '<!-- /wp:kadence/tabs -->';
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
		// Re-skin the brand container background (both normal + hover are soulful's #31533d). Default
		// theme value is #31533d, so a no-theme call is a no-op (byte-identical); a tenant overrides it.
		$tpl = str_replace( '#31533d', $this->theme['infoboxBg'], $tpl );
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
	 * Self-describing capability manifest: every block type compose() accepts, its field contract, and a
	 * working example. This is the single source of truth for the GET /blocks endpoint, so an AI/app can
	 * discover what it can build WITHOUT a hand-written doc that drifts. The example of every entry is
	 * exercised by the test suite (each must compose with no 'unknown'), binding this list to the
	 * buildInner() switch — add a case without a manifest entry (or vice versa) and the suite fails.
	 *
	 * @return array<int,array{type:string,aliases:string[],desc:string,fields:array<int,array{name:string,type:string,required:bool,desc:string}>,example:array<string,mixed>}>
	 */
	public function manifest(): array {
		$f = function ( string $name, string $type, bool $required, string $desc ): array {
			return array( 'name' => $name, 'type' => $type, 'required' => $required, 'desc' => $desc );
		};
		return array(
			array( 'type' => 'heading', 'aliases' => array(), 'desc' => 'Kadence advanced heading (h1–h6).',
				'fields' => array( $f( 'text', 'string', true, 'Heading text (inline HTML allowed).' ), $f( 'level', 'int', false, 'Heading level 1–6 (default 2).' ) ),
				'example' => array( 'text' => 'Section title', 'level' => 2 ) ),
			array( 'type' => 'paragraph', 'aliases' => array( 'text' ), 'desc' => 'Body paragraph (Kadence advanced text).',
				'fields' => array( $f( 'text', 'string', true, 'Paragraph HTML.' ) ),
				'example' => array( 'text' => 'Some body copy.' ) ),
			array( 'type' => 'button', 'aliases' => array(), 'desc' => 'Kadence advanced button.',
				'fields' => array( $f( 'text', 'string', true, 'Button label.' ), $f( 'link', 'string', true, 'Target URL.' ) ),
				'example' => array( 'text' => 'Learn more', 'link' => 'https://example.com' ) ),
			array( 'type' => 'list', 'aliases' => array(), 'desc' => 'Core unordered (bullet) list.',
				'fields' => array( $f( 'items', 'string[]', true, 'List items (inline HTML allowed).' ) ),
				'example' => array( 'items' => array( 'First', 'Second' ) ) ),
			array( 'type' => 'quote', 'aliases' => array(), 'desc' => 'Core blockquote.',
				'fields' => array( $f( 'text', 'string', true, 'Quote HTML.' ) ),
				'example' => array( 'text' => 'A memorable line.' ) ),
			array( 'type' => 'form', 'aliases' => array(), 'desc' => 'Embed an existing Fluent Form by id.',
				'fields' => array( $f( 'form_id', 'int', true, 'Fluent Forms form id.' ) ),
				'example' => array( 'form_id' => 1 ) ),
			array( 'type' => 'image', 'aliases' => array(), 'desc' => 'Image. With a media id → Kadence image; URL-only → core image (server sideloads URLs to media on POST /post).',
				'fields' => array( $f( 'url', 'string', true, 'Image URL.' ), $f( 'alt', 'string', false, 'Alt text.' ), $f( 'id', 'int', false, 'Media-library attachment id (set by sideloader).' ) ),
				'example' => array( 'url' => 'https://example.com/photo.jpg', 'alt' => 'A photo' ) ),
			array( 'type' => 'spacer', 'aliases' => array(), 'desc' => 'Vertical spacer.',
				'fields' => array( $f( 'height', 'int', false, 'Height in px (default 30).' ) ),
				'example' => array( 'height' => 30 ) ),
			array( 'type' => 'divider', 'aliases' => array(), 'desc' => 'Horizontal separator.',
				'fields' => array(),
				'example' => array() ),
			array( 'type' => 'icon_list', 'aliases' => array( 'iconlist' ), 'desc' => 'Kadence icon list (default icon per item).',
				'fields' => array( $f( 'items', 'string[]', true, 'Item texts.' ) ),
				'example' => array( 'items' => array( 'Point one', 'Point two' ) ) ),
			array( 'type' => 'table', 'aliases' => array(), 'desc' => 'Kadence table; first row is the header. Border colour from theme.',
				'fields' => array( $f( 'rows', 'string[][]', true, '2D array of cells; row 0 = header.' ) ),
				'example' => array( 'rows' => array( array( 'Col A', 'Col B' ), array( '1', '2' ) ) ) ),
			array( 'type' => 'accordion', 'aliases' => array(), 'desc' => 'Kadence accordion of collapsible panes.',
				'fields' => array( $f( 'panes', 'array', true, 'List of {title, content}.' ) ),
				'example' => array( 'panes' => array( array( 'title' => 'Pane one', 'content' => 'Body one.' ), array( 'title' => 'Pane two', 'content' => 'Body two.' ) ) ) ),
			array( 'type' => 'tabs', 'aliases' => array(), 'desc' => 'Kadence tabs. Each tab: {title, content} or {title, blocks:[…]}. English titles only (slug strips non-ASCII). Title palette from theme.',
				'fields' => array( $f( 'tabs', 'array', true, 'List of {title, content|blocks}.' ) ),
				'example' => array( 'tabs' => array( array( 'title' => 'Alpha', 'content' => 'First tab.' ), array( 'title' => 'Beta', 'content' => 'Second tab.' ) ) ) ),
			array( 'type' => 'youtube', 'aliases' => array( 'embed', 'video' ), 'desc' => 'Core YouTube/video embed.',
				'fields' => array( $f( 'url', 'string', true, 'Watch/share URL.' ) ),
				'example' => array( 'url' => 'https://youtu.be/dQw4w9WgXcQ' ) ),
			array( 'type' => 'infobox', 'aliases' => array( 'info_box' ), 'desc' => 'Kadence info box (captured skeleton). Brand background from theme.',
				'fields' => array( $f( 'title', 'string', true, 'Box title.' ), $f( 'text', 'string', true, 'Box body.' ), $f( 'cta', 'string', false, 'Learn-more label (default "Read More").' ) ),
				'example' => array( 'title' => 'Did you know?', 'text' => 'An interesting fact.', 'cta' => 'Read More' ) ),
			array( 'type' => 'gallery', 'aliases' => array(), 'desc' => 'Core gallery from image URLs.',
				'fields' => array( $f( 'urls', 'string[]', true, 'Image URLs.' ) ),
				'example' => array( 'urls' => array( 'https://example.com/a.jpg', 'https://example.com/b.jpg' ) ) ),
		);
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
