<?php
/**
 * ADR 017 4b-2: signing and delivery of queued payment events to next-admin.
 */

namespace AwareWave\Store\Tests;

use AwareWave\Store\PaymentSender;
use AwareWave\Store\Settings;
use AwareWave\Store\Signature;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/BillingFakes.php';

final class PaymentSenderTest extends TestCase {

	const SECRET = 'awarewave-test-vector-secret-0123456789abcdef';

	private function job( int $attempt = 0 ): array {
		return array( 'event_id' => 'wc:payment_complete:42:credit_pack', 'body' => '{"x":1}', 'note_id' => 42, 'attempt' => $attempt );
	}

	private function settings(): Settings {
		return new Settings( true, 'https://app.aware-wave.com/', self::SECRET, '' );
	}

	public function test_a_signature_matches_the_server_construction(): void {
		// Vector computed in Node: require('crypto').createHmac('sha256',k).update(b).digest('base64')
		// (next-admin lib/payments/hmac.ts signPayment), with this exact body and key.
		$body = '{"event_id":"wc:payment_complete:42:credit_pack","wp_user_id":7,"email":"約翰@example.com","email_verified":true,"display_name":"約翰","kind":"credit_pack","units":300,"order_ref":"42"}';
		$this->assertSame( 'J2XelonCCbWC7Mxke3k00AIK4vKmJbHVM4a84Ip8pyw=', Signature::sign( $body, self::SECRET ) );
	}

	public function test_a_400_answer_is_final_and_a_503_answer_retries(): void {
		$shop  = new FakeShop();
		$queue = new FakeQueue();
		$now   = function () {
			return 1000;
		};

		$http = new FakeHttp( 400, '{"ok":false,"error":"email_unverified"}' );
		$this->assertSame( 'final', ( new PaymentSender( $http, $queue, $shop, $now ) )->deliver( $this->job(), $this->settings() ) );
		$this->assertCount( 0, $queue->scheduled );
		$this->assertSame( 42, $shop->notes[0][0] );
		$this->assertStringContainsString( 'email_unverified', $shop->notes[0][1] );
		// Sent where the server listens, signed over the exact body.
		$this->assertSame( 'https://app.aware-wave.com/api/webhooks/payments/woo', $http->requests[0]['url'] );
		$this->assertSame( Signature::sign( '{"x":1}', self::SECRET ), $http->requests[0]['headers'][ Signature::PAYMENT_HEADER ] );

		$http = new FakeHttp( 503 );
		$this->assertSame( 'retry', ( new PaymentSender( $http, $queue, $shop, $now ) )->deliver( $this->job( 3 ), $this->settings() ) );
		$this->assertCount( 1, $queue->scheduled );
		$this->assertSame( 1000 + PaymentSender::delay( 3 ), $queue->scheduled[0][0] );
		$this->assertSame( 4, $queue->scheduled[0][1]['attempt'] );
		$this->assertSame( '{"x":1}', $queue->scheduled[0][1]['body'] );

		// The last allowed send gives up with a note instead of scheduling a 21st.
		$this->assertSame( 'gave_up', ( new PaymentSender( $http, $queue, $shop, $now ) )->deliver( $this->job( PaymentSender::MAX_ATTEMPTS - 1 ), $this->settings() ) );
		$this->assertCount( 1, $queue->scheduled );

		foreach ( array( 400, 409, 422, 413 ) as $s ) {
			$this->assertSame( 'final', PaymentSender::classify( $s ) );
		}
		// 401 = secrets differ on the two sides (rotation): retried, not lost.
		foreach ( array( null, 401, 404, 500, 502 ) as $s ) {
			$this->assertSame( 'retry', PaymentSender::classify( $s ) );
		}
		$this->assertSame( 'done', PaymentSender::classify( 200 ) );
	}

	public function test_a_subscription_paid_for_a_subscription_that_has_since_ended_is_not_sent(): void {
		$shop                     = new FakeShop();
		$shop->subscriptions[101] = array( 'id' => 101, 'customer_id' => 7, 'status' => 'cancelled', 'next_payment' => 0, 'end' => 0, 'lines' => array() );
		$http                     = new FakeHttp( 200 );
		$job                      = $this->job( 2 ) + array( 'subscription_id' => 101 );

		$this->assertSame( 'stale', ( new PaymentSender( $http, new FakeQueue(), $shop ) )->deliver( $job, $this->settings() ) );
		$this->assertCount( 0, $http->requests );

		$shop->subscriptions[101]['status'] = 'active';
		$this->assertSame( 'done', ( new PaymentSender( $http, new FakeQueue(), $shop ) )->deliver( $job, $this->settings() ) );
	}
}
