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
	// EVERY colour is a Kadence Global-Palette TOKEN (paletteN / CSS var), never a literal hex. Tokens
	// render as live `var(--global-paletteN)`, so when the site owner edits the Kadence Global Palette the
	// colours in already-published posts follow automatically — no regeneration. (Operator directive
	// 2026-06-09 "全部吃 Kadence，WP 改顏色也要跟著改"; this supersedes the prior fixed table-border
	// #A7A5A5 standing default.) Slots chosen by closest match to the previously-hardcoded values on the
	// soulful reference palette (palette9 = lightest ≈ white text; palette5 = mid ≈ visible border).
	private const DEFAULT_THEME = array(
		// Kadence Tabs — title pill palette (Kadence "paletteN" tokens or literal #hex / CSS var).
		'tabsTitleColor'        => 'palette9',
		'tabsTitleColorHover'   => 'palette1',
		'tabsTitleColorActive'  => 'var(--global-palette5, #444444)',
		'tabsTitleBg'           => 'palette3',
		'tabsTitleBgHover'      => 'palette2',
		'tabsTitleBgActive'     => 'palette2',
		'tabsTitleBorder'       => 'palette1',
		'tabsTitleBorderHover'  => 'palette2',
		'tabsTitleBorderActive' => 'palette2',
		'tabsContentBorder'     => 'palette5',
		// Kadence Table — cell border colour (all four sides).
		'tableBorder'           => 'palette5',
		// Kadence Info Box — brand container background. A Kadence palette TOKEN (not a literal hex), so it
		// inherits the site's Global Palette automatically: palette1 = the site's primary brand colour
		// (soulful: #1c3e5a navy). This is the "eat the WP settings" default — no per-tenant config. The
		// captured skeleton's literal #31533d (soulful's OLD green) is swapped to this token at render.
		'infoboxBg'             => 'palette1',
		// card (Kadence info box with icon, whole box is the link). Kadence palette roles: palette9 = base
		// background, palette7 = border/subtle, palette3 = strongest text, palette4 = body text, palette1 = accent.
		'cardBg'                => 'palette9',
		'cardBorder'            => 'palette7',
		'cardBorderHover'       => 'palette1',
		'cardTitle'             => 'palette3',
		'cardText'              => 'palette4',
		'cardIcon'              => 'palette1',
		// buttons: an "outline" button (a "fill" button takes the theme's own button colours).
		'outlineText'           => 'palette3',
		'outlineTextHover'      => 'palette1',
		'outlineBorder'         => 'palette5',
		'outlineBorderHover'    => 'palette1',
		// icon list with options (columns / icon): icon and text colours.
		'iconListIcon'          => 'palette1',
		'iconListText'          => 'palette4',
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

	/**
	 * @param array<string,mixed> $style optional: color, align, size [desktop, mobile], margin [t,r,b,l],
	 *                                   letter_spacing, link, link_color, link_hover_color (see styledText()).
	 *                                   Empty = the original unstyled markup, byte-identical to earlier versions.
	 */
	public function heading( string $text, int $level = 2, array $style = array() ): string {
		$level = ( $level >= 1 && $level <= 6 ) ? $level : 2;
		return $style === array() ? $this->advText( $text, 'h' . $level ) : $this->styledText( $text, $level, $style );
	}

	/** @param array<string,mixed> $style see heading(). */
	public function paragraph( string $html, array $style = array() ): string {
		return $style === array() ? $this->advText( $html, 'p' ) : $this->styledText( $html, 0, $style );
	}

	/**
	 * Styled Kadence advanced heading/text, in the exact form the Kadence editor saves (attribute order =
	 * the block's block.json order; defaults omitted). $level 0 = paragraph (htmlTag "p"), 1–6 = h1–h6.
	 * Colours must be palette tokens; anything else is dropped (the block then uses the theme's colour).
	 *
	 * @param array<string,mixed> $style
	 */
	private function styledText( string $html, int $level, array $style ): string {
		$id    = $this->uid();
		$attrs = array();
		if ( $level >= 1 && $level !== 2 ) {
			$attrs['level'] = $level;
		}
		$attrs['uniqueID'] = $id;
		if ( in_array( $style['align'] ?? '', array( 'left', 'center', 'right' ), true ) ) {
			$attrs['align'] = $style['align'];
		}
		if ( $this->isPaletteToken( $style['color'] ?? null ) ) {
			$attrs['color'] = $style['color'];
		}
		if ( isset( $style['letter_spacing'] ) && ( is_int( $style['letter_spacing'] ) || ( is_float( $style['letter_spacing'] ) && is_finite( $style['letter_spacing'] ) ) ) ) {
			$attrs['letterSpacing'] = $style['letter_spacing'] + 0;
		}
		if ( isset( $style['margin'] ) && is_array( $style['margin'] ) ) {
			$attrs['margin'] = $this->numbers( $style['margin'], 4 );
		}
		$tag = $level >= 1 ? 'h' . $level : 'p';
		if ( $level === 0 ) {
			$attrs['htmlTag'] = 'p';
		}
		$link = $this->str( $style['link'] ?? '' );
		if ( $link !== '' ) {
			$attrs['link']      = $link;
			$attrs['linkStyle'] = 'none';
			if ( $this->isPaletteToken( $style['link_color'] ?? null ) ) {
				$attrs['linkColor'] = $style['link_color'];
			}
			if ( $this->isPaletteToken( $style['link_hover_color'] ?? null ) ) {
				$attrs['linkHoverColor'] = $style['link_hover_color'];
			}
		}
		if ( isset( $style['size'] ) && is_array( $style['size'] ) ) {
			$size              = array_values( $style['size'] );
			$attrs['fontSize'] = array( $this->num( $size[0] ?? '' ), '', $this->num( $size[1] ?? '' ) );
		}
		$inner = '<' . $tag . ' class="kt-adv-heading' . $id . ' wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading' . $id . '">' . $html . '</' . $tag . '>';
		if ( $link !== '' ) {
			$inner = '<a href="' . htmlspecialchars( $link, ENT_QUOTES ) . '" class="kb-advanced-heading-link kt-adv-heading-link' . $id . ' hls-none">' . $inner . '</a>';
		}
		return '<!-- wp:kadence/advancedheading ' . $this->attrsJson( $attrs ) . ' -->' . "\n" . $inner . "\n" . '<!-- /wp:kadence/advancedheading -->';
	}

	/** Kadence palette token only ("palette1".."palette15"): the colours of the newer bricks follow the site palette. */
	private function isPaletteToken( $v ): bool {
		return is_string( $v ) && (bool) preg_match( '/^palette([1-9]|1[0-5])$/', $v );
	}

	/** A number stays a number, a Kadence spacing preset (xs, sm, md, lg, xl, xxl, 0) or "" stays a string. */
	private function num( $v ) {
		if ( is_int( $v ) || ( is_float( $v ) && is_finite( $v ) ) ) {
			return $v;
		}
		if ( ! is_string( $v ) ) {
			return '';
		}
		return (bool) preg_match( '/^(xs|sm|md|lg|xl|xxl|[0-9]+(\.[0-9]+)?)?$/', $v ) ? $v : '';
	}

	/** The value as a string when it is a string, else "" (no "Array to string" warnings from caller data). */
	private function str( $v ): string {
		return is_string( $v ) ? $v : '';
	}

	/** @return array<int,mixed> exactly $n entries via num(). */
	private function numbers( array $v, int $n ): array {
		$v   = array_values( $v );
		$out = array();
		for ( $i = 0; $i < $n; $i++ ) {
			$out[] = $this->num( $v[ $i ] ?? '' );
		}
		return $out;
	}

	/** Four-sided Kadence border attribute in a palette colour. */
	private function borderAttr( string $token, int $width ): array {
		$side = array( $token, 'solid', $width );
		return array( array( 'top' => $side, 'right' => $side, 'bottom' => $side, 'left' => $side, 'unit' => 'px' ) );
	}

	/**
	 * Section: a full-width Kadence Row Layout with 1–6 columns, each holding any composed blocks. Every
	 * colour is a palette token or a gradient between palette tokens; the inner content width follows the
	 * theme's content width unless max_width is set.
	 *
	 * @param array<string,mixed>          $opts    background (paletteN), gradient {from,to,angle|shape:"radial"},
	 *                                              text_color, padding [t,r,b,l], mobile_padding, layout
	 *                                              (Kadence colLayout, e.g. equal, left-golden), tablet_layout,
	 *                                              mobile_layout (row | two-grid | equal …), gap [desktop, mobile] px,
	 *                                              equal_height, valign (top|middle|bottom), max_width px, anchor,
	 *                                              show_to (guests | members).
	 * @param array<int,array<string,mixed>> $columns each: {blocks:[…], style:{background, border, radius, padding, mobile_padding}}
	 * @param string[]                       $unknown collects unsupported inner block types (by reference).
	 */
	public function section( array $opts, array $columns, array &$unknown = array() ): string {
		$columns = array_values( $columns );
		if ( count( $columns ) > 6 ) {
			$unknown[] = 'section:more_than_6_columns'; // reported, never silently cut
			$columns   = array_slice( $columns, 0, 6 );
		}
		foreach ( $columns as $col ) {
			if ( ! is_array( $col ) || ( $col !== array() && ! ( isset( $col['blocks'] ) && is_array( $col['blocks'] ) ) ) ) {
				$unknown[] = 'section:column_without_blocks';
			}
		}
		if ( $columns === array() ) {
			$columns = array( array( 'blocks' => array() ) );
		}
		$n     = count( $columns );
		$rid   = $this->uid();
		$attrs = array( 'uniqueID' => $rid );
		if ( $n !== 2 ) {
			$attrs['columns'] = $n;
		}
		$layouts = '/^(row|equal|two-grid|left-golden|right-golden|left-half|right-half|center-half|center-wide|center-exwide|first-row|last-row|grid-layout)$/';
		// Block defaults (mobile "row", tablet "inherit") are omitted, as the editor saves them.
		foreach ( array( 'mobile_layout' => 'mobileLayout', 'tablet_layout' => 'tabletLayout' ) as $k => $a ) {
			$v = $this->str( $opts[ $k ] ?? '' );
			if ( preg_match( $layouts, $v ) && ! ( $k === 'mobile_layout' && $v === 'row' ) ) {
				$attrs[ $a ] = $v;
			}
		}
		if ( isset( $opts['gap'] ) && is_array( $opts['gap'] ) ) {
			$g                        = array_values( $opts['gap'] );
			$gap                      = array( (int) ( $g[0] ?? 0 ), (int) ( $g[0] ?? 0 ), (int) ( $g[1] ?? $g[0] ?? 0 ) );
			$attrs['collapseGutter']  = 'custom';
			$attrs['customRowGutter'] = $gap;
			$attrs['columnGutter']    = 'custom';
			$attrs['customGutter']    = $gap;
		}
		// Desktop layouts other than "equal" exist only for a given column count (Kadence's own choices).
		$byCount            = array( 2 => array( 'left-golden', 'right-golden' ), 3 => array( 'left-half', 'right-half', 'center-half', 'center-wide', 'center-exwide' ) );
		$layout             = $this->str( $opts['layout'] ?? '' );
		$attrs['colLayout'] = in_array( $layout, $byCount[ $n ] ?? array(), true ) ? $layout : 'equal';
		$maxWidth           = isset( $opts['max_width'] ) ? (int) $opts['max_width'] : 0;
		if ( $maxWidth > 0 ) {
			$attrs['maxWidth'] = $maxWidth;
		}
		if ( $this->isPaletteToken( $opts['background'] ?? null ) ) {
			$attrs['bgColor'] = $opts['background'];
		}
		if ( in_array( $opts['valign'] ?? '', array( 'middle', 'bottom' ), true ) ) {
			$attrs['verticalAlignment'] = $opts['valign'];
		}
		if ( $this->isPaletteToken( $opts['text_color'] ?? null ) ) {
			$attrs['textColor'] = $opts['text_color'];
		}
		if ( ! empty( $opts['equal_height'] ) ) {
			$attrs['columnsInnerHeight'] = true;
		}
		$gradient = $this->gradient( $opts['gradient'] ?? null );
		if ( $gradient !== '' ) {
			$attrs['backgroundSettingTab'] = 'gradient';
		}
		if ( $maxWidth <= 0 ) {
			$attrs['inheritMaxWidth'] = true;
		}
		$showTo = $opts['show_to'] ?? '';
		if ( $showTo === 'guests' ) {
			$attrs['loggedIn'] = true; // Kadence: hide from logged-in users
		} elseif ( $showTo === 'members' ) {
			$attrs['loggedOut'] = true; // Kadence: hide from logged-out users
		}
		if ( $gradient !== '' ) {
			$attrs['gradient'] = $gradient;
		}
		if ( isset( $opts['padding'] ) && is_array( $opts['padding'] ) ) {
			$attrs['padding'] = $this->numbers( $opts['padding'], 4 );
		}
		if ( isset( $opts['mobile_padding'] ) && is_array( $opts['mobile_padding'] ) ) {
			$attrs['mobilePadding'] = $this->numbers( $opts['mobile_padding'], 4 );
		}
		$anchor = $this->str( $opts['anchor'] ?? '' );
		if ( preg_match( '/^[A-Za-z][A-Za-z0-9_-]*$/', $anchor ) ) {
			$attrs['anchor'] = $anchor;
		}
		$attrs['kbVersion'] = 2;

		$cols = array();
		foreach ( $columns as $i => $col ) {
			$blocks = ( is_array( $col ) && isset( $col['blocks'] ) && is_array( $col['blocks'] ) ) ? $col['blocks'] : array();
			$style  = ( is_array( $col ) && isset( $col['style'] ) && is_array( $col['style'] ) ) ? $col['style'] : array();
			$cols[] = $this->column( $i + 1, $this->buildInner( $blocks, $unknown ), $style );
		}
		return '<!-- wp:kadence/rowlayout ' . $this->attrsJson( $attrs ) . ' -->' . "\n"
			. implode( "\n\n", $cols ) . "\n"
			. '<!-- /wp:kadence/rowlayout -->';
	}

	/** @param string[] $inner @param array<string,mixed> $style */
	private function column( int $index, array $inner, array $style ): string {
		$cid   = $this->uid();
		$attrs = array();
		if ( $index > 1 ) {
			$attrs['id'] = $index;
		}
		if ( $this->isPaletteToken( $style['background'] ?? null ) ) {
			$attrs['background'] = $style['background'];
		}
		// The column editor migrates the legacy borderWidth default [0,0,0,0] into borderStyle on open (setting
		// its widths to ""), which would drop a border on the next save; this is the already-migrated form.
		$attrs['borderWidth'] = array( '', '', '', '' );
		if ( isset( $style['radius'] ) && is_numeric( $style['radius'] ) ) {
			$r                     = (int) $style['radius'];
			$attrs['borderRadius'] = array( $r, $r, $r, $r );
		}
		$attrs['uniqueID'] = $cid;
		if ( isset( $style['padding'] ) && is_array( $style['padding'] ) ) {
			$attrs['padding'] = $this->numbers( $style['padding'], 4 );
		}
		if ( isset( $style['mobile_padding'] ) && is_array( $style['mobile_padding'] ) ) {
			$attrs['mobilePadding'] = $this->numbers( $style['mobile_padding'], 4 );
		}
		if ( $this->isPaletteToken( $style['border'] ?? null ) ) {
			$attrs['borderStyle'] = $this->borderAttr( $style['border'], 1 );
		}
		$attrs['kbVersion'] = 2;
		return '<!-- wp:kadence/column ' . $this->attrsJson( $attrs ) . ' -->' . "\n"
			. '<div class="wp-block-kadence-column kadence-column' . $cid . '"><div class="kt-inside-inner-col">' . implode( "\n\n", $inner ) . '</div></div>' . "\n"
			. '<!-- /wp:kadence/column -->';
	}

	/** CSS gradient between two palette tokens ("" when the spec is not palette-only). @param mixed $g */
	private function gradient( $g ): string {
		if ( ! is_array( $g ) || ! $this->isPaletteToken( $g['from'] ?? null ) || ! $this->isPaletteToken( $g['to'] ?? null ) ) {
			return '';
		}
		$from = 'var(--global-' . $g['from'] . ')';
		$to   = 'var(--global-' . $g['to'] . ')';
		if ( ( $g['shape'] ?? '' ) === 'radial' ) {
			return 'radial-gradient(ellipse at top,' . $from . ' 0%,' . $to . ' 70%)';
		}
		$angle = isset( $g['angle'] ) ? (int) $g['angle'] : 180;
		return 'linear-gradient(' . $angle . 'deg,' . $from . ' 0%,' . $to . ' 100%)';
	}

	/**
	 * Button row: Kadence advanced buttons holding several single buttons. A "fill" button takes the theme's
	 * button colours; an "outline" button takes the outline* theme tokens.
	 *
	 * @param array<int,array<string,mixed>> $buttons each: {text, link, style: fill|outline, size: small|standard|large}
	 * @param array<string,mixed>            $opts    align (left|center|right), mobile_align, gap [desktop, mobile] (xs|sm|md|lg)
	 */
	public function buttons( array $buttons, array $opts = array(), array &$unknown = array() ): string {
		$w     = $this->uid();
		$attrs = array();
		$align = $opts['align'] ?? 'center';
		if ( in_array( $align, array( 'left', 'right' ), true ) ) {
			$attrs['hAlign'] = $align;
		}
		if ( in_array( $opts['mobile_align'] ?? '', array( 'left', 'center', 'right' ), true ) ) {
			$attrs['mhAlign'] = $opts['mobile_align'];
		}
		$attrs['uniqueID'] = $w;
		if ( isset( $opts['gap'] ) && is_array( $opts['gap'] ) ) {
			$g             = array_values( $opts['gap'] );
			$preset        = '/^(xs|sm|md|lg|xl)$/';
			$g0            = $this->str( $g[0] ?? '' );
			$g1            = $this->str( $g[1] ?? '' );
			$attrs['gap'] = array( preg_match( $preset, $g0 ) ? $g0 : 'xs', '', preg_match( $preset, $g1 ) ? $g1 : '' );
		}
		$singles = array();
		foreach ( $buttons as $b ) {
			if ( ! is_array( $b ) ) {
				$unknown[] = 'buttons:item_not_an_object'; // reported, never silently dropped
				continue;
			}
			$a = array(
				'uniqueID' => $this->uid(),
				'text'     => $this->str( $b['text'] ?? '' ),
				'link'     => $this->str( $b['link'] ?? '' ),
			);
			if ( in_array( $b['size'] ?? '', array( 'small', 'large' ), true ) ) {
				$a['sizePreset'] = $b['size'];
			}
			if ( ( $b['style'] ?? 'fill' ) === 'outline' ) {
				$a['color']            = $this->theme['outlineText'];
				$a['colorHover']       = $this->theme['outlineTextHover'];
				$a['borderStyle']      = $this->borderAttr( $this->theme['outlineBorder'], 1 );
				$a['borderHoverStyle'] = $this->borderAttr( $this->theme['outlineBorderHover'], 1 );
				$a['inheritStyles']    = '';
				$a['kbPreset']         = 'outline';
			}
			$singles[] = '<!-- wp:kadence/singlebtn ' . $this->attrsJson( $a ) . ' /-->';
		}
		return '<!-- wp:kadence/advancedbtn ' . $this->attrsJson( $attrs ) . ' -->' . "\n"
			. '<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns' . $w . '">' . implode( "\n\n", $singles ) . '</div>' . "\n"
			. '<!-- /wp:kadence/advancedbtn -->';
	}

	/**
	 * Card: Kadence info box with a Kadence icon, a title and one line of text; the whole box is a link.
	 * Equal height inside a section with equal_height. Colours come from the card* theme tokens.
	 */
	public function card( string $title, string $text, string $link, string $icon = 'fe_star' ): string {
		$id   = $this->uid();
		$icon = preg_match( '/^[a-z]{2,3}_[A-Za-z0-9]+$/', $icon ) ? $icon : 'fe_star';
		$link = $link !== '' ? $link : '#';
		$tk   = $this->theme;
		$attrs = array(
			'uniqueID'                 => $id,
			'hAlign'                   => 'left',
			'containerBackground'      => $tk['cardBg'],
			'containerHoverBackground' => $tk['cardBg'],
			'containerPadding'         => array( 24, 24, 24, 24 ),
			'containerMobilePadding'   => array( 16, 14, 16, 14 ),
			'mediaIcon'                => array( array( 'icon' => $icon, 'size' => 28, 'unit' => 'px', 'width' => 2, 'title' => '', 'color' => $tk['cardIcon'], 'hoverColor' => $tk['cardIcon'], 'hoverAnimation' => 'none', 'flipIcon' => '', 'tabletSize' => '', 'mobileSize' => '' ) ),
			'mediaStyle'               => array( array( 'background' => '', 'hoverBackground' => '', 'border' => '', 'hoverBorder' => '', 'borderRadius' => 0, 'borderRadiusUnit' => 'px', 'borderWidth' => array( 0, 0, 0, 0 ), 'borderWidthUnit' => 'px', 'padding' => array( 0, 0, 0, 0 ), 'paddingUnit' => 'px', 'margin' => array( 0, 0, 12, 0 ), 'marginUnit' => 'px' ) ),
			'titleColor'               => $tk['cardTitle'],
			'titleHoverColor'          => $tk['cardTitle'],
			'titleFont'                => array( array( 'level' => 3, 'size' => array( 20, '', 19 ), 'sizeType' => 'px', 'lineHeight' => array( 1.4, '', '' ), 'lineType' => '', 'letterSpacing' => '', 'textTransform' => '', 'family' => '', 'google' => false, 'style' => '', 'weight' => '', 'variant' => '', 'subset' => '', 'loadGoogle' => true, 'padding' => array( '', '', '', '' ), 'paddingControl' => 'linked', 'margin' => array( 0, 0, 6, 0 ), 'marginControl' => 'individual', 'paddingUnit' => 'px', 'marginUnit' => 'px' ) ),
			'textColor'                => $tk['cardText'],
			'textHoverColor'           => $tk['cardText'],
			'textFont'                 => array( array( 'size' => array( 15, '', 15 ), 'sizeType' => 'px', 'lineHeight' => array( 1.6, '', '' ), 'lineType' => '', 'letterSpacing' => '', 'family' => '', 'google' => '', 'style' => '', 'weight' => '', 'variant' => '', 'subset' => '', 'loadGoogle' => true, 'textTransform' => '' ) ),
			'borderStyle'              => $this->borderAttr( $tk['cardBorder'], 1 ),
			'borderHoverStyle'         => $this->borderAttr( $tk['cardBorderHover'], 1 ),
			'borderRadius'             => array( 12, 12, 12, 12 ),
			'fullHeight'               => true,
			'kbVersion'                => 2,
		);
		return '<!-- wp:kadence/infobox ' . $this->attrsJson( $attrs ) . ' -->' . "\n"
			. '<div class="wp-block-kadence-infobox kt-info-box' . $id . '"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="' . htmlspecialchars( $link, ENT_QUOTES ) . '"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="' . $icon . '" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">' . $title . '</h3><p class="kt-blocks-info-box-text">' . $text . '</p></div></a></div>' . "\n"
			. '<!-- /wp:kadence/infobox -->';
	}

	/**
	 * A server-rendered block from another plugin (e.g. "aware-wave/oracle" {"tool":"ziwei"}), as a
	 * self-closing block comment. Core and Kadence names are refused: those have their own bricks.
	 * Attribute values must be scalars. Returns "" when the name or attributes are not acceptable.
	 *
	 * @param array<string,mixed> $attrs
	 */
	public function pluginBlock( string $name, array $attrs = array() ): string {
		if ( ! preg_match( '/^[a-z0-9-]+\/[a-z0-9-]+$/', $name ) || preg_match( '/^(core|kadence)\//', $name ) ) {
			return '';
		}
		foreach ( $attrs as $k => $v ) {
			if ( ! is_string( $k ) || ! ( is_string( $v ) || is_int( $v ) || ( is_float( $v ) && is_finite( $v ) ) || is_bool( $v ) ) ) {
				return '';
			}
		}
		return '<!-- wp:' . $name . ( $attrs === array() ? '' : ' ' . $this->attrsJson( $attrs ) ) . ' /-->';
	}

	/** Core shortcode block. "" when the text could break out of the block comment. */
	public function shortcode( string $text ): string {
		$text = trim( $text );
		if ( $text === '' || strpos( $text, '<!--' ) !== false || strpos( $text, '-->' ) !== false ) {
			return '';
		}
		return '<!-- wp:shortcode -->' . "\n" . $text . "\n" . '<!-- /wp:shortcode -->';
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

	/**
	 * Reference a saved synced pattern (wp_block post) by id. Emits the core synced-pattern reference
	 * block so WordPress renders the site owner's hand-designed reusable pattern (e.g. a funnel CTA).
	 * The id is cast to int by the caller, so no escaping is needed inside the JSON attribute.
	 */
	public function pattern( int $ref ): string {
		return '<!-- wp:block {"ref":' . $ref . '} /-->';
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

	/**
	 * Kadence Icon List from plain-text items (matches soulful's real iconlist markup).
	 *
	 * @param string[]            $items
	 * @param array<string,mixed> $opts  optional: icon (e.g. fe_check), columns, tablet_columns, mobile_columns,
	 *                                   align (center), size px. Empty = the original markup, byte-identical.
	 */
	public function iconList( array $items, array $opts = array() ): string {
		if ( $opts !== array() ) {
			return $this->iconListStyled( $items, $opts );
		}
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

	/** @param string[] $items @param array<string,mixed> $opts see iconList(). */
	private function iconListStyled( array $items, array $opts ): string {
		$listId = $this->uid();
		$icon   = ( isset( $opts['icon'] ) && preg_match( '/^[a-z]{2,3}_[A-Za-z0-9]+$/', (string) $opts['icon'] ) ) ? (string) $opts['icon'] : 'fe_check';
		$cols   = max( 1, min( 5, (int) ( $opts['columns'] ?? 1 ) ) );
		$tab    = isset( $opts['tablet_columns'] ) ? max( 1, min( 5, (int) $opts['tablet_columns'] ) ) : 0;
		$mob    = isset( $opts['mobile_columns'] ) ? max( 1, min( 5, (int) $opts['mobile_columns'] ) ) : 0;
		$size   = isset( $opts['size'] ) ? (int) $opts['size'] : 17;
		$center = ( $opts['align'] ?? '' ) === 'center';
		$attrs  = array(
			'listStyles' => array( array( 'size' => array( $size, '', $size > 16 ? 16 : $size ), 'sizeType' => 'px', 'lineHeight' => array( '', '', '' ), 'lineType' => 'px', 'letterSpacing' => '', 'family' => '', 'google' => false, 'style' => '', 'weight' => '', 'variant' => '', 'subset' => '', 'loadGoogle' => true, 'color' => $this->theme['iconListText'], 'textTransform' => '' ) ),
		);
		if ( $cols !== 1 ) {
			$attrs['columns'] = $cols;
		}
		if ( $tab > 0 ) {
			$attrs['tabletColumns'] = $tab;
		}
		if ( $mob > 0 ) {
			$attrs['mobileColumns'] = $mob;
		}
		$attrs['listGap']   = 12;
		$attrs['columnGap'] = 24;
		$attrs['uniqueID']  = $listId;
		if ( $center ) {
			$attrs['blockAlignment'] = 'center';
		}
		$attrs['listMargin'] = array( '0', '0', '0', '0' );
		$attrs['iconSize']   = array( 22, '', '' );
		$attrs['color']      = $this->theme['iconListIcon'];
		$li = array();
		foreach ( $items as $text ) {
			$iid  = $this->uid();
			$li[] = '<!-- wp:kadence/listitem {"uniqueID":"' . $iid . '","icon":"' . $icon . '"} -->' . "\n"
				. '<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-' . $iid . '"><span data-name="' . $icon . '" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">' . (string) $text . '</span></li>' . "\n"
				. '<!-- /wp:kadence/listitem -->';
		}
		$class = 'wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items' . $listId . ' kt-svg-icon-list-columns-' . $cols . ( $center ? ' aligncenter' : ' alignnone' )
			. ( $tab > 0 ? ' kt-tablet-svg-icon-list-columns-' . $tab : '' ) . ( $mob > 0 ? ' kt-mobile-svg-icon-list-columns-' . $mob : '' );
		return '<!-- wp:kadence/iconlist ' . $this->attrsJson( $attrs ) . ' -->' . "\n"
			. '<div class="' . $class . '"><ul class="kt-svg-icon-list">' . implode( "\n\n", $li ) . '</ul></div>' . "\n"
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
		// Swap the captured skeleton's literal brand colour (soulful's OLD green #31533d, in both the
		// container bg + hover bg) for the theme token — default 'palette1' makes it inherit the site's
		// Global Palette (live-follows WP palette edits), instead of being frozen as a stale hex.
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
	 * Compose a whole page: the specs are emitted top level, without compose()'s wrapping row, so each
	 * "section" spec is its own full-width band. Any other block type is allowed too.
	 *
	 * @param array<int,array<string,mixed>> $blocks each: {type, ...content}; usually {type:"section", ...}.
	 * @return array{content:string, unknown:string[]}
	 */
	public function composePage( array $blocks ): array {
		$unknown = array();
		$inner   = $this->buildInner( $blocks, $unknown );
		return array( 'content' => implode( "\n\n", $inner ), 'unknown' => $unknown );
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
				'fields' => array( $f( 'text', 'string', true, 'Heading text (inline HTML allowed).' ), $f( 'level', 'int', false, 'Heading level 1–6 (default 2).' ), $f( 'style', 'object', false, 'Optional {color: paletteN, align, size:[desktop,mobile], margin:[t,r,b,l], letter_spacing, link, link_color, link_hover_color}.' ) ),
				'example' => array( 'text' => 'Section title', 'level' => 2 ) ),
			array( 'type' => 'paragraph', 'aliases' => array( 'text' ), 'desc' => 'Body paragraph (Kadence advanced text).',
				'fields' => array( $f( 'text', 'string', true, 'Paragraph HTML.' ), $f( 'style', 'object', false, 'Optional, same keys as heading.style.' ) ),
				'example' => array( 'text' => 'Some body copy.' ) ),
			array( 'type' => 'section', 'aliases' => array(), 'desc' => 'Full-width Kadence row with 1–6 columns of any blocks; background, gradient and text colour are palette tokens. Use composePage() for top-level bands.',
				'fields' => array( $f( 'options', 'object', false, '{background, gradient:{from,to,angle|shape:"radial"}, text_color, padding, mobile_padding, layout, tablet_layout, mobile_layout, gap:[desktop,mobile], equal_height, valign, max_width, anchor, show_to: guests|members}.' ), $f( 'columns', 'array', true, 'List of {blocks:[…], style:{background, border, radius, padding, mobile_padding}}.' ) ),
				'example' => array( 'options' => array( 'background' => 'palette8', 'padding' => array( 48, 'sm', 48, 'sm' ) ), 'columns' => array( array( 'blocks' => array( array( 'type' => 'heading', 'text' => 'Band title' ) ) ) ) ) ),
			array( 'type' => 'buttons', 'aliases' => array(), 'desc' => 'Row of Kadence buttons; fill = theme button colours, outline = outline theme tokens.',
				'fields' => array( $f( 'buttons', 'array', true, 'List of {text, link, style: fill|outline, size: small|standard|large}.' ), $f( 'options', 'object', false, '{align, mobile_align, gap:[desktop,mobile]}.' ) ),
				'example' => array( 'buttons' => array( array( 'text' => 'Start', 'link' => '#start' ), array( 'text' => 'More', 'link' => '/more/', 'style' => 'outline' ) ) ) ),
			array( 'type' => 'card', 'aliases' => array(), 'desc' => 'Linked card (Kadence info box with icon, title, one line of text); card* theme tokens.',
				'fields' => array( $f( 'title', 'string', true, 'Card title.' ), $f( 'text', 'string', true, 'One line of text.' ), $f( 'link', 'string', true, 'Target URL (whole card).' ), $f( 'icon', 'string', false, 'Kadence icon name, e.g. fe_star.' ) ),
				'example' => array( 'title' => 'A tool', 'text' => 'What it does.', 'link' => '/tool/', 'icon' => 'fe_star' ) ),
			array( 'type' => 'plugin_block', 'aliases' => array(), 'desc' => 'A server-rendered block of another plugin (not core/kadence), self-closing; scalar attributes only.',
				'fields' => array( $f( 'name', 'string', true, 'Block name, e.g. aware-wave/oracle.' ), $f( 'attrs', 'object', false, 'Scalar attributes.' ) ),
				'example' => array( 'name' => 'aware-wave/oracle', 'attrs' => array( 'tool' => 'ziwei' ) ) ),
			array( 'type' => 'shortcode', 'aliases' => array(), 'desc' => 'Core shortcode block.',
				'fields' => array( $f( 'text', 'string', true, 'The shortcode, e.g. [my_shortcode].' ) ),
				'example' => array( 'text' => '[my_shortcode]' ) ),
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
				'fields' => array( $f( 'items', 'string[]', true, 'Item texts.' ), $f( 'options', 'object', false, 'Optional {icon, columns, tablet_columns, mobile_columns, align: center, size}; iconList* theme tokens.' ) ),
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
			array( 'type' => 'pattern', 'aliases' => array(), 'desc' => 'Reference a saved synced pattern (wp_block) by id; renders the site owner\'s reusable pattern/funnel CTA.',
				'fields' => array( $f( 'ref', 'int', true, 'wp_block post id of the synced pattern.' ) ),
				'example' => array( 'ref' => 123 ) ),
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
	/** The value when it is an array, else array() (a stray "style":"x" must not turn on the styled path). */
	private function arr( $v ): array {
		return is_array( $v ) ? $v : array();
	}

	private function buildInner( array $blocks, array &$unknown ): array {
		$inner = array();
		foreach ( $blocks as $b ) {
			$type = isset( $b['type'] ) ? (string) $b['type'] : '';
			switch ( $type ) {
				case 'heading':
					$inner[] = $this->heading( (string) ( $b['text'] ?? '' ), (int) ( $b['level'] ?? 2 ), $this->arr( $b['style'] ?? null ) );
					break;
				case 'paragraph':
				case 'text':
					$inner[] = $this->paragraph( (string) ( $b['text'] ?? '' ), $this->arr( $b['style'] ?? null ) );
					break;
				case 'section':
					$inner[] = $this->section( $this->arr( $b['options'] ?? null ), $this->arr( $b['columns'] ?? null ), $unknown );
					break;
				case 'buttons':
					$inner[] = $this->buttons( $this->arr( $b['buttons'] ?? null ), $this->arr( $b['options'] ?? null ), $unknown );
					break;
				case 'card':
					$inner[] = $this->card( (string) ( $b['title'] ?? '' ), (string) ( $b['text'] ?? '' ), (string) ( $b['link'] ?? '' ), (string) ( $b['icon'] ?? 'fe_star' ) );
					break;
				case 'plugin_block':
					$pb = $this->pluginBlock( $this->str( $b['name'] ?? '' ), $this->arr( $b['attrs'] ?? null ) );
					if ( $pb === '' ) {
						$unknown[] = 'plugin_block:' . (string) ( $b['name'] ?? '' );
					} else {
						$inner[] = $pb;
					}
					break;
				case 'shortcode':
					$sc = $this->shortcode( (string) ( $b['text'] ?? '' ) );
					if ( $sc === '' ) {
						$unknown[] = 'shortcode';
					} else {
						$inner[] = $sc;
					}
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
					$inner[] = $this->iconList( array_map( 'strval', (array) ( $b['items'] ?? array() ) ), $this->arr( $b['options'] ?? null ) );
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
				case 'pattern':
					$ref = (int) ( $b['ref'] ?? 0 );
					if ( $ref > 0 ) {
						$inner[] = $this->pattern( $ref );
					}
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
