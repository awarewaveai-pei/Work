<?php
/**
 * Operation — one reversible-or-not write the bridge can perform, abstracted so WriteTransaction can
 * orchestrate snapshot → apply → verify → commit/rollback without knowing WHAT the write is.
 *
 * Concrete operations (set an option, update post content, change a Kadence block) implement this.
 * Keeping the orchestration (WP-free, this package) separate from the actual WP mutation (the
 * concrete op, WP-coupled) is what lets the self-healing loop be unit-tested with fakes.
 *
 * @package AwareWave\WpBridge\Transaction
 */

namespace AwareWave\WpBridge\Transaction;

interface Operation {

	/** Stable identifier for what this op targets (e.g. "option:blogname"). Used for snapshot + audit. */
	public function target(): string;

	/** Perform the mutation. Throws on failure (the transaction treats a throw as "apply failed"). */
	public function apply(): void;

	/**
	 * URLs whose rendered output this op can change — the cache is purged for these and the post-apply
	 * render-verify samples them. MUST include deep pages for structural changes (permalink/theme-mod),
	 * not just the obvious target, or a broken deep page passes verify (DESIGN §B guard 1).
	 *
	 * @return string[]
	 */
	public function affectedUrls(): array;

	/**
	 * Is this op cleanly reversible by restoring a snapshot? FALSE for operations with external side
	 * effects that cannot be un-done (send a Woo/Fluent email, take payment, delete an order). An
	 * irreversible op is NEVER auto-rolled-back and MUST go through human approval — the transaction
	 * refuses to pretend it can undo the un-doable (DESIGN §I reversibility-gating table).
	 */
	public function isReversible(): bool;

	/**
	 * Does a successful apply() necessarily change the rendered output of affectedUrls()? Almost all
	 * writes do (true). The transaction uses this for positive confirmation: when a change is expected
	 * but the post-apply render is byte-equal to before, the write SILENTLY FAILED (or no-op'd) and is
	 * rolled back rather than reported committed. Return false ONLY for genuinely idempotent ops whose
	 * re-application can legitimately leave output unchanged.
	 */
	public function expectsChange(): bool;

	/**
	 * Human/AI-readable preview of the intended change, for dry-run. No mutation happens.
	 *
	 * @return array<string,mixed>
	 */
	public function describe(): array;
}
