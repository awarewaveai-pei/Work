<?php
// ADR 017 4b-9 local drill, run by `wp eval-file drill.php <step> [args]` inside the drill stack (woo-drill.e2e.test.ts).
// Each step prints one JSON line. The order is paid the way a card gateway pays it: payment_complete(), which fires the
// hooks aware-wave-store listens to; the method id `drill` is on the plugin's allowlist like a real gateway id would be.
$step = $args[0] ?? '';
$out  = array();
switch ( $step ) {
	case 'setup': // receiver_url secret
		update_option( 'aware_wave_payments_enabled', '1' );
		update_option( 'aware_wave_payments_target', $args[1] );
		update_option( 'aware_wave_payments_secret', $args[2] );
		update_option( 'aware_wave_payments_gateways', array( 'drill' ) );
		$p = new WC_Product_Simple();
		$p->set_name( 'Drill credit pack 100' );
		$p->set_regular_price( '1' );
		$p->set_status( 'private' );
		$p->save();
		update_post_meta( $p->get_id(), '_awarewave_credit_units', '100' );
		$email = 'member@drill.test';
		$uid   = wp_create_user( 'drill-member', wp_generate_password( 24 ), $email );
		update_user_meta( $uid, 'aware_wave_email_verified', $email );
		$out = array( 'product_id' => $p->get_id(), 'wp_user_id' => $uid, 'email' => $email );
		break;
	case 'order': // product_id wp_user_id
		$o = wc_create_order( array( 'customer_id' => (int) $args[2] ) );
		$o->add_product( wc_get_product( (int) $args[1] ), 1 );
		$o->set_billing_email( 'member@drill.test' );
		$o->set_payment_method( 'drill' );
		$o->calculate_totals();
		$o->payment_complete( 'drill-tx-' . $o->get_id() );
		$out = array( 'order_id' => $o->get_id(), 'status' => $o->get_status(), 'total' => $o->get_total() );
		break;
	case 'refund': // order_id
		$o = wc_get_order( (int) $args[1] );
		$r = wc_create_refund( array( 'order_id' => $o->get_id(), 'amount' => $o->get_total(), 'reason' => 'drill' ) );
		$out = array( 'refund' => is_wp_error( $r ) ? $r->get_error_message() : $r->get_id(), 'status' => wc_get_order( $o->get_id() )->get_status() );
		break;
	case 'notes': // order_id
		$out = array( 'notes' => array_map( fn( $n ) => $n->content, wc_get_order_notes( array( 'order_id' => (int) $args[1] ) ) ) );
		break;
	default:
		fwrite( STDERR, "unknown step\n" );
		exit( 2 );
}
echo wp_json_encode( $out ) . "\n";
