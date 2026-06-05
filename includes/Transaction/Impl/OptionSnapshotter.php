<?php
/**
 * OptionSnapshotter — concrete Snapshotter for WP options. Captures the exact prior value (and
 * whether the option existed at all) so restore() returns it byte-for-byte, including deleting an
 * option that did not exist before.
 *
 * Operates on ops whose target() is "option:<name>".
 *
 * @package AwareWave\WpBridge\Transaction\Impl
 */

namespace AwareWave\WpBridge\Transaction\Impl;

use AwareWave\WpBridge\Transaction\Operation;
use AwareWave\WpBridge\Transaction\Snapshot;
use AwareWave\WpBridge\Transaction\Snapshotter;

final class OptionSnapshotter implements Snapshotter {

	/** Sentinel so we can tell "option missing" apart from "option stored as false/empty". */
	private const ABSENT = "\0__awbridge_absent__";

	public function capture( Operation $op, ?string $renderHashBefore = null ): Snapshot {
		$name  = $this->optionName( $op->target() );
		$value = get_option( $name, self::ABSENT );
		$state = array(
			'name'    => $name,
			'existed' => ( $value !== self::ABSENT ),
			'value'   => ( $value === self::ABSENT ) ? null : $value,
		);
		return new Snapshot( $op->target(), $state, $renderHashBefore );
	}

	public function restore( Snapshot $snapshot ): void {
		$state = $snapshot->state();
		$name  = $state['name'];
		if ( $state['existed'] ) {
			update_option( $name, $state['value'] );
		} else {
			delete_option( $name );
		}
	}

	private function optionName( string $target ): string {
		// target() is "option:<name>".
		return ( strpos( $target, 'option:' ) === 0 ) ? substr( $target, strlen( 'option:' ) ) : $target;
	}
}
