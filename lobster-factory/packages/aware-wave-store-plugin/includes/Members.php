<?php
/**
 * The WordPress member behind an order. Production: WpMembers.
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

interface Members {

	/** verified_email = user meta aware_wave_email_verified ('' when never verified). @return array{email:string,display_name:string,verified_email:string}|null */
	public function member( int $userId ): ?array;
}
