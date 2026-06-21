<?php
/**
 * ShippingProfileManager — applies WooCommerce shipping zones/classes from a small declarative
 * profile. This is for POD flat-rate profiles derived from Printful cost tables.
 *
 * @package AwareWave\WpBridge\Woo
 */

namespace AwareWave\WpBridge\Woo;

final class ShippingProfileManager {

	/**
	 * @param array<string,mixed> $spec
	 * @return array<string,mixed>
	 */
	public function apply( array $spec ): array {
		if ( ! class_exists( '\WC_Shipping_Zones' ) || ! class_exists( '\WC_Shipping_Zone' ) ) {
			return array( 'status' => 'rolled_back', 'reason' => 'woocommerce_not_active' );
		}

		$profile = isset( $spec['profile'] ) ? sanitize_key( (string) $spec['profile'] ) : '';
		if ( $profile === '' ) {
			return array( 'status' => 'rolled_back', 'reason' => 'profile_required' );
		}

		$classMap = $this->ensureShippingClasses( $spec['classes'] ?? array() );
		if ( isset( $classMap['error'] ) ) {
			return array( 'status' => 'rolled_back', 'reason' => $classMap['error'] );
		}

		$zones = isset( $spec['zones'] ) && is_array( $spec['zones'] ) ? $spec['zones'] : array();
		if ( $zones === array() ) {
			return array( 'status' => 'rolled_back', 'reason' => 'zones_required' );
		}

		$applied = array();
		foreach ( $zones as $zoneSpec ) {
			if ( ! is_array( $zoneSpec ) ) {
				return array( 'status' => 'rolled_back', 'reason' => 'invalid_zone' );
			}
			$r = $this->applyZone( $zoneSpec, $classMap );
			if ( ! empty( $r['error'] ) ) {
				return array( 'status' => 'rolled_back', 'reason' => (string) $r['error'], 'detail' => $r );
			}
			$applied[] = $r;
		}

		$verify = $this->verifyApplied( $applied );
		if ( $verify !== array() ) {
			return array( 'status' => 'rolled_back', 'reason' => 'verify_failed', 'detail' => array( 'problems' => $verify ) );
		}

		return array(
			'status'  => 'committed',
			'reason'  => 'ok',
			'profile' => $profile,
			'classes' => $classMap,
			'zones'   => $applied,
		);
	}

	/**
	 * @param mixed $classes
	 * @return array<string,int|string>
	 */
	private function ensureShippingClasses( $classes ): array {
		if ( ! is_array( $classes ) || $classes === array() ) {
			return array( 'error' => 'classes_required' );
		}

		$out = array();
		foreach ( $classes as $classSpec ) {
			if ( ! is_array( $classSpec ) ) {
				return array( 'error' => 'invalid_class' );
			}
			$slug = isset( $classSpec['slug'] ) ? sanitize_title( (string) $classSpec['slug'] ) : '';
			$name = isset( $classSpec['name'] ) && (string) $classSpec['name'] !== '' ? (string) $classSpec['name'] : $slug;
			if ( $slug === '' ) {
				return array( 'error' => 'class_slug_required' );
			}

			$term = get_term_by( 'slug', $slug, 'product_shipping_class' );
			if ( $term && ! is_wp_error( $term ) ) {
				$out[ $slug ] = (int) $term->term_id;
				continue;
			}

			$created = wp_insert_term( $name, 'product_shipping_class', array( 'slug' => $slug ) );
			if ( is_wp_error( $created ) ) {
				if ( $created->get_error_code() === 'term_exists' ) {
					$id = (int) $created->get_error_data();
					if ( $id > 0 ) {
						$out[ $slug ] = $id;
						continue;
					}
				}
				return array( 'error' => 'class_create_failed' );
			}
			if ( ! isset( $created['term_id'] ) ) {
				return array( 'error' => 'class_create_failed' );
			}
			$out[ $slug ] = (int) $created['term_id'];
		}

		return $out;
	}

	/**
	 * @param array<string,mixed> $zoneSpec
	 * @param array<string,int> $classMap
	 * @return array<string,mixed>
	 */
	private function applyZone( array $zoneSpec, array $classMap ): array {
		$name = isset( $zoneSpec['name'] ) ? trim( (string) $zoneSpec['name'] ) : '';
		if ( $name === '' ) {
			return array( 'error' => 'zone_name_required' );
		}

		$locations = $this->normalizeLocations( $zoneSpec['locations'] ?? array() );
		if ( $locations === array() ) {
			return array( 'error' => 'zone_locations_required', 'zone' => $name );
		}

		$zone = $this->findOrCreateZone( $name );
		$zone->set_zone_name( $name );
		$zone->set_locations( $locations );
		$zoneId = (int) $zone->save();

		$methods = isset( $zoneSpec['methods'] ) && is_array( $zoneSpec['methods'] ) ? $zoneSpec['methods'] : array();
		if ( $methods === array() ) {
			return array( 'error' => 'zone_methods_required', 'zone' => $name );
		}

		$appliedMethods = array();
		foreach ( $methods as $methodSpec ) {
			if ( ! is_array( $methodSpec ) ) {
				return array( 'error' => 'invalid_method', 'zone' => $name );
			}
			$m = $this->applyFlatRateMethod( $zoneId, $methodSpec, $classMap );
			if ( ! empty( $m['error'] ) ) {
				$m['zone'] = $name;
				return $m;
			}
			$appliedMethods[] = $m;
		}

		return array(
			'zone_id'   => $zoneId,
			'name'      => $name,
			'locations' => $locations,
			'methods'   => $appliedMethods,
		);
	}

	private function findOrCreateZone( string $name ) {
		$zones = \WC_Shipping_Zones::get_zones();
		foreach ( $zones as $zoneData ) {
			if ( isset( $zoneData['zone_name'], $zoneData['id'] ) && (string) $zoneData['zone_name'] === $name ) {
				return new \WC_Shipping_Zone( (int) $zoneData['id'] );
			}
		}
		$zone = new \WC_Shipping_Zone();
		$zone->set_zone_name( $name );
		return $zone;
	}

	/**
	 * @param mixed $locations
	 * @return array<int,array{code:string,type:string}>
	 */
	private function normalizeLocations( $locations ): array {
		if ( ! is_array( $locations ) ) {
			return array();
		}
		$out = array();
		foreach ( $locations as $loc ) {
			if ( ! is_array( $loc ) ) {
				continue;
			}
			$type = isset( $loc['type'] ) ? sanitize_key( (string) $loc['type'] ) : '';
			$code = isset( $loc['code'] ) ? strtoupper( trim( (string) $loc['code'] ) ) : '';
			if ( ! in_array( $type, array( 'country', 'state', 'postcode', 'continent' ), true ) || $code === '' ) {
				continue;
			}
			$out[] = array( 'code' => $code, 'type' => $type );
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $methodSpec
	 * @param array<string,int> $classMap
	 * @return array<string,mixed>
	 */
	private function applyFlatRateMethod( int $zoneId, array $methodSpec, array $classMap ): array {
		$methodId = isset( $methodSpec['method_id'] ) ? sanitize_key( (string) $methodSpec['method_id'] ) : '';
		if ( $methodId !== 'flat_rate' ) {
			return array( 'error' => 'only_flat_rate_supported' );
		}

		$zone       = new \WC_Shipping_Zone( $zoneId );
		$methods    = $zone->get_shipping_methods( true );
		$instanceId = 0;
		foreach ( $methods as $method ) {
			if ( isset( $method->id ) && $method->id === 'flat_rate' ) {
				$instanceId = (int) $method->instance_id;
				break;
			}
		}
		if ( $instanceId <= 0 ) {
			$instanceId = (int) $zone->add_shipping_method( 'flat_rate' );
		}
		if ( $instanceId <= 0 ) {
			return array( 'error' => 'flat_rate_create_failed' );
		}

		$title     = isset( $methodSpec['title'] ) && (string) $methodSpec['title'] !== '' ? (string) $methodSpec['title'] : 'Standard shipping';
		$taxStatus = isset( $methodSpec['tax_status'] ) && in_array( $methodSpec['tax_status'], array( 'taxable', 'none' ), true )
			? (string) $methodSpec['tax_status']
			: 'none';
		$cost = isset( $methodSpec['cost'] ) ? (string) $methodSpec['cost'] : '0';
		$type = isset( $methodSpec['calculation_type'] ) && in_array( $methodSpec['calculation_type'], array( 'class', 'order' ), true )
			? (string) $methodSpec['calculation_type']
			: 'class';

		$settings = array(
			'title'        => sanitize_text_field( $title ),
			'tax_status'   => $taxStatus,
			'cost'         => $this->sanitizeFormula( $cost ),
			'type'         => $type,
			'no_class_cost' => '',
		);

		$classCosts = isset( $methodSpec['class_costs'] ) && is_array( $methodSpec['class_costs'] ) ? $methodSpec['class_costs'] : array();
		foreach ( $classCosts as $slug => $formula ) {
			$slug = sanitize_title( (string) $slug );
			if ( ! isset( $classMap[ $slug ] ) ) {
				return array( 'error' => 'unknown_shipping_class', 'class' => $slug );
			}
			$settings[ 'class_cost_' . $classMap[ $slug ] ] = $this->sanitizeFormula( (string) $formula );
		}

		update_option( 'woocommerce_flat_rate_' . $instanceId . '_settings', $settings );

		$readback = get_option( 'woocommerce_flat_rate_' . $instanceId . '_settings', array() );
		return array(
			'instance_id' => $instanceId,
			'method_id'   => 'flat_rate',
			'settings'    => is_array( $readback ) ? $readback : array(),
		);
	}

	private function sanitizeFormula( string $formula ): string {
		$formula = trim( $formula );
		return preg_replace( '/[^0-9\.\+\-\*\/\(\)\[\] qtycostfeepercentmin_max"=]/', '', $formula );
	}

	/**
	 * @param array<int,array<string,mixed>> $applied
	 * @return array<int,string>
	 */
	private function verifyApplied( array $applied ): array {
		$problems = array();
		foreach ( $applied as $zone ) {
			if ( empty( $zone['zone_id'] ) ) {
				$problems[] = 'zone_id_missing';
				continue;
			}
			$z = new \WC_Shipping_Zone( (int) $zone['zone_id'] );
			if ( $z->get_zone_name() !== (string) $zone['name'] ) {
				$problems[] = 'zone_name_mismatch:' . (string) $zone['name'];
			}
			foreach ( $zone['methods'] as $method ) {
				if ( empty( $method['instance_id'] ) || empty( $method['settings']['title'] ) ) {
					$problems[] = 'method_settings_missing:' . (string) $zone['name'];
				}
			}
		}
		return $problems;
	}
}
