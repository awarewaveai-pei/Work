<?php
/**
 * ProductCreator — atomically create a WooCommerce product (simple or variable) and VERIFY it by
 * reading it back; if any requested part didn't take, delete the whole product so no half-built
 * product is left in the catalog. This is the CREATE self-heal pattern, the exact mirror of
 * PostCreator (read-back verification, since a draft product isn't render-checkable).
 *
 * Field coverage: the spec accepts every WRITABLE field of the WooCommerce REST v3 product +
 * variation schema. applyCommonFields() is purely additive — it only touches a field when the spec
 * provides it, so a minimal {name, regular_price} spec behaves exactly as before. WC_Product_Variation
 * extends WC_Product, so the same setters serve parents and variations alike.
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
	 *   Common (simple + variable parent, all optional unless noted):
	 *     name (or title) REQUIRED, slug, status(draft), featured, catalog_visibility, description,
	 *     short_description, sku, global_unique_id, sale_price, date_on_sale_from, date_on_sale_to,
	 *     virtual, downloadable, downloads[]{name,file,id}, download_limit, download_expiry,
	 *     tax_status, tax_class, manage_stock, stock_quantity, stock_status, backorders,
	 *     sold_individually, weight, dimensions{length,width,height}, shipping_class(slug),
	 *     reviews_allowed, upsell_ids[], cross_sell_ids[], purchase_note, menu_order,
	 *     categories[](names), tags[](names), brands[](names), images[]{src,alt} | [url strings],
	 *     seo{focus_keyword, description, title}, meta_data[]{key,value}.
	 *   Simple only: regular_price (or price) REQUIRED.
	 *   Variable only: attributes[]{name, options[], visible, variation, position} REQUIRED,
	 *     variations[]{attributes{AttrName:option}, regular_price (or price), sku, sale_price,
	 *                  description, status, image{src,alt}|url, stock fields, weight, dimensions,
	 *                  global_unique_id, menu_order, meta_data[]} REQUIRED,
	 *     default_attributes[]{name, option}.
	 *     A top-level regular_price is used as fallback price for every variation that omits it.
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

		$status = $this->normalizeStatus( $spec['status'] ?? null, 'draft' );

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
		if ( ! $this->isPlainPrice( $regularPrice ) ) {
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
			$catIds = $this->resolveTermIds( $categories, 'product_cat' );
			if ( $catIds !== array() ) {
				$product->set_category_ids( $catIds );
			}
		}

		// Tags: same name->term->id resolution as categories.
		$tags = array_values( array_unique( $this->stringList( $spec['tags'] ?? array() ) ) );
		if ( $tags !== array() ) {
			$tagIds = $this->resolveTermIds( $tags, 'product_tag' );
			if ( $tagIds !== array() ) {
				$product->set_tag_ids( $tagIds );
			}
		}

		// Images: first becomes the featured image, the rest the gallery. Accepts {src,alt}/{id} or url strings.
		$imageSpec = $this->collectImageSpec( $spec );
		if ( $imageSpec !== array() ) {
			$resolved = $this->resolveImages( $imageSpec, $name );
			if ( $resolved['featured'] > 0 ) {
				$product->set_image_id( $resolved['featured'] );
			}
			if ( $resolved['gallery'] !== array() ) {
				$product->set_gallery_image_ids( $resolved['gallery'] );
			}
		}

		// Every other writable scalar/structured field (sale price, stock, tax, weight, dimensions, ...).
		$fieldErr = $this->applyCommonFields( $product, $spec, false );
		if ( $fieldErr !== '' ) {
			return array( 'status' => 'rolled_back', 'reason' => $fieldErr );
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
		$this->applySeo( $productId, $seo );
		// Arbitrary meta + brand terms (need the saved post id).
		$this->applyMetaData( $productId, $spec['meta_data'] ?? null );
		$this->applyBrands( $productId, $spec['brands'] ?? null );

		// Read-back verify. If any requested part didn't land, the product is partial -> delete it all.
		$problems = $this->verify( $productId, $name, $status, (float) $regularPrice, $categories, $seo );
		if ( $problems !== array() ) {
			$this->rollbackProduct( $productId );
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

		$status = $this->normalizeStatus( $spec['status'] ?? null, 'draft' );

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

		// Parent SKU (optional on variable products)
		$parentSku = isset( $spec['sku'] ) ? trim( (string) $spec['sku'] ) : '';
		if ( $parentSku !== '' ) {
			if ( function_exists( 'wc_get_product_id_by_sku' ) && wc_get_product_id_by_sku( $parentSku ) ) {
				return array( 'status' => 'rolled_back', 'reason' => 'sku_exists', 'detail' => array( 'sku' => $parentSku ) );
			}
			try {
				$product->set_sku( $parentSku );
			} catch ( \WC_Data_Exception $e ) {
				return array( 'status' => 'rolled_back', 'reason' => 'invalid_sku' );
			}
		}

		// Categories
		$categories = array_values( array_unique( $this->stringList( $spec['categories'] ?? array() ) ) );
		if ( $categories !== array() ) {
			$catIds = $this->resolveTermIds( $categories, 'product_cat' );
			if ( $catIds !== array() ) {
				$product->set_category_ids( $catIds );
			}
		}

		// Tags
		$tags = array_values( array_unique( $this->stringList( $spec['tags'] ?? array() ) ) );
		if ( $tags !== array() ) {
			$tagIds = $this->resolveTermIds( $tags, 'product_tag' );
			if ( $tagIds !== array() ) {
				$product->set_tag_ids( $tagIds );
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

		// Build the set of valid variation-enabled attribute slugs from the parent for key validation
		$validVariationSlugs = array();
		foreach ( $wooAttributes as $wooAttr ) {
			if ( $wooAttr->get_variation() ) {
				$validVariationSlugs[] = sanitize_title( $wooAttr->get_name() );
			}
		}

		// Default (pre-selected) variation attributes: {name, option} -> slug=>option
		if ( isset( $spec['default_attributes'] ) && is_array( $spec['default_attributes'] ) ) {
			$defaults = array();
			foreach ( $spec['default_attributes'] as $da ) {
				if ( ! is_array( $da ) ) {
					continue;
				}
				$dn = isset( $da['name'] ) ? (string) $da['name'] : '';
				$do = isset( $da['option'] ) ? (string) $da['option'] : '';
				if ( $dn === '' || $do === '' ) {
					continue;
				}
				$defaults[ sanitize_title( $dn ) ] = $do;
			}
			if ( $defaults !== array() ) {
				$product->set_default_attributes( $defaults );
			}
		}

		// Images: featured + gallery. Accepts images[] ({src,alt}/{id}/url) or single image_url.
		$imageSpec = $this->collectImageSpec( $spec );
		if ( $imageSpec !== array() ) {
			$resolved = $this->resolveImages( $imageSpec, $name );
			if ( $resolved['featured'] > 0 ) {
				$product->set_image_id( $resolved['featured'] );
			}
			if ( $resolved['gallery'] !== array() ) {
				$product->set_gallery_image_ids( $resolved['gallery'] );
			}
		}

		// Every other writable scalar/structured field on the parent.
		$fieldErr = $this->applyCommonFields( $product, $spec, false );
		if ( $fieldErr !== '' ) {
			return array( 'status' => 'rolled_back', 'reason' => $fieldErr );
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

		// SEO + arbitrary meta + brand terms (need the saved post id).
		$seo = ( isset( $spec['seo'] ) && is_array( $spec['seo'] ) ) ? $spec['seo'] : array();
		$this->applySeo( $parentId, $seo );
		$this->applyMetaData( $parentId, $spec['meta_data'] ?? null );
		$this->applyBrands( $parentId, $spec['brands'] ?? null );

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

			if ( $vPrice === '' || ! $this->isPlainPrice( $vPrice ) ) {
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
			$variation->set_status( $this->normalizeStatus( $vSpec['status'] ?? null, 'publish' ) ); // publish so it is selectable
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

			// Per-variation image (featured only — WC variations have one image)
			if ( isset( $vSpec['image'] ) ) {
				$vImgSpec = $this->collectImageSpec( array( 'images' => array( $vSpec['image'] ) ) );
				if ( $vImgSpec !== array() ) {
					$vResolved = $this->resolveImages( $vImgSpec, $name );
					if ( $vResolved['featured'] > 0 ) {
						$variation->set_image_id( $vResolved['featured'] );
					}
				}
			}

			// Every other writable scalar/structured field on the variation.
			$vFieldErr = $this->applyCommonFields( $variation, $vSpec, true );
			if ( $vFieldErr !== '' ) {
				$this->rollbackProduct( $parentId );
				return array( 'status' => 'rolled_back', 'reason' => $vFieldErr );
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
			$vId = (int) $vId;
			// Arbitrary per-variation meta (needs the saved variation id).
			$this->applyMetaData( $vId, $vSpec['meta_data'] ?? null );
			$variationIds[] = $vId;
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

	// -------------------------------------------------------------------------
	// Shared field application (purely additive — only touches present fields)
	// -------------------------------------------------------------------------

	/**
	 * Apply every writable scalar/structured field shared by products and variations. WC_Product_Variation
	 * extends WC_Product so the setters are common; parent-only fields are skipped when $isVariation.
	 *
	 * @param \WC_Product $product (or \WC_Product_Variation)
	 * @param array<string,mixed> $spec
	 * @return string '' on success, or a reason code on a hard validation failure (caller rolls back).
	 */
	private function applyCommonFields( $product, array $spec, bool $isVariation ): string {
		// --- pricing: sale price + sale window ---
		if ( isset( $spec['sale_price'] ) && (string) $spec['sale_price'] !== '' ) {
			$sale = (string) $spec['sale_price'];
			if ( ! $this->isPlainPrice( $sale ) ) {
				return 'sale_price_not_numeric';
			}
			$saleFmt = function_exists( 'wc_format_decimal' ) ? (string) wc_format_decimal( $sale ) : $sale;
			// A sale price >= regular price is silently dropped by WC at read time, so the requested sale
			// would never take while status=committed. Reject it up-front (the regular price is already on
			// the object — set before applyCommonFields in every create path). Skip when no regular price is
			// known, e.g. a variable PARENT, where sale_price is meaningless anyway.
			$reg = (string) $product->get_regular_price();
			if ( $reg !== '' && (float) $saleFmt >= (float) $reg ) {
				return 'sale_price_not_below_regular';
			}
			$product->set_sale_price( $saleFmt );
		}
		if ( isset( $spec['date_on_sale_from'] ) && (string) $spec['date_on_sale_from'] !== '' ) {
			$product->set_date_on_sale_from( (string) $spec['date_on_sale_from'] );
		}
		if ( isset( $spec['date_on_sale_to'] ) && (string) $spec['date_on_sale_to'] !== '' ) {
			$product->set_date_on_sale_to( (string) $spec['date_on_sale_to'] );
		}

		// --- slug / global unique id ---
		if ( isset( $spec['slug'] ) && (string) $spec['slug'] !== '' ) {
			$product->set_slug( sanitize_title( (string) $spec['slug'] ) );
		}
		if ( isset( $spec['global_unique_id'] ) && method_exists( $product, 'set_global_unique_id' ) ) {
			// Newer WC only; ignore the value if it fails validation rather than fataling.
			try {
				$product->set_global_unique_id( (string) $spec['global_unique_id'] );
			} catch ( \Throwable $e ) {
				// non-fatal: leave unset
			}
		}

		// --- tax ---
		if ( isset( $spec['tax_status'] ) && in_array( $spec['tax_status'], array( 'taxable', 'shipping', 'none' ), true ) ) {
			$product->set_tax_status( (string) $spec['tax_status'] );
		}
		if ( isset( $spec['tax_class'] ) ) {
			$product->set_tax_class( (string) $spec['tax_class'] );
		}

		// --- stock ---
		if ( isset( $spec['manage_stock'] ) ) {
			if ( $isVariation && $spec['manage_stock'] === 'parent' ) {
				$product->set_manage_stock( 'parent' );
			} else {
				$product->set_manage_stock( (bool) $spec['manage_stock'] );
			}
		}
		if ( isset( $spec['stock_quantity'] ) && (string) $spec['stock_quantity'] !== '' && is_numeric( $spec['stock_quantity'] ) ) {
			$product->set_stock_quantity( (int) $spec['stock_quantity'] );
		}
		if ( isset( $spec['stock_status'] ) && in_array( $spec['stock_status'], array( 'instock', 'outofstock', 'onbackorder' ), true ) ) {
			$product->set_stock_status( (string) $spec['stock_status'] );
		}
		if ( isset( $spec['backorders'] ) && in_array( $spec['backorders'], array( 'no', 'notify', 'yes' ), true ) ) {
			$product->set_backorders( (string) $spec['backorders'] );
		}

		// --- shipping / physical ---
		if ( isset( $spec['weight'] ) && (string) $spec['weight'] !== '' ) {
			$product->set_weight( (string) $spec['weight'] );
		}
		if ( isset( $spec['dimensions'] ) && is_array( $spec['dimensions'] ) ) {
			$d = $spec['dimensions'];
			if ( isset( $d['length'] ) && (string) $d['length'] !== '' ) {
				$product->set_length( (string) $d['length'] );
			}
			if ( isset( $d['width'] ) && (string) $d['width'] !== '' ) {
				$product->set_width( (string) $d['width'] );
			}
			if ( isset( $d['height'] ) && (string) $d['height'] !== '' ) {
				$product->set_height( (string) $d['height'] );
			}
		}
		if ( isset( $spec['shipping_class'] ) && (string) $spec['shipping_class'] !== '' ) {
			$scSlug = (string) $spec['shipping_class'];
			$term   = get_term_by( 'slug', $scSlug, 'product_shipping_class' );
			if ( $term && ! is_wp_error( $term ) ) {
				$product->set_shipping_class_id( (int) $term->term_id );
			} else {
				// Auto-create the shipping class (same policy as categories/tags) so a requested class
				// actually lands instead of being silently dropped while status=committed.
				$created = wp_insert_term( $scSlug, 'product_shipping_class', array( 'slug' => $scSlug ) );
				if ( ! is_wp_error( $created ) && isset( $created['term_id'] ) ) {
					$product->set_shipping_class_id( (int) $created['term_id'] );
				} elseif ( is_wp_error( $created ) && $created->get_error_code() === 'term_exists' ) {
					$existingId = (int) $created->get_error_data();
					if ( $existingId > 0 ) {
						$product->set_shipping_class_id( $existingId );
					}
				}
			}
		}

		// --- virtual / downloadable ---
		if ( isset( $spec['virtual'] ) ) {
			$product->set_virtual( (bool) $spec['virtual'] );
		}
		if ( isset( $spec['downloadable'] ) ) {
			$product->set_downloadable( (bool) $spec['downloadable'] );
		}
		if ( isset( $spec['download_limit'] ) && is_numeric( $spec['download_limit'] ) ) {
			$product->set_download_limit( (int) $spec['download_limit'] );
		}
		if ( isset( $spec['download_expiry'] ) && is_numeric( $spec['download_expiry'] ) ) {
			$product->set_download_expiry( (int) $spec['download_expiry'] );
		}
		if ( isset( $spec['downloads'] ) && is_array( $spec['downloads'] ) && class_exists( '\WC_Product_Download' ) ) {
			$downloads = array();
			foreach ( $spec['downloads'] as $dl ) {
				if ( is_array( $dl ) && ! empty( $dl['file'] ) ) {
					$obj = new \WC_Product_Download();
					$obj->set_name( isset( $dl['name'] ) ? (string) $dl['name'] : '' );
					$obj->set_file( (string) $dl['file'] );
					if ( ! empty( $dl['id'] ) ) {
						$obj->set_id( (string) $dl['id'] );
					}
					$downloads[] = $obj;
				}
			}
			if ( $downloads !== array() ) {
				$product->set_downloads( $downloads );
			}
		}

		// --- misc shared ---
		if ( isset( $spec['menu_order'] ) && is_numeric( $spec['menu_order'] ) ) {
			$product->set_menu_order( (int) $spec['menu_order'] );
		}
		// Variation description (parent description is set explicitly in each create path).
		if ( $isVariation && isset( $spec['description'] ) && (string) $spec['description'] !== '' ) {
			$product->set_description( wp_slash( (string) $spec['description'] ) );
		}

		// --- parent-only fields (variations don't expose these) ---
		if ( ! $isVariation ) {
			if ( isset( $spec['featured'] ) ) {
				$product->set_featured( (bool) $spec['featured'] );
			}
			if ( isset( $spec['catalog_visibility'] ) && in_array( $spec['catalog_visibility'], array( 'visible', 'catalog', 'search', 'hidden' ), true ) ) {
				$product->set_catalog_visibility( (string) $spec['catalog_visibility'] );
			}
			if ( isset( $spec['sold_individually'] ) ) {
				$product->set_sold_individually( (bool) $spec['sold_individually'] );
			}
			if ( isset( $spec['reviews_allowed'] ) ) {
				$product->set_reviews_allowed( (bool) $spec['reviews_allowed'] );
			}
			if ( isset( $spec['purchase_note'] ) ) {
				$product->set_purchase_note( wp_slash( (string) $spec['purchase_note'] ) );
			}
			if ( isset( $spec['upsell_ids'] ) && is_array( $spec['upsell_ids'] ) ) {
				$product->set_upsell_ids( array_map( 'intval', $spec['upsell_ids'] ) );
			}
			if ( isset( $spec['cross_sell_ids'] ) && is_array( $spec['cross_sell_ids'] ) ) {
				$product->set_cross_sell_ids( array_map( 'intval', $spec['cross_sell_ids'] ) );
			}
		}

		return '';
	}

	/** Write Rank Math SEO meta if provided. @param array<string,mixed> $seo */
	private function applySeo( int $postId, array $seo ): void {
		if ( isset( $seo['focus_keyword'] ) ) {
			update_post_meta( $postId, 'rank_math_focus_keyword', sanitize_text_field( (string) $seo['focus_keyword'] ) );
		}
		if ( isset( $seo['description'] ) ) {
			update_post_meta( $postId, 'rank_math_description', sanitize_text_field( (string) $seo['description'] ) );
		}
		if ( isset( $seo['title'] ) ) {
			update_post_meta( $postId, 'rank_math_title', sanitize_text_field( (string) $seo['title'] ) );
		}
	}

	/**
	 * Write arbitrary meta_data[]{key,value}. Keys are restricted to a safe charset (preserves case,
	 * allows leading underscore for WC-internal keys); values pass through unchanged (scalar or array).
	 *
	 * @param mixed $metaData
	 */
	private function applyMetaData( int $postId, $metaData ): void {
		if ( ! is_array( $metaData ) ) {
			return;
		}
		// WC manages these via dedicated setters (set_price / set_stock / ...). Writing them raw here
		// would bypass read-back verify and corrupt the state WC just computed — block them outright.
		$reserved = array(
			'_price', '_regular_price', '_sale_price', '_stock', '_stock_status', '_sku',
			'_manage_stock', '_weight', '_length', '_width', '_height', '_backorders',
		);
		foreach ( $metaData as $m ) {
			if ( is_array( $m ) && isset( $m['key'] ) && array_key_exists( 'value', $m ) ) {
				$rawKey = (string) $m['key'];
				$key    = preg_replace( '/[^A-Za-z0-9_\-]/', '', $rawKey );
				// Skip empty, WC-reserved, or keys whose sanitization changed them (a changed key could
				// silently collide with another requested key — drop rather than overwrite the wrong meta).
				if ( $key === '' || $key !== $rawKey || in_array( $key, $reserved, true ) ) {
					continue;
				}
				update_post_meta( $postId, $key, $m['value'] );
			}
		}
	}

	/**
	 * Assign brand terms (taxonomy product_brand) by NAME, creating missing terms. No-op if the
	 * brand taxonomy isn't registered (WC Brands not active). @param mixed $brands
	 */
	private function applyBrands( int $postId, $brands ): void {
		if ( ! is_array( $brands ) || ! taxonomy_exists( 'product_brand' ) ) {
			return;
		}
		$names = array();
		foreach ( $brands as $b ) {
			if ( is_string( $b ) && trim( $b ) !== '' ) {
				$names[] = trim( $b );
			} elseif ( is_array( $b ) && isset( $b['name'] ) && trim( (string) $b['name'] ) !== '' ) {
				$names[] = trim( (string) $b['name'] );
			}
		}
		if ( $names === array() ) {
			return;
		}
		$ids = $this->resolveTermIds( array_values( array_unique( $names ) ), 'product_brand' );
		if ( $ids !== array() ) {
			wp_set_object_terms( $postId, $ids, 'product_brand' );
		}
	}

	/**
	 * Collect an image spec list from either images[] (preferred) or the single image_url alias.
	 * Each item may be a url string, {src,alt,name}, or {id} (existing attachment).
	 *
	 * @param array<string,mixed> $spec
	 * @return array<int,mixed>
	 */
	private function collectImageSpec( array $spec ): array {
		if ( isset( $spec['images'] ) && is_array( $spec['images'] ) && $spec['images'] !== array() ) {
			return array_values( $spec['images'] );
		}
		if ( isset( $spec['image_url'] ) && trim( (string) $spec['image_url'] ) !== '' ) {
			return array( trim( (string) $spec['image_url'] ) );
		}
		return array();
	}

	/**
	 * Sideload an images[] list into the media library. First resolved id is the featured image,
	 * the rest are the gallery. {id} items reuse an existing attachment without re-downloading.
	 *
	 * @param array<int,mixed> $images
	 * @return array{featured:int,gallery:int[]}
	 */
	private function resolveImages( array $images, string $fallbackAlt ): array {
		$loader = new MediaSideloader();
		$ids    = array();
		foreach ( $images as $img ) {
			$src = '';
			$alt = $fallbackAlt;
			if ( is_string( $img ) ) {
				$src = trim( $img );
			} elseif ( is_array( $img ) ) {
				if ( ! empty( $img['id'] ) ) {
					$ids[] = (int) $img['id'];
					continue;
				}
				$src = isset( $img['src'] ) ? trim( (string) $img['src'] ) : '';
				$alt = isset( $img['alt'] ) ? (string) $img['alt'] : $fallbackAlt;
			}
			if ( $src === '' ) {
				continue;
			}
			$media = $loader->sideload( $src, $alt );
			if ( $media ) {
				$ids[] = (int) $media['id'];
			}
		}
		if ( $ids === array() ) {
			return array( 'featured' => 0, 'gallery' => array() );
		}
		$featured = (int) array_shift( $ids );
		return array( 'featured' => $featured, 'gallery' => array_values( $ids ) );
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

	/** Validate a price string: plain non-negative decimal, no scientific notation. */
	private function isPlainPrice( string $v ): bool {
		return is_numeric( $v ) && stripos( $v, 'e' ) === false && (float) $v >= 0;
	}

	/** Normalize a post/variation status to a known value, else the supplied default. */
	private function normalizeStatus( $status, string $default ): string {
		return ( is_string( $status ) && in_array( $status, array( 'draft', 'pending', 'private', 'publish' ), true ) )
			? $status
			: $default;
	}

	/**
	 * Resolve a list of term NAMES to term IDs in $taxonomy, creating any missing terms.
	 *
	 * @param string[] $names
	 * @return int[]
	 */
	private function resolveTermIds( array $names, string $taxonomy ): array {
		$ids = array();
		foreach ( array_values( array_unique( $names ) ) as $name ) {
			$term = term_exists( $name, $taxonomy );
			if ( ! $term ) {
				$term = wp_insert_term( $name, $taxonomy );
			}
			if ( is_wp_error( $term ) ) {
				// Benign race: a concurrent request created the term between our check and insert.
				// wp_insert_term returns a 'term_exists' WP_Error whose data is the existing term_id —
				// recover it instead of dropping the term (which would later trip categories_incomplete).
				if ( $term->get_error_code() === 'term_exists' ) {
					$existingId = (int) $term->get_error_data();
					if ( $existingId > 0 ) {
						$ids[] = $existingId;
					}
				}
				continue;
			}
			if ( isset( $term['term_id'] ) ) {
				$ids[] = (int) $term['term_id'];
			}
		}
		return $ids;
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
