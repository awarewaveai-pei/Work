-- Reverses 0001_wave1_synthetic_up.sql and the test harness.
-- Exercised on every run by scripts/test-wave1-local.ps1, which tears the
-- schema down and rebuilds it, so the plan's "migration up/down succeeds"
-- acceptance criterion is proven rather than assumed.
DROP SCHEMA IF EXISTS hci_test CASCADE;
DROP SCHEMA IF EXISTS hci CASCADE;
DROP ROLE IF EXISTS hci_app_test_a;
DROP ROLE IF EXISTS hci_app_test_b;
