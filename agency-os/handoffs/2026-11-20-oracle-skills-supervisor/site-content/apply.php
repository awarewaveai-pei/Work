<?php
/**
 * PG-1: oracle.aware-wave.com pages + Kadence theme settings, built from pages.php with the wp-bridge plugin's
 * BlockLibrary (installed on the site) and checked by its KadenceValidator before anything is written.
 * Run from the folder holding pages.php (or pass pages=<path>):
 *      wp eval-file apply.php --user=<admin>            (re-runnable; same result every time)
 *      wp eval-file apply.php rollback --user=<admin>   (puts back what the script changed)
 * Touches only: front page, /tools/, /tools/<12 tools>/, /my-charts/, /daily-letter/ (found by slug), the Kadence
 * palette option, the theme mods in $pg1_mods, its own menu and the primary/mobile menu locations. Old page
 * content is kept as a revision before every write; the original state of everything touched is kept in
 * option aworacle_pg1_backup for rollback. No block markup lives here: change pages.php or the bridge bricks.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit( 1 );
}

// Signup form on /daily-letter/: 0 = the oracle plugin's signup block; a Fluent Forms form id (e.g. 3) = that form.
const AWORACLE_PG1_DAILY_FORM_ID = 3;
const AWORACLE_PG1_BACKUP     = 'aworacle_pg1_backup';
const AWORACLE_PG1_MENU       = '東西方命理主選單';

$pg1_args = isset( $args ) && is_array( $args ) ? $args : array();

if ( get_template() !== 'kadence' ) {
	WP_CLI::error( 'Active theme is not Kadence; nothing changed.' );
}
if ( ! class_exists( '\AwareWave\WpBridge\Content\BlockLibrary' ) || ! method_exists( '\AwareWave\WpBridge\Content\BlockLibrary', 'composePage' ) ) {
	WP_CLI::error( 'wp-bridge with BlockLibrary::composePage() (the page bricks) is not active; nothing changed.' );
}

/** @return array<string,int> page key => ID (only pages that exist) */
function aworacle_pg1_pages(): array {
	$out   = array();
	$front = 'page' === get_option( 'show_on_front' ) ? (int) get_option( 'page_on_front' ) : 0;
	if ( $front > 0 && get_post( $front ) ) {
		$out['home'] = $front;
	} else {
		WP_CLI::warning( 'No static front page set; home skipped.' );
	}
	$paths = array( 'tools' => 'tools', 'my-charts' => 'my-charts', 'daily-letter' => 'daily-letter' );
	foreach ( array( 'ziwei', 'bazi', 'hehun', 'iching', 'tarot', 'qian', 'astrology', 'vedic', 'fengshui', 'qimen', 'zeri', 'daily' ) as $slug ) {
		$paths[ 'tool-' . $slug ] = 'tools/' . $slug;
	}
	foreach ( $paths as $key => $path ) {
		$p = get_page_by_path( $path, OBJECT, 'page' );
		if ( $p ) {
			$out[ $key ] = (int) $p->ID;
		} else {
			WP_CLI::warning( "Page /$path/ not found; skipped." );
		}
	}
	return $out;
}

$pg1_meta = array(
	'_kad_post_title'            => 'hide',
	'_kad_post_layout'           => 'fullwidth',
	'_kad_post_content_style'    => 'unboxed',
	'_kad_post_vertical_padding' => 'hide',
);

// Palette = the engine's own colours (Projects/internal/ziwei-doushu/app/globals.css :root), so the page
// frame and the embedded tool look like one site. Semantics (the tool-theming card reads the same slots):
//   1 accent gold (--gold-400): buttons, links, icons    2 accent violet (--violet-400): hover, second accent
//   3 heading text (--text-heading)                      4 body text (--text-body)
//   5 caption text (--text-caption)                      6 dim text (--text-dim)
//   7 nebula (--bg-nebula): borders, raised bands        8 surface (--bg-surface): cards, sections, header popup
//   9 void (--bg-void): page background; button text on palette1
$pg1_palette = array(
	array( 'color' => '#f5d76e', 'slug' => 'palette1', 'name' => 'Palette Color 1' ),
	array( 'color' => '#c084fc', 'slug' => 'palette2', 'name' => 'Palette Color 2' ),
	array( 'color' => '#f5f3ff', 'slug' => 'palette3', 'name' => 'Palette Color 3' ),
	array( 'color' => '#b8b0d0', 'slug' => 'palette4', 'name' => 'Palette Color 4' ),
	array( 'color' => '#8980a8', 'slug' => 'palette5', 'name' => 'Palette Color 5' ),
	array( 'color' => '#8077a0', 'slug' => 'palette6', 'name' => 'Palette Color 6' ),
	array( 'color' => '#1a1035', 'slug' => 'palette7', 'name' => 'Palette Color 7' ),
	array( 'color' => '#12102a', 'slug' => 'palette8', 'name' => 'Palette Color 8' ),
	array( 'color' => '#0a0a14', 'slug' => 'palette9', 'name' => 'Palette Color 9' ),
);

// Fonts = the engine's (app/[lang]/layout.tsx): Geist for text (CJK falls back to the system font),
// Noto Serif TC 600/700 for headings and the site name.
$pg1_mods = array(
	'site_background'                => array( 'desktop' => array( 'color' => 'palette9' ) ),
	'content_background'             => array( 'desktop' => array( 'color' => 'palette9' ) ),
	'base_font'                      => array( 'family' => 'Geist', 'google' => true, 'fallback' => '"PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif', 'weight' => '400', 'variant' => 'regular', 'size' => array( 'desktop' => 17 ), 'lineHeight' => array( 'desktop' => 1.7 ), 'color' => 'palette4' ),
	'heading_font'                   => array( 'family' => 'Noto Serif TC', 'google' => true, 'variant' => array( '600', '700' ), 'fallback' => '"PingFang TC", "Microsoft JhengHei", serif' ),
	'load_fonts_local'               => true,
	'header_wrap_background'         => array( 'desktop' => array( 'color' => 'palette9' ) ),
	'header_main_background'         => array( 'desktop' => array( 'color' => 'palette9' ) ),
	'header_main_height'             => array( 'size' => array( 'mobile' => 60, 'tablet' => '', 'desktop' => 72 ) ),
	'brand_typography'               => array( 'family' => 'Noto Serif TC', 'google' => true, 'weight' => '700', 'variant' => '700', 'size' => array( 'desktop' => 24, 'mobile' => 20 ), 'color' => 'palette3' ),
	'brand_typography_color'         => array( 'hover' => 'palette1', 'active' => 'palette3' ),
	'primary_navigation_color'       => array( 'color' => 'palette4', 'hover' => 'palette1', 'active' => 'palette1' ),
	'primary_navigation_typography'  => array( 'size' => array( 'desktop' => 16 ) ),
	'mobile_trigger_color'           => array( 'color' => 'palette3', 'hover' => 'palette1' ),
	'header_popup_background'        => array( 'desktop' => array( 'color' => 'palette8' ) ),
	'header_popup_close_color'       => array( 'color' => 'palette3', 'hover' => 'palette1' ),
	'mobile_navigation_color'        => array( 'color' => 'palette3', 'hover' => 'palette1', 'active' => 'palette1' ),
	'mobile_navigation_typography'   => array( 'size' => array( 'desktop' => 17 ) ),
	'buttons_color'                  => array( 'color' => 'palette9', 'hover' => 'palette9' ),
	'buttons_background'             => array( 'color' => 'palette1', 'hover' => 'palette2' ),
	'buttons_border_radius'          => array( 'size' => array( 'mobile' => '', 'tablet' => '', 'desktop' => 8 ) ),
	'buttons_typography'             => array( 'weight' => '600', 'variant' => '600' ),
	'buttons_outline_color'          => array( 'color' => 'palette3', 'hover' => 'palette1' ),
	'footer_items'                   => array(
		'bottom' => array( 'bottom_1' => array( 'footer-html' ), 'bottom_2' => array(), 'bottom_3' => array(), 'bottom_4' => array(), 'bottom_5' => array() ),
	),
	'footer_bottom_background'       => array( 'desktop' => array( 'color' => 'palette8' ) ),
	'footer_html_content'            => '{copyright} {year} {site-title}',
	'footer_html_typography'         => array( 'color' => 'palette5', 'size' => array( 'desktop' => 14 ) ),
	'footer_html_link_color'         => array( 'color' => 'palette4', 'hover' => 'palette1' ),
);

// Card colours on this dark site: cards sit on the page background (palette9), so they take the surface (palette8).
$pg1_bricks_theme = array( 'cardBg' => 'palette8' );

/** Merge a mod value over a base (assoc arrays recursively; lists and empty arrays replace). */
function aworacle_pg1_merge( $base, $over ) {
	if ( ! is_array( $base ) || ! is_array( $over ) ) {
		return $over;
	}
	foreach ( $over as $k => $v ) {
		$is_assoc   = is_array( $v ) && array() !== $v && array_keys( $v ) !== range( 0, count( $v ) - 1 );
		$base[ $k ] = ( $is_assoc && isset( $base[ $k ] ) && is_array( $base[ $k ] ) ) ? aworacle_pg1_merge( $base[ $k ], $v ) : $v;
	}
	return $base;
}

/** Write a page and confirm what is stored; false (with a warning) when WordPress stored something else. */
function aworacle_pg1_write( int $id, string $content, string $label ): bool {
	if ( get_post_field( 'post_content', $id, 'raw' ) === $content ) {
		return true;
	}
	wp_save_post_revision( $id ); // keep the current content as a revision first
	$r = wp_update_post( array( 'ID' => $id, 'post_content' => wp_slash( $content ) ), true );
	if ( is_wp_error( $r ) ) {
		WP_CLI::warning( "$label ($id): " . $r->get_error_message() );
		return false;
	}
	clean_post_cache( $id );
	if ( get_post_field( 'post_content', $id, 'raw' ) !== $content ) {
		// A save filter rewrote the markup (e.g. block attributes dropped, or kses when run without --user).
		WP_CLI::warning( "$label ($id): stored content differs from the script." );
		return false;
	}
	return true;
}

$pg1_ids = aworacle_pg1_pages();

// ---- rollback
if ( in_array( 'rollback', $pg1_args, true ) ) {
	$bk = get_option( AWORACLE_PG1_BACKUP );
	if ( ! is_array( $bk ) ) {
		WP_CLI::error( 'No backup found; nothing changed.' );
	}
	foreach ( $bk['mods'] as $k => $v ) {
		null === $v ? remove_theme_mod( $k ) : set_theme_mod( $k, $v );
	}
	null === $bk['palette'] ? delete_option( 'kadence_global_palette' ) : update_option( 'kadence_global_palette', $bk['palette'] );
	set_theme_mod( 'nav_menu_locations', $bk['menu_locations'] );
	$ok = true;
	foreach ( $bk['pages'] as $id => $p ) {
		$ok = aworacle_pg1_write( (int) $id, (string) $p['content'], 'rollback' ) && $ok;
		foreach ( $p['meta'] as $mk => $mv ) {
			null === $mv ? delete_post_meta( (int) $id, $mk ) : update_post_meta( (int) $id, $mk, $mv );
		}
	}
	if ( ! $ok ) {
		WP_CLI::error( 'Some pages did not restore exactly; backup option ' . AWORACLE_PG1_BACKUP . ' kept (old content is also in each page\'s revisions). Re-run with --user=<admin>.' );
	}
	if ( ! empty( $bk['menu_created'] ) ) {
		wp_delete_nav_menu( (int) $bk['menu_created'] );
	}
	delete_option( AWORACLE_PG1_BACKUP );
	WP_CLI::success( 'Rolled back pages ' . implode( ',', array_keys( $bk['pages'] ) ) . ', palette, theme mods, menu.' );
	return;
}

// ---- build every page first: definitions -> bricks -> KadenceValidator. Any failure stops before anything changes.
$home  = untrailingslashit( home_url() );
$mine  = isset( $pg1_ids['my-charts'] ) ? get_permalink( $pg1_ids['my-charts'] ) : $home . '/my-charts/';
$links = array( '{login}' => wp_login_url( $mine ), '{register}' => wp_registration_url() );
$form  = AWORACLE_PG1_DAILY_FORM_ID > 0
	? array( 'type' => 'form', 'form_id' => (int) AWORACLE_PG1_DAILY_FORM_ID )
	: array( 'type' => 'plugin_block', 'name' => 'aware-wave/oracle-daily' );
/** Site URLs for "/..." links and {login}/{register}; the daily_form placeholder becomes $form. */
$resolve = function ( $node ) use ( &$resolve, $home, $links, $form ) {
	if ( ! is_array( $node ) ) {
		return $node;
	}
	if ( ( $node['type'] ?? '' ) === 'daily_form' ) {
		return $form;
	}
	foreach ( $node as $k => $v ) {
		if ( $k === 'link' && is_string( $v ) ) {
			// Allowed: {login}/{register}, "#anchor", a site path "/x" (not "//" or "/\\"), or an http(s) URL.
			if ( isset( $links[ $v ] ) ) {
				$node[ $k ] = $links[ $v ];
			} elseif ( preg_match( '~^/(?![/\\\\])~', $v ) ) {
				$node[ $k ] = $home . $v;
			} elseif ( preg_match( '~^(#[A-Za-z][\\w-]*|https?://[^\\s]+)$~', $v ) ) {
				$node[ $k ] = $v;
			} else {
				WP_CLI::error( "pages.php: link not allowed: $v. Nothing changed." );
			}
		} else {
			$node[ $k ] = $resolve( $v );
		}
	}
	return $node;
};
$pg1_pages_file = getcwd() . '/pages.php';
foreach ( $pg1_args as $a ) {
	if ( strpos( $a, 'pages=' ) === 0 ) {
		$pg1_pages_file = substr( $a, 6 );
	}
}
if ( ! is_readable( $pg1_pages_file ) ) {
	WP_CLI::error( "Page definitions not found at $pg1_pages_file; run from the folder holding pages.php or pass pages=<path>. Nothing changed." );
}
$pg1_defs    = require $pg1_pages_file;
$library     = new \AwareWave\WpBridge\Content\BlockLibrary( $pg1_bricks_theme );
$validator   = new \AwareWave\WpBridge\Validation\KadenceValidator();
$pg1_content = array();
foreach ( $pg1_ids as $key => $id ) {
	if ( ! isset( $pg1_defs[ $key ] ) ) {
		continue;
	}
	$built = $library->composePage( $resolve( $pg1_defs[ $key ] ) );
	if ( $built['unknown'] !== array() ) {
		WP_CLI::error( "$key: bricks not available on this bridge: " . implode( ', ', array_unique( $built['unknown'] ) ) . '. Nothing written.' );
	}
	$check = $validator->validate( parse_blocks( $built['content'] ) );
	if ( ! $check->isValid() ) {
		WP_CLI::error( "$key: KadenceValidator: " . wp_json_encode( $check->toArray() ) . '. Nothing written.' );
	}
	$pg1_content[ $key ] = $built['content'];
}
// ---- backup: the original value of everything this script touches. Saved entries are never overwritten
// on re-runs; pages, mods or meta that a later run touches for the first time are added.
$bk = get_option( AWORACLE_PG1_BACKUP );
if ( ! is_array( $bk ) ) {
	$bk = array(
		'mods'           => array(),
		'palette'        => get_option( 'kadence_global_palette', null ),
		'menu_locations' => get_theme_mod( 'nav_menu_locations', array() ),
		'menu_created'   => 0,
		'pages'          => array(),
	);
}
$mods_raw = (array) get_theme_mods();
foreach ( array_keys( $pg1_mods ) as $k ) {
	if ( ! array_key_exists( $k, $bk['mods'] ) ) {
		$bk['mods'][ $k ] = array_key_exists( $k, $mods_raw ) ? $mods_raw[ $k ] : null;
	}
}
foreach ( $pg1_ids as $id ) {
	if ( ! isset( $bk['pages'][ $id ] ) ) {
		$bk['pages'][ $id ] = array( 'content' => get_post_field( 'post_content', $id, 'raw' ), 'meta' => array() );
	}
	foreach ( array_keys( $pg1_meta ) as $mk ) {
		if ( ! array_key_exists( $mk, $bk['pages'][ $id ]['meta'] ) ) {
			$bk['pages'][ $id ]['meta'][ $mk ] = metadata_exists( 'post', $id, $mk ) ? get_post_meta( $id, $mk, true ) : null;
		}
	}
}
$menu = wp_get_nav_menu_object( AWORACLE_PG1_MENU );
if ( ! $menu ) {
	$mid = wp_create_nav_menu( AWORACLE_PG1_MENU );
	if ( is_wp_error( $mid ) ) {
		WP_CLI::error( 'Menu: ' . $mid->get_error_message() );
	}
	$mid                = (int) $mid;
	$bk['menu_created'] = $mid;
} else {
	$mid = (int) $menu->term_id;
	if ( (int) $bk['menu_created'] !== $mid && wp_get_nav_menu_items( $mid ) ) {
		WP_CLI::error( 'A menu named "' . AWORACLE_PG1_MENU . '" exists that this script did not create; rename it and re-run. Nothing changed.' );
	}
}
update_option( AWORACLE_PG1_BACKUP, $bk, false );

// ---- palette + theme mods
$pal = json_decode( (string) get_option( 'kadence_global_palette', '' ), true );
if ( ! is_array( $pal ) ) {
	$pal = json_decode( (string) \Kadence\kadence()->get_default_palette(), true );
}
$pal['palette'] = $pg1_palette;
$pal['active']  = 'palette';
update_option( 'kadence_global_palette', wp_json_encode( $pal ) );

$defaults = \Kadence\Options\Component::defaults();
foreach ( $pg1_mods as $k => $v ) {
	$base = get_theme_mod( $k, $defaults[ $k ] ?? null );
	set_theme_mod( $k, is_array( $v ) ? aworacle_pg1_merge( is_array( $base ) ? $base : array(), $v ) : $v );
}

// ---- write pages (all built and validated above)
foreach ( $pg1_content as $key => $content ) {
	$id = $pg1_ids[ $key ];
	if ( ! aworacle_pg1_write( $id, $content, $key ) ) {
		WP_CLI::error( "$key ($id) not written as intended; run \"wp eval-file apply.php rollback\" and report." );
	}
	foreach ( $pg1_meta as $mk => $mv ) {
		update_post_meta( $id, $mk, $mv );
	}
	WP_CLI::log( "page $key ($id) ok" );
}

// ---- menu (this script's own menu only): three flat links, no dropdowns, on the primary and mobile locations
foreach ( (array) wp_get_nav_menu_items( $mid ) as $item ) {
	if ( $item instanceof WP_Post ) {
		wp_delete_post( $item->ID, true );
	}
}
$pos = 0;
foreach ( array( 'tools' => '全部工具', 'daily-letter' => '每日運勢信', 'my-charts' => '我的命盤' ) as $key => $label ) {
	if ( isset( $pg1_ids[ $key ] ) ) {
		wp_update_nav_menu_item(
			$mid,
			0,
			array(
				'menu-item-title'     => $label,
				'menu-item-object'    => 'page',
				'menu-item-object-id' => $pg1_ids[ $key ],
				'menu-item-type'      => 'post_type',
				'menu-item-status'    => 'publish',
				'menu-item-position'  => ++$pos,
			)
		);
	}
}
$loc            = (array) get_theme_mod( 'nav_menu_locations', array() );
$loc['primary'] = $mid;
$loc['mobile']  = $mid;
set_theme_mod( 'nav_menu_locations', $loc );

WP_CLI::success( 'PG-1 applied: ' . count( $pg1_ids ) . ' pages, palette, ' . count( $pg1_mods ) . ' theme mods, menu ' . $mid . '.' );
