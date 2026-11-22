<?php
/**
 * WP-free units: the site key signs in the format the engine verifies; nothing builds an embed URL
 * from unchecked input; settings reject non-https browser URLs and malformed map lines; settings survive
 * a second sanitize pass (WordPress's first save); engine path prefixes are recognised.
 */

namespace AwareWave\Oracle\Tests;

use AwareWave\Oracle\Crypto\SiteKey;
use AwareWave\Oracle\Embed\EmbedUrl;
use AwareWave\Oracle\Embed\LocaleMap;
use AwareWave\Oracle\Engine\ToolList;
use AwareWave\Oracle\Settings\Normalize;
use PHPUnit\Framework\TestCase;

final class UnitTest extends TestCase {

	public function testSiteKeySignatureVerifiesWithPublishedPublicKey(): void {
		$kp   = SiteKey::newKeypair();
		$body = '{"system":"daily","items":[]}';
		$sig  = base64_decode( SiteKey::sign( $body, $kp ), true );
		$pem  = SiteKey::publicKeyPem( $kp );
		$der  = base64_decode( preg_replace( '/-----[A-Z ]+-----|\s/', '', $pem ), true );
		$this->assertSame( SiteKey::SPKI_PREFIX_HEX, bin2hex( substr( $der, 0, 12 ) ) );
		$this->assertTrue( sodium_crypto_sign_verify_detached( $sig, $body, substr( $der, 12 ) ) );
		$this->assertFalse( sodium_crypto_sign_verify_detached( $sig, $body . ' ', substr( $der, 12 ) ) );
		$this->assertTrue( SiteKey::usable( $kp ) );
		$this->assertFalse( SiteKey::usable( 'not-a-key' ) );
	}

	public function testBrowserUrlMustBeHttpsUnlessLocal(): void {
		$this->assertSame( 'https://engine.example.com', Normalize::engineUrl( ' https://Engine.example.com/ ', false ) );
		$this->assertSame( '', Normalize::engineUrl( 'http://engine.example.com', false ) );
		$this->assertSame( 'http://localhost:3000', Normalize::engineUrl( 'http://localhost:3000', false ) );
		$this->assertSame( 'http://oracle-web:3000', Normalize::engineUrl( 'http://oracle-web:3000', true ) );
		$this->assertSame( '', Normalize::engineUrl( 'https://x.example.com/?a=1', true ) );
		$this->assertSame( '', Normalize::engineUrl( 'javascript:alert(1)', true ) );
		$this->assertSame( '', Normalize::engineUrl( 'https://user:pw@x.example.com', true ) );
		// Default ports dropped: the browser reports https://x as a message origin, never https://x:443.
		$this->assertSame( 'https://x.example.com/base', Normalize::engineUrl( 'https://x.example.com:443/base', false ) );
		$this->assertSame( 'http://oracle-web', Normalize::engineUrl( 'http://oracle-web:80', true ) );
		$this->assertSame( 'https://x.example.com:8443', Normalize::engineUrl( 'https://x.example.com:8443', false ) );
	}

	public function testSignedRequestCarriesAudienceAndVerifies(): void {
		$kp  = SiteKey::newKeypair();
		$req = SiteKey::signedRequest( array( 'system' => 'ziwei', 'input' => array( 'y' => 1990 ) ), SiteKey::AUD_V1, 'oracle-main', $kp, 1700000000 );
		$body = json_decode( $req['body'], true );
		$this->assertSame( array( 'key_id', 'ts', 'nonce', 'aud', 'system', 'input' ), array_keys( $body ) );
		$this->assertSame( 'v1', $body['aud'] );
		$this->assertSame( 1700000000, $body['ts'] );
		$this->assertMatchesRegularExpression( '/^[A-Za-z0-9_-]{16,100}$/', $body['nonce'] );
		$pem = SiteKey::publicKeyPem( $kp );
		$der = base64_decode( preg_replace( '/-----[A-Z ]+-----|\s/', '', $pem ), true );
		$sig = base64_decode( $req['headers'][ SiteKey::SIGNATURE_HEADER ], true );
		$this->assertTrue( sodium_crypto_sign_verify_detached( $sig, $req['body'], substr( $der, 12 ) ) );
		$this->assertNotSame( $body['nonce'], json_decode( SiteKey::signedRequest( array(), SiteKey::AUD_TICKET, 'oracle-main', $kp )['body'], true )['nonce'] );
	}

	public function testSignedRequestRefusesCallerAuthFieldsAndUnknownAudience(): void {
		$kp = SiteKey::newKeypair();
		$cases = array(
			array( array( 'aud' => 'ticket' ), 'v1', 'oracle-main' ),
			array( array( 'nonce' => 'x' ), 'v1', 'oracle-main' ),
			array( array(), 'batch', 'oracle-main' ),
			array( array(), 'v1', 'Oracle_Main' ),
			array( array( 'name' => "\xC3" ), 'v1', 'oracle-main' ),
		);
		foreach ( $cases as $case ) {
			try {
				SiteKey::signedRequest( $case[0], $case[1], $case[2], $kp );
				$this->fail( 'accepted ' . json_encode( $case ) );
			} catch ( \InvalidArgumentException $e ) {
				$this->addToAssertionCount( 1 );
			}
		}
	}

	public function testSettingsSurviveSecondSanitizePass(): void {
		$form   = array(
			'embed'              => 'same-origin',
			'browser_engine_url' => '',
			'server_engine_url'  => 'http://oracle-web:3000',
			'key_id'             => 'oracle-main',
			'default_locale'     => 'zh-TW',
			'locale_map'         => "zh_HK=zh-TW\r\nen_GB=en",
			'page_map'           => "ziwei=12\ntarot=34",
		);
		$errors = array();
		$first  = Normalize::settings( $form, $errors );
		$this->assertSame( array(), $errors );
		$this->assertSame( array( 'zh_HK' => 'zh-TW', 'en_GB' => 'en' ), $first['locale_map'] );
		$this->assertSame( array( 'ziwei' => 12, 'tarot' => 34 ), $first['page_map'] );
		$second = Normalize::settings( $first, $errors );
		$this->assertSame( $first, $second );
		$this->assertSame( array(), $errors );
		// A wrong default language is reported, not silently replaced.
		$third = Normalize::settings( array( 'default_locale' => 'zh_TW' ), $errors );
		$this->assertSame( 'en', $third['default_locale'] );
		$this->assertSame( array( array( 'default_locale', '' ) ), $errors );
	}

	public function testEnginePrefixPaths(): void {
		foreach ( array( '/tarot/', '/en/', '/zh-tw/x/', '/api', '/_next/static', '/embed/en/ziwei' ) as $p ) {
			$this->assertTrue( Normalize::pathHitsEnginePrefix( $p ), $p );
		}
		foreach ( array( '/', '/tools/tarot/', '/english/', '/entry/', '/apis/' ) as $p ) {
			$this->assertFalse( Normalize::pathHitsEnginePrefix( $p ), $p );
		}
	}

	public function testMapLinesRejectMalformed(): void {
		$rejected = array();
		$map      = Normalize::pairs( "zh_TW=zh-TW\n# note\nen_US=en\nbad line\nzh_TW=<script>\nja=ja", Normalize::WP_LOCALE_PATTERN, null, $rejected );
		$this->assertSame( array( 'zh_TW' => 'zh-TW', 'en_US' => 'en' ), $map );
		$this->assertSame( array( 'bad line', 'zh_TW=<script>', 'ja=ja' ), $rejected );
	}

	public function testEmbedUrlOnlyFromLegalParts(): void {
		$this->assertSame( 'https://e.example.com/embed/zh-TW/ziwei', EmbedUrl::build( 'https://e.example.com', 'zh-TW', 'ziwei' ) );
		$this->assertSame( '', EmbedUrl::build( 'https://e.example.com', 'zh-TW', '../admin' ) );
		$this->assertSame( '', EmbedUrl::build( 'https://e.example.com', 'zh TW', 'ziwei' ) );
		$this->assertSame( '', EmbedUrl::build( '', 'en', 'ziwei' ) );
		$this->assertSame( '/embed/en/tarot', EmbedUrl::path( 'en', 'tarot' ) );
		$this->assertSame( '', EmbedUrl::path( 'ja', 'tarot' ) );
		$this->assertSame( 'https://e.example.com:8443', EmbedUrl::origin( 'https://e.example.com:8443/base' ) );
	}

	public function testLocaleResolution(): void {
		$map = array( 'zh_TW' => 'zh-TW', 'en' => 'en' );
		$this->assertSame( 'zh-TW', LocaleMap::resolve( 'zh_TW', $map, 'en' ) );
		$this->assertSame( 'en', LocaleMap::resolve( 'en_GB', $map, 'zh-TW' ) );
		$this->assertSame( 'zh-TW', LocaleMap::resolve( 'de_DE', $map, 'zh-TW' ) );
		$this->assertSame( 'en', LocaleMap::resolve( 'de_DE', array(), '' ) );
		// No map needed for the engine's own languages; an unknown default still ends at en.
		$this->assertSame( 'zh-TW', LocaleMap::resolve( 'zh_TW', array(), 'en' ) );
		$this->assertSame( 'en', LocaleMap::resolve( 'en_US', array(), 'zh-TW' ) );
		$this->assertSame( 'en', LocaleMap::resolve( 'fr_FR', array( 'fr_FR' => 'fr' ), 'ja' ) );
	}

	public function testToolListPrefersPagesAndDropsIllegal(): void {
		$this->assertSame( array( 'ziwei', 'daily' ), ToolList::parse( array( 'pages' => array( 'ziwei', 'daily', 'ziwei', '<x>' ), 'systems' => array( array( 'id' => 'bazi' ) ) ) ) );
		$this->assertSame( array( 'bazi', 'tarot' ), ToolList::parse( array( 'systems' => array( array( 'id' => 'bazi' ), array( 'id' => 'tarot' ), array( 'x' => 1 ) ) ) ) );
		$this->assertSame( array(), ToolList::parse( 'oops' ) );
	}
}
