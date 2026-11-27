<?php
/**
 * WP-free units for Embed\ThemeTokens: Kadence palette slot for slot → engine host-theme tokens, override map, nothing
 * sent when the site has no palette, junk never reaches the URL.
 */

namespace AwareWave\Oracle\Tests;

use AwareWave\Oracle\Embed\ThemeTokens;
use PHPUnit\Framework\TestCase;

final class ThemeTokensUnitTest extends TestCase {

	private const KADENCE_OPTION = '{"palette":[{"color":"#3182CE","slug":"palette1","name":"Palette Color 1"},{"color":"#2B6CB0","slug":"palette2"},{"color":"#1A202C","slug":"palette3"},{"color":"#2D3748","slug":"palette4"},{"color":"#4A5568","slug":"palette5"},{"color":"#718096","slug":"palette6"},{"color":"#EDF2F7","slug":"palette7"},{"color":"#F7FAFC","slug":"palette8"},{"color":"#ffffff","slug":"palette9"}],"second-palette":[{"color":"#000000","slug":"palette9"}],"active":"palette"}';

	public function testKadencePaletteMapsToContractTokens(): void {
		$mods   = array(
			'base_font'    => array( 'family' => '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', 'google' => false ),
			'heading_font' => array( 'family' => 'inherit' ),
			'radius'       => array( 'size' => array( 'desktop' => 3 ), 'unit' => array( 'desktop' => 'px' ) ),
		);
		$tokens = ThemeTokens::fromKadence( ThemeTokens::kadencePalette( self::KADENCE_OPTION ), array(), $mods );
		$this->assertSame(
			array(
				'palette1'      => '#3182CE',
				'palette2'      => '#2B6CB0',
				'palette3'      => '#1A202C',
				'palette4'      => '#2D3748',
				'palette5'      => '#4A5568',
				'palette6'      => '#718096',
				'palette7'      => '#EDF2F7',
				'palette8'      => '#F7FAFC',
				'palette9'      => '#ffffff',
				'body-font'     => 'BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
				'heading-font'  => 'BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
				'button-radius' => '3px',
			),
			$tokens
		);
		// The site's override map replaces single slots; illegal override lines are ignored.
		$over = ThemeTokens::fromKadence( ThemeTokens::kadencePalette( self::KADENCE_OPTION ), array( 'palette8' => 'palette7', 'palette9;x' => 'palette1', 'palette4' => 'Palette 1', 'bg' => 'palette1' ), array() );
		$this->assertSame( '#EDF2F7', $over['palette8'] );
		$this->assertSame( '#2D3748', $over['palette4'] );
		$this->assertSame( '#ffffff', $over['palette9'] );
		// The active palette wins.
		$second = ThemeTokens::kadencePalette( str_replace( '"active":"palette"', '"active":"second-palette"', self::KADENCE_OPTION ) );
		$this->assertSame( array( 'palette9' => '#000000' ), $second );
		$this->assertSame(
			'/embed/zh-TW/ziwei?aw-palette1=%233182CE&aw-palette9=%23ffffff&aw-body-font=Segoe%20UI%2C%20sans-serif',
			ThemeTokens::withQuery( '/embed/zh-TW/ziwei', array( 'palette9' => '#ffffff', 'palette1' => '#3182CE', 'body-font' => 'Segoe UI, sans-serif' ) )
		);
	}

	public function testNoPaletteSendsNothing(): void {
		$this->assertSame( array(), ThemeTokens::fromKadence( ThemeTokens::kadencePalette( '' ), array(), array( 'base_font' => array( 'family' => 'Inter' ) ) ) );
		// Kadence never saved a palette: read() falls back to Kadence's built-in one, which maps cleanly.
		$this->assertSame( '#3182CE', ThemeTokens::fromKadence( ThemeTokens::KADENCE_DEFAULT_PALETTE, array(), array() )['palette1'] );
		$this->assertSame( array(), ThemeTokens::fromKadence( ThemeTokens::kadencePalette( 'not json' ), array(), array() ) );
		$this->assertSame( array(), ThemeTokens::fromGlobalStyles( array( 'palette9' => '', 'palette4' => null ), array(), array(), array() ) );
		$this->assertSame( '/embed/en/daily', ThemeTokens::withQuery( '/embed/en/daily', array() ) );
		// Junk in a palette never reaches the URL.
		$bad = ThemeTokens::fromKadence( array( 'palette9' => 'red;}', 'palette4' => 'url(x)', 'palette1' => '#3182CE' ), array(), array( 'base_font' => array( 'family' => '"x</style>"' ) ) );
		$this->assertSame( array( 'palette1' => '#3182CE' ), $bad );
	}

	public function testGlobalStylesResolvePresets(): void {
		$palette = ThemeTokens::presets(
			array(
				'default' => array( array( 'slug' => 'base', 'color' => '#eeeeee' ) ),
				'theme'   => array( array( 'slug' => 'base', 'color' => '#FFFFFF' ), array( 'slug' => 'contrast', 'color' => '#111111' ), array( 'slug' => 'accent-1', 'color' => 'rgb(10, 20, 30)' ) ),
			),
			'color'
		);
		$fonts   = ThemeTokens::presets( array( 'theme' => array( array( 'slug' => 'manrope', 'fontFamily' => 'Manrope, sans-serif' ) ) ), 'fontFamily' );
		$tokens  = ThemeTokens::fromGlobalStyles(
			array(
				'palette9'      => 'var:preset|color|base',
				'palette4'      => 'var(--wp--preset--color--contrast)',
				'palette1'      => 'var:preset|color|missing',
				'body-font'     => 'var:preset|font-family|manrope',
				'button-radius' => '0.5rem',
			),
			$palette,
			$fonts,
			array( 'palette2' => 'accent-1' )
		);
		$this->assertSame(
			array( 'palette2' => 'rgb(10, 20, 30)', 'palette4' => '#111111', 'palette9' => '#FFFFFF', 'body-font' => 'Manrope, sans-serif', 'button-radius' => '0.5rem' ),
			$tokens
		);
	}
}
