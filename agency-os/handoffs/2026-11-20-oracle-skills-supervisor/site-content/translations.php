<?php
/**
 * PG-1 English copy for TranslatePress (zh_TW → en_US), written as human-reviewed rows (status 2)
 * through TranslatePress's own query component, same table as the 2026-11-25 "英文頁定案" rows.
 * Run after apply.php: wp eval-file translations.php   (re-runnable; existing rows are updated in place)
 * Tool names and one-line descriptions follow Projects/internal/ziwei-doushu/messages/en.json.
 * Keys must match the page text exactly (TranslatePress looks up whole text nodes).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit( 1 );
}
if ( ! class_exists( 'TRP_Translate_Press' ) ) {
	WP_CLI::error( 'TranslatePress is not active; nothing changed.' );
}

$pg1_en = array(
	// Site and menu
	'東西方命理'                         => 'East & West Divination',
	'紫微斗數・八字・易經・塔羅・占星'         => 'Zi Wei · BaZi · I Ching · Tarot · Astrology',
	'專業排盤 · 真太陽時校正 · AI 深度解讀'   => 'Professional charting · True solar time · AI in-depth readings',
	'選一個工具開始'                      => 'Pick a tool to start',
	'全部工具'                          => 'All tools',
	'← 全部工具'                        => '← All tools',
	'每日運勢信'                         => 'Daily fortune letter',
	'我的命盤'                          => 'My charts',
	'訂閱'                             => 'Subscribe',
	'這個工具會給你什麼'                   => 'What this tool gives you',
	'其他工具'                          => 'Other tools',
	// Tool names (en.json nav.*)
	'紫微斗數' => 'Zi Wei Dou Shu',
	'八字四柱' => 'BaZi',
	'八字合婚' => 'Compatibility',
	'易經卜卦' => 'I Ching',
	'塔羅'    => 'Tarot',
	'觀音靈籤' => 'Guanyin Lots',
	'西洋占星' => 'Astrology',
	'吠陀占星' => 'Vedic Astrology',
	'風水飛星' => 'Feng Shui',
	'奇門遁甲' => 'Qi Men Dun Jia',
	'擇日'    => 'Date Selection',
	'每日運勢' => 'Daily Fortune',
	// One-line descriptions (en.json hub.*Desc)
	'紫微斗數命盤,真太陽時校正,三方四正'                 => 'Zi Wei Dou Shu chart with true solar time correction',
	'八字四柱、十神、藏干、納音'                        => 'BaZi Four Pillars, Ten Gods, hidden stems, NaYin',
	'兩人八字合婚與生肖配對,逐項列出依據'                 => 'BaZi compatibility and zodiac match for two, with the reason for each item',
	'六爻銅錢起卦,本卦變卦動爻'                        => 'I Ching coin casting, primary & changed hexagrams',
	'78 張牌庫,單張/三張/凱爾特十字'                    => '78-card deck, single / three-card / Celtic Cross',
	'觀音靈籤一百首,默念所問求一支籤'                    => 'The hundred Guanyin lots: hold a question in mind and draw one',
	'行星·星座·宮位·上升(Swiss 級精度,自架)'              => 'Planets · Signs · Houses · Ascendant (Swiss-grade, self-hosted)',
	'恆星黃道本命盤、二十七月宿、九分盤、Vimśottarī 大運'     => 'Sidereal birth chart, 27 nakshatras, navamsa and Vimshottari dashas',
	'玄空飛星九宮盤、八宅命卦,方位擺放建議'                => 'Flying Star chart, Eight Mansions, placement tips',
	'時家奇門九宮盤:三奇六儀、八門、九星、八神'              => 'Qi Men Dun Jia hour chart: stems, eight doors, nine stars, eight deities',
	'依事項挑吉日:通書宜忌、建除、黃道與沖煞逐日判定'          => 'Pick good days for an event: almanac do/don\'t lists, day officers, yellow-path days and clashes, day by day',
	'今日運勢、幸運色、幸運數字、宜忌'                    => 'Daily fortune, lucky color, lucky number, almanac',
	// "What this tool gives you": three points per tool, split from the descriptions above
	'紫微斗數命盤'        => 'Zi Wei Dou Shu chart',
	'真太陽時校正'        => 'True solar time correction',
	'三方四正'           => 'Three sides and four squares',
	'十神、藏干'          => 'Ten Gods, hidden stems',
	'納音'              => 'NaYin',
	'兩人八字合婚'        => 'BaZi compatibility for two',
	'生肖配對'           => 'Zodiac match',
	'逐項列出依據'        => 'The reason for each item',
	'六爻銅錢起卦'        => 'Coin casting',
	'本卦、變卦'          => 'Primary & changed hexagrams',
	'動爻'              => 'Moving lines',
	'78 張牌庫'          => '78-card deck',
	'單張、三張'          => 'Single or three-card',
	'凱爾特十字'          => 'Celtic Cross',
	'觀音靈籤一百首'       => 'The hundred Guanyin lots',
	'默念所問'           => 'Hold a question in mind',
	'求一支籤'           => 'Draw one',
	'行星·星座·宮位'      => 'Planets · Signs · Houses',
	'上升'              => 'Ascendant',
	'Swiss 級精度,自架'   => 'Swiss-grade, self-hosted',
	'恆星黃道本命盤'       => 'Sidereal birth chart',
	'二十七月宿、九分盤'    => '27 nakshatras, navamsa',
	'Vimśottarī 大運'    => 'Vimshottari dashas',
	'玄空飛星九宮盤'       => 'Flying Star chart',
	'八宅命卦'           => 'Eight Mansions',
	'方位擺放建議'        => 'Placement tips',
	'時家奇門九宮盤'       => 'Qi Men Dun Jia hour chart',
	'三奇六儀、八門'       => 'Stems, eight doors',
	'九星、八神'          => 'Nine stars, eight deities',
	'依事項挑吉日'        => 'Pick good days for an event',
	'通書宜忌、建除'       => 'Almanac do/don\'t lists, day officers',
	'黃道與沖煞逐日判定'    => 'Yellow-path days and clashes, day by day',
	'今日運勢'           => 'Daily fortune',
	'幸運色、幸運數字'      => 'Lucky color, lucky number',
	'宜忌'              => 'Almanac',
	// Daily letter (plugin's own zh string for the same sentence) and my-charts
	'每天早上 07:00（您所在時區）之後寄一封，依您的出生資料計算。每封信都可以取消訂閱。' => 'One letter every morning after 07:00 in your time zone, calculated from your birth data. You can unsubscribe from any letter.',
	'只有你看得到。不會通知任何人你存了他們。'                                    => 'Only you can see these. Nobody is told that you saved them.',
	'登入後才能存命盤'                                                    => 'Log in to save your charts',
	'工具不用登入也能用。想把命盤和親友資料存起來，請先登入或註冊。'                    => 'The tools work without logging in. To save charts and people you know, log in or sign up.',
	'登入'                                                            => 'Log in',
	'註冊'                                                            => 'Sign up',
);

$trp      = TRP_Translate_Press::get_trp_instance();
$settings = $trp->get_component( 'settings' )->get_settings();
$query    = $trp->get_component( 'query' );
$default  = $settings['default-language'];
$lang     = 'en_US';
if ( ! in_array( $lang, (array) $settings['translation-languages'], true ) ) {
	WP_CLI::error( 'en_US is not a TranslatePress language here; nothing changed.' );
}
$query->check_original_table();
$query->check_table( $default, $lang ); // both create the tables only when missing

$originals = array_keys( $pg1_en );
$ids       = $query->get_string_ids( $originals, $lang );
$missing   = array_values( array_diff( $originals, array_keys( (array) $ids ) ) );
if ( $missing ) {
	$query->insert_strings( $missing, $lang );
	$ids = $query->get_string_ids( $originals, $lang );
}

$rows = array();
foreach ( $pg1_en as $zh => $en ) {
	if ( empty( $ids[ $zh ] ) ) {
		WP_CLI::warning( "Not stored: $zh" );
		continue;
	}
	$rows[] = array( 'id' => (int) $ids[ $zh ]->id, 'original' => $zh, 'translated' => $en, 'status' => $query::HUMAN_REVIEWED );
}
$query->update_strings( $rows, $lang, array( 'id', 'original', 'translated', 'status' ) );
WP_CLI::success( count( $rows ) . ' rows written (' . count( $missing ) . ' new) in ' . $query->get_table_name( $lang ) . '.' );
