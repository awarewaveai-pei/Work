<?php
/**
 * TransactionResult — the outcome of WriteTransaction::execute, as a structured, self-describing
 * envelope. Mirrors the response contract in DESIGN §B (committed / rolled_back / dry_run) plus the
 * safety states the design demands: rejected-irreversible and the CRITICAL rollback-failed.
 *
 * @package AwareWave\WpBridge\Transaction
 */

namespace AwareWave\WpBridge\Transaction;

final class TransactionResult {

	/** Change applied, verified live, committed. */
	public const COMMITTED = 'committed';
	/** Change did not verify (or apply threw); snapshot restored and the rollback was confirmed healthy. */
	public const ROLLED_BACK = 'rolled_back';
	/** Preview only — nothing was applied. */
	public const DRY_RUN = 'dry_run';
	/** Refused before applying: the op is irreversible and must go through human approval, not here. */
	public const BLOCKED_IRREVERSIBLE = 'blocked_irreversible';
	/** Refused before applying: the op declares no observable URL, so the write could not be verified. */
	public const UNVERIFIABLE = 'unverifiable';
	/** CRITICAL: verify failed AND the rollback itself failed — the site may be in a bad state. */
	public const ROLLBACK_FAILED = 'rollback_failed';

	/** @var string one of the constants above. */
	private $status;
	/** @var string machine reason / detail. */
	private $reason;
	/** @var string|null */
	private $renderHashBefore;
	/** @var string|null */
	private $renderHashAfter;
	/** @var string[] */
	private $purgedUrls;
	/** @var array<string,mixed> dry-run preview or extra detail. */
	private $detail;

	private function __construct( string $status, string $reason, ?string $before, ?string $after, array $purgedUrls, array $detail ) {
		$this->status           = $status;
		$this->reason           = $reason;
		$this->renderHashBefore = $before;
		$this->renderHashAfter  = $after;
		$this->purgedUrls       = $purgedUrls;
		$this->detail           = $detail;
	}

	public static function committed( ?string $before, ?string $after, array $purgedUrls ): self {
		return new self( self::COMMITTED, 'ok', $before, $after, $purgedUrls, array() );
	}

	public static function rolledBack( string $reason, ?string $before, ?string $after, array $purgedUrls ): self {
		return new self( self::ROLLED_BACK, $reason, $before, $after, $purgedUrls, array() );
	}

	public static function dryRun( array $preview ): self {
		return new self( self::DRY_RUN, 'ok', null, null, array(), $preview );
	}

	public static function blockedIrreversible( string $reason ): self {
		return new self( self::BLOCKED_IRREVERSIBLE, $reason, null, null, array(), array() );
	}

	public static function unverifiable( string $reason ): self {
		return new self( self::UNVERIFIABLE, $reason, null, null, array(), array() );
	}

	public static function rollbackFailed( string $reason ): self {
		return new self( self::ROLLBACK_FAILED, $reason, null, null, array(), array() );
	}

	public function status(): string {
		return $this->status;
	}

	public function reason(): string {
		return $this->reason;
	}

	public function renderHashBefore(): ?string {
		return $this->renderHashBefore;
	}

	public function renderHashAfter(): ?string {
		return $this->renderHashAfter;
	}

	/** @return string[] */
	public function purgedUrls(): array {
		return $this->purgedUrls;
	}

	/** @return array<string,mixed> */
	public function detail(): array {
		return $this->detail;
	}

	public function isCommitted(): bool {
		return $this->status === self::COMMITTED;
	}
}
