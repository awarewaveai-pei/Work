<?php
/**
 * PG-1: oracle.aware-wave.com pages rebuilt with Kadence blocks + Kadence theme settings.
 * Run: wp eval-file apply.php --user=<admin>            (re-runnable; same result every time)
 *      wp eval-file apply.php rollback --user=<admin>   (puts back what the script changed)
 * Touches only: front page, /tools/, /tools/<12 tools>/, /my-charts/, /daily-letter/ (found by slug),
 * the Kadence palette option, the theme mods listed in $pg1_mods, its own menu and the primary/mobile
 * menu locations. Old page content is kept as a revision before every write; the original state of
 * everything touched is kept in option aworacle_pg1_backup for rollback.
 * Block markup below was produced by the Kadence block editor itself (createBlock, mounted, serialize;
 * Kadence Blocks 3.9.1.2 / Pro 2.8.17); do not hand-edit it, edit the page in the block editor instead.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit( 1 );
}

// Form slot on /daily-letter/ (block markup). Today: the plugin's signup block. For Fluent Forms put e.g.
// '<!-- wp:shortcode -->[fluentform id="3"]<!-- /wp:shortcode -->' here and re-run.
const AWORACLE_PG1_DAILY_FORM = '<!-- wp:aware-wave/oracle-daily /-->';
const AWORACLE_PG1_BACKUP     = 'aworacle_pg1_backup';
const AWORACLE_PG1_MENU       = '東西方命理主選單';

$pg1_args = isset( $args ) && is_array( $args ) ? $args : array();

if ( get_template() !== 'kadence' ) {
	WP_CLI::error( 'Active theme is not Kadence; nothing changed.' );
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

$pg1_pages = array();
$pg1_pages['home'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_cbbbd8-e7","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"radial-gradient(ellipse at top,var(\u002d\u002dglobal-palette7) 0%,var(\u002d\u002dglobal-palette9) 70%)","padding":["112","sm","96","sm"],"mobilePadding":["64","","56",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_d4cfc3-49","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_d4cfc3-49"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_58df2f-b8","align":"center","color":"palette1","letterSpacing":3,"margin":[0,0,16,0],"htmlTag":"p","fontSize":[15,"",13]} -->
<p class="kt-adv-heading59_58df2f-b8 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_58df2f-b8">紫微斗數・八字・易經・塔羅・占星</p>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_f7b61a-8a","align":"center","color":"palette3","margin":[0,0,16,0],"fontSize":[60,"",40]} -->
<h1 class="kt-adv-heading59_f7b61a-8a wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_f7b61a-8a">東西方命理</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_70c2c3-a3","align":"center","color":"palette4","margin":[0,0,36,0],"htmlTag":"p","fontSize":[20,"",16]} -->
<p class="kt-adv-heading59_70c2c3-a3 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_70c2c3-a3">專業排盤 · 真太陽時校正 · AI 深度解讀</p>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"59_e4fb8f-ea","gap":["sm","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns59_e4fb8f-ea"><!-- wp:kadence/singlebtn {"uniqueID":"59_0649c1-5c","text":"選一個工具開始","link":"#tools","sizePreset":"large"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_b6ea79-f8","text":"每日運勢信","link":"@@HOME@@/daily-letter/","sizePreset":"large","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_2fa20c-45","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["72","sm","24","sm"],"mobilePadding":["48","","16",""],"anchor":"tools","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_f862c7-67","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_f862c7-67"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_e3eb90-b3","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_e3eb90-b3 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_e3eb90-b3">選一個工具開始</h2>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_060943-7e","columns":4,"mobileLayout":"two-grid","tabletLayout":"two-grid","collapseGutter":"custom","customRowGutter":[20,20,12],"columnGutter":"custom","customGutter":[20,20,12],"colLayout":"equal","bgColor":"palette9","columnsInnerHeight":true,"inheritMaxWidth":true,"padding":["0","sm","20","sm"],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_b86714-3e","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_b86714-3e"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_8afc8e-4c","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_star","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_8afc8e-4c"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/ziwei/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_star" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">紫微斗數</h3><p class="kt-blocks-info-box-text">紫微斗數命盤,真太陽時校正,三方四正</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":2,"uniqueID":"59_e6531d-27","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_e6531d-27"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_fda85a-06","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_grid","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_fda85a-06"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/bazi/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_grid" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">八字四柱</h3><p class="kt-blocks-info-box-text">八字四柱、十神、藏干、納音</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":3,"uniqueID":"59_41f57a-df","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_41f57a-df"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_366697-46","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_heart","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_366697-46"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/hehun/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_heart" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">八字合婚</h3><p class="kt-blocks-info-box-text">兩人八字合婚與生肖配對,逐項列出依據</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":4,"uniqueID":"59_38b025-21","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_38b025-21"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_54c4e8-29","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_aperture","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_54c4e8-29"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/iching/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_aperture" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">易經卜卦</h3><p class="kt-blocks-info-box-text">六爻銅錢起卦,本卦變卦動爻</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_045fa1-bb","columns":4,"mobileLayout":"two-grid","tabletLayout":"two-grid","collapseGutter":"custom","customRowGutter":[20,20,12],"columnGutter":"custom","customGutter":[20,20,12],"colLayout":"equal","bgColor":"palette9","columnsInnerHeight":true,"inheritMaxWidth":true,"padding":["0","sm","20","sm"],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_48c5b1-af","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_48c5b1-af"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_ae93dc-f0","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_layers","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_ae93dc-f0"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/tarot/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_layers" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">塔羅</h3><p class="kt-blocks-info-box-text">78 張牌庫,單張/三張/凱爾特十字</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":2,"uniqueID":"59_b2aff4-42","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_b2aff4-42"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_cf2e90-37","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_book","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_cf2e90-37"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/qian/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_book" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">觀音靈籤</h3><p class="kt-blocks-info-box-text">觀音靈籤一百首,默念所問求一支籤</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":3,"uniqueID":"59_80783c-c5","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_80783c-c5"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_feb8ef-da","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_sun","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_feb8ef-da"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/astrology/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_sun" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">西洋占星</h3><p class="kt-blocks-info-box-text">行星·星座·宮位·上升(Swiss 級精度,自架)</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":4,"uniqueID":"59_b7afb5-0f","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_b7afb5-0f"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_858612-86","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_moon","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_858612-86"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/vedic/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_moon" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">吠陀占星</h3><p class="kt-blocks-info-box-text">恆星黃道本命盤、二十七月宿、九分盤、Vimśottarī 大運</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_6c4941-02","columns":4,"mobileLayout":"two-grid","tabletLayout":"two-grid","collapseGutter":"custom","customRowGutter":[20,20,12],"columnGutter":"custom","customGutter":[20,20,12],"colLayout":"equal","bgColor":"palette9","columnsInnerHeight":true,"inheritMaxWidth":true,"padding":["0","sm","0","sm"],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_9c48a9-b8","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_9c48a9-b8"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_5d6873-61","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_compass","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_5d6873-61"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/fengshui/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_compass" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">風水飛星</h3><p class="kt-blocks-info-box-text">玄空飛星九宮盤、八宅命卦,方位擺放建議</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":2,"uniqueID":"59_3dbb1e-fc","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_3dbb1e-fc"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_afadde-28","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_target","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_afadde-28"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/qimen/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_target" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">奇門遁甲</h3><p class="kt-blocks-info-box-text">時家奇門九宮盤:三奇六儀、八門、九星、八神</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":3,"uniqueID":"59_2db467-13","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_2db467-13"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_8057db-18","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_calendar","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_8057db-18"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/zeri/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_calendar" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">擇日</h3><p class="kt-blocks-info-box-text">依事項挑吉日:通書宜忌、建除、黃道與沖煞逐日判定</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":4,"uniqueID":"59_668232-88","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_668232-88"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_e3b1f6-de","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_sunrise","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_e3b1f6-de"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/daily/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_sunrise" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">每日運勢</h3><p class="kt-blocks-info-box-text">今日運勢、幸運色、幸運數字、宜忌</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_2774c6-c4","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["0","sm","72","sm"],"mobilePadding":["0","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_966a8a-10","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_966a8a-10"><div class="kt-inside-inner-col"></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_587b6d-24","colLayout":"left-golden","bgColor":"palette7","verticalAlignment":"middle","textColor":"palette3","inheritMaxWidth":true,"padding":["64","sm","64","sm"],"mobilePadding":["48","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_f5d6c8-a8","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_f5d6c8-a8"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_f23154-9a","color":"palette3","margin":[0,0,8,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_f23154-9a wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_f23154-9a">每日運勢信</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_a60526-8a","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[17,"",16]} -->
<p class="kt-adv-heading59_a60526-8a wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_a60526-8a">每天早上 07:00（您所在時區）之後寄一封，依您的出生資料計算。每封信都可以取消訂閱。</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":2,"uniqueID":"59_279fca-79","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_279fca-79"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedbtn {"hAlign":"right","mhAlign":"left","uniqueID":"59_f939ca-41"} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns59_f939ca-41"><!-- wp:kadence/singlebtn {"uniqueID":"59_c07b15-25","text":"訂閱","link":"@@HOME@@/daily-letter/","sizePreset":"large"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tools'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_e65959-29","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette8) 0%,var(\u002d\u002dglobal-palette7) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_bd7340-e4","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_bd7340-e4"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_0bad20-c4","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading59_0bad20-c4 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_0bad20-c4">全部工具</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_22c8f5-7d","align":"center","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading59_22c8f5-7d wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_22c8f5-7d">選一個工具開始</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_803165-4e","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","0","sm"],"mobilePadding":["32","","",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_122e9e-8a","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_122e9e-8a"><div class="kt-inside-inner-col"></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_8bc03b-6c","columns":4,"mobileLayout":"two-grid","tabletLayout":"two-grid","collapseGutter":"custom","customRowGutter":[20,20,12],"columnGutter":"custom","customGutter":[20,20,12],"colLayout":"equal","bgColor":"palette9","columnsInnerHeight":true,"inheritMaxWidth":true,"padding":["0","sm","20","sm"],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_33d334-1e","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_33d334-1e"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_74d57c-c4","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_star","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_74d57c-c4"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/ziwei/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_star" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">紫微斗數</h3><p class="kt-blocks-info-box-text">紫微斗數命盤,真太陽時校正,三方四正</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":2,"uniqueID":"59_84285c-70","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_84285c-70"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_ea030d-9d","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_grid","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_ea030d-9d"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/bazi/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_grid" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">八字四柱</h3><p class="kt-blocks-info-box-text">八字四柱、十神、藏干、納音</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":3,"uniqueID":"59_93731c-c8","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_93731c-c8"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_374feb-22","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_heart","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_374feb-22"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/hehun/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_heart" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">八字合婚</h3><p class="kt-blocks-info-box-text">兩人八字合婚與生肖配對,逐項列出依據</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":4,"uniqueID":"59_b85385-9a","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_b85385-9a"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_749a5a-9e","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_aperture","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_749a5a-9e"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/iching/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_aperture" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">易經卜卦</h3><p class="kt-blocks-info-box-text">六爻銅錢起卦,本卦變卦動爻</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_4e0de2-21","columns":4,"mobileLayout":"two-grid","tabletLayout":"two-grid","collapseGutter":"custom","customRowGutter":[20,20,12],"columnGutter":"custom","customGutter":[20,20,12],"colLayout":"equal","bgColor":"palette9","columnsInnerHeight":true,"inheritMaxWidth":true,"padding":["0","sm","20","sm"],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_f0c383-f3","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_f0c383-f3"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_cf6ee2-e3","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_layers","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_cf6ee2-e3"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/tarot/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_layers" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">塔羅</h3><p class="kt-blocks-info-box-text">78 張牌庫,單張/三張/凱爾特十字</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":2,"uniqueID":"59_745941-99","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_745941-99"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_bb8f63-16","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_book","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_bb8f63-16"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/qian/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_book" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">觀音靈籤</h3><p class="kt-blocks-info-box-text">觀音靈籤一百首,默念所問求一支籤</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":3,"uniqueID":"59_c9a107-59","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_c9a107-59"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_b7eb98-69","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_sun","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_b7eb98-69"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/astrology/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_sun" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">西洋占星</h3><p class="kt-blocks-info-box-text">行星·星座·宮位·上升(Swiss 級精度,自架)</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":4,"uniqueID":"59_82156c-28","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_82156c-28"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_ccc768-85","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_moon","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_ccc768-85"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/vedic/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_moon" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">吠陀占星</h3><p class="kt-blocks-info-box-text">恆星黃道本命盤、二十七月宿、九分盤、Vimśottarī 大運</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_e1b5dd-2d","columns":4,"mobileLayout":"two-grid","tabletLayout":"two-grid","collapseGutter":"custom","customRowGutter":[20,20,12],"columnGutter":"custom","customGutter":[20,20,12],"colLayout":"equal","bgColor":"palette9","columnsInnerHeight":true,"inheritMaxWidth":true,"padding":["0","sm","0","sm"],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_0b3675-47","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_0b3675-47"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_adb637-cc","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_compass","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_adb637-cc"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/fengshui/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_compass" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">風水飛星</h3><p class="kt-blocks-info-box-text">玄空飛星九宮盤、八宅命卦,方位擺放建議</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":2,"uniqueID":"59_8d7159-99","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_8d7159-99"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_d87730-b0","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_target","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_d87730-b0"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/qimen/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_target" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">奇門遁甲</h3><p class="kt-blocks-info-box-text">時家奇門九宮盤:三奇六儀、八門、九星、八神</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":3,"uniqueID":"59_15481b-3d","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_15481b-3d"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_101263-21","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_calendar","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_101263-21"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/zeri/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_calendar" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">擇日</h3><p class="kt-blocks-info-box-text">依事項挑吉日:通書宜忌、建除、黃道與沖煞逐日判定</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":4,"uniqueID":"59_4f1524-0d","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_4f1524-0d"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"59_9e5fa8-3c","hAlign":"left","containerBackground":"palette8","containerHoverBackground":"palette8","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_sunrise","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette4","textHoverColor":"palette4","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box59_9e5fa8-3c"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/daily/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_sunrise" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">每日運勢</h3><p class="kt-blocks-info-box-text">今日運勢、幸運色、幸運數字、宜忌</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_2f817b-e9","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["0","sm","72","sm"],"mobilePadding":["0","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_3630e1-68","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_3630e1-68"><div class="kt-inside-inner-col"></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-ziwei'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_9fadc9-95","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette8) 0%,var(\u002d\u002dglobal-palette7) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_64b4d0-3f","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_64b4d0-3f"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_5022b6-39","align":"center","color":"palette1","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette1","linkHoverColor":"palette3","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link59_5022b6-39 hls-none"><p class="kt-adv-heading59_5022b6-39 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_5022b6-39">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_855987-40","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading59_855987-40 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_855987-40">紫微斗數</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_cf1409-d3","align":"center","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading59_cf1409-d3 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_cf1409-d3">紫微斗數命盤,真太陽時校正,三方四正</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_0bc8d3-8f","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_a914a5-d2","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_a914a5-d2"><div class="kt-inside-inner-col"><!-- wp:aware-wave/oracle {"tool":"ziwei"} /--></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_c52d90-0f","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_14580f-15","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_14580f-15"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_3681fe-d6","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_3681fe-d6 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_3681fe-d6">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"59_0ecb86-d2","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items59_0ecb86-d2 kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"59_e30bf8-3d","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_e30bf8-3d"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">紫微斗數命盤</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_ce10c3-b0","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_ce10c3-b0"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">真太陽時校正</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_49f199-d7","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_49f199-d7"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">三方四正</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_8b1dd5-db","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_a56d4f-df","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_a56d4f-df"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_9c66ae-09","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_9c66ae-09 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_9c66ae-09">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"59_4ab640-56","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns59_4ab640-56"><!-- wp:kadence/singlebtn {"uniqueID":"59_b5313b-1b","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_8c19b6-30","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_62a918-e1","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_a6e9c0-08","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_b95600-fe","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_1bd299-03","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_5cc792-c0","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_c8be1f-5d","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_feb8f1-f6","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_3d1ab1-96","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_2381e8-e2","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-bazi'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_fead29-5b","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette8) 0%,var(\u002d\u002dglobal-palette7) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_07940e-cc","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_07940e-cc"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_1a6af8-9a","align":"center","color":"palette1","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette1","linkHoverColor":"palette3","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link59_1a6af8-9a hls-none"><p class="kt-adv-heading59_1a6af8-9a wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_1a6af8-9a">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_fefc9e-38","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading59_fefc9e-38 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_fefc9e-38">八字四柱</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_92da1c-1a","align":"center","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading59_92da1c-1a wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_92da1c-1a">八字四柱、十神、藏干、納音</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_02b6a1-95","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_944c30-b6","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_944c30-b6"><div class="kt-inside-inner-col"><!-- wp:aware-wave/oracle {"tool":"bazi"} /--></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_c5bd1a-03","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_1ff373-76","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_1ff373-76"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_481197-f7","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_481197-f7 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_481197-f7">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"59_a9a175-b2","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items59_a9a175-b2 kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"59_3784b6-5f","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_3784b6-5f"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">八字四柱</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_5cfdf7-04","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_5cfdf7-04"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">十神、藏干</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_31f105-b4","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_31f105-b4"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">納音</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_102090-dd","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_e0c7d1-47","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_e0c7d1-47"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_dad322-ad","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_dad322-ad wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_dad322-ad">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"59_e402e5-3e","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns59_e402e5-3e"><!-- wp:kadence/singlebtn {"uniqueID":"59_114e7a-5d","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_71f7a4-ee","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_3e3bf8-47","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_dfd993-50","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_a390df-6c","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_4ee476-23","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_3f53bf-0c","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_d0db30-0f","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_d6c9fc-bd","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_b4bbc5-fc","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_56bed0-b1","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-hehun'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_1a7c46-69","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette8) 0%,var(\u002d\u002dglobal-palette7) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_cccd52-44","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_cccd52-44"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_c49add-0c","align":"center","color":"palette1","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette1","linkHoverColor":"palette3","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link59_c49add-0c hls-none"><p class="kt-adv-heading59_c49add-0c wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_c49add-0c">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_e6f0fa-49","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading59_e6f0fa-49 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_e6f0fa-49">八字合婚</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_09ecb5-34","align":"center","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading59_09ecb5-34 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_09ecb5-34">兩人八字合婚與生肖配對,逐項列出依據</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_469a04-56","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_76e0f5-28","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_76e0f5-28"><div class="kt-inside-inner-col"><!-- wp:aware-wave/oracle {"tool":"hehun"} /--></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_9b70c8-bb","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_23d63b-dc","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_23d63b-dc"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_633568-fd","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_633568-fd wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_633568-fd">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"59_a7a3b9-c7","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items59_a7a3b9-c7 kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"59_35b00a-9e","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_35b00a-9e"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">兩人八字合婚</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_619c01-de","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_619c01-de"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">生肖配對</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_82a33c-64","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_82a33c-64"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">逐項列出依據</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_5a4d69-8f","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_c57203-79","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_c57203-79"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_618e3a-35","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_618e3a-35 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_618e3a-35">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"59_2e9615-aa","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns59_2e9615-aa"><!-- wp:kadence/singlebtn {"uniqueID":"59_1bb63e-2f","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_1510e8-98","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_ddca64-29","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_a7150b-1b","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_dcc247-98","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_6e7bd8-ee","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_b02b66-db","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_693748-0c","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_cad229-93","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_ed59a6-ba","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_74dcb4-64","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-iching'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_427214-00","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette8) 0%,var(\u002d\u002dglobal-palette7) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_1d9d71-c8","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_1d9d71-c8"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_bb845d-2d","align":"center","color":"palette1","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette1","linkHoverColor":"palette3","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link59_bb845d-2d hls-none"><p class="kt-adv-heading59_bb845d-2d wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_bb845d-2d">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_fb95d0-16","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading59_fb95d0-16 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_fb95d0-16">易經卜卦</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_0ca8e7-37","align":"center","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading59_0ca8e7-37 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_0ca8e7-37">六爻銅錢起卦,本卦變卦動爻</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_b0fdbb-4d","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_2fff3b-f6","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_2fff3b-f6"><div class="kt-inside-inner-col"><!-- wp:aware-wave/oracle {"tool":"iching"} /--></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_6f84f5-ec","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_dc8b7d-b4","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_dc8b7d-b4"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_58f324-b6","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_58f324-b6 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_58f324-b6">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"59_e1e0b6-cb","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items59_e1e0b6-cb kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"59_ac63e3-09","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_ac63e3-09"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">六爻銅錢起卦</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_c20a58-d2","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_c20a58-d2"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">本卦、變卦</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_734ba8-9e","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_734ba8-9e"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">動爻</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_e8feff-71","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_e8b559-53","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_e8b559-53"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_88cc14-86","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_88cc14-86 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_88cc14-86">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"59_de4ac0-8b","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns59_de4ac0-8b"><!-- wp:kadence/singlebtn {"uniqueID":"59_59c9b1-98","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_bde042-ed","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_1e36c3-d0","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_a87cf7-c3","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_3ba572-d7","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_48b2ca-d8","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_d20b91-7e","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_0697bd-5f","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_9a34ea-80","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_697c65-73","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_bea7c3-45","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-tarot'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_80d3af-a3","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette8) 0%,var(\u002d\u002dglobal-palette7) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_ce79e4-1a","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_ce79e4-1a"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_0f586c-a2","align":"center","color":"palette1","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette1","linkHoverColor":"palette3","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link59_0f586c-a2 hls-none"><p class="kt-adv-heading59_0f586c-a2 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_0f586c-a2">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_a6093c-78","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading59_a6093c-78 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_a6093c-78">塔羅</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_10e11d-57","align":"center","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading59_10e11d-57 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_10e11d-57">78 張牌庫,單張/三張/凱爾特十字</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_b776bb-69","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_85fc11-f5","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_85fc11-f5"><div class="kt-inside-inner-col"><!-- wp:aware-wave/oracle {"tool":"tarot"} /--></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_f6ca58-cb","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_c869d3-9e","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_c869d3-9e"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_b35381-29","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_b35381-29 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_b35381-29">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"59_afacf9-09","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items59_afacf9-09 kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"59_4b8b28-13","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_4b8b28-13"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">78 張牌庫</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_cc94d1-9d","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_cc94d1-9d"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">單張、三張</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_253ec1-31","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_253ec1-31"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">凱爾特十字</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_6db4d9-5b","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_b5d21c-23","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_b5d21c-23"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_fc76c7-75","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_fc76c7-75 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_fc76c7-75">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"59_894921-af","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns59_894921-af"><!-- wp:kadence/singlebtn {"uniqueID":"59_c4d1f4-fa","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_566e0c-8d","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_16ad01-26","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_975f0f-8e","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_a689bd-bb","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_3c80da-2a","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_902c60-17","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_f55852-e9","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_0d52b0-5a","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_4a7832-d4","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_3229a1-7d","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-qian'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_c6661d-86","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette8) 0%,var(\u002d\u002dglobal-palette7) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_273bd6-85","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_273bd6-85"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_73c0c2-2a","align":"center","color":"palette1","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette1","linkHoverColor":"palette3","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link59_73c0c2-2a hls-none"><p class="kt-adv-heading59_73c0c2-2a wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_73c0c2-2a">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_bcefab-96","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading59_bcefab-96 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_bcefab-96">觀音靈籤</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_1dc165-42","align":"center","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading59_1dc165-42 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_1dc165-42">觀音靈籤一百首,默念所問求一支籤</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_26d7d2-ee","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_01e7c6-78","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_01e7c6-78"><div class="kt-inside-inner-col"><!-- wp:aware-wave/oracle {"tool":"qian"} /--></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_6fd921-a5","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_1b2f69-bb","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_1b2f69-bb"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_d6be3c-bd","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_d6be3c-bd wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_d6be3c-bd">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"59_6f1ebd-5c","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items59_6f1ebd-5c kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"59_718abc-e4","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_718abc-e4"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">觀音靈籤一百首</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_c3c306-3e","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_c3c306-3e"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">默念所問</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_016e61-ff","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_016e61-ff"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">求一支籤</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_48c246-09","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_c092d5-97","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_c092d5-97"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_13c959-03","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_13c959-03 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_13c959-03">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"59_ce93eb-1c","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns59_ce93eb-1c"><!-- wp:kadence/singlebtn {"uniqueID":"59_52796c-e4","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_2eaee3-c1","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_fe3774-81","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_aa08c9-72","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_42b653-93","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_d0d6d7-15","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_fd33ba-0b","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_51661d-c9","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_57df85-6e","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_832017-18","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_8faab4-b3","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-astrology'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_2b3586-63","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette8) 0%,var(\u002d\u002dglobal-palette7) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_659a18-7f","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_659a18-7f"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_887e80-a0","align":"center","color":"palette1","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette1","linkHoverColor":"palette3","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link59_887e80-a0 hls-none"><p class="kt-adv-heading59_887e80-a0 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_887e80-a0">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_73385e-0a","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading59_73385e-0a wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_73385e-0a">西洋占星</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_6d7ec0-58","align":"center","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading59_6d7ec0-58 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_6d7ec0-58">行星·星座·宮位·上升(Swiss 級精度,自架)</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_e336f5-99","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_6bab70-d4","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_6bab70-d4"><div class="kt-inside-inner-col"><!-- wp:aware-wave/oracle {"tool":"astrology"} /--></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_f6589a-58","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_fc4c7f-cd","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_fc4c7f-cd"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_43298f-59","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_43298f-59 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_43298f-59">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"59_8924ca-df","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items59_8924ca-df kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"59_1d8c36-c4","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_1d8c36-c4"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">行星·星座·宮位</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_2bbf87-a0","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_2bbf87-a0"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">上升</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_20c99c-20","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_20c99c-20"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">Swiss 級精度,自架</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_afd13b-64","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_cfc200-26","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_cfc200-26"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_a25551-1d","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_a25551-1d wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_a25551-1d">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"59_9a3e72-d4","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns59_9a3e72-d4"><!-- wp:kadence/singlebtn {"uniqueID":"59_7b4882-b8","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_00a916-ce","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_36cc3d-73","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_36cf9f-09","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_953ff3-a0","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_95fe02-2b","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_d22bb1-b6","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_f54e6f-0e","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_f5d699-69","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_ac60f0-27","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_432a44-0a","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-vedic'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_e7110c-89","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette8) 0%,var(\u002d\u002dglobal-palette7) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_82229a-f4","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_82229a-f4"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_f12662-d6","align":"center","color":"palette1","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette1","linkHoverColor":"palette3","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link59_f12662-d6 hls-none"><p class="kt-adv-heading59_f12662-d6 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_f12662-d6">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_84f86a-49","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading59_84f86a-49 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_84f86a-49">吠陀占星</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_436cae-be","align":"center","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading59_436cae-be wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_436cae-be">恆星黃道本命盤、二十七月宿、九分盤、Vimśottarī 大運</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_207485-1d","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_9dc1ab-cb","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_9dc1ab-cb"><div class="kt-inside-inner-col"><!-- wp:aware-wave/oracle {"tool":"vedic"} /--></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_ea8157-e5","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_0aa0e3-87","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_0aa0e3-87"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_1f1b21-3f","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_1f1b21-3f wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_1f1b21-3f">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"59_d20f68-69","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items59_d20f68-69 kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"59_1ea2b3-5d","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_1ea2b3-5d"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">恆星黃道本命盤</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_7e8d2c-1a","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_7e8d2c-1a"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">二十七月宿、九分盤</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_5fec8b-2e","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_5fec8b-2e"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">Vimśottarī 大運</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_71518f-f5","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_4203ee-80","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_4203ee-80"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_08aed4-92","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_08aed4-92 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_08aed4-92">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"59_d1f367-53","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns59_d1f367-53"><!-- wp:kadence/singlebtn {"uniqueID":"59_e8f2a2-a9","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_515c16-3e","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_f3b212-ed","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_b678f5-27","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_2742ff-a9","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_9f5a7a-0d","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_a4ad9e-1d","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_48be2f-9e","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_e9ddde-df","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_08d474-55","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_a83f7e-4f","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-fengshui'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_44b664-47","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette8) 0%,var(\u002d\u002dglobal-palette7) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_0fa745-b9","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_0fa745-b9"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_857b2e-68","align":"center","color":"palette1","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette1","linkHoverColor":"palette3","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link59_857b2e-68 hls-none"><p class="kt-adv-heading59_857b2e-68 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_857b2e-68">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_d2d991-b8","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading59_d2d991-b8 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_d2d991-b8">風水飛星</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_f46e0a-9b","align":"center","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading59_f46e0a-9b wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_f46e0a-9b">玄空飛星九宮盤、八宅命卦,方位擺放建議</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_9c3ea8-5f","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_f0f66b-41","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_f0f66b-41"><div class="kt-inside-inner-col"><!-- wp:aware-wave/oracle {"tool":"fengshui"} /--></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_f95962-9d","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_ed12e7-3d","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_ed12e7-3d"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_8c5aac-a1","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_8c5aac-a1 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_8c5aac-a1">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"59_0df51c-cc","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items59_0df51c-cc kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"59_5d4321-eb","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_5d4321-eb"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">玄空飛星九宮盤</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_d207ed-93","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_d207ed-93"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">八宅命卦</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_70fcbe-03","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_70fcbe-03"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">方位擺放建議</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_9d78aa-1a","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_7fa0aa-06","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_7fa0aa-06"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_cb8517-df","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_cb8517-df wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_cb8517-df">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"59_4fc97a-1b","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns59_4fc97a-1b"><!-- wp:kadence/singlebtn {"uniqueID":"59_15077c-73","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_9c08c9-be","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_0a23f3-64","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_fe187e-61","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_e09381-67","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_8fdb19-25","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_28b0cb-ae","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_50e458-81","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_85d0db-c0","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_ad6c0b-19","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_050d69-94","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-qimen'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_f68382-f0","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette8) 0%,var(\u002d\u002dglobal-palette7) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_7c45cc-50","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_7c45cc-50"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_005617-e1","align":"center","color":"palette1","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette1","linkHoverColor":"palette3","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link59_005617-e1 hls-none"><p class="kt-adv-heading59_005617-e1 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_005617-e1">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_f20f3a-41","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading59_f20f3a-41 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_f20f3a-41">奇門遁甲</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_18ff94-54","align":"center","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading59_18ff94-54 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_18ff94-54">時家奇門九宮盤:三奇六儀、八門、九星、八神</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_1e9730-17","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_417de5-07","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_417de5-07"><div class="kt-inside-inner-col"><!-- wp:aware-wave/oracle {"tool":"qimen"} /--></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_a4a15a-2c","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_7f3289-08","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_7f3289-08"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_55f350-9b","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_55f350-9b wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_55f350-9b">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"59_00b395-9e","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items59_00b395-9e kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"59_c77bbf-0d","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_c77bbf-0d"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">時家奇門九宮盤</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_0c3d09-e7","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_0c3d09-e7"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">三奇六儀、八門</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_14ae33-1c","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_14ae33-1c"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">九星、八神</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_a3fda8-ac","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_1c68f7-e7","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_1c68f7-e7"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_4ba9a7-0b","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_4ba9a7-0b wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_4ba9a7-0b">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"59_1461d5-73","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns59_1461d5-73"><!-- wp:kadence/singlebtn {"uniqueID":"59_87f0ab-37","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_cc8997-65","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_9cd2e0-32","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_064e0f-0c","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_bdfef2-74","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_4140b5-a9","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_11cb6d-fd","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_d83f99-d8","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_d45dbf-c9","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_a55904-c2","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_3f0623-02","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-zeri'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_daae31-d4","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette8) 0%,var(\u002d\u002dglobal-palette7) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_023a6d-d0","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_023a6d-d0"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_aeb8e9-db","align":"center","color":"palette1","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette1","linkHoverColor":"palette3","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link59_aeb8e9-db hls-none"><p class="kt-adv-heading59_aeb8e9-db wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_aeb8e9-db">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_749636-1f","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading59_749636-1f wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_749636-1f">擇日</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_c58504-50","align":"center","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading59_c58504-50 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_c58504-50">依事項挑吉日:通書宜忌、建除、黃道與沖煞逐日判定</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_47b891-41","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_d2c6d4-83","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_d2c6d4-83"><div class="kt-inside-inner-col"><!-- wp:aware-wave/oracle {"tool":"zeri"} /--></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_5ede8c-a5","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_2fabb5-ca","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_2fabb5-ca"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_fdf1d5-09","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_fdf1d5-09 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_fdf1d5-09">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"59_9144b7-d5","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items59_9144b7-d5 kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"59_bf4c5c-f1","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_bf4c5c-f1"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">依事項挑吉日</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_1ee301-7c","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_1ee301-7c"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">通書宜忌、建除</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_54c05d-e4","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_54c05d-e4"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">黃道與沖煞逐日判定</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_9b0dc0-00","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_1cae7b-49","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_1cae7b-49"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_a77e6d-a1","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_a77e6d-a1 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_a77e6d-a1">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"59_73d292-70","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns59_73d292-70"><!-- wp:kadence/singlebtn {"uniqueID":"59_18a42d-25","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_2e4a2e-03","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_0ef337-79","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_0aad8e-e9","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_2c79ca-2f","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_2cbaa6-a6","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_fd1967-49","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_156fe6-01","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_b5d6c8-88","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_f1ccfb-fb","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_42f44f-6b","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-daily'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_31b86d-ae","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette8) 0%,var(\u002d\u002dglobal-palette7) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_c8eb7b-9e","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_c8eb7b-9e"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_784987-b9","align":"center","color":"palette1","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette1","linkHoverColor":"palette3","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link59_784987-b9 hls-none"><p class="kt-adv-heading59_784987-b9 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_784987-b9">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_762008-8c","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading59_762008-8c wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_762008-8c">每日運勢</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_46e3aa-66","align":"center","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading59_46e3aa-66 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_46e3aa-66">今日運勢、幸運色、幸運數字、宜忌</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_519197-3b","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_eda566-10","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_eda566-10"><div class="kt-inside-inner-col"><!-- wp:aware-wave/oracle {"tool":"daily"} /--></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_4421a4-99","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_aa2ea9-59","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_aa2ea9-59"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_9ad575-3b","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_9ad575-3b wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_9ad575-3b">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"59_c94552-1c","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items59_c94552-1c kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"59_840408-48","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_840408-48"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">今日運勢</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_49d036-e2","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_49d036-e2"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">幸運色、幸運數字</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"59_3ac37e-0b","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-59_3ac37e-0b"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">宜忌</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_a09920-4f","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_e552d0-c9","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_e552d0-c9"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_cdded7-7e","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading59_cdded7-7e wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_cdded7-7e">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"59_8d122e-d4","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns59_8d122e-d4"><!-- wp:kadence/singlebtn {"uniqueID":"59_2ae37f-57","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_391b95-7e","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_cd5a18-17","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_f722cb-49","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_b5369c-48","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_43c1cf-f1","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_66bcef-db","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_dd6cc1-07","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_e30a34-6e","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_cb39c8-3d","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_3b1d3e-17","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['my-charts'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_dfa554-dc","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette8) 0%,var(\u002d\u002dglobal-palette7) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_2ad1b3-61","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_2ad1b3-61"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_c9ecd8-72","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading59_c9ecd8-72 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_c9ecd8-72">我的命盤</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_4055f4-42","align":"center","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading59_4055f4-42 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_4055f4-42">只有你看得到。不會通知任何人你存了他們。</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_c49ccd-23","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"loggedIn":true,"padding":["56","sm","72","sm"],"mobilePadding":["32","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_d53b38-9a","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_d53b38-9a"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"59_25eab9-52","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[28,"",22]} -->
<h2 class="kt-adv-heading59_25eab9-52 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_25eab9-52">登入後才能存命盤</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_e6050a-c7","align":"center","color":"palette4","margin":[0,0,28,0],"htmlTag":"p","fontSize":[17,"",16]} -->
<p class="kt-adv-heading59_e6050a-c7 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_e6050a-c7">工具不用登入也能用。想把命盤和親友資料存起來，請先登入或註冊。</p>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"59_4c28f0-3c","gap":["sm","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns59_4c28f0-3c"><!-- wp:kadence/singlebtn {"uniqueID":"59_221917-99","text":"登入","link":"@@HOME@@/wp-login.php?redirect_to=%40%40MYCHARTS%40%40","sizePreset":"large"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"59_925698-8f","text":"註冊","link":"@@HOME@@/wp-login.php?action=register","sizePreset":"large","color":"palette3","colorHover":"palette1","borderStyle":[{"top":["palette5","solid",1],"right":["palette5","solid",1],"bottom":["palette5","solid",1],"left":["palette5","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette1","solid",1],"right":["palette1","solid",1],"bottom":["palette1","solid",1],"left":["palette1","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_947eae-64","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"loggedOut":true,"padding":["48","sm","72","sm"],"mobilePadding":["32","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_0ba661-a6","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_0ba661-a6"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
[aw_oracle_my_charts]
<!-- /wp:shortcode -->

<!-- wp:shortcode -->
[aw_oracle_persons]
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['daily-letter'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"59_544ff3-e0","columns":1,"colLayout":"equal","textColor":"palette3","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette8) 0%,var(\u002d\u002dglobal-palette7) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"59_0f27bc-f6","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_0f27bc-f6"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"level":1,"uniqueID":"59_8c0abe-ef","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading59_8c0abe-ef wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_8c0abe-ef">每日運勢信</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"59_675360-a6","align":"center","color":"palette4","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading59_675360-a6 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading59_675360-a6">每天早上 07:00（您所在時區）之後寄一封，依您的出生資料計算。每封信都可以取消訂閱。</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"59_1f6900-20","columns":1,"colLayout":"equal","maxWidth":720,"bgColor":"palette9","padding":["56","sm","72","sm"],"mobilePadding":["32","","48",""],"anchor":"daily-form","kbVersion":2} -->
<!-- wp:kadence/column {"background":"palette8","borderRadius":[12,12,12,12],"uniqueID":"59_dc3c3c-d6","padding":[32,32,32,32],"mobilePadding":[20,16,20,16],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column59_dc3c3c-d6"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
@@DAILY_FORM@@
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;


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

// ---- pages
$home = untrailingslashit( home_url() );
$mine = isset( $pg1_ids['my-charts'] ) ? get_permalink( $pg1_ids['my-charts'] ) : $home . '/my-charts/';
$slot = "<!-- wp:shortcode -->\n@@DAILY_FORM@@\n<!-- /wp:shortcode -->";
foreach ( $pg1_ids as $key => $id ) {
	if ( ! isset( $pg1_pages[ $key ] ) ) {
		continue;
	}
	$content = strtr(
		$pg1_pages[ $key ],
		array(
			'@@HOME@@'             => $home,
			'%40%40MYCHARTS%40%40' => rawurlencode( $mine ),
			$slot                  => AWORACLE_PG1_DAILY_FORM,
		)
	);
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
