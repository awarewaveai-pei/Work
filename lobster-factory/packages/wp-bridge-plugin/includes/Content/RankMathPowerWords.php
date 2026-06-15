<?php
/**
 * RankMathPowerWords — register a Traditional-Chinese power-word list with Rank Math so the SEO Title
 * Readability test ("title contains a power word") can score CJK titles.
 *
 * Why this exists: Rank Math ships a per-locale power-word file (assets/vendor/powerwords/<locale>.php)
 * for en / de / es / ja / … but NONE for Chinese. For a zh_* site Rank Math therefore calls the
 * `rank_math/metabox/power_words` filter with an EMPTY list, and no Chinese title can ever earn the
 * power-word point. The content generator's CJK prompt already tells the model to use one of these
 * exact words and states "a matching server-side list is registered for the site" — THIS class is
 * that registration. The word list here is the SSOT counterpart of the CJK block in
 * next-admin app/api/content/generate/route.ts (keep the two in sync).
 *
 * Detection caveat (Rank Math upstream, not ours): the title power-word check runs client-side and
 * tokenises the title with `title.split(' ')` — ASCII space only. A registered CJK word scores only
 * when it appears as a space-delimited token in the title (e.g. "兒童藝術治療 完整 指南"); glued CJK
 * ("完整指南") will not match. The generator prompt is responsible for surfacing the chosen power word
 * as its own token. Registering the list is necessary but not sufficient on its own.
 *
 * @package AwareWave\WpBridge\Content
 */

namespace AwareWave\WpBridge\Content;

final class RankMathPowerWords {

	/**
	 * The Traditional-Chinese power words offered to the title-readability check. SSOT mirror of the
	 * "TITLE power word" line in the content generator's CJK Rank Math compliance block. Overclaim
	 * words (保證 / 治癒) are intentionally excluded — they violate the YMYL trust rules.
	 *
	 * @return string[]
	 */
	public static function words(): array {
		return array(
			'終極', '必備', '實證', '專家', '完整', '有效', '簡單', '關鍵', '最佳', '免費',
			'立即', '秘訣', '揭密', '一次搞懂', '高效', '避免', '不可不知', '獨家', '快速', '突破',
		);
	}

	/** Hook the filter (2 args so we receive Rank Math's $locale). */
	public function register(): void {
		add_filter( 'rank_math/metabox/power_words', array( $this, 'filter' ), 10, 2 );
	}

	/**
	 * Merge the Chinese list into whatever Rank Math passes in. Merging is unconditional (not gated on
	 * $locale) on purpose: a 2-character Chinese word can never be a token in a space-split Latin title,
	 * so adding these words to an en/de/… list is inert — it can only ever help a CJK title, never alter
	 * a non-CJK score. This also makes the list work even when a Chinese site runs an en_US WordPress
	 * locale (common), where a $locale gate would silently miss. Result is de-duplicated.
	 *
	 * @param mixed  $words  Rank Math's current power-word list (array; [] for a no-file locale).
	 * @param string $locale Site locale (accepted for forward-compat; not branched on — see above).
	 * @return string[]
	 */
	public function filter( $words, $locale = '' ): array {
		$base = is_array( $words ) ? array_values( array_filter( $words, 'is_string' ) ) : array();
		return array_values( array_unique( array_merge( $base, self::words() ) ) );
	}
}
