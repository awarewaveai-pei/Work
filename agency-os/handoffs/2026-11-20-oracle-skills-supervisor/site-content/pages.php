<?php
/**
 * PG-1 page definitions for oracle.aware-wave.com: which wp-bridge BlockLibrary bricks each page uses and the
 * words in them. Data only — apply.php turns it into Kadence markup with the bridge installed on the site.
 * Links starting with "/" become absolute site URLs; "{login}" / "{register}" become WordPress's own URLs;
 * {"type":"daily_form"} becomes the signup form chosen in apply.php. Colours are palette tokens only.
 *
 * @return array<string,array<int,array<string,mixed>>> page key => composePage() specs
 */

$tools = array(
	// slug, name, one-line description (engine messages/zh-TW.json hub.*), icon, three points (split from the description)
	array( 'ziwei', '紫微斗數', '紫微斗數命盤,真太陽時校正,三方四正', 'fe_star', array( '紫微斗數命盤', '真太陽時校正', '三方四正' ) ),
	array( 'bazi', '八字四柱', '八字四柱、十神、藏干、納音', 'fe_grid', array( '八字四柱', '十神、藏干', '納音' ) ),
	array( 'hehun', '八字合婚', '兩人八字合婚與生肖配對,逐項列出依據', 'fe_heart', array( '兩人八字合婚', '生肖配對', '逐項列出依據' ) ),
	array( 'iching', '易經卜卦', '六爻銅錢起卦,本卦變卦動爻', 'fe_aperture', array( '六爻銅錢起卦', '本卦、變卦', '動爻' ) ),
	array( 'tarot', '塔羅', '78 張牌庫,單張/三張/凱爾特十字', 'fe_layers', array( '78 張牌庫', '單張、三張', '凱爾特十字' ) ),
	array( 'qian', '觀音靈籤', '觀音靈籤一百首,默念所問求一支籤', 'fe_book', array( '觀音靈籤一百首', '默念所問', '求一支籤' ) ),
	array( 'astrology', '西洋占星', '行星·星座·宮位·上升(Swiss 級精度,自架)', 'fe_sun', array( '行星·星座·宮位', '上升', 'Swiss 級精度,自架' ) ),
	array( 'vedic', '吠陀占星', '恆星黃道本命盤、二十七月宿、九分盤、Vimśottarī 大運', 'fe_moon', array( '恆星黃道本命盤', '二十七月宿、九分盤', 'Vimśottarī 大運' ) ),
	array( 'fengshui', '風水飛星', '玄空飛星九宮盤、八宅命卦,方位擺放建議', 'fe_compass', array( '玄空飛星九宮盤', '八宅命卦', '方位擺放建議' ) ),
	array( 'qimen', '奇門遁甲', '時家奇門九宮盤:三奇六儀、八門、九星、八神', 'fe_target', array( '時家奇門九宮盤', '三奇六儀、八門', '九星、八神' ) ),
	array( 'zeri', '擇日', '依事項挑吉日:通書宜忌、建除、黃道與沖煞逐日判定', 'fe_calendar', array( '依事項挑吉日', '通書宜忌、建除', '黃道與沖煞逐日判定' ) ),
	array( 'daily', '每日運勢', '今日運勢、幸運色、幸運數字、宜忌', 'fe_sunrise', array( '今日運勢', '幸運色、幸運數字', '宜忌' ) ),
);
$letter = '每天早上 07:00（您所在時區）之後寄一封，依您的出生資料計算。每封信都可以取消訂閱。';

// ---- shared pieces
$band = function ( string $title, string $sub, array $before = array() ): array {
	return array(
		'type'    => 'section',
		'options' => array( 'gradient' => array( 'from' => 'palette8', 'to' => 'palette7', 'angle' => 160 ), 'text_color' => 'palette3', 'padding' => array( 64, 'sm', 56, 'sm' ), 'mobile_padding' => array( 40, '', 36, '' ) ),
		'columns' => array( array( 'blocks' => array_merge( $before, array(
			array( 'type' => 'heading', 'text' => $title, 'level' => 1, 'style' => array( 'color' => 'palette3', 'align' => 'center', 'size' => array( 44, 32 ), 'margin' => array( 0, 0, 12, 0 ) ) ),
			array( 'type' => 'paragraph', 'text' => $sub, 'style' => array( 'color' => 'palette4', 'align' => 'center', 'size' => array( 18, 16 ), 'margin' => array( 0, 0, 0, 0 ) ) ),
		) ) ) ),
	);
};
$title2 = function ( string $text ): array {
	return array( 'type' => 'heading', 'text' => $text, 'level' => 2, 'style' => array( 'color' => 'palette3', 'align' => 'center', 'size' => array( 30, 24 ), 'margin' => array( 0, 0, 28, 0 ) ) );
};
$gap = function ( int $top, int $bottom, int $mTop, int $mBottom ): array {
	return array( 'type' => 'section', 'options' => array( 'background' => 'palette9', 'padding' => array( $top, 'sm', $bottom, 'sm' ), 'mobile_padding' => array( $mTop, '', $mBottom, '' ) ), 'columns' => array( array( 'blocks' => array() ) ) );
};
$cardRows = function () use ( $tools ): array {
	$rows = array();
	foreach ( array_chunk( $tools, 4 ) as $i => $chunk ) {
		$cols = array();
		foreach ( $chunk as $t ) {
			$cols[] = array( 'blocks' => array( array( 'type' => 'card', 'title' => $t[1], 'text' => $t[2], 'link' => '/tools/' . $t[0] . '/', 'icon' => $t[3] ) ) );
		}
		$rows[] = array(
			'type'    => 'section',
			'options' => array( 'background' => 'palette9', 'tablet_layout' => 'two-grid', 'mobile_layout' => 'two-grid', 'gap' => array( 20, 12 ), 'equal_height' => true, 'padding' => array( 0, 'sm', $i === 2 ? 0 : 20, 'sm' ) ),
			'columns' => $cols,
		);
	}
	return $rows;
};

$pages = array();

$pages['home'] = array_merge(
	array(
		array(
			'type'    => 'section',
			'options' => array( 'gradient' => array( 'from' => 'palette7', 'to' => 'palette9', 'shape' => 'radial' ), 'text_color' => 'palette3', 'padding' => array( 112, 'sm', 96, 'sm' ), 'mobile_padding' => array( 64, '', 56, '' ) ),
			'columns' => array( array( 'blocks' => array(
				array( 'type' => 'paragraph', 'text' => '紫微斗數・八字・易經・塔羅・占星', 'style' => array( 'color' => 'palette1', 'align' => 'center', 'size' => array( 15, 13 ), 'letter_spacing' => 3, 'margin' => array( 0, 0, 16, 0 ) ) ),
				array( 'type' => 'heading', 'text' => '東西方命理', 'level' => 1, 'style' => array( 'color' => 'palette3', 'align' => 'center', 'size' => array( 60, 40 ), 'margin' => array( 0, 0, 16, 0 ) ) ),
				array( 'type' => 'paragraph', 'text' => '專業排盤 · 真太陽時校正 · AI 深度解讀', 'style' => array( 'color' => 'palette4', 'align' => 'center', 'size' => array( 20, 16 ), 'margin' => array( 0, 0, 36, 0 ) ) ),
				array( 'type' => 'buttons', 'buttons' => array(
					array( 'text' => '選一個工具開始', 'link' => '#tools', 'size' => 'large' ),
					array( 'text' => '每日運勢信', 'link' => '/daily-letter/', 'style' => 'outline', 'size' => 'large' ),
				), 'options' => array( 'gap' => array( 'sm', 'xs' ) ) ),
			) ) ),
		),
		array( 'type' => 'section', 'options' => array( 'background' => 'palette9', 'anchor' => 'tools', 'padding' => array( 72, 'sm', 24, 'sm' ), 'mobile_padding' => array( 48, '', 16, '' ) ), 'columns' => array( array( 'blocks' => array( $title2( '選一個工具開始' ) ) ) ) ),
	),
	$cardRows(),
	array(
		$gap( 0, 72, 0, 48 ),
		array(
			'type'    => 'section',
			'options' => array( 'background' => 'palette7', 'text_color' => 'palette3', 'layout' => 'left-golden', 'mobile_layout' => 'row', 'valign' => 'middle', 'padding' => array( 64, 'sm', 64, 'sm' ), 'mobile_padding' => array( 48, '', 48, '' ) ),
			'columns' => array(
				array( 'blocks' => array(
					array( 'type' => 'heading', 'text' => '每日運勢信', 'level' => 2, 'style' => array( 'color' => 'palette3', 'size' => array( 30, 24 ), 'margin' => array( 0, 0, 8, 0 ) ) ),
					array( 'type' => 'paragraph', 'text' => $letter, 'style' => array( 'color' => 'palette4', 'size' => array( 17, 16 ), 'margin' => array( 0, 0, 0, 0 ) ) ),
				) ),
				array( 'blocks' => array( array( 'type' => 'buttons', 'buttons' => array( array( 'text' => '訂閱', 'link' => '/daily-letter/', 'size' => 'large' ) ), 'options' => array( 'align' => 'right', 'mobile_align' => 'left' ) ) ) ),
			),
		),
	)
);

$pages['tools'] = array_merge(
	array( $band( '全部工具', '選一個工具開始' ), $gap( 56, 0, 32, 0 ) ),
	$cardRows(),
	array( $gap( 0, 72, 0, 48 ) )
);

foreach ( $tools as $t ) {
	$others = array();
	foreach ( $tools as $o ) {
		if ( $o[0] !== $t[0] ) {
			$others[] = array( 'text' => $o[1], 'link' => '/tools/' . $o[0] . '/', 'style' => 'outline', 'size' => 'small' );
		}
	}
	$pages[ 'tool-' . $t[0] ] = array(
		$band( $t[1], $t[2], array( array( 'type' => 'paragraph', 'text' => '← 全部工具', 'style' => array( 'color' => 'palette1', 'align' => 'center', 'size' => array( 15, 14 ), 'margin' => array( 0, 0, 12, 0 ), 'link' => '/tools/', 'link_color' => 'palette1', 'link_hover_color' => 'palette3' ) ) ) ),
		// The tool itself: full content width, no side padding on phones.
		array( 'type' => 'section', 'options' => array( 'background' => 'palette9', 'anchor' => 'tool', 'padding' => array( 0, 'sm', 48, 'sm' ), 'mobile_padding' => array( 0, 0, 32, 0 ) ), 'columns' => array( array( 'blocks' => array(
			array( 'type' => 'plugin_block', 'name' => 'aware-wave/oracle', 'attrs' => array( 'tool' => $t[0] ) ),
		) ) ) ),
		array( 'type' => 'section', 'options' => array( 'background' => 'palette8', 'padding' => array( 56, 'sm', 56, 'sm' ), 'mobile_padding' => array( 40, '', 40, '' ) ), 'columns' => array( array( 'blocks' => array(
			$title2( '這個工具會給你什麼' ),
			array( 'type' => 'icon_list', 'items' => $t[4], 'options' => array( 'columns' => 3, 'tablet_columns' => 3, 'mobile_columns' => 1, 'align' => 'center' ) ),
		) ) ) ),
		array( 'type' => 'section', 'options' => array( 'background' => 'palette9', 'padding' => array( 56, 'sm', 72, 'sm' ), 'mobile_padding' => array( 40, '', 48, '' ) ), 'columns' => array( array( 'blocks' => array(
			$title2( '其他工具' ),
			array( 'type' => 'buttons', 'buttons' => $others, 'options' => array( 'gap' => array( 'xs', 'xs' ) ) ),
		) ) ) ),
	);
}

$pages['my-charts'] = array(
	$band( '我的命盤', '只有你看得到。不會通知任何人你存了他們。' ),
	array( 'type' => 'section', 'options' => array( 'show_to' => 'guests', 'background' => 'palette8', 'padding' => array( 56, 'sm', 72, 'sm' ), 'mobile_padding' => array( 32, '', 48, '' ) ), 'columns' => array( array( 'blocks' => array(
		array( 'type' => 'heading', 'text' => '登入後才能存命盤', 'level' => 2, 'style' => array( 'color' => 'palette3', 'align' => 'center', 'size' => array( 28, 22 ), 'margin' => array( 0, 0, 12, 0 ) ) ),
		array( 'type' => 'paragraph', 'text' => '工具不用登入也能用。想把命盤和親友資料存起來，請先登入或註冊。', 'style' => array( 'color' => 'palette4', 'align' => 'center', 'size' => array( 17, 16 ), 'margin' => array( 0, 0, 28, 0 ) ) ),
		array( 'type' => 'buttons', 'buttons' => array(
			array( 'text' => '登入', 'link' => '{login}', 'size' => 'large' ),
			array( 'text' => '註冊', 'link' => '{register}', 'style' => 'outline', 'size' => 'large' ),
		), 'options' => array( 'gap' => array( 'sm', 'xs' ) ) ),
	) ) ) ),
	// No block exists for these two in the oracle plugin yet, so they stay shortcodes.
	array( 'type' => 'section', 'options' => array( 'show_to' => 'members', 'background' => 'palette9', 'padding' => array( 48, 'sm', 72, 'sm' ), 'mobile_padding' => array( 32, '', 48, '' ) ), 'columns' => array( array( 'blocks' => array(
		array( 'type' => 'shortcode', 'text' => '[aw_oracle_my_charts]' ),
		array( 'type' => 'shortcode', 'text' => '[aw_oracle_persons]' ),
	) ) ) ),
);

$pages['daily-letter'] = array(
	$band( '每日運勢信', $letter ),
	array( 'type' => 'section', 'options' => array( 'background' => 'palette9', 'anchor' => 'daily-form', 'max_width' => 720, 'padding' => array( 56, 'sm', 72, 'sm' ), 'mobile_padding' => array( 32, '', 48, '' ) ), 'columns' => array( array(
		'blocks' => array( array( 'type' => 'daily_form' ) ),
		'style'  => array( 'background' => 'palette8', 'border' => 'palette7', 'radius' => 12, 'padding' => array( 32, 32, 32, 32 ), 'mobile_padding' => array( 20, 16, 20, 16 ) ),
	) ) ),
);

return $pages;
