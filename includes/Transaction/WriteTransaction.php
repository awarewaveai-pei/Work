<?php
/**
 * WriteTransaction — the self-healing write loop. THE headline differentiator (DESIGN §B):
 *
 *   validate(done upstream) → snapshot(+pre-render hash) → apply → purge target URLs → render-verify
 *   → commit if healthy AND the change actually took effect, else restore snapshot + re-render to
 *   confirm the rollback (at the Renderer's hash granularity) → audit.
 *
 * Two things are verified, not one: (a) the affected URLs still render 2xx (nothing broke), AND
 * (b) when the op expectsChange(), the output actually differs from before (the write did not silently
 * no-op). An op that declares no affectedUrls is REFUSED, never committed unverified.
 *
 * Restoration is confirmed at the RENDERER's hash granularity (a stable structural marker, not full
 * page bytes — see RenderObservation). True storage-level byte-restoration is the Snapshotter's
 * contract, not something the render hash alone can prove.
 *
 * A write is not "done" until a cache-bypassing render shows it took effect and broke nothing; if it
 * didn't, the snapshot is restored and the restoration is itself re-verified. Anything the loop cannot
 * observe (render throws, purge throws) is treated as failure → rollback (fail-closed, never
 * fire-and-hope). Irreversible operations are refused here entirely — they must go through human
 * approval, because you cannot honestly auto-undo a sent email or a taken payment (DESIGN §I table).
 *
 * WP-free: all WP coupling is behind the injected Snapshotter / Renderer / CachePurger interfaces, so
 * the whole loop — including the auto-rollback-and-byte-restore path — is unit-tested with fakes.
 *
 * @package AwareWave\WpBridge\Transaction
 */

namespace AwareWave\WpBridge\Transaction;

final class WriteTransaction {

	/** @var Snapshotter */
	private $snapshotter;
	/** @var Renderer */
	private $renderer;
	/** @var CachePurger */
	private $purger;

	public function __construct( Snapshotter $snapshotter, Renderer $renderer, CachePurger $purger ) {
		$this->snapshotter = $snapshotter;
		$this->renderer    = $renderer;
		$this->purger      = $purger;
	}

	public function execute( Operation $op, bool $dryRun = false ): TransactionResult {
		if ( $dryRun ) {
			return TransactionResult::dryRun( $op->describe() );
		}

		// Irreversible ops never run through the auto-rollback loop — refuse, force the human path.
		if ( ! $op->isReversible() ) {
			return TransactionResult::blockedIrreversible( 'operation has external side effects; requires human approval' );
		}

		$urls = $op->affectedUrls();

		// An op with no observable URL cannot be render-verified — refuse BEFORE applying rather than
		// commit a write we cannot check. Committing the unverifiable would silently degrade the whole
		// self-healing guarantee to fire-and-hope (critic #1). Ops with no public render surface must
		// use a different, explicitly-unverified path, never this loop.
		if ( count( $urls ) === 0 ) {
			return TransactionResult::unverifiable( 'operation declares no affectedUrls to verify' );
		}

		// Establish the pre-change baseline. If we cannot even observe the "before", we must not apply
		// (we'd have no proof of what to restore to) — fail closed without touching anything.
		try {
			$before = $this->renderAll( $urls );
		} catch ( \Throwable $e ) {
			return TransactionResult::rolledBack( 'pre_render_failed', null, null, array() );
		}
		$beforeHash = $this->combinedHash( $before );

		$snapshot = $this->snapshotter->capture( $op, $beforeHash );

		// Apply. A throw means the mutation failed (possibly partially) — roll back to be safe.
		try {
			$op->apply();
		} catch ( \Throwable $e ) {
			return $this->rollback( $snapshot, $urls, $beforeHash, array(), 'apply_failed' );
		}

		// Purge so verify reads fresh output, not a stale cached page.
		try {
			$purged = $this->purger->purge( $urls );
		} catch ( \Throwable $e ) {
			return $this->rollback( $snapshot, $urls, $beforeHash, array(), 'purge_failed' );
		}

		// Verify the live, uncached result.
		try {
			$after = $this->renderAll( $urls );
		} catch ( \Throwable $e ) {
			return $this->rollback( $snapshot, $urls, $beforeHash, $purged, 'post_render_failed' );
		}
		if ( ! $this->allHealthy( $after ) ) {
			return $this->rollback( $snapshot, $urls, $beforeHash, $purged, 'verify_unhealthy' );
		}

		// Positive confirmation: "still 2xx" is necessary but not sufficient. If the op expected to
		// change the output but the verified render is identical to before, the write SILENTLY failed
		// or no-op'd — do not report it committed; roll back to the known-good state (critic #2).
		$afterHash = $this->combinedHash( $after );
		if ( $op->expectsChange() && $afterHash === $beforeHash ) {
			return $this->rollback( $snapshot, $urls, $beforeHash, $purged, 'no_effect' );
		}

		return TransactionResult::committed( $beforeHash, $afterHash, $purged );
	}

	/**
	 * Restore the snapshot and confirm the restoration: re-purge, re-render, and check the output
	 * matches the captured pre-change render (at the Renderer's hash granularity — the storage-level
	 * byte guarantee is the Snapshotter's responsibility). Any failure of the rollback itself is CRITICAL.
	 *
	 * @param string[] $urls
	 * @param string[] $purged
	 */
	private function rollback( Snapshot $snapshot, array $urls, string $beforeHash, array $purged, string $reason ): TransactionResult {
		try {
			$this->snapshotter->restore( $snapshot );
		} catch ( \Throwable $e ) {
			return TransactionResult::rollbackFailed( 'restore_threw_after_' . $reason );
		}

		// Re-purge so the cache reflects the restored state before we re-verify. A purge failure here
		// does not by itself mean the data is wrong, but we cannot then trust the verify — treat as critical.
		try {
			$this->purger->purge( $urls );
		} catch ( \Throwable $e ) {
			return TransactionResult::rollbackFailed( 'rollback_purge_failed_after_' . $reason );
		}

		try {
			$confirm = $this->renderAll( $urls );
		} catch ( \Throwable $e ) {
			return TransactionResult::rollbackFailed( 'rollback_render_failed_after_' . $reason );
		}
		if ( ! $this->allHealthy( $confirm ) ) {
			return TransactionResult::rollbackFailed( 'rollback_unhealthy_after_' . $reason );
		}

		$confirmHash = $this->combinedHash( $confirm );
		if ( $confirmHash !== $beforeHash ) {
			// Restore ran but the output is NOT what it was — do not claim a clean rollback.
			return TransactionResult::rollbackFailed( 'rollback_bytes_mismatch_after_' . $reason );
		}

		return TransactionResult::rolledBack( $reason, $beforeHash, $confirmHash, $purged );
	}

	/**
	 * @param string[] $urls
	 * @return array<string,RenderObservation> url => observation (insertion order = $urls order)
	 */
	private function renderAll( array $urls ): array {
		$out = array();
		foreach ( $urls as $url ) {
			$out[ $url ] = $this->renderer->render( $url );
		}
		return $out;
	}

	/** @param array<string,RenderObservation> $observations */
	private function allHealthy( array $observations ): bool {
		foreach ( $observations as $obs ) {
			if ( ! $obs->isHealthy() ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Deterministic combined hash over all observations (sorted by URL so ordering can't change it).
	 *
	 * @param array<string,RenderObservation> $observations
	 */
	private function combinedHash( array $observations ): string {
		$parts = array();
		foreach ( $observations as $url => $obs ) {
			$parts[] = $url . '=' . $obs->httpStatus() . ':' . $obs->hash();
		}
		sort( $parts );
		return hash( 'sha256', implode( "\n", $parts ) );
	}
}
