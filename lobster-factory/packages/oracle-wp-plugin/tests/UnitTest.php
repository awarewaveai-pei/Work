<?php
/**
 * WP-free units: the site key signs in the format the engine verifies; nothing builds an embed URL
 * from unchecked input; settings reject non-https browser URLs and malformed map lines.
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
	}

	public function testMapLinesRejectMalformed(): void {
		$rejected = array();
		$map      = Normalize::pairs( "zh_TW=zh-TW\n# note\nen_US=en\nbad line\nzh_TW=<script>", Normalize::WP_LOCALE_PATTERN, Normalize::LOCALE_PATTERN, $rejected );
		$this->assertSame( array( 'zh_TW' => 'zh-TW', 'en_US' => 'en' ), $map );
		$this->assertSame( array( 'bad line', 'zh_TW=<script>' ), $rejected );
	}

	public function testEmbedUrlOnlyFromLegalParts(): void {
		$this->assertSame( 'https://e.example.com/embed/zh-TW/ziwei', EmbedUrl::build( 'https://e.example.com', 'zh-TW', 'ziwei' ) );
		$this->assertSame( '', EmbedUrl::build( 'https://e.example.com', 'zh-TW', '../admin' ) );
		$this->assertSame( '', EmbedUrl::build( 'https://e.example.com', 'zh TW', 'ziwei' ) );
		$this->assertSame( '', EmbedUrl::build( '', 'en', 'ziwei' ) );
		$this->assertSame( 'https://e.example.com:8443', EmbedUrl::origin( 'https://e.example.com:8443/base' ) );
	}

	public function testLocaleResolution(): void {
		$map = array( 'zh_TW' => 'zh-TW', 'en' => 'en' );
		$this->assertSame( 'zh-TW', LocaleMap::resolve( 'zh_TW', $map, 'en' ) );
		$this->assertSame( 'en', LocaleMap::resolve( 'en_GB', $map, 'zh-TW' ) );
		$this->assertSame( 'zh-TW', LocaleMap::resolve( 'de_DE', $map, 'zh-TW' ) );
		$this->assertSame( 'en', LocaleMap::resolve( 'de_DE', array(), '' ) );
	}

	public function testToolListPrefersPagesAndDropsIllegal(): void {
		$this->assertSame( array( 'ziwei', 'daily' ), ToolList::parse( array( 'pages' => array( 'ziwei', 'daily', 'ziwei', '<x>' ), 'systems' => array( array( 'id' => 'bazi' ) ) ) ) );
		$this->assertSame( array( 'bazi', 'tarot' ), ToolList::parse( array( 'systems' => array( array( 'id' => 'bazi' ), array( 'id' => 'tarot' ), array( 'x' => 1 ) ) ) ) );
		$this->assertSame( array(), ToolList::parse( 'oops' ) );
	}
}
