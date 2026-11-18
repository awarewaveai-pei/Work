<?php
/**
 * DraftPostEditor with fake WordPress callables: only draft/pending posts whose content is still what was read are
 * changed, the status never moves.
 */

namespace AwareWave\WpBridge\Tests\Post;

use AwareWave\WpBridge\Post\DraftPostEditor;
use PHPUnit\Framework\TestCase;

final class DraftPostEditorTest extends TestCase {

	/** @var array<int,object> */
	private $posts = array();
	/** @var array<int,array<string,mixed>> */
	private $updates = array();
	/** @var callable|null replaces the default fake update (which applies the args) */
	private $onUpdate;

	private function post( int $id, string $status, string $type = 'post' ): void {
		$this->posts[ $id ] = (object) array(
			'ID'            => $id,
			'post_type'     => $type,
			'post_status'   => $status,
			'post_title'    => 'T' . $id,
			'post_content'  => 'before',
			'post_modified' => '2026-11-18T10:00:00',
		);
	}

	private function editor(): DraftPostEditor {
		return new DraftPostEditor(
			function ( int $id ) {
				return isset( $this->posts[ $id ] ) ? clone $this->posts[ $id ] : null;
			},
			function ( array $args ) {
				$this->updates[] = $args;
				if ( $this->onUpdate ) {
					return ( $this->onUpdate )( $args );
				}
				foreach ( $args as $k => $v ) {
					if ( $k !== 'ID' ) {
						$this->posts[ $args['ID'] ]->$k = $v;
					}
				}
				return $args['ID'];
			},
			function ( int $limit ): array {
				return array_slice( array_values( $this->posts ), 0, $limit );
			}
		);
	}

	private function sha( int $id ): string {
		return $this->editor()->read( $id )['content_sha256'];
	}

	public function test_post_id_must_be_a_positive_integer(): void {
		$this->assertSame( 7, DraftPostEditor::postId( array( 'post_id' => 7 ) ) );
		$this->assertNull( DraftPostEditor::postId( array( 'post_id' => '7' ) ) );
		$this->assertNull( DraftPostEditor::postId( array( 'post_id' => 0 ) ) );
		$this->assertNull( DraftPostEditor::postId( null ) );
	}

	public function test_a_post_is_read_with_its_status_and_content_hash(): void {
		$this->post( 5, 'draft' );
		$this->post( 6, 'publish' );
		$this->assertSame(
			array( 'status' => 'ok', 'post_id' => 5, 'post_status' => 'draft', 'title' => 'T5', 'content' => 'before', 'content_sha256' => hash( 'sha256', 'before' ) ),
			$this->editor()->read( 5 )
		);
		$this->assertSame( 'publish', $this->editor()->read( 6 )['post_status'] );
	}

	public function test_a_draft_is_updated_and_keeps_its_status(): void {
		$this->post( 5, 'draft' );
		$r = $this->editor()->update( 5, 'with video', $this->sha( 5 ) );
		$this->assertSame( 'committed', $r['status'] );
		$this->assertSame( 'with video', $r['content'] );
		$this->assertSame( array( array( 'ID' => 5, 'post_content' => 'with video' ) ), $this->updates );
		$this->assertSame( 'draft', $this->posts[5]->post_status );
		$this->post( 6, 'pending' );
		$this->assertSame( 'committed', $this->editor()->update( 6, 'with video', $this->sha( 6 ) )['status'] );
	}

	/** The guard: nothing the bridge does here may edit a live post. */
	public function test_a_live_post_is_refused_and_never_written(): void {
		foreach ( array( 'publish', 'future', 'private' ) as $i => $status ) {
			$this->post( 10 + $i, $status );
			$r = $this->editor()->update( 10 + $i, 'with video', $this->sha( 10 + $i ) );
			$this->assertSame( 'refused', $r['status'], $status );
			$this->assertSame( 'post_not_draft', $r['reason'], $status );
		}
		$this->assertSame( array(), $this->updates );
	}

	/** Edited after the caller read it: refused, the edit is not overwritten (Codex 7ab1abb3 F1). */
	public function test_a_draft_changed_since_the_read_is_refused(): void {
		$this->post( 5, 'draft' );
		$sha                          = $this->sha( 5 );
		$this->posts[5]->post_content = 'edited by a person';
		$this->assertSame( 'content_changed', $this->editor()->update( 5, 'with video', $sha )['reason'] );
		$this->assertSame( 'expect_sha256_required', $this->editor()->update( 5, 'with video', null )['reason'] );
		$this->assertSame( array(), $this->updates );
	}

	public function test_a_page_or_a_missing_post_is_not_found(): void {
		$this->post( 20, 'draft', 'page' );
		$this->assertSame( 'post_not_found', $this->editor()->update( 20, 'x', hash( 'sha256', 'before' ) )['reason'] );
		$this->assertSame( 'post_not_found', $this->editor()->read( 20 )['reason'] );
		$this->assertSame( 'post_not_found', $this->editor()->read( 99 )['reason'] );
		$this->assertSame( array(), $this->updates );
	}

	public function test_empty_content_is_refused(): void {
		$this->post( 5, 'draft' );
		$this->assertSame( 'content_required', $this->editor()->update( 5, '', $this->sha( 5 ) )['reason'] );
		$this->assertSame( 'content_required', $this->editor()->update( 5, array( 'x' ), $this->sha( 5 ) )['reason'] );
		$this->assertSame( array(), $this->updates );
	}

	/** Published in the gap inside the write: our content comes out, their publish stays (Codex 66c620ce F1). */
	public function test_a_post_published_during_the_write_gets_its_old_content_and_stays_published(): void {
		$this->post( 5, 'draft' );
		$this->onUpdate = function ( array $args ) {
			$p               = $this->posts[ $args['ID'] ];
			$p->post_content = $args['post_content'];
			$p->post_status  = $args['post_status'] ?? 'publish';
			return $args['ID'];
		};
		$r = $this->editor()->update( 5, 'with video', $this->sha( 5 ) );
		$this->assertSame( 'rolled_back', $r['status'] );
		$this->assertSame( 'status_changed', $r['reason'] );
		$this->assertSame( 'publish', $this->posts[5]->post_status );
		$this->assertSame( 'before', $this->posts[5]->post_content );
		$this->assertArrayNotHasKey( 'post_status', $this->updates[1] );
		$this->assertTrue( $r['restored'] );
	}

	/** The undo itself failed: reported as not restored (Codex abb56f44 F2). */
	public function test_a_failed_undo_is_reported_as_not_restored(): void {
		$this->post( 5, 'draft' );
		$this->onUpdate = function ( array $args ) {
			if ( count( $this->updates ) > 1 ) {
				return new \stdClass(); // WP_Error stand-in
			}
			$p               = $this->posts[ $args['ID'] ];
			$p->post_content = $args['post_content'];
			$p->post_status  = 'publish';
			return $args['ID'];
		};
		$r = $this->editor()->update( 5, 'with video', $this->sha( 5 ) );
		$this->assertSame( 'status_changed', $r['reason'] );
		$this->assertFalse( $r['restored'] );
	}

	/** Published with new content right after our write: their content is not ours to undo (Codex 247784b5 F1). */
	public function test_content_saved_by_someone_after_our_write_is_left_alone(): void {
		$this->post( 5, 'draft' );
		$this->onUpdate = function ( array $args ) {
			$p               = $this->posts[ $args['ID'] ];
			$p->post_content = 'published by a person';
			$p->post_status  = 'publish';
			return $args['ID'];
		};
		$r = $this->editor()->update( 5, 'with video', $this->sha( 5 ) );
		$this->assertSame( 'status_changed', $r['reason'] );
		$this->assertFalse( $r['restored'] );
		$this->assertCount( 1, $this->updates );
		$this->assertSame( 'published by a person', $this->posts[5]->post_content );
	}

	/** The saved content goes back to the caller, so a save filter that dropped the video is seen (Codex 66c620ce F2). */
	public function test_the_saved_content_is_returned_as_saved(): void {
		$this->post( 5, 'draft' );
		$this->onUpdate = function ( array $args ) {
			$this->posts[ $args['ID'] ]->post_content = 'filtered';
			return $args['ID'];
		};
		$this->assertSame( 'filtered', $this->editor()->update( 5, 'with video', $this->sha( 5 ) )['content'] );
	}

	public function test_a_failed_write_is_reported(): void {
		$this->post( 5, 'draft' );
		$this->onUpdate = function () {
			return new \stdClass(); // WP_Error stand-in
		};
		$this->assertSame( 'update_failed', $this->editor()->update( 5, 'x', $this->sha( 5 ) )['reason'] );
	}

	public function test_the_list_holds_only_not_live_posts(): void {
		$this->post( 1, 'draft' );
		$this->post( 2, 'publish' );
		$this->post( 3, 'pending' );
		$r = $this->editor()->listDrafts();
		$this->assertSame( 'ok', $r['status'] );
		$this->assertSame( array( 1, 3 ), array_column( $r['posts'], 'id' ) );
		$this->assertSame( array( 'id' => 1, 'title' => 'T1', 'status' => 'draft', 'modified' => '2026-11-18T10:00:00' ), $r['posts'][0] );
	}
}
