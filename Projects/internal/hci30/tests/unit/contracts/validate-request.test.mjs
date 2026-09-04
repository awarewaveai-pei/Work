import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRequest } from '../../../packages/contracts/validate-request.mjs';

// This is CONSENT-NEG-01 (ADR-0010, HD-02): "a bare `consent` payload is
// rejected." It is proven here, at the request-validation layer, not in the
// SQL suite - there is no `consent` table to attempt inserting into; the
// invariant is about rejecting a malformed API request shape before it ever
// reaches SQL. See governance/wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md and
// database/tests/wave1-negative-tests.sql's "Consent-class separation"
// section for CONSENT-NEG-02/03's disposition (blocked on an application
// claim-admission flow that does not exist yet at Wave 1 schema stage).
test('rejects bare consent', () => assert.throws(() => validateRequest({ type: 'tenant_authorization', consent: true }), /bare consent/));
test('rejects incomplete authorization', () => assert.throws(() => validateRequest({ type: 'tenant_authorization' }), /missing or invalid/));
test('accepts explicitly scoped authorization', () => assert.deepEqual(validateRequest({ type: 'tenant_authorization', tenantId: 'synthetic', status: 'ACTIVE' }), { type: 'tenant_authorization', tenantId: 'synthetic', status: 'ACTIVE' }));
