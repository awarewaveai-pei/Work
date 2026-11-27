<?php
/**
 * PG-1: oracle.aware-wave.com pages rebuilt with Kadence blocks + Kadence theme settings.
 * Run: wp eval-file apply.php            (re-runnable; same result every time)
 *      wp eval-file apply.php rollback   (puts back what the first run saved)
 * Touches only: front page, /tools/, /tools/<12 tools>/, /my-charts/, /daily-letter/ (found by slug),
 * the Kadence palette option, the theme mods listed in $mods, and the primary/mobile menu locations.
 * Old page content is kept as a revision before every write. Block markup below was produced by the
 * Kadence block editor itself (createBlock + serialize, Kadence Blocks 3.9.1.2 / Pro 2.8.17); do not hand-edit it,
 * edit the page in the block editor instead.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit( 1 );
}

// Form slot on /daily-letter/. Swap to the Fluent Forms shortcode (e.g. [fluentform id="3"]) and re-run.
const AWORACLE_PG1_DAILY_FORM = '[aw_oracle_daily]';
const AWORACLE_PG1_BACKUP     = 'aworacle_pg1_backup';
const AWORACLE_PG1_MENU       = '東西方命理主選單';

$pg1_args = isset( $args ) && is_array( $args ) ? $args : array();

if ( get_template() !== 'kadence' ) {
	WP_CLI::error( 'Active theme is not Kadence; nothing changed.' );
}

/** @return array<string,int> page key => ID (only pages that exist) */
function aworacle_pg1_pages(): array {
	$out   = array();
	$front = (int) get_option( 'page_on_front' );
	if ( $front > 0 && get_post( $front ) ) {
		$out['home'] = $front;
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

// Palette: night indigo + gold. Body text palette4/5 on palette8/9 ≥ 7:1; palette9/7 on palette3 ≥ 10:1.
$pg1_palette = array(
	array( 'color' => '#8A5A12', 'slug' => 'palette1', 'name' => 'Palette Color 1' ), // accent (links, icons) on light
	array( 'color' => '#E0B252', 'slug' => 'palette2', 'name' => 'Palette Color 2' ), // gold: buttons, accents on dark
	array( 'color' => '#141833', 'slug' => 'palette3', 'name' => 'Palette Color 3' ), // night indigo: headings, dark bands
	array( 'color' => '#272C4D', 'slug' => 'palette4', 'name' => 'Palette Color 4' ), // body text, gradient end
	array( 'color' => '#4A4E68', 'slug' => 'palette5', 'name' => 'Palette Color 5' ), // secondary text
	array( 'color' => '#6A6E85', 'slug' => 'palette6', 'name' => 'Palette Color 6' ), // subtle text
	array( 'color' => '#E6DECD', 'slug' => 'palette7', 'name' => 'Palette Color 7' ), // borders; light text on dark
	array( 'color' => '#F7F2E8', 'slug' => 'palette8', 'name' => 'Palette Color 8' ), // page background
	array( 'color' => '#FFFFFF', 'slug' => 'palette9', 'name' => 'Palette Color 9' ), // cards, content background
);

$pg1_font_body    = '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';
$pg1_font_heading = array( 'family' => 'Noto Serif TC', 'google' => true, 'variant' => array( '700' ), 'fallback' => 'serif' );

/** Theme mods: each value is merged over Kadence's own default, so only the listed keys change. */
$pg1_mods = array(
	'site_background'                => array( 'desktop' => array( 'color' => 'palette8' ) ),
	'content_background'             => array( 'desktop' => array( 'color' => 'palette9' ) ),
	'base_font'                      => array( 'family' => $pg1_font_body, 'google' => false, 'size' => array( 'desktop' => 17 ), 'lineHeight' => array( 'desktop' => 1.75 ), 'color' => 'palette4' ),
	'heading_font'                   => $pg1_font_heading,
	'load_fonts_local'               => true,
	'header_wrap_background'         => array( 'desktop' => array( 'color' => 'palette3' ) ),
	'header_main_background'         => array( 'desktop' => array( 'color' => 'palette3' ) ),
	'header_main_height'             => array( 'size' => array( 'mobile' => 60, 'tablet' => '', 'desktop' => 72 ) ),
	'brand_typography'               => array( 'family' => 'Noto Serif TC', 'google' => true, 'weight' => '700', 'variant' => '700', 'size' => array( 'desktop' => 24, 'mobile' => 20 ), 'color' => 'palette9' ),
	'brand_typography_color'         => array( 'hover' => 'palette2', 'active' => 'palette9' ),
	'primary_navigation_color'       => array( 'color' => 'palette7', 'hover' => 'palette2', 'active' => 'palette2' ),
	'primary_navigation_typography'  => array( 'size' => array( 'desktop' => 16 ) ),
	'mobile_trigger_color'           => array( 'color' => 'palette9', 'hover' => 'palette2' ),
	'header_popup_background'        => array( 'desktop' => array( 'color' => 'palette3' ) ),
	'header_popup_close_color'       => array( 'color' => 'palette9', 'hover' => 'palette2' ),
	'mobile_navigation_color'        => array( 'color' => 'palette9', 'hover' => 'palette2', 'active' => 'palette2' ),
	'mobile_navigation_typography'   => array( 'size' => array( 'desktop' => 17 ) ),
	'buttons_color'                  => array( 'color' => 'palette3', 'hover' => 'palette9' ),
	'buttons_background'             => array( 'color' => 'palette2', 'hover' => 'palette1' ),
	'buttons_border_radius'          => array( 'size' => array( 'mobile' => '', 'tablet' => '', 'desktop' => 8 ) ),
	'buttons_typography'             => array( 'weight' => '600', 'variant' => '600' ),
	'buttons_outline_color'          => array( 'color' => 'palette3', 'hover' => 'palette9' ),
	'footer_items'                   => array(
		'bottom' => array( 'bottom_1' => array( 'footer-html' ), 'bottom_2' => array(), 'bottom_3' => array(), 'bottom_4' => array(), 'bottom_5' => array() ),
	),
	'footer_bottom_background'       => array( 'desktop' => array( 'color' => 'palette3' ) ),
	'footer_html_content'            => '{copyright} {year} {site-title}',
	'footer_html_typography'         => array( 'color' => 'palette7', 'size' => array( 'desktop' => 14 ) ),
	'footer_html_link_color'         => array( 'color' => 'palette7', 'hover' => 'palette2' ),
);

$pg1_pages = array();
$pg1_pages['home'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_0132b8-12","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"radial-gradient(ellipse at top,var(\u002d\u002dglobal-palette4) 0%,var(\u002d\u002dglobal-palette3) 70%)","padding":["112","sm","96","sm"],"mobilePadding":["64","","56",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_66c79c-8f","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_66c79c-8f"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_04999b-5c","align":"center","color":"palette2","letterSpacing":3,"margin":[0,0,16,0],"htmlTag":"p","fontSize":[15,"",13]} -->
<p class="kt-adv-heading146_04999b-5c wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_04999b-5c">紫微斗數・八字・易經・塔羅・占星</p>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_66a972-a6","align":"center","color":"palette9","margin":[0,0,16,0],"fontSize":[60,"",40]} -->
<h1 class="kt-adv-heading146_66a972-a6 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_66a972-a6">東西方命理</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_f93d9b-c4","align":"center","color":"palette7","margin":[0,0,36,0],"htmlTag":"p","fontSize":[20,"",16]} -->
<p class="kt-adv-heading146_f93d9b-c4 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_f93d9b-c4">專業排盤 · 真太陽時校正 · AI 深度解讀</p>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"146_692d45-22","gap":["sm","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns146_692d45-22"><!-- wp:kadence/singlebtn {"uniqueID":"146_bc3c49-41","text":"選一個工具開始","link":"#tools","sizePreset":"large"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_82b6bc-bc","text":"每日運勢信","link":"@@HOME@@/daily-letter/","sizePreset":"large","color":"palette9","colorHover":"palette3","backgroundHover":"palette9","borderStyle":[{"top":["palette9","solid",2],"right":["palette9","solid",2],"bottom":["palette9","solid",2],"left":["palette9","solid",2],"unit":"px"}],"borderHoverStyle":[{"top":["palette9","solid",2],"right":["palette9","solid",2],"bottom":["palette9","solid",2],"left":["palette9","solid",2],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_6a808f-27","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["72","sm","24","sm"],"mobilePadding":["48","","16",""],"anchor":"tools","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_cf0cb8-29","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_cf0cb8-29"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_fc7be9-16","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_fc7be9-16 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_fc7be9-16">選一個工具開始</h2>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_d0657f-04","columns":4,"mobileLayout":"two-grid","tabletLayout":"two-grid","collapseGutter":"custom","customRowGutter":[20,20,12],"columnGutter":"custom","customGutter":[20,20,12],"colLayout":"equal","bgColor":"palette8","columnsInnerHeight":true,"inheritMaxWidth":true,"padding":["0","sm","20","sm"],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_64cd12-1a","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_64cd12-1a"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_a8d977-7c","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_star","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_a8d977-7c"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/ziwei/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_star" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">紫微斗數</h3><p class="kt-blocks-info-box-text">紫微斗數命盤,真太陽時校正,三方四正</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":2,"uniqueID":"146_34aee4-eb","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_34aee4-eb"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_7d4705-a1","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_grid","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_7d4705-a1"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/bazi/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_grid" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">八字四柱</h3><p class="kt-blocks-info-box-text">八字四柱、十神、藏干、納音</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":3,"uniqueID":"146_ece111-9a","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_ece111-9a"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_a34099-da","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_heart","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_a34099-da"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/hehun/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_heart" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">八字合婚</h3><p class="kt-blocks-info-box-text">兩人八字合婚與生肖配對,逐項列出依據</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":4,"uniqueID":"146_a4ef17-9c","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_a4ef17-9c"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_bb31de-7e","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_aperture","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_bb31de-7e"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/iching/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_aperture" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">易經卜卦</h3><p class="kt-blocks-info-box-text">六爻銅錢起卦,本卦變卦動爻</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_40a711-bb","columns":4,"mobileLayout":"two-grid","tabletLayout":"two-grid","collapseGutter":"custom","customRowGutter":[20,20,12],"columnGutter":"custom","customGutter":[20,20,12],"colLayout":"equal","bgColor":"palette8","columnsInnerHeight":true,"inheritMaxWidth":true,"padding":["0","sm","20","sm"],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_f2a4ed-02","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_f2a4ed-02"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_fb4f6a-89","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_layers","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_fb4f6a-89"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/tarot/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_layers" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">塔羅</h3><p class="kt-blocks-info-box-text">78 張牌庫,單張/三張/凱爾特十字</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":2,"uniqueID":"146_a428b1-39","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_a428b1-39"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_0fe469-8f","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_book","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_0fe469-8f"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/qian/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_book" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">觀音靈籤</h3><p class="kt-blocks-info-box-text">觀音靈籤一百首,默念所問求一支籤</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":3,"uniqueID":"146_e0231d-1d","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_e0231d-1d"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_935c70-65","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_sun","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_935c70-65"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/astrology/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_sun" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">西洋占星</h3><p class="kt-blocks-info-box-text">行星·星座·宮位·上升(Swiss 級精度,自架)</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":4,"uniqueID":"146_ed6991-eb","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_ed6991-eb"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_e29dc0-71","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_moon","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_e29dc0-71"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/vedic/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_moon" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">吠陀占星</h3><p class="kt-blocks-info-box-text">恆星黃道本命盤、二十七月宿、九分盤、Vimśottarī 大運</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_1453e5-7d","columns":4,"mobileLayout":"two-grid","tabletLayout":"two-grid","collapseGutter":"custom","customRowGutter":[20,20,12],"columnGutter":"custom","customGutter":[20,20,12],"colLayout":"equal","bgColor":"palette8","columnsInnerHeight":true,"inheritMaxWidth":true,"padding":["0","sm","0","sm"],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_1be5c2-3c","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_1be5c2-3c"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_a13687-9d","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_compass","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_a13687-9d"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/fengshui/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_compass" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">風水飛星</h3><p class="kt-blocks-info-box-text">玄空飛星九宮盤、八宅命卦,方位擺放建議</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":2,"uniqueID":"146_21b99b-ae","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_21b99b-ae"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_d760d7-6e","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_target","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_d760d7-6e"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/qimen/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_target" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">奇門遁甲</h3><p class="kt-blocks-info-box-text">時家奇門九宮盤:三奇六儀、八門、九星、八神</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":3,"uniqueID":"146_09e98e-8e","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_09e98e-8e"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_e7146d-be","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_calendar","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_e7146d-be"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/zeri/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_calendar" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">擇日</h3><p class="kt-blocks-info-box-text">依事項挑吉日:通書宜忌、建除、黃道與沖煞逐日判定</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":4,"uniqueID":"146_3619ce-ad","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_3619ce-ad"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_64bb3c-7d","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_sunrise","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_64bb3c-7d"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/daily/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_sunrise" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">每日運勢</h3><p class="kt-blocks-info-box-text">今日運勢、幸運色、幸運數字、宜忌</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_ffb40c-d0","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["0","sm","72","sm"],"mobilePadding":["0","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_f5bda4-31","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_f5bda4-31"><div class="kt-inside-inner-col"></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_235ddb-0a","colLayout":"left-golden","bgColor":"palette3","verticalAlignment":"middle","textColor":"palette9","inheritMaxWidth":true,"padding":["64","sm","64","sm"],"mobilePadding":["48","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_d4e27e-66","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_d4e27e-66"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_f98d06-3c","color":"palette9","margin":[0,0,8,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_f98d06-3c wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_f98d06-3c">每日運勢信</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_3809ca-6f","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[17,"",16]} -->
<p class="kt-adv-heading146_3809ca-6f wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_3809ca-6f">每天早上 07:00（您所在時區）之後寄一封，依您的出生資料計算。每封信都可以取消訂閱。</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":2,"uniqueID":"146_32c580-09","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_32c580-09"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedbtn {"hAlign":"right","mhAlign":"left","uniqueID":"146_d46b56-e2"} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns146_d46b56-e2"><!-- wp:kadence/singlebtn {"uniqueID":"146_6b3156-2c","text":"訂閱","link":"@@HOME@@/daily-letter/","sizePreset":"large"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tools'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_03967d-ee","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette3) 0%,var(\u002d\u002dglobal-palette4) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_8bb10c-74","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_8bb10c-74"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_46e1a4-04","align":"center","color":"palette9","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading146_46e1a4-04 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_46e1a4-04">全部工具</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_579090-7c","align":"center","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading146_579090-7c wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_579090-7c">選一個工具開始</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_990ff0-6a","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","0","sm"],"mobilePadding":["32","","",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_1d45e3-35","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_1d45e3-35"><div class="kt-inside-inner-col"></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_d7b24b-2b","columns":4,"mobileLayout":"two-grid","tabletLayout":"two-grid","collapseGutter":"custom","customRowGutter":[20,20,12],"columnGutter":"custom","customGutter":[20,20,12],"colLayout":"equal","bgColor":"palette8","columnsInnerHeight":true,"inheritMaxWidth":true,"padding":["0","sm","20","sm"],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_c5dcd3-dd","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_c5dcd3-dd"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_31b5d1-cf","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_star","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_31b5d1-cf"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/ziwei/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_star" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">紫微斗數</h3><p class="kt-blocks-info-box-text">紫微斗數命盤,真太陽時校正,三方四正</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":2,"uniqueID":"146_de1c3b-1e","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_de1c3b-1e"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_a8b50b-b8","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_grid","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_a8b50b-b8"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/bazi/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_grid" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">八字四柱</h3><p class="kt-blocks-info-box-text">八字四柱、十神、藏干、納音</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":3,"uniqueID":"146_a82ca4-e8","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_a82ca4-e8"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_1ac7bd-83","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_heart","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_1ac7bd-83"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/hehun/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_heart" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">八字合婚</h3><p class="kt-blocks-info-box-text">兩人八字合婚與生肖配對,逐項列出依據</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":4,"uniqueID":"146_17ef26-0c","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_17ef26-0c"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_3b4fd7-94","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_aperture","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_3b4fd7-94"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/iching/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_aperture" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">易經卜卦</h3><p class="kt-blocks-info-box-text">六爻銅錢起卦,本卦變卦動爻</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_fb43b5-96","columns":4,"mobileLayout":"two-grid","tabletLayout":"two-grid","collapseGutter":"custom","customRowGutter":[20,20,12],"columnGutter":"custom","customGutter":[20,20,12],"colLayout":"equal","bgColor":"palette8","columnsInnerHeight":true,"inheritMaxWidth":true,"padding":["0","sm","20","sm"],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_09bc49-d3","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_09bc49-d3"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_794dc8-a5","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_layers","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_794dc8-a5"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/tarot/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_layers" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">塔羅</h3><p class="kt-blocks-info-box-text">78 張牌庫,單張/三張/凱爾特十字</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":2,"uniqueID":"146_e44891-41","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_e44891-41"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_2ae9f0-dc","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_book","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_2ae9f0-dc"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/qian/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_book" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">觀音靈籤</h3><p class="kt-blocks-info-box-text">觀音靈籤一百首,默念所問求一支籤</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":3,"uniqueID":"146_862b7d-ec","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_862b7d-ec"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_84defe-95","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_sun","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_84defe-95"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/astrology/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_sun" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">西洋占星</h3><p class="kt-blocks-info-box-text">行星·星座·宮位·上升(Swiss 級精度,自架)</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":4,"uniqueID":"146_21bd6a-56","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_21bd6a-56"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_c5fe75-d6","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_moon","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_c5fe75-d6"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/vedic/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_moon" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">吠陀占星</h3><p class="kt-blocks-info-box-text">恆星黃道本命盤、二十七月宿、九分盤、Vimśottarī 大運</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_16fd9d-52","columns":4,"mobileLayout":"two-grid","tabletLayout":"two-grid","collapseGutter":"custom","customRowGutter":[20,20,12],"columnGutter":"custom","customGutter":[20,20,12],"colLayout":"equal","bgColor":"palette8","columnsInnerHeight":true,"inheritMaxWidth":true,"padding":["0","sm","0","sm"],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_3bf172-b6","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_3bf172-b6"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_c70b62-f6","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_compass","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_c70b62-f6"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/fengshui/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_compass" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">風水飛星</h3><p class="kt-blocks-info-box-text">玄空飛星九宮盤、八宅命卦,方位擺放建議</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":2,"uniqueID":"146_b6092e-7b","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_b6092e-7b"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_cc20d8-0a","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_target","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_cc20d8-0a"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/qimen/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_target" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">奇門遁甲</h3><p class="kt-blocks-info-box-text">時家奇門九宮盤:三奇六儀、八門、九星、八神</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":3,"uniqueID":"146_28f538-01","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_28f538-01"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_cfc7f2-7a","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_calendar","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_cfc7f2-7a"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/zeri/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_calendar" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">擇日</h3><p class="kt-blocks-info-box-text">依事項挑吉日:通書宜忌、建除、黃道與沖煞逐日判定</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->

<!-- wp:kadence/column {"id":4,"uniqueID":"146_5abbe4-c2","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_5abbe4-c2"><div class="kt-inside-inner-col"><!-- wp:kadence/infobox {"uniqueID":"146_fc261d-c2","hAlign":"left","containerBackground":"palette9","containerHoverBackground":"palette9","containerPadding":[24,24,24,24],"containerMobilePadding":[16,14,16,14],"mediaIcon":[{"icon":"fe_sunrise","size":28,"unit":"px","width":2,"title":"","color":"palette1","hoverColor":"palette1","hoverAnimation":"none","flipIcon":"","tabletSize":"","mobileSize":""}],"mediaStyle":[{"background":"","hoverBackground":"","border":"","hoverBorder":"","borderRadius":0,"borderRadiusUnit":"px","borderWidth":[0,0,0,0],"borderWidthUnit":"px","padding":[0,0,0,0],"paddingUnit":"px","margin":[0,0,12,0],"marginUnit":"px"}],"titleColor":"palette3","titleHoverColor":"palette3","titleFont":[{"level":3,"size":[20,"",19],"sizeType":"px","lineHeight":[1.4,"",""],"lineType":"","letterSpacing":"","textTransform":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"padding":["","","",""],"paddingControl":"linked","margin":[0,0,6,0],"marginControl":"individual","paddingUnit":"px","marginUnit":"px"}],"textColor":"palette5","textHoverColor":"palette5","textFont":[{"size":[15,"",15],"sizeType":"px","lineHeight":[1.6,"",""],"lineType":"","letterSpacing":"","family":"","google":"","style":"","weight":"","variant":"","subset":"","loadGoogle":true,"textTransform":""}],"borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette2","solid",1],"right":["palette2","solid",1],"bottom":["palette2","solid",1],"left":["palette2","solid",1],"unit":"px"}],"borderRadius":[12,12,12,12],"fullHeight":true,"kbVersion":2} -->
<div class="wp-block-kadence-infobox kt-info-box146_fc261d-c2"><a class="kt-blocks-info-box-link-wrap info-box-link kt-blocks-info-box-media-align-top kt-info-halign-left" href="@@HOME@@/tools/daily/"><div class="kt-blocks-info-box-media-container"><div class="kt-blocks-info-box-media kt-info-media-animate-none"><div class="kadence-info-box-icon-container kt-info-icon-animate-none"><div class="kadence-info-box-icon-inner-container"><span data-name="fe_sunrise" data-stroke="2" data-class="kt-info-svg-icon" class="kadence-dynamic-icon"></span></div></div></div></div><div class="kt-infobox-textcontent"><h3 class="kt-blocks-info-box-title">每日運勢</h3><p class="kt-blocks-info-box-text">今日運勢、幸運色、幸運數字、宜忌</p></div></a></div>
<!-- /wp:kadence/infobox --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_9862dc-69","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["0","sm","72","sm"],"mobilePadding":["0","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_d1e4a7-9e","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_d1e4a7-9e"><div class="kt-inside-inner-col"></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-ziwei'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_f606c9-a6","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette3) 0%,var(\u002d\u002dglobal-palette4) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_0867ab-71","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_0867ab-71"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_8d6856-90","align":"center","color":"palette2","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette2","linkHoverColor":"palette9","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link146_8d6856-90 hls-none"><p class="kt-adv-heading146_8d6856-90 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_8d6856-90">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_f0b40e-99","align":"center","color":"palette9","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading146_f0b40e-99 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_f0b40e-99">紫微斗數</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_a67bfd-cf","align":"center","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading146_a67bfd-cf wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_a67bfd-cf">紫微斗數命盤,真太陽時校正,三方四正</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_64a058-7d","columns":1,"colLayout":"equal","bgColor":"palette3","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_9a8301-e2","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_9a8301-e2"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
[aw_oracle tool="ziwei"]
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_423049-70","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_6b36a7-06","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_6b36a7-06"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_f5a950-06","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_f5a950-06 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_f5a950-06">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"146_01aaed-2e","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items146_01aaed-2e kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"146_15fe9a-aa","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_15fe9a-aa"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">紫微斗數命盤</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_8966f8-37","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_8966f8-37"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">真太陽時校正</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_cc52ea-a1","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_cc52ea-a1"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">三方四正</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_2c517a-30","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_0970e9-7e","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_0970e9-7e"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_e69659-62","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_e69659-62 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_e69659-62">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"146_f7747c-5d","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns146_f7747c-5d"><!-- wp:kadence/singlebtn {"uniqueID":"146_f920f8-81","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_78c31e-6b","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_92deae-3d","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_eea902-5b","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_7426c3-1f","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_bf7373-ee","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_8c2858-1f","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_efc33f-53","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_b8a111-02","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_08b2a8-93","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_bf55d2-4d","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-bazi'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_5fff7f-3a","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette3) 0%,var(\u002d\u002dglobal-palette4) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_72c23f-25","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_72c23f-25"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_f5b51b-d2","align":"center","color":"palette2","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette2","linkHoverColor":"palette9","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link146_f5b51b-d2 hls-none"><p class="kt-adv-heading146_f5b51b-d2 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_f5b51b-d2">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_5d5924-83","align":"center","color":"palette9","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading146_5d5924-83 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_5d5924-83">八字四柱</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_acdfe4-db","align":"center","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading146_acdfe4-db wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_acdfe4-db">八字四柱、十神、藏干、納音</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_c55ac1-a6","columns":1,"colLayout":"equal","bgColor":"palette3","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_010c47-5f","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_010c47-5f"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
[aw_oracle tool="bazi"]
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_53bbd2-ca","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_ea1599-93","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_ea1599-93"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_5ee7e2-64","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_5ee7e2-64 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_5ee7e2-64">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"146_310f49-47","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items146_310f49-47 kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"146_fb645a-76","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_fb645a-76"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">八字四柱</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_986053-a7","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_986053-a7"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">十神、藏干</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_3bb2fe-95","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_3bb2fe-95"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">納音</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_8a150f-fe","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_5634c3-fe","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_5634c3-fe"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_c686d6-b0","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_c686d6-b0 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_c686d6-b0">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"146_851499-b5","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns146_851499-b5"><!-- wp:kadence/singlebtn {"uniqueID":"146_680a4b-3b","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_14ac36-fe","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_4e60a4-b2","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_79cc50-9e","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_7b5307-88","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_2d67e4-05","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_12b6ab-e8","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_47e351-e3","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_bdc1a4-f4","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_aff0f5-2e","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_a8d95c-ca","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-hehun'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_c7984e-34","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette3) 0%,var(\u002d\u002dglobal-palette4) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_f513ed-97","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_f513ed-97"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_3ff35a-2c","align":"center","color":"palette2","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette2","linkHoverColor":"palette9","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link146_3ff35a-2c hls-none"><p class="kt-adv-heading146_3ff35a-2c wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_3ff35a-2c">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_8bd7b1-0e","align":"center","color":"palette9","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading146_8bd7b1-0e wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_8bd7b1-0e">八字合婚</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_b3620a-b7","align":"center","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading146_b3620a-b7 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_b3620a-b7">兩人八字合婚與生肖配對,逐項列出依據</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_8398f4-64","columns":1,"colLayout":"equal","bgColor":"palette3","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_5c60fb-5e","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_5c60fb-5e"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
[aw_oracle tool="hehun"]
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_6bc538-72","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_c29eaa-c4","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_c29eaa-c4"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_8fdcf5-36","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_8fdcf5-36 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_8fdcf5-36">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"146_5fe7a4-13","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items146_5fe7a4-13 kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"146_a3be8d-4c","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_a3be8d-4c"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">兩人八字合婚</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_068f72-2e","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_068f72-2e"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">生肖配對</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_63d3cd-eb","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_63d3cd-eb"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">逐項列出依據</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_702d52-5f","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_1b30fc-39","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_1b30fc-39"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_a80ede-6b","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_a80ede-6b wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_a80ede-6b">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"146_d9e895-62","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns146_d9e895-62"><!-- wp:kadence/singlebtn {"uniqueID":"146_2d4def-e0","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_a13a37-22","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_9186ff-89","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_c06ebf-21","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_e482ec-8a","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_95da81-84","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_aef572-d7","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_4606ca-8a","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_6df914-ba","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_9e4ce4-83","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_491a2b-fb","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-iching'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_659f97-26","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette3) 0%,var(\u002d\u002dglobal-palette4) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_6df0f3-c1","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_6df0f3-c1"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_20012d-af","align":"center","color":"palette2","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette2","linkHoverColor":"palette9","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link146_20012d-af hls-none"><p class="kt-adv-heading146_20012d-af wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_20012d-af">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_3e6970-51","align":"center","color":"palette9","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading146_3e6970-51 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_3e6970-51">易經卜卦</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_f6d500-93","align":"center","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading146_f6d500-93 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_f6d500-93">六爻銅錢起卦,本卦變卦動爻</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_f04367-c9","columns":1,"colLayout":"equal","bgColor":"palette3","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_d19b0c-dd","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_d19b0c-dd"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
[aw_oracle tool="iching"]
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_2c6e5a-f0","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_925d2d-9b","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_925d2d-9b"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_be802a-3f","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_be802a-3f wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_be802a-3f">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"146_311895-e1","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items146_311895-e1 kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"146_ec29a3-58","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_ec29a3-58"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">六爻銅錢起卦</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_f4f45c-b5","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_f4f45c-b5"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">本卦、變卦</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_5d26fc-71","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_5d26fc-71"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">動爻</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_37dabf-de","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_d34580-72","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_d34580-72"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_165c2b-11","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_165c2b-11 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_165c2b-11">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"146_6aac2a-d6","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns146_6aac2a-d6"><!-- wp:kadence/singlebtn {"uniqueID":"146_d01f2d-4b","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_4e051c-16","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_2999ab-65","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_a0deb7-00","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_bae3cc-a3","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_deea46-c9","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_3b7c9b-e1","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_d93e68-bd","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_d6c268-76","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_4ecb8b-9d","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_310063-cf","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-tarot'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_1b5592-b2","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette3) 0%,var(\u002d\u002dglobal-palette4) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_a7249f-1f","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_a7249f-1f"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_91391b-60","align":"center","color":"palette2","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette2","linkHoverColor":"palette9","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link146_91391b-60 hls-none"><p class="kt-adv-heading146_91391b-60 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_91391b-60">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_4cafcf-4b","align":"center","color":"palette9","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading146_4cafcf-4b wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_4cafcf-4b">塔羅</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_7c1ee6-42","align":"center","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading146_7c1ee6-42 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_7c1ee6-42">78 張牌庫,單張/三張/凱爾特十字</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_152e21-6c","columns":1,"colLayout":"equal","bgColor":"palette3","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_0341fb-05","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_0341fb-05"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
[aw_oracle tool="tarot"]
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_85c463-77","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_e044ae-7f","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_e044ae-7f"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_62f065-9c","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_62f065-9c wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_62f065-9c">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"146_204b47-6c","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items146_204b47-6c kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"146_bc5ff1-8e","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_bc5ff1-8e"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">78 張牌庫</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_6a5684-1f","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_6a5684-1f"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">單張、三張</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_540536-4f","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_540536-4f"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">凱爾特十字</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_7b07f3-09","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_bda5a3-f8","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_bda5a3-f8"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_c185d7-12","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_c185d7-12 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_c185d7-12">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"146_b1218a-e8","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns146_b1218a-e8"><!-- wp:kadence/singlebtn {"uniqueID":"146_feca09-04","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_0777ed-90","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_f2aed9-a9","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_242c37-c2","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_f0474c-1f","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_7875a7-b5","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_e48fe5-36","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_9a5984-db","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_5b45f5-64","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_13f390-69","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_eef7ac-0c","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-qian'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_8baefb-14","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette3) 0%,var(\u002d\u002dglobal-palette4) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_00037b-6b","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_00037b-6b"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_95ab6a-52","align":"center","color":"palette2","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette2","linkHoverColor":"palette9","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link146_95ab6a-52 hls-none"><p class="kt-adv-heading146_95ab6a-52 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_95ab6a-52">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_0dc57f-eb","align":"center","color":"palette9","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading146_0dc57f-eb wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_0dc57f-eb">觀音靈籤</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_7e8d18-5e","align":"center","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading146_7e8d18-5e wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_7e8d18-5e">觀音靈籤一百首,默念所問求一支籤</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_45bdd2-ec","columns":1,"colLayout":"equal","bgColor":"palette3","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_32ef8e-97","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_32ef8e-97"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
[aw_oracle tool="qian"]
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_b85898-0c","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_42d465-56","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_42d465-56"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_f7d161-1f","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_f7d161-1f wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_f7d161-1f">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"146_681928-2c","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items146_681928-2c kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"146_eeeeea-1c","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_eeeeea-1c"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">觀音靈籤一百首</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_d696c1-2a","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_d696c1-2a"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">默念所問</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_6079a6-e5","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_6079a6-e5"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">求一支籤</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_e4459e-83","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_452abd-fb","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_452abd-fb"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_5059da-6b","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_5059da-6b wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_5059da-6b">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"146_8313c4-06","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns146_8313c4-06"><!-- wp:kadence/singlebtn {"uniqueID":"146_098c45-93","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_83f9ba-13","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_596775-22","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_6c1074-28","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_112ff4-80","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_ed011c-81","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_3c21b0-64","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_360e90-29","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_2e32c5-91","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_de5ee2-5d","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_64d07e-67","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-astrology'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_e4c998-bc","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette3) 0%,var(\u002d\u002dglobal-palette4) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_ee1365-e4","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_ee1365-e4"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_9979ff-73","align":"center","color":"palette2","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette2","linkHoverColor":"palette9","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link146_9979ff-73 hls-none"><p class="kt-adv-heading146_9979ff-73 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_9979ff-73">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_e5e8cd-2c","align":"center","color":"palette9","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading146_e5e8cd-2c wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_e5e8cd-2c">西洋占星</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_2ca1d0-67","align":"center","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading146_2ca1d0-67 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_2ca1d0-67">行星·星座·宮位·上升(Swiss 級精度,自架)</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_445fef-95","columns":1,"colLayout":"equal","bgColor":"palette3","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_71b09e-f9","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_71b09e-f9"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
[aw_oracle tool="astrology"]
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_375c2d-2a","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_e345e8-44","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_e345e8-44"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_745d72-2d","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_745d72-2d wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_745d72-2d">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"146_80fed5-07","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items146_80fed5-07 kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"146_56002d-00","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_56002d-00"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">行星·星座·宮位</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_0e3669-e3","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_0e3669-e3"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">上升</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_5dae78-e3","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_5dae78-e3"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">Swiss 級精度,自架</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_1a7480-97","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_968dc6-d7","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_968dc6-d7"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_42bd7a-98","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_42bd7a-98 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_42bd7a-98">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"146_50965a-d6","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns146_50965a-d6"><!-- wp:kadence/singlebtn {"uniqueID":"146_66b0e3-e5","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_9e46f8-1d","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_d0bc7d-ac","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_cbac6e-62","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_b66868-bd","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_cae545-ce","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_66c2d5-ca","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_e625f2-d1","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_7f72b3-19","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_744f0b-f7","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_f5fb02-2a","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-vedic'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_a0f58b-07","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette3) 0%,var(\u002d\u002dglobal-palette4) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_55c489-cf","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_55c489-cf"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_e6d83b-79","align":"center","color":"palette2","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette2","linkHoverColor":"palette9","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link146_e6d83b-79 hls-none"><p class="kt-adv-heading146_e6d83b-79 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_e6d83b-79">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_de42fa-99","align":"center","color":"palette9","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading146_de42fa-99 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_de42fa-99">吠陀占星</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_5cf027-d4","align":"center","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading146_5cf027-d4 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_5cf027-d4">恆星黃道本命盤、二十七月宿、九分盤、Vimśottarī 大運</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_05a0c9-a0","columns":1,"colLayout":"equal","bgColor":"palette3","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_5e5253-1c","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_5e5253-1c"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
[aw_oracle tool="vedic"]
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_3bfe38-0a","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_779104-7a","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_779104-7a"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_669248-b8","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_669248-b8 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_669248-b8">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"146_21c488-54","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items146_21c488-54 kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"146_12c338-5c","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_12c338-5c"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">恆星黃道本命盤</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_8c11f2-a3","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_8c11f2-a3"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">二十七月宿、九分盤</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_e279da-41","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_e279da-41"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">Vimśottarī 大運</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_8a2e1b-1f","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_bc106b-f3","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_bc106b-f3"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_bdcaa4-9b","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_bdcaa4-9b wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_bdcaa4-9b">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"146_610081-f3","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns146_610081-f3"><!-- wp:kadence/singlebtn {"uniqueID":"146_68d1fc-b8","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_1d335c-39","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_64edf8-08","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_79d1f3-d3","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_2eea0e-f6","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_9c0f7d-5f","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_d70529-23","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_72a002-3b","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_fe4965-38","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_2f35fe-4e","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_d2531f-b4","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-fengshui'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_18cbf1-b0","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette3) 0%,var(\u002d\u002dglobal-palette4) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_b0cc86-71","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_b0cc86-71"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_4894b8-e1","align":"center","color":"palette2","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette2","linkHoverColor":"palette9","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link146_4894b8-e1 hls-none"><p class="kt-adv-heading146_4894b8-e1 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_4894b8-e1">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_622a6c-22","align":"center","color":"palette9","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading146_622a6c-22 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_622a6c-22">風水飛星</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_03ae33-7c","align":"center","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading146_03ae33-7c wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_03ae33-7c">玄空飛星九宮盤、八宅命卦,方位擺放建議</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_0f7e7d-bc","columns":1,"colLayout":"equal","bgColor":"palette3","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_277905-8e","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_277905-8e"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
[aw_oracle tool="fengshui"]
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_38d5fb-13","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_92cfc9-f6","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_92cfc9-f6"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_c77250-1c","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_c77250-1c wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_c77250-1c">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"146_230b80-5d","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items146_230b80-5d kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"146_3a5c36-1b","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_3a5c36-1b"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">玄空飛星九宮盤</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_21c9a9-e9","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_21c9a9-e9"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">八宅命卦</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_86c349-8f","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_86c349-8f"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">方位擺放建議</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_8d8ab3-89","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_e2160d-74","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_e2160d-74"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_3ab7a4-63","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_3ab7a4-63 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_3ab7a4-63">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"146_a9323b-86","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns146_a9323b-86"><!-- wp:kadence/singlebtn {"uniqueID":"146_117c21-64","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_cb05e3-e1","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_bee474-18","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_516943-4e","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_db53ea-4a","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_d4a82d-37","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_4322c4-a9","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_eb2634-37","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_8b5a47-b8","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_156f21-03","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_0a116c-e2","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-qimen'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_d3ef3f-6b","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette3) 0%,var(\u002d\u002dglobal-palette4) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_4720e1-9a","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_4720e1-9a"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_ac8704-6e","align":"center","color":"palette2","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette2","linkHoverColor":"palette9","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link146_ac8704-6e hls-none"><p class="kt-adv-heading146_ac8704-6e wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_ac8704-6e">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_a46e6b-7b","align":"center","color":"palette9","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading146_a46e6b-7b wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_a46e6b-7b">奇門遁甲</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_3885c8-69","align":"center","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading146_3885c8-69 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_3885c8-69">時家奇門九宮盤:三奇六儀、八門、九星、八神</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_25aade-e6","columns":1,"colLayout":"equal","bgColor":"palette3","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_d19bdf-92","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_d19bdf-92"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
[aw_oracle tool="qimen"]
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_d896f3-b8","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_e7f512-5f","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_e7f512-5f"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_2a6167-17","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_2a6167-17 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_2a6167-17">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"146_a55d61-bc","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items146_a55d61-bc kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"146_b9287a-45","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_b9287a-45"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">時家奇門九宮盤</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_4d92ec-00","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_4d92ec-00"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">三奇六儀、八門</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_8f02ec-71","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_8f02ec-71"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">九星、八神</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_d08ebb-33","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_5423aa-c6","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_5423aa-c6"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_db5c96-02","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_db5c96-02 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_db5c96-02">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"146_48b56c-7d","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns146_48b56c-7d"><!-- wp:kadence/singlebtn {"uniqueID":"146_071616-67","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_6d231c-d8","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_5b9a24-a5","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_983a81-90","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_0d65f7-3d","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_82f742-25","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_ae1ee0-09","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_6c4ac3-08","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_f72a29-65","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_7d2f9b-ad","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_778eeb-1a","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-zeri'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_0015ad-f0","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette3) 0%,var(\u002d\u002dglobal-palette4) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_924eb4-16","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_924eb4-16"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_fa7826-71","align":"center","color":"palette2","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette2","linkHoverColor":"palette9","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link146_fa7826-71 hls-none"><p class="kt-adv-heading146_fa7826-71 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_fa7826-71">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_b2b086-d8","align":"center","color":"palette9","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading146_b2b086-d8 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_b2b086-d8">擇日</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_2ef607-66","align":"center","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading146_2ef607-66 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_2ef607-66">依事項挑吉日:通書宜忌、建除、黃道與沖煞逐日判定</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_56f048-c1","columns":1,"colLayout":"equal","bgColor":"palette3","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_e0a514-33","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_e0a514-33"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
[aw_oracle tool="zeri"]
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_888545-8e","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_5d5922-2d","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_5d5922-2d"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_f662ec-14","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_f662ec-14 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_f662ec-14">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"146_fc70f4-6f","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items146_fc70f4-6f kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"146_249b56-3b","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_249b56-3b"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">依事項挑吉日</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_110474-dc","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_110474-dc"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">通書宜忌、建除</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_f7c3b2-d7","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_f7c3b2-d7"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">黃道與沖煞逐日判定</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_7635eb-ca","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_59abfc-ad","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_59abfc-ad"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_d4e869-c0","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_d4e869-c0 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_d4e869-c0">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"146_3f2bb1-1c","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns146_3f2bb1-1c"><!-- wp:kadence/singlebtn {"uniqueID":"146_a2e5c6-59","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_46f975-21","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_75a5c5-aa","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_019b7f-90","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_db6b2a-d4","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_6dc58d-22","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_f40728-2f","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_4fd91b-4e","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_745763-64","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_a91f62-ec","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_881ec7-34","text":"每日運勢","link":"@@HOME@@/tools/daily/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['tool-daily'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_42ecb8-04","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette3) 0%,var(\u002d\u002dglobal-palette4) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_314504-d4","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_314504-d4"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_e3515b-d8","align":"center","color":"palette2","margin":[0,0,12,0],"htmlTag":"p","link":"@@HOME@@/tools/","linkStyle":"none","linkColor":"palette2","linkHoverColor":"palette9","fontSize":[15,"",14]} -->
<a href="@@HOME@@/tools/" class="kb-advanced-heading-link kt-adv-heading-link146_e3515b-d8 hls-none"><p class="kt-adv-heading146_e3515b-d8 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_e3515b-d8">← 全部工具</p></a>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_56eeae-05","align":"center","color":"palette9","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading146_56eeae-05 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_56eeae-05">每日運勢</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_557c61-cc","align":"center","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading146_557c61-cc wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_557c61-cc">今日運勢、幸運色、幸運數字、宜忌</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_aa94c9-72","columns":1,"colLayout":"equal","bgColor":"palette3","inheritMaxWidth":true,"padding":["0","sm","48","sm"],"mobilePadding":["0","0","32","0"],"anchor":"tool","kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_68c5cd-f3","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_68c5cd-f3"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
[aw_oracle tool="daily"]
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_5973aa-67","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"padding":["56","sm","56","sm"],"mobilePadding":["40","","40",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_dc1c15-0e","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_dc1c15-0e"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_7c41a5-fb","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_7c41a5-fb wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_7c41a5-fb">這個工具會給你什麼</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/iconlist {"listStyles":[{"size":[17,"",16],"sizeType":"px","lineHeight":["","",""],"lineType":"px","letterSpacing":"","family":"","google":false,"style":"","weight":"","variant":"","subset":"","loadGoogle":true,"color":"palette4","textTransform":""}],"columns":3,"tabletColumns":3,"mobileColumns":1,"listGap":12,"columnGap":24,"uniqueID":"146_827701-d1","blockAlignment":"center","listMargin":["0","0","0","0"],"iconSize":[22,"",""],"color":"palette1"} -->
<div class="wp-block-kadence-iconlist kt-svg-icon-list-items kt-svg-icon-list-items146_827701-d1 kt-svg-icon-list-columns-3 aligncenter kt-tablet-svg-icon-list-columns-3 kt-mobile-svg-icon-list-columns-1"><ul class="kt-svg-icon-list"><!-- wp:kadence/listitem {"uniqueID":"146_78625c-95","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_78625c-95"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">今日運勢</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_21ac78-da","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_21ac78-da"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">幸運色、幸運數字</span></li>
<!-- /wp:kadence/listitem -->

<!-- wp:kadence/listitem {"uniqueID":"146_07206a-87","icon":"fe_check"} -->
<li class="wp-block-kadence-listitem kt-svg-icon-list-item-wrap kt-svg-icon-list-item-146_07206a-87"><span data-name="fe_check" data-stroke="USE_PARENT_DEFAULT_WIDTH" data-class="kt-svg-icon-list-single" class="kadence-dynamic-icon"></span><span class="kt-svg-icon-list-text">宜忌</span></li>
<!-- /wp:kadence/listitem --></ul></div>
<!-- /wp:kadence/iconlist --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_dfeaf4-0f","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"padding":["56","sm","72","sm"],"mobilePadding":["40","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_e595d8-b6","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_e595d8-b6"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_13cf84-22","align":"center","color":"palette3","margin":[0,0,28,0],"fontSize":[30,"",24]} -->
<h2 class="kt-adv-heading146_13cf84-22 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_13cf84-22">其他工具</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"146_850a00-c6","gap":["xs","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns146_850a00-c6"><!-- wp:kadence/singlebtn {"uniqueID":"146_2010e6-ea","text":"紫微斗數","link":"@@HOME@@/tools/ziwei/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_3f0584-58","text":"八字四柱","link":"@@HOME@@/tools/bazi/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_1cbb7e-67","text":"八字合婚","link":"@@HOME@@/tools/hehun/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_634508-f1","text":"易經卜卦","link":"@@HOME@@/tools/iching/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_f51583-1a","text":"塔羅","link":"@@HOME@@/tools/tarot/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_e0eec6-b8","text":"觀音靈籤","link":"@@HOME@@/tools/qian/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_6ee7d9-69","text":"西洋占星","link":"@@HOME@@/tools/astrology/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_0a4604-78","text":"吠陀占星","link":"@@HOME@@/tools/vedic/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_f85313-3c","text":"風水飛星","link":"@@HOME@@/tools/fengshui/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_6942e6-0a","text":"奇門遁甲","link":"@@HOME@@/tools/qimen/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_715b5a-e1","text":"擇日","link":"@@HOME@@/tools/zeri/","sizePreset":"small","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['my-charts'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_f583e2-46","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette3) 0%,var(\u002d\u002dglobal-palette4) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_bff736-47","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_bff736-47"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_e981cc-2f","align":"center","color":"palette9","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading146_e981cc-2f wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_e981cc-2f">我的命盤</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_a760f0-ac","align":"center","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading146_a760f0-ac wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_a760f0-ac">只有你看得到。不會通知任何人你存了他們。</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_f53155-89","columns":1,"colLayout":"equal","bgColor":"palette8","inheritMaxWidth":true,"loggedIn":true,"padding":["56","sm","72","sm"],"mobilePadding":["32","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_0f7e04-ea","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_0f7e04-ea"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"uniqueID":"146_8ea36e-7c","align":"center","color":"palette3","margin":[0,0,12,0],"fontSize":[28,"",22]} -->
<h2 class="kt-adv-heading146_8ea36e-7c wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_8ea36e-7c">登入後才能存命盤</h2>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_686d41-7e","align":"center","color":"palette5","margin":[0,0,28,0],"htmlTag":"p","fontSize":[17,"",16]} -->
<p class="kt-adv-heading146_686d41-7e wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_686d41-7e">工具不用登入也能用。想把命盤和親友資料存起來，請先登入或註冊。</p>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedbtn {"uniqueID":"146_589939-58","gap":["sm","","xs"]} -->
<div class="wp-block-kadence-advancedbtn kb-buttons-wrap kb-btns146_589939-58"><!-- wp:kadence/singlebtn {"uniqueID":"146_94796e-1a","text":"登入","link":"@@HOME@@/wp-login.php?redirect_to=%40%40MYCHARTS%40%40","sizePreset":"large"} /-->

<!-- wp:kadence/singlebtn {"uniqueID":"146_57ff11-d2","text":"註冊","link":"@@HOME@@/wp-login.php?action=register","sizePreset":"large","color":"palette3","colorHover":"palette9","backgroundHover":"palette3","borderStyle":[{"top":["palette7","solid",1],"right":["palette7","solid",1],"bottom":["palette7","solid",1],"left":["palette7","solid",1],"unit":"px"}],"borderHoverStyle":[{"top":["palette3","solid",1],"right":["palette3","solid",1],"bottom":["palette3","solid",1],"left":["palette3","solid",1],"unit":"px"}],"inheritStyles":"","kbPreset":"outline"} /--></div>
<!-- /wp:kadence/advancedbtn --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_b8d4a6-56","columns":1,"colLayout":"equal","bgColor":"palette9","inheritMaxWidth":true,"loggedOut":true,"padding":["48","sm","72","sm"],"mobilePadding":["32","","48",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_1ec265-01","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_1ec265-01"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
[aw_oracle_my_charts]
<!-- /wp:shortcode -->

<!-- wp:shortcode -->
[aw_oracle_persons]
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;

$pg1_pages['daily-letter'] = <<<'PG1_BLOCKS'
<!-- wp:kadence/rowlayout {"uniqueID":"146_b841c5-bd","columns":1,"colLayout":"equal","textColor":"palette9","backgroundSettingTab":"gradient","inheritMaxWidth":true,"gradient":"linear-gradient(160deg,var(\u002d\u002dglobal-palette3) 0%,var(\u002d\u002dglobal-palette4) 100%)","padding":["64","sm","56","sm"],"mobilePadding":["40","","36",""],"kbVersion":2} -->
<!-- wp:kadence/column {"uniqueID":"146_dbbe4b-3d","kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_dbbe4b-3d"><div class="kt-inside-inner-col"><!-- wp:kadence/advancedheading {"level":1,"uniqueID":"146_5e1b01-31","align":"center","color":"palette9","margin":[0,0,12,0],"fontSize":[44,"",32]} -->
<h1 class="kt-adv-heading146_5e1b01-31 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_5e1b01-31">每日運勢信</h1>
<!-- /wp:kadence/advancedheading -->

<!-- wp:kadence/advancedheading {"uniqueID":"146_2c67da-e9","align":"center","color":"palette7","margin":[0,0,0,0],"htmlTag":"p","fontSize":[18,"",16]} -->
<p class="kt-adv-heading146_2c67da-e9 wp-block-kadence-advancedheading" data-kb-block="kb-adv-heading146_2c67da-e9">每天早上 07:00（您所在時區）之後寄一封，依您的出生資料計算。每封信都可以取消訂閱。</p>
<!-- /wp:kadence/advancedheading --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->

<!-- wp:kadence/rowlayout {"uniqueID":"146_b2d398-07","columns":1,"colLayout":"equal","maxWidth":720,"bgColor":"palette8","padding":["56","sm","72","sm"],"mobilePadding":["32","","48",""],"anchor":"daily-form","kbVersion":2} -->
<!-- wp:kadence/column {"background":"palette9","borderRadius":[12,12,12,12],"uniqueID":"146_d23947-00","padding":[32,32,32,32],"mobilePadding":[20,16,20,16],"kbVersion":2} -->
<div class="wp-block-kadence-column kadence-column146_d23947-00"><div class="kt-inside-inner-col"><!-- wp:shortcode -->
@@DAILY_FORM@@
<!-- /wp:shortcode --></div></div>
<!-- /wp:kadence/column -->
<!-- /wp:kadence/rowlayout -->
PG1_BLOCKS;


/** Merge a mod value over Kadence's default for that key (arrays recursively, scalars replace). */
function aworacle_pg1_merge( $base, $over ) {
	if ( ! is_array( $base ) || ! is_array( $over ) ) {
		return $over;
	}
	foreach ( $over as $k => $v ) {
		$base[ $k ] = ( isset( $base[ $k ] ) && is_array( $base[ $k ] ) && is_array( $v ) && array_keys( $v ) !== range( 0, count( $v ) - 1 ) ) ? aworacle_pg1_merge( $base[ $k ], $v ) : $v;
	}
	return $base;
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
	foreach ( $bk['pages'] as $id => $p ) {
		wp_save_post_revision( (int) $id );
		wp_update_post( array( 'ID' => (int) $id, 'post_content' => wp_slash( $p['content'] ) ) );
		foreach ( $p['meta'] as $mk => $mv ) {
			null === $mv ? delete_post_meta( (int) $id, $mk ) : update_post_meta( (int) $id, $mk, $mv );
		}
	}
	delete_option( AWORACLE_PG1_BACKUP );
	WP_CLI::success( 'Rolled back pages ' . implode( ',', array_keys( $bk['pages'] ) ) . ', palette, theme mods, menu locations.' );
	return;
}

// ---- backup (first run only, so re-runs never overwrite the original state)
if ( ! is_array( get_option( AWORACLE_PG1_BACKUP ) ) ) {
	$mods_raw = get_theme_mods();
	$bk       = array(
		'mods'           => array(),
		'palette'        => get_option( 'kadence_global_palette', null ),
		'menu_locations' => get_theme_mod( 'nav_menu_locations', array() ),
		'pages'          => array(),
	);
	foreach ( array_keys( $pg1_mods ) as $k ) {
		$bk['mods'][ $k ] = array_key_exists( $k, (array) $mods_raw ) ? $mods_raw[ $k ] : null;
	}
	foreach ( $pg1_ids as $id ) {
		$meta = array();
		foreach ( array_keys( $pg1_meta ) as $mk ) {
			$meta[ $mk ] = metadata_exists( 'post', $id, $mk ) ? get_post_meta( $id, $mk, true ) : null;
		}
		$bk['pages'][ $id ] = array( 'content' => get_post_field( 'post_content', $id, 'raw' ), 'meta' => $meta );
	}
	add_option( AWORACLE_PG1_BACKUP, $bk, '', false );
	WP_CLI::log( 'Backup saved in option ' . AWORACLE_PG1_BACKUP . '.' );
}

// ---- palette + theme mods
$pal = json_decode( (string) get_option( 'kadence_global_palette', '' ), true );
if ( ! is_array( $pal ) ) {
	$pal = json_decode( (string) \Kadence\kadence()->get_default_palette(), true );
}
$pal['palette'] = $pg1_palette;
$pal['active']  = 'palette';
update_option( 'kadence_global_palette', wp_json_encode( $pal ) );

foreach ( $pg1_mods as $k => $v ) {
	$base = \Kadence\Options\Component::defaults()[ $k ] ?? null;
	set_theme_mod( $k, is_array( $v ) ? aworacle_pg1_merge( is_array( $base ) ? $base : array(), $v ) : $v );
}

// ---- pages
$home = untrailingslashit( home_url() );
$mine = isset( $pg1_ids['my-charts'] ) ? get_permalink( $pg1_ids['my-charts'] ) : $home . '/my-charts/';
foreach ( $pg1_ids as $key => $id ) {
	if ( ! isset( $pg1_pages[ $key ] ) ) {
		continue;
	}
	$content = strtr(
		$pg1_pages[ $key ],
		array(
			'@@HOME@@'              => $home,
			'%40%40MYCHARTS%40%40'  => rawurlencode( $mine ),
			'@@DAILY_FORM@@'        => AWORACLE_PG1_DAILY_FORM,
		)
	);
	if ( get_post_field( 'post_content', $id, 'raw' ) !== $content ) {
		wp_save_post_revision( $id ); // keep the current content as a revision first
		$r = wp_update_post( array( 'ID' => $id, 'post_content' => wp_slash( $content ) ), true );
		if ( is_wp_error( $r ) ) {
			WP_CLI::warning( "$key ($id): " . $r->get_error_message() );
			continue;
		}
		clean_post_cache( $id );
		if ( get_post_field( 'post_content', $id, 'raw' ) !== $content ) {
			// A save filter rewrote the markup (e.g. block attributes dropped): stop instead of leaving a half-styled page.
			WP_CLI::error( "$key ($id): stored content differs from the script; run \"wp eval-file apply.php rollback\" and report." );
		}
	}
	foreach ( $pg1_meta as $mk => $mv ) {
		update_post_meta( $id, $mk, $mv );
	}
	WP_CLI::log( "page $key ($id) ok" );
}

// ---- menu: three flat links (no dropdowns), on the primary and mobile locations
$menu = wp_get_nav_menu_object( AWORACLE_PG1_MENU );
$mid  = $menu ? (int) $menu->term_id : (int) wp_create_nav_menu( AWORACLE_PG1_MENU );
foreach ( (array) wp_get_nav_menu_items( $mid ) as $item ) {
	wp_delete_post( $item->ID, true );
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
