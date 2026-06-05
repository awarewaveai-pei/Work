<?php
/**
 * KadenceValidator — turns the colleague's hard-won Kadence trial-and-error into server-side,
 * fail-fast invariants checked BEFORE a write, so a malformed block is rejected with a precise hint
 * instead of silently rendering with no styles (DESIGN §D).
 *
 * Why these specific invariants (the "fixed class" problem the user named): Kadence does not hardcode
 * CSS in the HTML — it generates CSS keyed to each block's `uniqueID` and emits a matching class
 * (`.kt-row-layout-id<uniqueID>`). So:
 *   - a MISSING/duplicate uniqueID means the generated class can't bind -> the block renders unstyled;
 *   - a MISSING `kbVersion:2` on layout blocks means the responsive (RWD) CSS path silently breaks
 *     on mobile while desktop looks fine — the nastiest failure, learned by trial and error;
 *   - an unknown `kadence/*` block name means Gutenberg invalidates the whole block (red error).
 *
 * Input is the PARSED block tree (WP parse_blocks() shape: each node has blockName/attrs/innerBlocks).
 * Parsing raw markup is WP's job (done by the REST glue); this validator is pure structure-checking so
 * it is unit-testable without WordPress. The serialize(parse(x))===x round-trip is enforced at the glue
 * layer (it needs WP's parse/serialize), not here.
 *
 * @package AwareWave\WpBridge\Validation
 */

namespace AwareWave\WpBridge\Validation;

final class KadenceValidator {

	/** Layout blocks whose responsive CSS depends on kbVersion:2. */
	private const REQUIRE_KB_VERSION = array( 'kadence/rowlayout', 'kadence/column' );

	/** Known Kadence block names. An unknown kadence/* name is almost always a typo Gutenberg rejects. */
	private const KADENCE_BLOCKS = array(
		'kadence/rowlayout', 'kadence/column', 'kadence/advancedheading', 'kadence/spacer',
		'kadence/advancedbtn', 'kadence/singlebtn', 'kadence/infobox', 'kadence/icon', 'kadence/iconlist',
		'kadence/accordion', 'kadence/pane', 'kadence/tabs', 'kadence/tab', 'kadence/testimonials',
		'kadence/image', 'kadence/advancedgallery', 'kadence/countup', 'kadence/countdown',
		'kadence/lottie', 'kadence/form', 'kadence/advanced-form', 'kadence/posts', 'kadence/table',
		'kadence/show-more', 'kadence/googlemaps', 'kadence/identity', 'kadence/navigation',
	);

	/**
	 * @param array<int,array<string,mixed>> $blocks parsed block tree (WP parse_blocks shape).
	 */
	public function validate( array $blocks ): ValidationResult {
		$violations = array();
		$seenIds    = array(); // uniqueID => first path it appeared at
		$this->walk( $blocks, '', $violations, $seenIds );
		return $violations === array() ? ValidationResult::ok() : ValidationResult::fail( $violations );
	}

	/**
	 * @param array<int,array<string,mixed>> $blocks
	 * @param Violation[]                     $violations
	 * @param array<string,string>            $seenIds
	 */
	private function walk( array $blocks, string $prefix, array &$violations, array &$seenIds ): void {
		foreach ( $blocks as $i => $block ) {
			$path = ( $prefix === '' ) ? (string) $i : $prefix . '.' . $i;

			if ( ! is_array( $block ) ) {
				$violations[] = new Violation( $path, 'malformed_block', 'block node is not an array' );
				continue;
			}

			$name = isset( $block['blockName'] ) ? $block['blockName'] : null;

			// Only police kadence/* blocks; core/other-plugin blocks pass through (we still recurse).
			if ( is_string( $name ) && strpos( $name, 'kadence/' ) === 0 ) {
				$this->checkKadenceBlock( $name, $block, $path, $violations, $seenIds );
			}

			$inner = ( isset( $block['innerBlocks'] ) && is_array( $block['innerBlocks'] ) ) ? $block['innerBlocks'] : array();
			if ( $inner !== array() ) {
				$this->walk( $inner, $path . '.innerBlocks', $violations, $seenIds );
			}
		}
	}

	/**
	 * @param array<string,mixed> $block
	 * @param Violation[]         $violations
	 * @param array<string,string> $seenIds
	 */
	private function checkKadenceBlock( string $name, array $block, string $path, array &$violations, array &$seenIds ): void {
		if ( ! in_array( $name, self::KADENCE_BLOCKS, true ) ) {
			$violations[] = new Violation( $path, 'unknown_kadence_block', "'{$name}' is not a recognised Kadence block; check for a typo or unsupported block" );
			return; // unknown block: skip the attribute checks, the name itself is the problem
		}

		$attrs = ( isset( $block['attrs'] ) && is_array( $block['attrs'] ) ) ? $block['attrs'] : array();

		// uniqueID: present, non-empty, and globally unique within this document.
		$uniqueId = isset( $attrs['uniqueID'] ) ? $attrs['uniqueID'] : null;
		if ( ! is_string( $uniqueId ) || $uniqueId === '' ) {
			$violations[] = new Violation( $path, 'missing_unique_id', "Kadence block '{$name}' needs a non-empty uniqueID; without it the generated CSS class cannot bind and the block renders unstyled" );
		} else {
			// Key the seen-map with a type sentinel so a numeric-string uniqueID (e.g. "12") is not
			// silently coerced to an int array key and made to collide with a different value.
			$seenKey = 'id:' . $uniqueId;
			if ( isset( $seenIds[ $seenKey ] ) ) {
				$violations[] = new Violation( $path, 'duplicate_unique_id', "uniqueID '{$uniqueId}' already used at '{$seenIds[ $seenKey ]}'; duplicate IDs make Kadence CSS collide — generate a fresh uniqueID" );
			} else {
				$seenIds[ $seenKey ] = $path;
			}
		}

		// kbVersion on layout blocks gates the responsive (RWD) CSS path. Kadence's own runtime uses
		// kbVersion >= 2 (NOT === 2), so we mirror that: reject only a missing / non-numeric / < 2
		// value. A strict === 2 would false-positive on a float 2.0 (JSON serialisation) or a future
		// kbVersion 3, wrongly BLOCKING valid content — as harmful as missing a bad block.
		if ( in_array( $name, self::REQUIRE_KB_VERSION, true ) ) {
			$kb = isset( $attrs['kbVersion'] ) ? $attrs['kbVersion'] : null;
			if ( ! is_numeric( $kb ) || (float) $kb < 2.0 ) {
				$violations[] = new Violation( $path, 'missing_kb_version', "Kadence layout block '{$name}' must have \"kbVersion\" >= 2 or its responsive (RWD) styles break silently on mobile" );
			}
		}
	}
}
