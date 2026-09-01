import { fileURLToPath } from 'node:url';
import path from 'node:path';

const contract = new Map([
  ['tenant_authorization', { keys: new Set(['type', 'tenantId', 'status', 'expiresAt']), required: ['tenantId', 'status'] }],
  ['subject_lawful_basis', { keys: new Set(['type', 'tenantId', 'personId', 'basis']), required: ['tenantId', 'personId', 'basis'] }],
  ['source_terms', { keys: new Set(['type', 'tenantId', 'sourceId', 'termsRef']), required: ['tenantId', 'sourceId', 'termsRef'] }],
]);

export function validateRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('payload must be an object');
  if (Object.hasOwn(value, 'consent')) throw new Error('bare consent is not an HCI record type');
  const spec = contract.get(value.type);
  if (!spec) throw new Error('unsupported record type');
  for (const key of Object.keys(value)) if (!spec.keys.has(key)) throw new Error(`unknown property: ${key}`);
  for (const key of spec.required) if (typeof value[key] !== 'string' || value[key].trim() === '') throw new Error(`missing or invalid property: ${key}`);
  if (value.type === 'tenant_authorization' && !['ACTIVE', 'REVOKED', 'EXPIRED'].includes(value.status)) throw new Error('invalid authorization status');
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const chunks = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    try { validateRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))); process.exitCode = 0; }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  });
}
