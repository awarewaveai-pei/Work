<?php
/**
 * Snapshotter — captures an Operation's target state before a write and restores it on rollback.
 *
 * The concrete (WP-coupled) implementation reads/writes the actual option/post/meta. This interface
 * lets WriteTransaction's rollback be tested with an in-memory fake.
 *
 * TWO contracts every implementation MUST uphold (the orchestrator cannot enforce them, but a clean
 * rollback depends on them):
 *   1. capture() must snapshot the COMPLETE reversal set — everything the matching Operation::apply()
 *      can mutate. If apply() touches N things and capture() saved only one, restore() leaves the
 *      others changed and the transaction would falsely report a clean rollback.
 *   2. restore() must return the persisted storage to its prior value byte-for-byte. The render-hash
 *      re-verify in WriteTransaction only proves the SAMPLED output marker matches; true byte
 *      restoration of the underlying option/post/meta is this method's responsibility.
 *
 * @package AwareWave\WpBridge\Transaction
 */

namespace AwareWave\WpBridge\Transaction;

interface Snapshotter {

	/**
	 * Capture the FULL reversal set for $op (see contract 1 above), plus the pre-change render hash.
	 *
	 * @param string|null $renderHashBefore pre-render hash.
	 */
	public function capture( Operation $op, ?string $renderHashBefore = null ): Snapshot;

	/**
	 * Restore the target to the captured pre-state. Throws if the restore itself fails — the
	 * transaction surfaces that as a CRITICAL "rollback failed" rather than silently swallowing it.
	 */
	public function restore( Snapshot $snapshot ): void;
}
