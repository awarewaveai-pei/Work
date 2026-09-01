import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRequest } from '../../../packages/contracts/validate-request.mjs';

test('rejects bare consent', () => assert.throws(() => validateRequest({ type: 'tenant_authorization', consent: true }), /bare consent/));
test('rejects incomplete authorization', () => assert.throws(() => validateRequest({ type: 'tenant_authorization' }), /missing or invalid/));
test('accepts explicitly scoped authorization', () => assert.deepEqual(validateRequest({ type: 'tenant_authorization', tenantId: 'synthetic', status: 'ACTIVE' }), { type: 'tenant_authorization', tenantId: 'synthetic', status: 'ACTIVE' }));
