<?php
/**
 * ProductCreator — atomically create a WooCommerce product (simple or variable) and VERIFY it by
 * reading it back; if any requested part didn't take, delete the whole product so no half-built
 * product is left in the catalog. This is the CREATE self-heal pattern, the exact mirror of
 * PostCreator (read-back verification, since a draft product isn't render-checkable).
 *
 * Simple product:   name + price required; one SKU; self-contained.
 * Variable product: name required; price lives on each variation; attributes + variations arrays
 *                   required; parent saved first, then each WC_Product_Variation saved atomically;
 *                   any failure deletes the parent (WC cascades child deletions); WC_Product_Variable::sync()
 *                   called after all variations to refresh min/max price cache.
 *
 * WooCommerce is a hard dependency only at call time: if WC classes are absent we bail with
 * 'woocommerce_not_active' rather than fataling, so the bridge stays loadable on a non-Woo site.
 *
 * WP/Woo functions are called unqualified (PHP auto-falls-back to the global namespace for FUNCTIONS);
 * WooCommerce CLASSES do not fall back, so they are written fully-qualified.
 *
 * @package AwareWave\WpBridge\Product
 */

namespace AwareWave\WpBridge\Product;

use AwareWave\WpBridge\Content\MediaSideloader;

final class ProductCreator {

	/**
	 * @param array<string,mixed> $spec
	 *   Common: name (or title), status(draft), description, short_description, categories[],
	 *           image_url, seo{focus_keyword, description, title}.
	 *   Simple: regular_price (or price), sku.
	 *   Variable: attributes[]{name, options[], visible, variation, position},
	 *             variations[]{attributes{AttrName:option}, regular_price (or price), sku}.
	 *             A top-level regular_price is used as fallback price for every variation that omits it.
	 * @return array<string,mixed> status: committed|rolled_back ; product_id ; edit_url ; permalink ; reason ; detail
	 */
	public function create( array $spec ): array {
		$type = ( isset( $spec['type'] ) && $spec['type'] === 'variable' ) ? 'variable' : 'simple';

		if ( $type === 'variable' ) {
			return $this->createVariable( $spec );
		}

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

	// -------------------------------------------------------------------------
	// Variable product
	// -------------------------------------------------------------------------

	/** @param array<string,mixed> $spec */
	private function createVariable( array $spec ): array {
		if ( ! class_exists( '\WC_Product_Variable' ) ) {
			return array( 'status' => 'rolled_back', 'reason' => 'woocommerce_not_active' );
		}

		$name = isset( $spec['name'] ) ? (string) $spec['name'] : '';
		if ( $name === '' && isset( $spec['title'] ) ) {
			$name = (string) $spec['title'];
		}
		if ( $name === '' ) {
			return array( 'status' => 'rolled_back', 'reason' => 'name_required' );
		}

		$status = ( isset( $spec['status'] ) && in_array( $spec['status'], array( 'draft', 'pending', 'publish', 'private' ), true ) )
			? (string) $spec['status']
			: 'draft';

		// Validate attributes
		$attrSpecs = ( isset( $spec['attributes'] ) && is_array( $spec['attributes'] ) ) ? $spec['attributes'] : array();
		if ( $attrSpecs === array() ) {
			return array( 'status' => 'rolled_back', 'reason' => 'attributes_required' );
		}

		// Validate variations
		$variationSpecs = ( isset( $spec['variations'] ) && is_array( $spec['variations'] ) ) ? $spec['variations'] : array();
		if ( $variationSpecs === array() ) {
			return array( 'status' => 'rolled_back', 'reason' => 'variations_required' );
		}

		// Fallback price used when a variation omits regular_price
		$defaultPrice = isset( $spec['regular_price'] ) ? (string) $spec['regular_price']
			: ( isset( $spec['price'] ) ? (string) $spec['price'] : '' );

		// Build parent
		$product = new \WC_Product_Variable();
		$product->set_name( wp_slash( $name ) );
		$product->set_status( $status );

		$description      = isset( $spec['description'] ) ? (string) $spec['description'] : '';
		$shortDescription = isset( $spec['short_description'] ) ? (string) $spec['short_description'] : '';
		if ( $description !== '' ) {
			$product->set_description( wp_slash( $description ) );
		}
		if ( $shortDescription !== '' ) {
			$product->set_short_description( wp_slash( $shortDescription ) );
		}

		// Categories
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

		// Build WC_Product_Attribute objects from spec
		$wooAttributes = array();
		foreach ( array_values( $attrSpecs ) as $i => $attrSpec ) {
			if ( ! is_array( $attrSpec ) ) {
				continue;
			}
			$attrName = isset( $attrSpec['name'] ) ? trim( (string) $attrSpec['name'] ) : '';
			if ( $attrName === '' ) {
				continue;
			}
			$options = $this->stringList( $attrSpec['options'] ?? array() );
			if ( $options === array() ) {
				continue;
			}
			$attr = new \WC_Product_Attribute();
			$attr->set_id( 0 ); // local (non-global) attribute
			$attr->set_name( $attrName );
			$attr->set_options( $options );
			$attr->set_position( isset( $attrSpec['position'] ) ? (int) $attrSpec['position'] : $i );
			$attr->set_visible( ! empty( $attrSpec['visible'] ) );
			$attr->set_variation( isset( $attrSpec['variation'] ) ? (bool) $attrSpec['variation'] : true );
			$wooAttributes[] = $attr;
		}

		if ( $wooAttributes === array() ) {
			return array( 'status' => 'rolled_back', 'reason' => 'attributes_required' );
		}
		$product->set_attributes( $wooAttributes );

		// Optional featured image sideload
		$imageUrl = isset( $spec['image_url'] ) ? trim( (string) $spec['image_url'] ) : '';
		if ( $imageUrl !== '' ) {
			$media = ( new MediaSideloader() )->sideload( $imageUrl, $name );
			if ( $media ) {
				$product->set_image_id( $media['id'] );
			}
		}

		// Save parent
		try {
			$parentId = $product->save();
		} catch ( \Throwable $e ) {
			return array( 'status' => 'rolled_back', 'reason' => 'save_failed' );
		}
		if ( ! $parentId ) {
			return array( 'status' => 'rolled_back', 'reason' => 'save_failed' );
		}
		$parentId = (int) $parentId;

		// SEO meta
		$seo = ( isset( $spec['seo'] ) && is_array( $spec['seo'] ) ) ? $spec['seo'] : array();
		if ( isset( $seo['focus_keyword'] ) ) {
			update_post_meta( $parentId, 'rank_math_focus_keyword', sanitize_text_field( (string) $seo['focus_keyword'] ) );
		}
		if ( isset( $seo['description'] ) ) {
			update_post_meta( $parentId, 'rank_math_description', sanitize_text_field( (string) $seo['description'] ) );
		}
		if ( isset( $seo['title'] ) ) {
			update_post_meta( $parentId, 'rank_math_title', sanitize_text_field( (string) $seo['title'] ) );
		}

		// Build the set of valid variation-enabled attribute slugs from the parent for key validation
		$validVariationSlugs = array();
		foreach ( $wooAttributes as $wooAttr ) {
			if ( $wooAttr->get_variation() ) {
				$validVariationSlugs[] = sanitize_title( $wooAttr->get_name() );
			}
		}

		// Create variations
		$seenSkus     = array();
		$variationIds = array();
		foreach ( $variationSpecs as $vSpec ) {
			if ( ! is_array( $vSpec ) ) {
				$this->rollbackProduct( $parentId );
				return array( 'status' => 'rolled_back', 'reason' => 'variation_save_failed' );
			}

			// Resolve price: per-variation first, then top-level fallback
			$vPrice = isset( $vSpec['regular_price'] ) ? (string) $vSpec['regular_price']
				: ( isset( $vSpec['price'] ) ? (string) $vSpec['price'] : $defaultPrice );

			if ( $vPrice === '' || ! is_numeric( $vPrice ) || stripos( $vPrice, 'e' ) !== false || (float) $vPrice < 0 ) {
				$this->rollbackProduct( $parentId );
				return array( 'status' => 'rolled_back', 'reason' => 'variation_price_required' );
			}
			if ( function_exists( 'wc_format_decimal' ) ) {
				$vPrice = (string) wc_format_decimal( $vPrice );
			}

			// Normalize variation attribute keys and validate against parent's variation-enabled slugs
			$vAttrs = ( isset( $vSpec['attributes'] ) && is_array( $vSpec['attributes'] ) ) ? $vSpec['attributes'] : array();
			$normalizedAttrs = array();
			foreach ( $vAttrs as $attrName => $option ) {
				$slug = sanitize_title( strtolower( (string) $attrName ) );
				if ( $validVariationSlugs !== array() && ! in_array( $slug, $validVariationSlugs, true ) ) {
					$this->rollbackProduct( $parentId );
					return array( 'status' => 'rolled_back', 'reason' => 'variation_attribute_unknown', 'detail' => array( 'attribute' => (string) $attrName ) );
				}
				$normalizedAttrs[ $slug ] = (string) $option;
			}

			$variation = new \WC_Product_Variation();
			$variation->set_parent_id( $parentId );
			$variation->set_status( 'publish' ); // variations must be publish to be selectable
			$variation->set_regular_price( $vPrice );
			$variation->set_attributes( $normalizedAttrs );

			$vSku = isset( $vSpec['sku'] ) ? trim( (string) $vSpec['sku'] ) : '';
			if ( $vSku !== '' ) {
				// Reject duplicates within this request before touching the DB
				if ( isset( $seenSkus[ $vSku ] ) ) {
					$this->rollbackProduct( $parentId );
					return array( 'status' => 'rolled_back', 'reason' => 'duplicate_sku_in_request', 'detail' => array( 'sku' => $vSku ) );
				}
				$seenSkus[ $vSku ] = true;
				if ( function_exists( 'wc_get_product_id_by_sku' ) && wc_get_product_id_by_sku( $vSku ) ) {
					$this->rollbackProduct( $parentId );
					return array( 'status' => 'rolled_back', 'reason' => 'sku_exists', 'detail' => array( 'sku' => $vSku ) );
				}
				try {
					$variation->set_sku( $vSku );
				} catch ( \WC_Data_Exception $e ) {
					$this->rollbackProduct( $parentId );
					return array( 'status' => 'rolled_back', 'reason' => 'invalid_sku' );
				}
			}

			try {
				$vId = $variation->save();
			} catch ( \Throwable $e ) {
				$this->rollbackProduct( $parentId );
				return array( 'status' => 'rolled_back', 'reason' => 'variation_save_failed' );
			}
			if ( ! $vId ) {
				$this->rollbackProduct( $parentId );
				return array( 'status' => 'rolled_back', 'reason' => 'variation_save_failed' );
			}
			$variationIds[] = (int) $vId;
		}

		// Sync parent min/max price cache after all variations are saved
		\WC_Product_Variable::sync( $parentId );

		// Read-back verify
		$problems = $this->verifyVariable( $parentId, $name, $status, count( $variationSpecs ) );
		if ( $problems !== array() ) {
			$this->rollbackProduct( $parentId );
			return array( 'status' => 'rolled_back', 'reason' => 'verify_failed', 'detail' => array( 'problems' => $problems ) );
		}

		return array(
			'status'          => 'committed',
			'product_id'      => $parentId,
			'variation_ids'   => $variationIds,
			'variation_count' => count( $variationIds ),
			'edit_url'        => admin_url( 'post.php?post=' . $parentId . '&action=edit' ),
			'permalink'       => (string) get_permalink( $parentId ),
			'reason'          => 'ok',
		);
	}

	/** @return string[] list of problems (empty = verified OK) */
	private function verifyVariable( int $parentId, string $name, string $status, int $expectedCount ): array {
		$problems = array();
		$product  = wc_get_product( $parentId );
		if ( ! $product ) {
			return array( 'product_not_found' );
		}
		if ( $product->get_status() !== $status ) {
			$problems[] = 'status_mismatch';
		}
		if ( wp_strip_all_tags( $product->get_name() ) !== wp_strip_all_tags( $name ) ) {
			$problems[] = 'name_mismatch';
		}
		if ( $product->get_type() !== 'variable' ) {
			$problems[] = 'type_not_variable';
		}
		$children = $product->get_children();
		if ( count( $children ) < $expectedCount ) {
			$problems[] = 'variation_count_mismatch';
		}
		return $problems;
	}

	/** Force-delete a product post (WC cascades variation children). */
	private function rollbackProduct( int $productId ): void {
		$product = wc_get_product( $productId );
		if ( $product ) {
			$product->delete( true );
		} else {
			wp_delete_post( $productId, true );
		}
	}

	// -------------------------------------------------------------------------

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
