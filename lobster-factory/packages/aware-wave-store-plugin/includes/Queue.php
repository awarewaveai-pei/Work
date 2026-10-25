<?php
/**
 * Delivery queue for signed payment events. Production: ActionSchedulerQueue (WooCommerce's bundled Action Scheduler).
 *
 * @package AwareWave\Store
 */

namespace AwareWave\Store;

interface Queue {

	/** Run as soon as possible. @param array{event_id:string,body:string,note_id:int,attempt:int,subscription_id?:int} $job */
	public function enqueue( array $job ): void;

	/** Run at a unix time. @param array{event_id:string,body:string,note_id:int,attempt:int} $job */
	public function scheduleAt( int $timestamp, array $job ): void;
}
