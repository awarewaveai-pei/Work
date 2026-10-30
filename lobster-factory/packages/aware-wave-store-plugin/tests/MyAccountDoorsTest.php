<?php
/**
 * My Account 「進入」 list and refusals: the workspace (next-admin WORKSPACE_KEY "portal") first on aware-wave.com, none on
 * a seller's site; a held product; nothing else from the form; and no press at all while the member's email is unverified.
 */

namespace AwareWave\Store\Tests;

use AwareWave\Store\MyAccountDoors;
use PHPUnit\Framework\TestCase;

final class MyAccountDoorsTest extends TestCase {

	public function test_the_list_is_the_workspace_then_the_held_products_and_a_seller_site_has_no_workspace(): void {
		$held = array( 'tarot' => '塔羅製圖' );
		$this->assertSame( array( 'portal' => '我的工作區', 'tarot' => '塔羅製圖' ), MyAccountDoors::doors( $held, false ) );
		$this->assertSame( array( 'portal' => '我的工作區' ), MyAccountDoors::doors( array(), false ), 'a member with no product still has a workspace' );
		$this->assertSame( $held, MyAccountDoors::doors( $held, true ), 'a seller site: its members buy from the seller' );
		// a WooCommerce product whose key was set to the reserved "portal" is never a door, on either kind of site
		$this->assertSame( array( 'portal' => '我的工作區' ), MyAccountDoors::doors( array( 'portal' => 'Bad' ), false ) );
		$this->assertSame( array(), MyAccountDoors::doors( array( 'portal' => 'Bad' ), true ) );
		$this->assertSame( 'portal', MyAccountDoors::WORKSPACE, 'the key next-admin reserves for the workspace' );
	}

	public function test_an_unverified_email_is_refused_first_and_only_listed_keys_are_sent(): void {
		$doors = MyAccountDoors::doors( array( 'tarot' => '塔羅製圖' ), false );
		$this->assertSame( 'email_unverified', MyAccountDoors::refusal( false, $doors, 'tarot' ) );
		$this->assertSame( 'email_unverified', MyAccountDoors::refusal( false, $doors, MyAccountDoors::WORKSPACE ) );
		$this->assertNull( MyAccountDoors::refusal( true, $doors, 'tarot' ) );
		$this->assertNull( MyAccountDoors::refusal( true, $doors, MyAccountDoors::WORKSPACE ) );
		$this->assertSame( 'not_offered', MyAccountDoors::refusal( true, $doors, 'studio' ) );
		$this->assertSame( 'not_offered', MyAccountDoors::refusal( true, $doors, '' ) );
		$this->assertSame( 'not_offered', MyAccountDoors::refusal( true, MyAccountDoors::doors( array( 'tarot' => '塔羅製圖', 'portal' => 'Bad' ), true ), MyAccountDoors::WORKSPACE ), 'a seller site: the workspace key is not offered, even as a product' );
		$this->assertStringContainsString( '確認', MyAccountDoors::message( 'email_unverified' ) );
		$this->assertStringContainsString( '開通中', MyAccountDoors::message( 'not_a_member' ) );
	}
}
