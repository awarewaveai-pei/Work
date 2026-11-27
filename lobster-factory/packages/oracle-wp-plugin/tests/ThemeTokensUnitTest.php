<?php
/**
 * WP-free units for Embed\ThemeTokens: Kadence palette → engine host-theme tokens, override map, nothing
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
				'bg'           => '#ffffff',
				'surface'      => '#F7FAFC',
				'border'       => '#EDF2F7',
				'heading'      => '#1A202C',
				'text'         => '#2D3748',
				'muted'        => '#4A5568',
				'accent'       => '#3182CE',
				'on-accent'    => '#ffffff',
				'accent-2'     => '#2B6CB0',
				'font'         => 'BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
				'font-heading' => 'BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
				'radius'       => '3px',
			),
			$tokens
		);
		// The site's override map replaces single rows; illegal override lines are ignored.
		$over = ThemeTokens::fromKadence( ThemeTokens::kadencePalette( self::KADENCE_OPTION ), array( 'surface' => 'palette7', 'bg;x' => 'palette1', 'text' => 'Palette 1' ), array() );
		$this->assertSame( '#EDF2F7', $over['surface'] );
		$this->assertSame( '#2D3748', $over['text'] );
		// The active palette wins.
		$second = ThemeTokens::kadencePalette( str_replace( '"active":"palette"', '"active":"second-palette"', self::KADENCE_OPTION ) );
		$this->assertSame( array( 'palette9' => '#000000' ), $second );
		$this->assertSame(
			'/embed/zh-TW/ziwei?aw-bg=%23ffffff&aw-accent=%233182CE&aw-font=Segoe%20UI%2C%20sans-serif',
			ThemeTokens::withQuery( '/embed/zh-TW/ziwei', array( 'accent' => '#3182CE', 'bg' => '#ffffff', 'font' => 'Segoe UI, sans-serif' ) )
		);
	}

	public function testNoPaletteSendsNothing(): void {
		$this->assertSame( array(), ThemeTokens::fromKadence( ThemeTokens::kadencePalette( '' ), array(), array( 'base_font' => array( 'family' => 'Inter' ) ) ) );
		// Kadence never saved a palette: read() falls back to Kadence's built-in one, which maps cleanly.
		$this->assertSame( '#3182CE', ThemeTokens::fromKadence( ThemeTokens::KADENCE_DEFAULT_PALETTE, array(), array() )['accent'] );
		$this->assertSame( array(), ThemeTokens::fromKadence( ThemeTokens::kadencePalette( 'not json' ), array(), array() ) );
		$this->assertSame( array(), ThemeTokens::fromGlobalStyles( array( 'bg' => '', 'text' => null ), array(), array(), array() ) );
		$this->assertSame( '/embed/en/daily', ThemeTokens::withQuery( '/embed/en/daily', array() ) );
		// Junk in a palette never reaches the URL.
		$bad = ThemeTokens::fromKadence( array( 'palette9' => 'red;}', 'palette4' => 'url(x)', 'palette1' => '#3182CE' ), array(), array( 'base_font' => array( 'family' => '"x</style>"' ) ) );
		$this->assertSame( array( 'accent' => '#3182CE' ), $bad );
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
				'bg'     => 'var:preset|color|base',
				'text'   => 'var(--wp--preset--color--contrast)',
				'accent' => 'var:preset|color|missing',
				'font'   => 'var:preset|font-family|manrope',
				'radius' => '0.5rem',
			),
			$palette,
			$fonts,
			array( 'accent-2' => 'accent-1' )
		);
		$this->assertSame(
			array( 'bg' => '#FFFFFF', 'text' => '#111111', 'accent-2' => 'rgb(10, 20, 30)', 'font' => 'Manrope, sans-serif', 'radius' => '0.5rem' ),
			$tokens
		);
	}
}
