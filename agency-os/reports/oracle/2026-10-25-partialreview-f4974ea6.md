# codex-oracle review -- 2026-10-25 18:30:10 +08:00

- mode: `review`
- scope: whole repo
- target: `372095b8f`
- context: Split AwareWave billing out of the shared wp-bridge WordPress plugin (every managed site) into a new aware-wave-store plugin installed only on aware-wave.com. Moved files must keep every stored/wire name identical (options aware_wave_payments_*, meta _awarewave_*, Action Scheduler hook awbridge_send_payment_event, awbridge_* params, token salt). StoreModule must stay dormant while wp-bridge <=0.18.3 is installed (no double payment events) and take over after 0.19.0; never a window where neither runs. Also review the new -Plugin/-Install logic in scripts/rollout-wp-bridge.ps1 (embedded bash) and --plugin in scripts/release-wp-bridge.sh.
- exit: 0 | elapsed: 166527ms | answer: 2107B
- files-reviewed: .claude/commands/wp-bridge-release.md, agency-os/WORKLOG.md, agency-os/handoffs/2026-10-16-customer-model-supervisor/cards/step-4.md, lobster-factory/packages/aware-wave-store-plugin/.gitignore, lobster-factory/packages/aware-wave-store-plugin/README.md, lobster-factory/packages/aware-wave-store-plugin/aware-wave-store.php, lobster-factory/packages/aware-wave-store-plugin/composer.json, lobster-factory/packages/aware-wave-store-plugin/includes/ActionSchedulerQueue.php, lobster-factory/packages/aware-wave-store-plugin/includes/Admin/SettingsPage.php, lobster-factory/packages/aware-wave-store-plugin/includes/CheckoutGate.php, lobster-factory/packages/aware-wave-store-plugin/includes/EmailVerification.php, lobster-factory/packages/aware-wave-store-plugin/includes/HttpClient.php, lobster-factory/packages/aware-wave-store-plugin/includes/Members.php, lobster-factory/packages/aware-wave-store-plugin/includes/MyAccountDoors.php, lobster-factory/packages/aware-wave-store-plugin/includes/PaymentEvents.php, lobster-factory/packages/aware-wave-store-plugin/includes/PaymentSender.php, lobster-factory/packages/aware-wave-store-plugin/includes/ProductFields.php, lobster-factory/packages/aware-wave-store-plugin/includes/Queue.php, lobster-factory/packages/aware-wave-store-plugin/includes/Settings.php, lobster-factory/packages/aware-wave-store-plugin/includes/Shop.php, lobster-factory/packages/aware-wave-store-plugin/includes/Signature.php, lobster-factory/packages/aware-wave-store-plugin/includes/StoreModule.php, lobster-factory/packages/aware-wave-store-plugin/includes/WooShop.php, lobster-factory/packages/aware-wave-store-plugin/includes/WpHttpClient.php, lobster-factory/packages/aware-wave-store-plugin/includes/WpMembers.php, lobster-factory/packages/aware-wave-store-plugin/phpunit.xml, lobster-factory/packages/aware-wave-store-plugin/tests/BillingFakes.php, lobster-factory/packages/aware-wave-store-plugin/tests/PaymentEventsTest.php, lobster-factory/packages/aware-wave-store-plugin/tests/PaymentSenderTest.php, lobster-factory/packages/aware-wave-store-plugin/tests/StoreModuleTest.php, lobster-factory/packages/aware-wave-store-plugin/tests/bootstrap.php, lobster-factory/packages/aware-wave-store-plugin/tests/stubs/legacy-bridge-billing.php, lobster-factory/packages/aware-wave-store-plugin/tests/stubs/wp-hooks.php, lobster-factory/packages/wp-bridge-plugin/.gitignore, lobster-factory/packages/wp-bridge-plugin/aware-wave-wp-bridge.php, lobster-factory/packages/wp-bridge-plugin/phpunit.xml, runbooks/WP-BRIDGE-RELEASE-RUNBOOK.md, scripts/release-wp-bridge.sh, scripts/rollout-wp-bridge.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A release can publish even when its CI tests fail.
  file:line   -> scripts/release-wp-bridge.sh:112
  confidence  -> CONFIRMED
  scenario    -> A change passes `php -l` but fails PHPUnit. The script pushes main and immediately tags it; the release workflow builds the zip from the tag independently of the CI workflow, so the script can report `RELEASE OK` for failing code.
  why missed  -> Mirroring the tests into the release repo was treated as a release gate, but the script never waits for CI.

FINDING 2: The bridge handoff accepts an installed but inactive store plugin.
  file:line   -> scripts/rollout-wp-bridge.ps1:99
  confidence  -> CONFIRMED
  scenario    -> `aware-wave-store.php` exists but the plugin is inactive. The bridge rollout sees the file and upgrades to 0.19.0. The bridge no longer registers billing, and the inactive store registers nothing, leaving payments unhandled.
  why missed  -> The guard checks a file; the store rollout’s health check considers activation only when it attempted activation.

FINDING 3: `-Install` can put the store plugin on a client site.
  file:line   -> scripts/rollout-wp-bridge.ps1:88
  confidence  -> CONFIRMED
  scenario    -> An operator runs `-Plugin store -Install -Site soulful-wp`. The named site passes validation, and the script installs and activates AwareWave billing code on a client site.
  why missed  -> Requiring an explicit `-Site` was treated as enforcing the aware-wave.com-only rule, but no site restriction is checked.

FINDING 4: The release script directs the first store rollout to a command that cannot install it.
  file:line   -> scripts/release-wp-bridge.sh:41
  confidence  -> CONFIRMED
  scenario    -> After the first store release, no site has the plugin yet. Following the printed `-Plugin store -DryRun` instruction finds no installed site and exits with “no site running aware-wave-store found”; the required `-Install -Site lobster-wordpress` step is absent.
  why missed  -> The runbook has the first-install command, while the script’s `NEXT` message assumes an upgrade.

TOTAL: 4 findings
