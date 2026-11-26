<?php
/**
 * The birthplace picker shared by the signup form and the member forms (assets/birthplace.js): a city search
 * on the engine's own GeoNames data (GET /api/v1/places → {places: [{label, lat, lon, zone}]}, ziwei-doushu
 * lib/places/http.ts), the same choice every engine tool offers. Nobody types coordinates.
 *
 * Default when nothing is picked: the main city of the browser's time zone (looked up by the same search),
 * else fallback(). It is always shown and can be changed.
 *
 * @package AwareWave\Oracle\Places
 */

namespace AwareWave\Oracle\Places;

use AwareWave\Oracle\Embed\Renderer;
use AwareWave\Oracle\Settings\Normalize;
use AwareWave\Oracle\Settings\Options;

final class Birthplace {

	const SCRIPT      = 'aworacle-birthplace';
	const SEARCH_PATH = '/api/v1/places';

	/** @var bool */
	private static $configured = false;

	/**
	 * Same city and coordinates as the engine's default (ziwei-doushu components/PlaceField.tsx TAIPEI).
	 *
	 * @return array{label:string,lat:float,lon:float,zone:string}
	 */
	public static function fallback( string $locale ): array {
		return array(
			'label' => $locale === 'zh-TW' ? '台北' : 'Taipei',
			'lat'   => 25.03,
			'lon'   => 121.5,
			'zone'  => 'Asia/Taipei',
		);
	}

	/** Enqueues the picker (once) and returns its handle, for the form script to depend on. */
	public static function enqueue(): string {
		wp_enqueue_script( self::SCRIPT, AWORACLE_URL . 'assets/birthplace.js', array(), AWORACLE_VERSION, true );
		if ( self::$configured ) {
			return self::SCRIPT;
		}
		self::$configured = true;
		$s      = Options::get();
		$locale = Renderer::locale();
		$config = array(
			// Same-origin: the reverse proxy sends /api/ to the engine, like /embed/.
			'url'      => $s['embed'] === Normalize::EMBED_CROSS_ORIGIN ? esc_url_raw( $s['browser_engine_url'] . self::SEARCH_PATH ) : self::SEARCH_PATH,
			'locale'   => $locale,
			'fallback' => self::fallback( $locale ),
			'labels'   => array(
				'search'    => __( 'Born somewhere else? Type a city name', 'aware-wave-oracle' ),
				'searching' => __( 'Searching…', 'aware-wave-oracle' ),
				'none'      => __( 'No city found. Try a larger city nearby.', 'aware-wave-oracle' ),
				'failed'    => __( 'City search is not working right now. Try again later.', 'aware-wave-oracle' ),
				'credit'    => __( 'City data: GeoNames (CC BY 4.0)', 'aware-wave-oracle' ),
			),
		);
		wp_add_inline_script( self::SCRIPT, 'window.AWORACLE_PLACE=' . wp_json_encode( $config ) . ';', 'before' );
		return self::SCRIPT;
	}
}
