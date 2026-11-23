<?php
/**
 * What a saved chart or saved person may contain (WP-free, unit-tested). The birth fields are the engine's
 * shared birth input (ziwei-doushu lib/divination/fields.ts BIRTH_FIELDS: calendar, year…minute,
 * isLeapMonth, gender, place {label, lat, lon, zone}, trueSolar, dayDivide), so a stored record can be
 * handed to any tool unchanged. Change both sides together.
 *
 * Only clean() decides what is stored: unknown keys are dropped, every value is type-checked, nothing is
 * coerced from a wrong type.
 *
 * @package AwareWave\Oracle\Members
 */

namespace AwareWave\Oracle\Members;

final class Record {

	/** Same range as the engine (lib/divination/input.ts YEAR_MIN, YEAR_MAX). */
	const YEAR_MIN    = 1800;
	const YEAR_MAX    = 2200;
	const NAME_MAX    = 100;
	const CALENDARS   = array( 'solar', 'lunar' );
	const GENDERS     = array( '男', '女' );
	const DAY_DIVIDES = array( 'current', 'forward' );

	/**
	 * @param mixed             $in     decoded JSON body: { name, birth: {...} }
	 * @param array<int,string> $errors field paths that failed, e.g. "birth.month"
	 * @return array{name:string,birth:array<string,mixed>}|null null when anything failed
	 */
	public static function clean( $in, array &$errors = array() ): ?array {
		$errors = array();
		if ( ! is_array( $in ) ) {
			$errors[] = 'body';
			return null;
		}
		$name = self::text( $in['name'] ?? null, self::NAME_MAX );
		if ( $name === null || $name === '' ) {
			$errors[] = 'name';
		}
		$birth = self::cleanBirth( $in['birth'] ?? null, $errors );
		if ( $birth === null || $errors ) {
			return null;
		}
		return array(
			'name'  => $name,
			'birth' => $birth,
		);
	}

	/**
	 * The birth part alone (also the daily letter's input). Appends failing paths to $errors.
	 *
	 * @param mixed             $b
	 * @param array<int,string> $errors
	 * @return array<string,mixed>|null
	 */
	public static function cleanBirth( $b, array &$errors ): ?array {
		if ( ! is_array( $b ) ) {
			$errors[] = 'birth';
			return null;
		}
		$before            = count( $errors );
		$birth             = array();
		$birth['calendar'] = self::oneOf( $b['calendar'] ?? null, self::CALENDARS, 'birth.calendar', $errors );
		$birth['year']     = self::int( $b['year'] ?? null, self::YEAR_MIN, self::YEAR_MAX, 'birth.year', $errors );
		$birth['month']    = self::int( $b['month'] ?? null, 1, 12, 'birth.month', $errors );
		$birth['day']      = self::int( $b['day'] ?? null, 1, 31, 'birth.day', $errors );
		$birth['hour']     = self::int( $b['hour'] ?? null, 0, 23, 'birth.hour', $errors );
		$birth['minute']   = self::int( $b['minute'] ?? null, 0, 59, 'birth.minute', $errors );
		$leap              = self::flag( $b['isLeapMonth'] ?? false, 'birth.isLeapMonth', $errors );
		$birth['gender']   = self::oneOf( $b['gender'] ?? null, self::GENDERS, 'birth.gender', $errors );
		$birth['place']    = self::place( $b['place'] ?? null, $errors );
		$birth['trueSolar'] = self::flag( $b['trueSolar'] ?? false, 'birth.trueSolar', $errors );
		$birth['dayDivide'] = self::oneOf( $b['dayDivide'] ?? 'current', self::DAY_DIVIDES, 'birth.dayDivide', $errors );

		// Leap month only exists in the lunar calendar; a lunar month has at most 30 days; a solar date must exist.
		$birth['isLeapMonth'] = $birth['calendar'] === 'lunar' && $leap === true;
		if ( is_int( $birth['year'] ) && is_int( $birth['month'] ) && is_int( $birth['day'] ) ) {
			$ok = $birth['calendar'] === 'lunar' ? $birth['day'] <= 30 : checkdate( $birth['month'], $birth['day'], $birth['year'] );
			if ( ! $ok ) {
				$errors[] = 'birth.day';
			}
		}
		return count( $errors ) > $before ? null : $birth;
	}

	/** @param mixed $v */
	private static function text( $v, int $max ): ?string {
		if ( ! is_string( $v ) ) {
			return null;
		}
		// Control characters (line breaks included), zero-width and bidi-override characters out; then trim.
		// Invalid UTF-8 is refused, not repaired.
		if ( ! preg_match( '//u', $v ) ) {
			return null;
		}
		$v = trim( (string) preg_replace( '/[\x00-\x1F\x7F\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]/u', '', $v ) );
		return mb_strlen( $v, 'UTF-8' ) <= $max ? $v : null;
	}

	/**
	 * @param mixed             $v
	 * @param array<int,string> $allowed
	 * @param array<int,string> $errors
	 */
	private static function oneOf( $v, array $allowed, string $path, array &$errors ): ?string {
		if ( is_string( $v ) && in_array( $v, $allowed, true ) ) {
			return $v;
		}
		$errors[] = $path;
		return null;
	}

	/**
	 * @param mixed             $v
	 * @param array<int,string> $errors
	 */
	private static function int( $v, int $min, int $max, string $path, array &$errors ): ?int {
		if ( is_int( $v ) && $v >= $min && $v <= $max ) {
			return $v;
		}
		$errors[] = $path;
		return null;
	}

	/**
	 * @param mixed             $v
	 * @param array<int,string> $errors
	 */
	private static function flag( $v, string $path, array &$errors ): ?bool {
		if ( is_bool( $v ) ) {
			return $v;
		}
		$errors[] = $path;
		return null;
	}

	/**
	 * @param mixed             $p
	 * @param array<int,string> $errors
	 * @return array{label:string,lat:float,lon:float,zone:string}|null
	 */
	private static function place( $p, array &$errors ): ?array {
		if ( ! is_array( $p ) ) {
			$errors[] = 'birth.place';
			return null;
		}
		$label = self::text( $p['label'] ?? '', self::NAME_MAX );
		if ( $label === null ) {
			$errors[] = 'birth.place.label';
		}
		$lat = $p['lat'] ?? null;
		$lon = $p['lon'] ?? null;
		if ( ! ( is_int( $lat ) || is_float( $lat ) ) || ! is_finite( (float) $lat ) || abs( (float) $lat ) > 90 ) {
			$errors[] = 'birth.place.lat';
		}
		if ( ! ( is_int( $lon ) || is_float( $lon ) ) || ! is_finite( (float) $lon ) || abs( (float) $lon ) > 180 ) {
			$errors[] = 'birth.place.lon';
		}
		$zone = $p['zone'] ?? null;
		if ( ! is_string( $zone ) || ! self::isTimeZone( $zone ) ) {
			$errors[] = 'birth.place.zone';
		}
		return array(
			'label' => (string) $label,
			'lat'   => (float) $lat,
			'lon'   => (float) $lon,
			'zone'  => is_string( $zone ) ? $zone : '',
		);
	}

	/** IANA zone names only (Asia/Taipei, UTC); not offsets like +08:00 or abbreviations like CST. */
	public static function isTimeZone( string $zone ): bool {
		static $known = null;
		if ( $known === null ) {
			$known = array_flip( \DateTimeZone::listIdentifiers( \DateTimeZone::ALL_WITH_BC ) );
		}
		return isset( $known[ $zone ] );
	}
}
