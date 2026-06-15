<?php
/**
 * PostCreator — atomically create a full blog post (content + categories + tags + SEO + excerpt) and
 * VERIFY it by reading it back; if any part didn't take, delete the whole post so no half-built draft
 * is left behind. This is the self-healing pattern for a CREATE (a draft is not publicly renderable,
 * so render-verify doesn't apply — read-back verification does).
 *
 * A real WordPress post is a multi-part write: the post row + taxonomy terms + several post-meta rows
 * (Rank Math SEO, etc.). Treating it as one all-or-nothing operation is what keeps a failed write from
 * leaving a post with, say, content but no category or broken SEO.
 *
 * @package AwareWave\WpBridge\Post
 */

namespace AwareWave\WpBridge\Post;

use AwareWave\WpBridge\Content\MediaSideloader;

final class PostCreator {

	/**
	 * @param array<string,mixed> $spec title, content, status(draft), categories[], tags[], excerpt,
	 *                                  seo{focus_keyword, description, title},
	 *                                  featured_image_url, featured_image_alt, internal_link_keywords[].
	 * @return array<string,mixed> status: committed|rolled_back ; post_id ; edit_url ; featured_set ; reason ; detail
	 */
	public function create( array $spec ): array {
		$title   = isset( $spec['title'] ) ? (string) $spec['title'] : '';
		$content = isset( $spec['content'] ) ? (string) $spec['content'] : '';
		$status  = ( isset( $spec['status'] ) && in_array( $spec['status'], array( 'draft', 'pending', 'publish' ), true ) )
			? (string) $spec['status']
			: 'draft';
		$excerpt = isset( $spec['excerpt'] ) ? (string) $spec['excerpt'] : '';

		if ( $title === '' || $content === '' ) {
			return array( 'status' => 'rolled_back', 'reason' => 'title_and_content_required' );
		}

		// 1. Insert the post. wp_insert_post with wp_error=true so a failure is observable.
		// wp_slash() the args because wp_insert_post() internally wp_unslash()es them (it expects
		// $_POST-style slashed data); without this, backslash-escaped block attributes such as the
		// kadence/tabs `titles` (<strong>…) would be corrupted to u003cstrong on save.
		$postId = wp_insert_post(
			wp_slash(
				array(
					'post_title'   => $title,
					'post_content' => $content,
					'post_excerpt' => $excerpt,
					'post_status'  => $status,
					'post_type'    => 'post',
				)
			),
			true
		);
		if ( is_wp_error( $postId ) || ! $postId ) {
			return array( 'status' => 'rolled_back', 'reason' => 'insert_failed' );
		}
		$postId = (int) $postId;

		// 2. Categories (create missing terms), tags, SEO meta — each best-effort, all verified in step 3.
		$categories = $this->stringList( $spec['categories'] ?? array() );
		if ( $categories !== array() ) {
			$catIds = array();
			foreach ( $categories as $name ) {
				$term = term_exists( $name, 'category' );
				if ( ! $term ) {
					$term = wp_insert_term( $name, 'category' );
				}
				if ( ! is_wp_error( $term ) && isset( $term['term_id'] ) ) {
					$catIds[] = (int) $term['term_id'];
				}
			}
			if ( $catIds !== array() ) {
				wp_set_post_categories( $postId, $catIds );
			}
		}

		$tags = $this->stringList( $spec['tags'] ?? array() );
		if ( $tags !== array() ) {
			wp_set_post_tags( $postId, $tags, false );
		}

		$seo = isset( $spec['seo'] ) && is_array( $spec['seo'] ) ? $spec['seo'] : array();
		if ( isset( $seo['focus_keyword'] ) ) {
			update_post_meta( $postId, 'rank_math_focus_keyword', sanitize_text_field( (string) $seo['focus_keyword'] ) );
		}
		if ( isset( $seo['description'] ) ) {
			update_post_meta( $postId, 'rank_math_description', sanitize_text_field( (string) $seo['description'] ) );
		}
		if ( isset( $seo['title'] ) ) {
			update_post_meta( $postId, 'rank_math_title', sanitize_text_field( (string) $seo['title'] ) );
		}

		// Featured image (issue 四): sideload the hero URL into the media library and set it as the post
		// thumbnail. Alt text carries the focus keyword for SEO. BEST-EFFORT — a transient image fetch
		// failure must NOT roll back an otherwise-good article (mirrors ProductCreator's featured handling,
		// which never verify-gates the image). The committed response reports whether it landed.
		$featuredSet = false;
		$featuredUrl = isset( $spec['featured_image_url'] ) ? trim( (string) $spec['featured_image_url'] ) : '';
		if ( $featuredUrl !== '' ) {
			$featAlt = isset( $spec['featured_image_alt'] ) ? (string) $spec['featured_image_alt'] : '';
			if ( $featAlt === '' && isset( $seo['focus_keyword'] ) ) {
				$featAlt = (string) $seo['focus_keyword'];
			}
			$media = ( new MediaSideloader() )->sideload( $featuredUrl, $featAlt );
			if ( $media && ! empty( $media['id'] ) ) {
				set_post_thumbnail( $postId, (int) $media['id'] );
				$featuredSet = has_post_thumbnail( $postId );
			}
		}

		// Internal Link Juicer keywords (issue 七): write the ILJ link definition so OTHER posts that
		// mention these keywords auto-link to THIS post. ILJ stores a plain indexed array under
		// `ilj_linkdefinition`; WP auto-serializes it (do NOT pre-serialize / pass a comma string —
		// ILJ's Postmeta::fromMeta() checks is_array()). Index rebuild only fires on save_post for a
		// PUBLISHED post, so for a draft the links activate when the post is later published — no manual
		// rebuild needed here. Best-effort: a missing/inactive ILJ plugin just no-ops this meta row.
		$iljKeywords = $this->stringList( $spec['internal_link_keywords'] ?? array() );
		if ( $iljKeywords !== array() ) {
			update_post_meta( $postId, 'ilj_linkdefinition', $iljKeywords );
		}

		// 3. Read-back verify. If any requested part didn't land, the post is partial -> delete it all.
		$problems = $this->verify( $postId, $title, $status, $categories, $seo );
		if ( $problems !== array() ) {
			wp_delete_post( $postId, true );
			return array( 'status' => 'rolled_back', 'reason' => 'verify_failed', 'detail' => array( 'problems' => $problems ) );
		}

		return array(
			'status'       => 'committed',
			'post_id'      => $postId,
			'edit_url'     => admin_url( 'post.php?post=' . $postId . '&action=edit' ),
			'featured_set' => $featuredSet,
			'reason'       => 'ok',
		);
	}

	/**
	 * @param string[] $categories
	 * @param array<string,mixed> $seo
	 * @return string[] list of problems (empty = verified OK)
	 */
	private function verify( int $postId, string $title, string $status, array $categories, array $seo ): array {
		$problems = array();
		$post     = get_post( $postId );
		if ( ! $post ) {
			return array( 'post_not_found' );
		}
		if ( $post->post_status !== $status ) {
			$problems[] = 'status_mismatch';
		}
		if ( wp_strip_all_tags( $post->post_title ) !== wp_strip_all_tags( $title ) ) {
			$problems[] = 'title_mismatch';
		}
		if ( $categories !== array() ) {
			$assigned = wp_get_post_categories( $postId );
			if ( count( $assigned ) === 0 ) {
				$problems[] = 'categories_not_set';
			}
		}
		if ( isset( $seo['focus_keyword'] ) ) {
			if ( (string) get_post_meta( $postId, 'rank_math_focus_keyword', true ) === '' ) {
				$problems[] = 'seo_focus_keyword_not_set';
			}
		}
		return $problems;
	}

	/**
	 * @param mixed $value
	 * @return string[]
	 */
	private function stringList( $value ): array {
		if ( ! is_array( $value ) ) {
			return array();
		}
		$out = array();
		foreach ( $value as $v ) {
			if ( is_string( $v ) && trim( $v ) !== '' ) {
				$out[] = trim( $v );
			}
		}
		return $out;
	}
}
