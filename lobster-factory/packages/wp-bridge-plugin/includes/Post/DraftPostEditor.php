<?php
/**
 * DraftPostEditor — read a blog post, list the not-live ones, and change the content of NOT-LIVE posts (draft, pending)
 * only.
 *
 * next-admin embeds a video into a post it created through POST /post; on a bridge site that read and write must go
 * through this same signed channel, not /wp/v2 with a separate application password (a second identity that can be
 * dead while the bridge works: Soulful 2026-11-18, draft #7753 created, embed refused). A post that is published,
 * scheduled or private is refused by update(), server-side: editing one through the bridge would be a live edit.
 *
 * Invariant of update(): it writes only over content it has verified -- the content the caller read (content_sha256 from
 * read(), compare-and-set, post still not live), or, when undoing, its own write -- so it never overwrites an edit made
 * by anyone else and never changes the status. Residual: wp_update_post has no conditional write (it merges the row it
 * read itself), so a publish landing in the microseconds between the check and the write inside one request is not
 * excluded -- the same as wp-admin's own editor; a status that moved there is seen on read-back.
 *
 * WordPress is reached only through the injected callables, so the guard is testable without WordPress.
 *
 * @package AwareWave\WpBridge\Post
 */

namespace AwareWave\WpBridge\Post;

final class DraftPostEditor {

	public const EDITABLE_STATUSES = array( 'draft', 'pending' );
	public const LIST_LIMIT        = 30;
	public const MAX_CONTENT_BYTES = 2097152;

	/** @var callable(int):?object get_post */
	private $getPost;
	/** @var callable(array):mixed wp_update_post( slashed args, true ) -> post id or WP_Error */
	private $updatePost;
	/** @var callable(int):array newest not-live posts, objects with ID/post_title/post_status/post_modified */
	private $listPosts;

	public function __construct( callable $getPost, callable $updatePost, callable $listPosts ) {
		$this->getPost    = $getPost;
		$this->updatePost = $updatePost;
		$this->listPosts  = $listPosts;
	}

	/**
	 * The post id from a request body, or null when it is not a positive integer.
	 *
	 * @param mixed $payload decoded JSON body.
	 */
	public static function postId( $payload ): ?int {
		if ( ! is_array( $payload ) || ! isset( $payload['post_id'] ) || ! is_int( $payload['post_id'] ) || $payload['post_id'] <= 0 ) {
			return null;
		}
		return $payload['post_id'];
	}

	/**
	 * Any blog post with its status, so the caller can tell a live post (and see a video it already holds); only
	 * update() is limited to not-live posts. content_sha256 goes back with update() as its precondition.
	 *
	 * @return array<string,mixed> status ok: post_id, post_status, title, content, content_sha256 ; refused: reason
	 */
	public function read( int $postId ): array {
		$p = $this->post( $postId );
		if ( $p === null ) {
			return array( 'status' => 'refused', 'reason' => 'post_not_found', 'post_id' => $postId );
		}
		return array(
			'status'         => 'ok',
			'post_id'        => (int) $p->ID,
			'post_status'    => (string) $p->post_status,
			'title'          => (string) $p->post_title,
			'content'        => (string) $p->post_content,
			'content_sha256' => hash( 'sha256', (string) $p->post_content ),
		);
	}

	/**
	 * Replace the content of a not-live post whose content is still what the caller read. Only post_content is sent, so
	 * WordPress keeps the status. Read back: a post whose status moved in the gap gets the content it had back and keeps
	 * the new status -- only if it still holds exactly our write; content someone saved after us is left alone
	 * (restored false). The saved content is returned so the caller checks its own deliverable (a save filter may change it).
	 *
	 * @param mixed $content
	 * @param mixed $expectSha256 content_sha256 from read().
	 * @return array<string,mixed> status committed | refused | rolled_back ; post_id ; post_status ; content ; reason
	 */
	public function update( int $postId, $content, $expectSha256 ): array {
		if ( ! is_string( $content ) || $content === '' || strlen( $content ) > self::MAX_CONTENT_BYTES ) {
			return array( 'status' => 'refused', 'reason' => 'content_required' );
		}
		if ( ! is_string( $expectSha256 ) || ! preg_match( '/^[0-9a-f]{64}$/', $expectSha256 ) ) {
			return array( 'status' => 'refused', 'reason' => 'expect_sha256_required' );
		}
		$before = $this->post( $postId );
		if ( $before === null ) {
			return array( 'status' => 'refused', 'reason' => 'post_not_found', 'post_id' => $postId );
		}
		if ( ! in_array( (string) $before->post_status, self::EDITABLE_STATUSES, true ) ) {
			return array( 'status' => 'refused', 'reason' => 'post_not_draft', 'post_id' => $postId, 'post_status' => (string) $before->post_status );
		}
		if ( ! hash_equals( $expectSha256, hash( 'sha256', (string) $before->post_content ) ) ) {
			return array( 'status' => 'refused', 'reason' => 'content_changed', 'post_id' => $postId );
		}
		$result = ( $this->updatePost )( array( 'ID' => $postId, 'post_content' => $content ) );
		if ( ! is_int( $result ) || $result !== $postId ) {
			return array( 'status' => 'rolled_back', 'reason' => 'update_failed', 'post_id' => $postId );
		}
		$after = ( $this->getPost )( $postId );
		if ( ! is_object( $after ) ) {
			return array( 'status' => 'rolled_back', 'reason' => 'verify_failed', 'post_id' => $postId );
		}
		if ( (string) $after->post_status !== (string) $before->post_status ) {
			$restored = false;
			if ( (string) $after->post_content === $content ) {
				$undo     = ( $this->updatePost )( array( 'ID' => $postId, 'post_content' => (string) $before->post_content ) );
				$restored = ( is_int( $undo ) && $undo === $postId );
			}
			return array( 'status' => 'rolled_back', 'reason' => 'status_changed', 'post_id' => $postId, 'post_status' => (string) $after->post_status, 'restored' => $restored );
		}
		return array(
			'status'      => 'committed',
			'post_id'     => $postId,
			'post_status' => (string) $after->post_status,
			'content'     => (string) $after->post_content,
			'reason'      => 'ok',
		);
	}

	/** @return array<string,mixed> status ok ; posts: id, title, status, modified (newest first) */
	public function listDrafts(): array {
		$out = array();
		foreach ( ( $this->listPosts )( self::LIST_LIMIT ) as $p ) {
			if ( ! is_object( $p ) || ! in_array( (string) $p->post_status, self::EDITABLE_STATUSES, true ) ) {
				continue;
			}
			$out[] = array(
				'id'       => (int) $p->ID,
				'title'    => (string) $p->post_title,
				'status'   => (string) $p->post_status,
				'modified' => (string) $p->post_modified,
			);
		}
		return array( 'status' => 'ok', 'posts' => $out );
	}

	/** The blog post (type post) with this id, or null. */
	private function post( int $postId ): ?object {
		$post = ( $this->getPost )( $postId );
		return ( is_object( $post ) && (string) $post->post_type === 'post' ) ? $post : null;
	}
}
