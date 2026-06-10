<?php
/**
 * ProductCreator — atomically create a WooCommerce simple product (name + price + description +
 * categories + SEO) and VERIFY it by reading it back; if any requested part didn't take, delete the
 * whole product so no half-built product is left in the catalog. This is the CREATE self-heal pattern,
 * the exact mirror of PostCreator (read-back verification, since a draft product isn't render-checkable).
 *
 * WooCommerce is a hard dependency only at call time: if WC_Product_Simple is absent we bail with
 * 'woocommerce_not_active' rather than fataling, so the bridge stays loadable on a non-Woo site.
 *
 * WP/Woo functions are called unqualified (PHP auto-falls-back to the global namespace for FUNCTIONS);
 * WooCommerce CLASSES do not fall back, so they are written fully-qualified (\WC_Product_Simple).
 *
 * @package AwareWave\WpBridge\Product
 */

namespace AwareWave\WpBridge\Product;

final class ProductCreator {

	/**
	 * @param array<string,mixed> $spec name (or title), regular_price (or price), status(draft),
	 *                                  description, short_description, sku, categories[],
	 *                                  seo{focus_keyword, description, title}.
	 * @return array<string,mixed> status: committed|rolled_back ; product_id ; edit_url ; permalink ; reason ; detail
	 */
	public function create( array $spec ): array {
		if ( ! class_exists( '\WC_Product_Simple' ) ) {
			return array( 'status' => 'rolled_back', 'reason' => 'woocommerce_not_active' );
		}

		$name = isset( $spec['name'] ) ? (string) $spec['name'] : '';
		if ( $name === '' && isset( $spec['title'] ) ) {
			$name = (string) $spec['title']; // accept 'title' as an alias so the post/product specs rhyme.
		}

		$status = ( isset( $spec['status'] ) && in_array( $spec['status'], array( 'draft', 'pending', 'publish', 'private' ), true ) )
			? (string) $spec['status']
			: 'draft';

		$regularPrice = isset( $spec['regular_price'] ) ? (string) $spec['regular_price']
			: ( isset( $spec['price'] ) ? (string) $spec['price'] : '' );

		$description      = isset( $spec['description'] ) ? (string) $spec['description'] : '';
		$shortDescription = isset( $spec['short_description'] ) ? (string) $spec['short_description'] : '';
		$sku              = isset( $spec['sku'] ) ? trim( (string) $spec['sku'] ) : '';

		if ( $name === '' || $regularPrice === '' ) {
			return array( 'status' => 'rolled_back', 'reason' => 'name_and_price_required' );
		}
		// Reject anything not a plain non-negative decimal. Scientific notation ("1e3") passes is_numeric()
		// but wc_format_decimal() would strip the 'e' and store a different number — so reject it outright.
		if ( ! is_numeric( $regularPrice ) || stripos( $regularPrice, 'e' ) !== false || (float) $regularPrice < 0 ) {
			return array( 'status' => 'rolled_back', 'reason' => 'price_not_numeric' );
		}
		// Normalize to Woo's stored form NOW, so the value we verify against equals the value Woo persists.
		if ( function_exists( 'wc_format_decimal' ) ) {
			$regularPrice = (string) wc_format_decimal( $regularPrice );
		}

		// SKU uniqueness is enforced by Woo at save() too, but checking first lets us return a clean
		// 'sku_exists' instead of a generic save failure, and avoids creating then deleting a product.
		if ( $sku !== '' && function_exists( 'wc_get_product_id_by_sku' ) && wc_get_product_id_by_sku( $sku ) ) {
			return array( 'status' => 'rolled_back', 'reason' => 'sku_exists' );
		}

		// wp_slash() text fields: WooCommerce persists name/description through the post store, which
		// wp_unslash()es internally (same reason PostCreator slashes its insert array). Without this,
		// backslash-bearing content — e.g. Kadence block markup in a description — corrupts on save.
		$product = new \WC_Product_Simple();
		$product->set_name( wp_slash( $name ) );
		$product->set_status( $status );
		$product->set_regular_price( $regularPrice );
		if ( $description !== '' ) {
			$product->set_description( wp_slash( $description ) );
		}
		if ( $shortDescription !== '' ) {
			$product->set_short_description( wp_slash( $shortDescription ) );
		}
		if ( $sku !== '' ) {
			try {
				$product->set_sku( $sku );
			} catch ( \WC_Data_Exception $e ) {
				return array( 'status' => 'rolled_back', 'reason' => 'invalid_sku' );
			}
		}

		// Categories: create missing product_cat terms, then assign by id. Deduped so the requested count
		// can be compared against the assigned count in verify (partial resolution => roll back).
		$categories = array_values( array_unique( $this->stringList( $spec['categories'] ?? array() ) ) );
		if ( $categories !== array() ) {
			$catIds = array();
			foreach ( $categories as $catName ) {
				$term = term_exists( $catName, 'product_cat' );
				if ( ! $term ) {
					$term = wp_insert_term( $catName, 'product_cat' );
				}
				if ( ! is_wp_error( $term ) && isset( $term['term_id'] ) ) {
					$catIds[] = (int) $term['term_id'];
				}
			}
			if ( $catIds !== array() ) {
				$product->set_category_ids( $catIds );
			}
		}

		try {
			$productId = $product->save();
		} catch ( \Throwable $e ) {
			return array( 'status' => 'rolled_back', 'reason' => 'save_failed' );
		}
		if ( ! $productId ) {
			return array( 'status' => 'rolled_back', 'reason' => 'save_failed' );
		}
		$productId = (int) $productId;

		// SEO meta (Rank Math). A product is a public post type, so the same meta keys apply.
		$seo = isset( $spec['seo'] ) && is_array( $spec['seo'] ) ? $spec['seo'] : array();
		if ( isset( $seo['focus_keyword'] ) ) {
			update_post_meta( $productId, 'rank_math_focus_keyword', sanitize_text_field( (string) $seo['focus_keyword'] ) );
		}
		if ( isset( $seo['description'] ) ) {
			update_post_meta( $productId, 'rank_math_description', sanitize_text_field( (string) $seo['description'] ) );
		}
		if ( isset( $seo['title'] ) ) {
			update_post_meta( $productId, 'rank_math_title', sanitize_text_field( (string) $seo['title'] ) );
		}

		// Read-back verify. If any requested part didn't land, the product is partial -> delete it all.
		$problems = $this->verify( $productId, $name, $status, (float) $regularPrice, $categories, $seo );
		if ( $problems !== array() ) {
			$existing = wc_get_product( $productId );
			if ( $existing ) {
				$existing->delete( true ); // force delete (skip trash) so no orphan stays in the catalog.
			} else {
				wp_delete_post( $productId, true );
			}
			return array( 'status' => 'rolled_back', 'reason' => 'verify_failed', 'detail' => array( 'problems' => $problems ) );
		}

		return array(
			'status'     => 'committed',
			'product_id' => $productId,
			'edit_url'   => admin_url( 'post.php?post=' . $productId . '&action=edit' ),
			'permalink'  => (string) get_permalink( $productId ),
			'reason'     => 'ok',
		);
	}

	/**
	 * @param string[] $categories
	 * @param array<string,mixed> $seo
	 * @return string[] list of problems (empty = verified OK)
	 */
	private function verify( int $productId, string $name, string $status, float $price, array $categories, array $seo ): array {
		$problems = array();
		$product  = wc_get_product( $productId );
		if ( ! $product ) {
			return array( 'product_not_found' );
		}
		if ( $product->get_status() !== $status ) {
			$problems[] = 'status_mismatch';
		}
		if ( wp_strip_all_tags( $product->get_name() ) !== wp_strip_all_tags( $name ) ) {
			$problems[] = 'name_mismatch';
		}
		// Compare prices numerically — Woo stores price as a string, so === would spuriously differ.
		if ( abs( (float) $product->get_regular_price() - $price ) > 0.0001 ) {
			$problems[] = 'price_mismatch';
		}
		if ( $categories !== array() ) {
			$assigned = count( $product->get_category_ids() );
			if ( $assigned === 0 ) {
				$problems[] = 'categories_not_set';
			} elseif ( $assigned < count( $categories ) ) {
				// Some requested categories failed to resolve/create — don't silently commit a
				// mis-categorized product on a live catalog; roll back so the caller can retry.
				$problems[] = 'categories_incomplete';
			}
		}
		if ( isset( $seo['focus_keyword'] ) ) {
			if ( (string) get_post_meta( $productId, 'rank_math_focus_keyword', true ) === '' ) {
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
