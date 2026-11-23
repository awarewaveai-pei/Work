<?php
/**
 * WP-free units for P2: the vault never stores plaintext and only opens a blob under its own key and
 * context; Record accepts exactly the engine's birth input; cross-origin embedding cannot be stored.
 */

namespace AwareWave\Oracle\Tests;

use AwareWave\Oracle\Crypto\Vault;
use AwareWave\Oracle\Members\Record;
use AwareWave\Oracle\Settings\Normalize;
use PHPUnit\Framework\TestCase;

final class MembersUnitTest extends TestCase {

	/** @return array<string,mixed> */
	private static function body(): array {
		return array(
			'name'  => '阿明',
			'birth' => array(
				'calendar'  => 'solar',
				'year'      => 1873,
				'month'     => 11,
				'day'       => 29,
				'hour'      => 8,
				'minute'    => 5,
				'gender'    => '男',
				'place'     => array(
					'label' => '台北',
					'lat'   => 25.03,
					'lon'   => 121,
					'zone'  => 'Asia/Taipei',
				),
				'trueSolar' => true,
			),
		);
	}

	public function testVaultRoundTripHidesPlaintextAndBindsKeyAndContext(): void {
		$key  = Vault::keyFromBase64( Vault::newKeyBase64() );
		$data = Record::clean( self::body() );
		$blob = Vault::seal( $data, $key, 'charts:7' );
		$this->assertStringStartsWith( Vault::PREFIX, $blob );
		foreach ( array( '1873', '阿明', 'Asia/Taipei', '"year"' ) as $plain ) {
			$this->assertStringNotContainsString( $plain, $blob );
		}
		$this->assertSame( $data, Vault::open( $blob, $key, 'charts:7' ) );
		// Another member, the other table, another key, a flipped byte: nothing opens.
		$this->assertNull( Vault::open( $blob, $key, 'charts:8' ) );
		$this->assertNull( Vault::open( $blob, $key, 'persons:7' ) );
		$this->assertNull( Vault::open( $blob, Vault::keyFromBase64( Vault::newKeyBase64() ), 'charts:7' ) );
		$raw            = base64_decode( substr( $blob, 3 ), true );
		$raw[ strlen( $raw ) - 1 ] = chr( ord( $raw[ strlen( $raw ) - 1 ] ) ^ 1 );
		$this->assertNull( Vault::open( Vault::PREFIX . base64_encode( $raw ), $key, 'charts:7' ) );
		$this->assertNull( Vault::open( '{"name":"x"}', $key, 'charts:7' ) );
	}

	public function testVaultRefusesBadKeys(): void {
		$this->assertSame( '', Vault::keyFromBase64( base64_encode( str_repeat( 'k', 31 ) ) ) );
		$this->assertSame( '', Vault::keyFromBase64( 'not base64!' ) );
		$this->expectException( \InvalidArgumentException::class );
		Vault::seal( array( 'a' => 1 ), '', 'charts:1' );
	}

	public function testRecordKeepsOnlyEngineBirthFields(): void {
		$in                   = self::body();
		$in['extra']          = 'dropped';
		$in['birth']['isLeapMonth'] = true; // solar: no leap month
		$in['birth']['hacker'] = '<script>';
		$errors               = array();
		$out                  = Record::clean( $in, $errors );
		$this->assertSame( array(), $errors );
		$this->assertSame( array( 'name', 'birth' ), array_keys( $out ) );
		$this->assertSame(
			array( 'calendar', 'year', 'month', 'day', 'hour', 'minute', 'gender', 'place', 'trueSolar', 'dayDivide', 'isLeapMonth' ),
			array_keys( $out['birth'] )
		);
		$this->assertFalse( $out['birth']['isLeapMonth'] );
		$this->assertSame( 'current', $out['birth']['dayDivide'] );
		$this->assertSame( 121.0, $out['birth']['place']['lon'] );
	}

	public function testRecordRejectsWrongTypesAndImpossibleDates(): void {
		$cases = array(
			'name'              => array( 'name', '' ),
			'birth.year'        => array( 'birth.year', '1873' ),
			'birth.month'       => array( 'birth.month', 13 ),
			'birth.gender'      => array( 'birth.gender', 'M' ),
			'birth.place.zone'  => array( 'birth.place.zone', '+08:00' ),
			'birth.place.lat'   => array( 'birth.place.lat', 91 ),
			'birth.trueSolar'   => array( 'birth.trueSolar', 'yes' ),
			'birth.calendar'    => array( 'birth.calendar', 'julian' ),
		);
		foreach ( $cases as $expect => $change ) {
			$in   = self::body();
			$path = explode( '.', $change[0] );
			$ref  = &$in;
			foreach ( $path as $p ) {
				$ref = &$ref[ $p ];
			}
			$ref    = $change[1];
			unset( $ref );
			$errors = array();
			$this->assertNull( Record::clean( $in, $errors ), $expect );
			$this->assertContains( $expect, $errors, $expect );
		}
		$in                   = self::body();
		$in['birth']['month'] = 2;
		$in['birth']['day']   = 30;
		$errors               = array();
		$this->assertNull( Record::clean( $in, $errors ) );
		$this->assertSame( array( 'birth.day' ), $errors );
		$in['birth']['calendar'] = 'lunar'; // lunar 2/30 exists
		$this->assertNotNull( Record::clean( $in, $errors ) );
		$this->assertNull( Record::clean( 'x', $errors ) );
		$this->assertNull( Record::clean( array( 'name' => "\xC3", 'birth' => self::body()['birth'] ), $errors ) );
	}

	public function testCrossOriginCannotBeStored(): void {
		$errors = array();
		$out    = Normalize::settings( array( 'embed' => 'cross-origin', 'browser_engine_url' => 'https://e.example.com' ), $errors );
		$this->assertSame( Normalize::EMBED_SAME_ORIGIN, $out['embed'] );
		$this->assertSame( array( array( 'cross_unsupported', '' ) ), $errors );
	}
}
