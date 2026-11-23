<?php
/**
 * The daily letter's subject and HTML body, built only from the engine's computed result for one subscriber
 * (system "daily", ziwei-doushu lib/daily.ts DailyFortune; §7-2: no AI text). WP-free, unit-tested.
 *
 * Invariant: anything missing or of the wrong type → null, and the caller sends nothing (never an empty or
 * half letter). Every engine value is HTML-escaped and stripped of "{{" / "}}" so FluentCRM's smartcode
 * parser cannot read engine text as a placeholder. Labels arrive already translated (the caller switches
 * to the subscriber's language), so this class has no WordPress dependency.
 *
 * @package AwareWave\Oracle\Daily
 */

namespace AwareWave\Oracle\Daily;

final class Letter {

	const SCORES = array( 'overall', 'love', 'career', 'wealth', 'health' );

	/**
	 * @param mixed                $data   one batch result's "data"
	 * @param array<string,string> $labels subject (with %s for the date), intro, scores.<key>, luckyColors,
	 *                                     luckyNumbers, luckyDirection, yi, ji, footer, sep (list separator)
	 * @return array{subject:string,html:string}|null
	 */
	public static function build( $data, string $date, array $labels ): ?array {
		if ( ! is_array( $data ) || ( $data['date'] ?? null ) !== $date ) {
			return null;
		}
		$scores = $data['scores'] ?? null;
		if ( ! is_array( $scores ) ) {
			return null;
		}
		foreach ( self::SCORES as $k ) {
			if ( ! is_int( $scores[ $k ] ?? null ) || $scores[ $k ] < 1 || $scores[ $k ] > 5 ) {
				return null;
			}
		}
		$sep       = $labels['sep'] ?? '、';
		$colors    = self::list( $data['luckyColors'] ?? null, $sep );
		$numbers   = self::list( $data['luckyNumbers'] ?? null, $sep );
		$direction = is_string( $data['luckyDirection'] ?? null ) ? self::text( $data['luckyDirection'] ) : '';
		$yi        = self::list( $data['yi'] ?? null, $sep, true );
		$ji        = self::list( $data['ji'] ?? null, $sep, true );
		if ( $colors === null || $numbers === null || $yi === null || $ji === null || $colors === '' || $numbers === '' || $direction === '' ) {
			return null;
		}

		$e    = static function ( string $s ): string {
			return htmlspecialchars( $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' );
		};
		$rows = '';
		foreach ( self::SCORES as $k ) {
			$n     = $scores[ $k ];
			$rows .= '<tr><td style="padding:4px 12px 4px 0">' . $e( $labels[ 'scores.' . $k ] ?? $k ) . '</td><td style="padding:4px 0;letter-spacing:2px">'
				. str_repeat( '★', $n ) . str_repeat( '☆', 5 - $n ) . '</td></tr>';
		}
		$line = static function ( string $label, string $value ) use ( $e ): string {
			return '<p style="margin:6px 0"><strong>' . $e( $label ) . '</strong> ' . $e( $value ) . '</p>';
		};
		$html = '<p>' . $e( $labels['intro'] ?? '' ) . '</p>'
			. '<table role="presentation" style="border-collapse:collapse;margin:8px 0 12px">' . $rows . '</table>'
			. $line( $labels['luckyColors'] ?? '', $colors )
			. $line( $labels['luckyNumbers'] ?? '', $numbers )
			. $line( $labels['luckyDirection'] ?? '', $direction )
			. $line( $labels['yi'] ?? '', $yi === '' ? '—' : $yi )
			. $line( $labels['ji'] ?? '', $ji === '' ? '—' : $ji )
			. '<p style="margin-top:16px;font-size:13px;opacity:.75">' . $e( $labels['footer'] ?? '' ) . '</p>';

		return array(
			'subject' => sprintf( $labels['subject'] ?? '%s', $date ),
			'html'    => $html,
		);
	}

	/**
	 * Strings or integers joined with $sep; null when not a list of those. $mayBeEmpty: an empty list is ''.
	 *
	 * @param mixed $v
	 */
	private static function list( $v, string $sep, bool $mayBeEmpty = false ): ?string {
		if ( ! is_array( $v ) || ( ! $mayBeEmpty && ! $v ) ) {
			return null;
		}
		$out = array();
		foreach ( $v as $item ) {
			if ( ! is_string( $item ) && ! is_int( $item ) ) {
				return null;
			}
			$t = self::text( (string) $item );
			if ( $t !== '' ) {
				$out[] = $t;
			}
		}
		return implode( $sep, $out );
	}

	private static function text( string $s ): string {
		return trim( str_replace( array( '{{', '}}' ), '', $s ) );
	}
}
