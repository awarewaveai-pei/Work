<?php
/**
 * Tests for WriteTransaction — the self-healing write loop.
 *
 * The headline test (DESIGN §G "頭號測試") is test_broken_write_auto_rolls_back_byte_identical: an
 * apply that breaks a page must be detected by render-verify and rolled back to BYTE-identical
 * pre-state. The fakes model a tiny "world" of URL -> {status, content} that the operation mutates,
 * the snapshotter copies/restores, and the renderer reads — so the entire loop runs without WordPress.
 */

namespace AwareWave\WpBridge\Tests\Transaction;

use AwareWave\WpBridge\Transaction\CachePurger;
use AwareWave\WpBridge\Transaction\Operation;
use AwareWave\WpBridge\Transaction\Renderer;
use AwareWave\WpBridge\Transaction\RenderObservation;
use AwareWave\WpBridge\Transaction\Snapshot;
use AwareWave\WpBridge\Transaction\Snapshotter;
use AwareWave\WpBridge\Transaction\TransactionResult;
use AwareWave\WpBridge\Transaction\WriteTransaction;
use PHPUnit\Framework\TestCase;

/** Shared mutable site state: url => ['status'=>int,'content'=>string]. */
final class World {
	/** @var array<string,array{status:int,content:string}> */
	public $pages;
	public function __construct( array $pages ) {
		$this->pages = $pages;
	}
}

final class FakeOp implements Operation {
	/** @var World */ private $world;
	/** @var string[] */ private $urls;
	/** @var callable */ private $mutation;
	/** @var bool */ private $reversible;
	/** @var bool */ private $applyThrows;
	/** @var bool */ private $expectsChange;

	public function __construct( World $world, array $urls, callable $mutation, bool $reversible = true, bool $applyThrows = false, bool $expectsChange = true ) {
		$this->world         = $world;
		$this->urls          = $urls;
		$this->mutation      = $mutation;
		$this->reversible    = $reversible;
		$this->applyThrows   = $applyThrows;
		$this->expectsChange = $expectsChange;
	}
	public function target(): string { return 'fake:op'; }
	public function apply(): void {
		( $this->mutation )( $this->world );
		if ( $this->applyThrows ) { throw new \RuntimeException( 'apply blew up' ); }
	}
	public function affectedUrls(): array { return $this->urls; }
	public function isReversible(): bool { return $this->reversible; }
	public function expectsChange(): bool { return $this->expectsChange; }
	public function describe(): array { return array( 'op' => 'fake', 'urls' => $this->urls ); }
}

final class FakeSnapshotter implements Snapshotter {
	/** @var World */ private $world;
	public $restoreThrows = false;
	public function __construct( World $world ) { $this->world = $world; }
	public function capture( Operation $op, ?string $renderHashBefore = null ): Snapshot {
		// Deep copy of the world's pages so restore() returns byte-identical state.
		return new Snapshot( $op->target(), array_map( static function ( $p ) { return $p; }, $this->world->pages ), $renderHashBefore );
	}
	public function restore( Snapshot $snapshot ): void {
		if ( $this->restoreThrows ) { throw new \RuntimeException( 'restore failed' ); }
		$this->world->pages = $snapshot->state();
	}
}

final class FakeRenderer implements Renderer {
	/** @var World */ private $world;
	public $throwOnRender = false;
	public function __construct( World $world ) { $this->world = $world; }
	public function render( string $url ): RenderObservation {
		if ( $this->throwOnRender ) { throw new \RuntimeException( 'render transport failed' ); }
		$page = isset( $this->world->pages[ $url ] ) ? $this->world->pages[ $url ] : array( 'status' => 404, 'content' => '' );
		return new RenderObservation( $url, $page['status'], hash( 'sha256', $page['content'] ) );
	}
}

final class FakePurger implements CachePurger {
	/** @var int number of leading purge() calls that should throw before succeeding. */
	public $failFirst = 0;
	public $purgeCount = 0;
	public function purge( array $urls ): array {
		$this->purgeCount++;
		if ( $this->purgeCount <= $this->failFirst ) { throw new \RuntimeException( 'purge failed' ); }
		return $urls;
	}
}

final class WriteTransactionTest extends TestCase {

	private function world(): World {
		return new World( array( 'https://x/' => array( 'status' => 200, 'content' => 'ORIGINAL' ) ) );
	}

	public function test_healthy_write_commits(): void {
		$world = $this->world();
		$op    = new FakeOp( $world, array( 'https://x/' ), static function ( World $w ) { $w->pages['https://x/']['content'] = 'CHANGED'; } );
		$tx    = new WriteTransaction( new FakeSnapshotter( $world ), new FakeRenderer( $world ), new FakePurger() );
		$r     = $tx->execute( $op );
		$this->assertSame( TransactionResult::COMMITTED, $r->status() );
		$this->assertNotSame( $r->renderHashBefore(), $r->renderHashAfter(), 'committed write should have changed output' );
		$this->assertSame( 'CHANGED', $world->pages['https://x/']['content'] );
	}

	public function test_broken_write_auto_rolls_back_byte_identical(): void {
		// THE headline test: the op breaks the page (500), verify catches it, snapshot is restored,
		// and the rollback is proven byte-identical to the original.
		$world = $this->world();
		$op    = new FakeOp( $world, array( 'https://x/' ), static function ( World $w ) {
			$w->pages['https://x/'] = array( 'status' => 500, 'content' => 'BROKEN' );
		} );
		$tx = new WriteTransaction( new FakeSnapshotter( $world ), new FakeRenderer( $world ), new FakePurger() );
		$r  = $tx->execute( $op );
		$this->assertSame( TransactionResult::ROLLED_BACK, $r->status() );
		$this->assertSame( 'verify_unhealthy', $r->reason() );
		// Byte-identical restoration:
		$this->assertSame( 200, $world->pages['https://x/']['status'] );
		$this->assertSame( 'ORIGINAL', $world->pages['https://x/']['content'] );
		$this->assertSame( $r->renderHashBefore(), $r->renderHashAfter(), 'rollback output must equal pre-change output' );
	}

	public function test_apply_throw_rolls_back(): void {
		$world = $this->world();
		$op    = new FakeOp( $world, array( 'https://x/' ), static function ( World $w ) { $w->pages['https://x/']['content'] = 'PARTIAL'; }, true, true );
		$tx    = new WriteTransaction( new FakeSnapshotter( $world ), new FakeRenderer( $world ), new FakePurger() );
		$r     = $tx->execute( $op );
		$this->assertSame( TransactionResult::ROLLED_BACK, $r->status() );
		$this->assertSame( 'apply_failed', $r->reason() );
		$this->assertSame( 'ORIGINAL', $world->pages['https://x/']['content'] );
	}

	public function test_irreversible_op_is_blocked_without_applying(): void {
		$world   = $this->world();
		$applied = false;
		$op      = new FakeOp( $world, array( 'https://x/' ), static function ( World $w ) use ( &$applied ) { $applied = true; }, false );
		$tx      = new WriteTransaction( new FakeSnapshotter( $world ), new FakeRenderer( $world ), new FakePurger() );
		$r       = $tx->execute( $op );
		$this->assertSame( TransactionResult::BLOCKED_IRREVERSIBLE, $r->status() );
		$this->assertFalse( $applied, 'an irreversible op must NOT be applied here' );
	}

	public function test_dry_run_previews_without_applying(): void {
		$world   = $this->world();
		$applied = false;
		$op      = new FakeOp( $world, array( 'https://x/' ), static function ( World $w ) use ( &$applied ) { $applied = true; } );
		$tx      = new WriteTransaction( new FakeSnapshotter( $world ), new FakeRenderer( $world ), new FakePurger() );
		$r       = $tx->execute( $op, true );
		$this->assertSame( TransactionResult::DRY_RUN, $r->status() );
		$this->assertFalse( $applied );
		$this->assertSame( 'fake', $r->detail()['op'] );
	}

	public function test_rollback_failure_is_critical(): void {
		$world           = $this->world();
		$snap            = new FakeSnapshotter( $world );
		$snap->restoreThrows = true;
		$op              = new FakeOp( $world, array( 'https://x/' ), static function ( World $w ) {
			$w->pages['https://x/'] = array( 'status' => 500, 'content' => 'BROKEN' );
		} );
		$tx = new WriteTransaction( $snap, new FakeRenderer( $world ), new FakePurger() );
		$r  = $tx->execute( $op );
		$this->assertSame( TransactionResult::ROLLBACK_FAILED, $r->status() );
	}

	public function test_empty_affected_urls_is_unverifiable_not_committed(): void {
		// critic #1: a write with no observable URL must be refused BEFORE applying, never committed.
		$world   = $this->world();
		$applied = false;
		$op      = new FakeOp( $world, array(), static function ( World $w ) use ( &$applied ) { $applied = true; } );
		$tx      = new WriteTransaction( new FakeSnapshotter( $world ), new FakeRenderer( $world ), new FakePurger() );
		$r       = $tx->execute( $op );
		$this->assertSame( TransactionResult::UNVERIFIABLE, $r->status() );
		$this->assertFalse( $applied, 'an unverifiable op must NOT be applied' );
	}

	public function test_silent_no_op_rolls_back_when_change_expected(): void {
		// critic #2: apply() that changes nothing but expectsChange()=true must NOT report committed.
		$world = $this->world();
		$op    = new FakeOp( $world, array( 'https://x/' ), static function ( World $w ) { /* no-op */ }, true, false, true );
		$tx    = new WriteTransaction( new FakeSnapshotter( $world ), new FakeRenderer( $world ), new FakePurger() );
		$r     = $tx->execute( $op );
		$this->assertSame( TransactionResult::ROLLED_BACK, $r->status() );
		$this->assertSame( 'no_effect', $r->reason() );
	}

	public function test_idempotent_no_op_commits_when_change_not_expected(): void {
		// An op that legitimately expects no change (expectsChange=false) commits even if output is identical.
		$world = $this->world();
		$op    = new FakeOp( $world, array( 'https://x/' ), static function ( World $w ) { /* no-op */ }, true, false, false );
		$tx    = new WriteTransaction( new FakeSnapshotter( $world ), new FakeRenderer( $world ), new FakePurger() );
		$r     = $tx->execute( $op );
		$this->assertSame( TransactionResult::COMMITTED, $r->status() );
	}

	public function test_transient_purge_failure_rolls_back_cleanly(): void {
		$world  = $this->world();
		$purger = new FakePurger();
		$purger->failFirst = 1; // first (post-apply) purge throws; the rollback re-purge succeeds.
		$op = new FakeOp( $world, array( 'https://x/' ), static function ( World $w ) { $w->pages['https://x/']['content'] = 'CHANGED'; } );
		$tx = new WriteTransaction( new FakeSnapshotter( $world ), new FakeRenderer( $world ), $purger );
		$r  = $tx->execute( $op );
		$this->assertSame( TransactionResult::ROLLED_BACK, $r->status() );
		$this->assertSame( 'purge_failed', $r->reason() );
		$this->assertSame( 'ORIGINAL', $world->pages['https://x/']['content'] );
	}
}
