<?php
/**
 * Snapshot — opaque captured pre-state for one Operation, plus the pre-change render hash.
 *
 * The Snapshotter produces it before apply() and consumes it on restore(). WriteTransaction treats
 * the `state` as a black box (only the Snapshotter understands it), but keeps the `renderHashBefore`
 * to confirm, after a rollback, that the rendered output returned to its pre-change value (at the
 * Renderer's hash granularity — storage-level byte restoration is the Snapshotter's contract).
 *
 * @package AwareWave\WpBridge\Transaction
 */

namespace AwareWave\WpBridge\Transaction;

final class Snapshot {

	/** @var string target identifier this snapshot belongs to. */
	private $target;
	/** @var mixed opaque pre-state, meaningful only to the Snapshotter that created it. */
	private $state;
	/** @var string|null render hash of the affected output BEFORE the change (null if not captured). */
	private $renderHashBefore;

	/**
	 * @param mixed $state
	 */
	public function __construct( string $target, $state, ?string $renderHashBefore = null ) {
		$this->target           = $target;
		$this->state            = $state;
		$this->renderHashBefore = $renderHashBefore;
	}

	public function target(): string {
		return $this->target;
	}

	/** @return mixed */
	public function state() {
		return $this->state;
	}

	public function renderHashBefore(): ?string {
		return $this->renderHashBefore;
	}
}
