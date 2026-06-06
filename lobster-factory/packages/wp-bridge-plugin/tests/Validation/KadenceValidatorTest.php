<?php
/**
 * Tests for KadenceValidator — the pre-write guard for Kadence block correctness (uniqueID, kbVersion,
 * block-name whitelist). Uses parsed-block-tree fixtures (WP parse_blocks shape), no WordPress.
 */

namespace AwareWave\WpBridge\Tests\Validation;

use AwareWave\WpBridge\Validation\KadenceValidator;
use PHPUnit\Framework\TestCase;

final class KadenceValidatorTest extends TestCase {

	private function block( ?string $name, array $attrs = array(), array $inner = array() ): array {
		return array( 'blockName' => $name, 'attrs' => $attrs, 'innerBlocks' => $inner );
	}

	/** A correct row>column tree: kbVersion:2 + unique IDs everywhere. */
	private function goldenTree(): array {
		return array(
			$this->block(
				'kadence/rowlayout',
				array( 'uniqueID' => '12_row', 'kbVersion' => 2 ),
				array(
					$this->block(
						'kadence/column',
						array( 'uniqueID' => '12_col', 'kbVersion' => 2 ),
						array(
							$this->block( 'kadence/advancedheading', array( 'uniqueID' => '12_head' ) ),
						)
					),
				)
			),
		);
	}

	public function test_golden_tree_is_valid(): void {
		$r = ( new KadenceValidator() )->validate( $this->goldenTree() );
		$this->assertTrue( $r->isValid(), 'a correct Kadence tree must pass' );
	}

	public function test_non_kadence_blocks_pass_through(): void {
		$tree = array( $this->block( 'core/paragraph', array() ), $this->block( null ) );
		$this->assertTrue( ( new KadenceValidator() )->validate( $tree )->isValid() );
	}

	public function test_missing_kb_version_on_rowlayout(): void {
		$tree = array( $this->block( 'kadence/rowlayout', array( 'uniqueID' => 'r1' ) ) );
		$r    = ( new KadenceValidator() )->validate( $tree );
		$this->assertFalse( $r->isValid() );
		$this->assertSame( 'missing_kb_version', $r->violations()[0]->code() );
	}

	public function test_wrong_kb_version_value_rejected(): void {
		$tree = array( $this->block( 'kadence/column', array( 'uniqueID' => 'c1', 'kbVersion' => 1 ) ) );
		$r    = ( new KadenceValidator() )->validate( $tree );
		$this->assertFalse( $r->isValid() );
		$this->assertSame( 'missing_kb_version', $r->violations()[0]->code() );
	}

	public function test_kb_version_accepts_float_string_and_future_versions(): void {
		// Kadence uses kbVersion >= 2; these are all valid and must NOT be false-positived.
		foreach ( array( 2, 2.0, '2', 3, '3' ) as $i => $kb ) {
			$tree = array( $this->block( 'kadence/rowlayout', array( 'uniqueID' => 'r' . $i, 'kbVersion' => $kb ) ) );
			$this->assertTrue( ( new KadenceValidator() )->validate( $tree )->isValid(), 'kbVersion ' . var_export( $kb, true ) . ' must be accepted' );
		}
	}

	public function test_kb_version_below_two_or_nonnumeric_rejected(): void {
		foreach ( array( 1, 1.9, '1', 'two', null ) as $i => $kb ) {
			$attrs = array( 'uniqueID' => 'r' . $i );
			if ( $kb !== null ) {
				$attrs['kbVersion'] = $kb;
			}
			$tree = array( $this->block( 'kadence/column', $attrs ) );
			$r    = ( new KadenceValidator() )->validate( $tree );
			$this->assertFalse( $r->isValid(), 'kbVersion ' . var_export( $kb, true ) . ' must be rejected' );
		}
	}

	public function test_numeric_string_unique_ids_do_not_falsely_collide(): void {
		// "12" and "120" must be treated as distinct (no int-key coercion collision).
		$tree = array(
			$this->block( 'kadence/advancedheading', array( 'uniqueID' => '12' ) ),
			$this->block( 'kadence/advancedheading', array( 'uniqueID' => '120' ) ),
		);
		$this->assertTrue( ( new KadenceValidator() )->validate( $tree )->isValid() );
	}

	public function test_missing_unique_id(): void {
		$tree = array( $this->block( 'kadence/advancedheading', array() ) );
		$r    = ( new KadenceValidator() )->validate( $tree );
		$this->assertSame( 'missing_unique_id', $r->violations()[0]->code() );
	}

	public function test_empty_unique_id(): void {
		$tree = array( $this->block( 'kadence/advancedheading', array( 'uniqueID' => '' ) ) );
		$r    = ( new KadenceValidator() )->validate( $tree );
		$this->assertSame( 'missing_unique_id', $r->violations()[0]->code() );
	}

	public function test_duplicate_unique_id_across_tree(): void {
		$tree = array(
			$this->block( 'kadence/rowlayout', array( 'uniqueID' => 'dup', 'kbVersion' => 2 ), array(
				$this->block( 'kadence/column', array( 'uniqueID' => 'dup', 'kbVersion' => 2 ) ),
			) ),
		);
		$r = ( new KadenceValidator() )->validate( $tree );
		$this->assertFalse( $r->isValid() );
		$codes = array_map( static function ( $v ) { return $v->code(); }, $r->violations() );
		$this->assertContains( 'duplicate_unique_id', $codes );
	}

	public function test_unrecognised_kadence_block_with_unique_id_passes(): void {
		// We no longer whitelist block names (it false-positived on real child blocks like
		// kadence/listitem / table-row / table-data). A well-formed kadence/* block passes; a genuine
		// typo is caught by Gutenberg at render, not here.
		$tree = array( $this->block( 'kadence/listitem', array( 'uniqueID' => 'x' ) ) );
		$r    = ( new KadenceValidator() )->validate( $tree );
		$this->assertTrue( $r->isValid() );
	}

	public function test_violation_path_points_at_nested_block(): void {
		$tree = array(
			$this->block( 'kadence/rowlayout', array( 'uniqueID' => 'r', 'kbVersion' => 2 ), array(
				$this->block( 'kadence/column', array( 'uniqueID' => 'c' ) ), // missing kbVersion
			) ),
		);
		$r = ( new KadenceValidator() )->validate( $tree );
		$this->assertFalse( $r->isValid() );
		$this->assertSame( '0.innerBlocks.0', $r->violations()[0]->path() );
		$this->assertSame( 'missing_kb_version', $r->violations()[0]->code() );
	}
}
