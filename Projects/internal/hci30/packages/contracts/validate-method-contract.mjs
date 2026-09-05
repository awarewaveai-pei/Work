import { TRUST_DOMAINS, FORBIDDEN_AGGREGATE_KEY } from './trust-domains.mjs';

// The 12 fields 05_HCI30_INTELLIGENCE_METHODS.md:151-167 says "Each formal
// HCI method should declare"; inference_mode is independently called out
// there (:169) as required on every method that can be pointed at a Subject
// who did not personally provide the input data.
const REQUIRED_KEYS = [
  'method_id', 'version', 'category', 'origin', 'evidence_grade',
  'allowed_scope', 'required_inputs', 'outputs', 'forbidden_uses',
  'decision_weight', 'license_status', 'validation_status', 'inference_mode',
];
const REQUIRED_KEY_SET = new Set(REQUIRED_KEYS);
const OUTPUTS_KEYS = new Set(['domains']);
const INFERENCE_MODES = new Set(['self_report', 'third_party_inferred', 'third_party_applied']);

const nonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';
const stringArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');
// Rejects arrays and boxed primitives (`new Number(...)`, `new String(...)`,
// etc.) in addition to `null`/non-objects. Plain-`typeof === 'object'` alone
// let a boxed Number with extra own properties pass every other check here
// and then serialize back to a bare scalar (critic review, 2026-09-06 m1).
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

// METHOD-CONTRACT-NEG-01 (ADR-0004 gate 5, "Required implementation gates"
// item 5): for every method declaring the Method Contract fields, if
// `outputs` touches more than one Trust Domain, `decision_weight` must be
// expressed per-domain, not as a single scalar; a method definition with a
// cross-domain scalar decision_weight fails registry validation and cannot
// be loaded. A scalar cross-domain weight is exactly the shape that would
// let a "weighted-average overall score" -- the alternative ADR-0004
// explicitly rejects -- slip in through the method catalog instead of the
// schema gates 1-3 already close off. There is no real method catalog yet;
// this validator exists so the first one built cannot introduce that shape
// unnoticed.
export function validateMethodContract(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('method definition must be an object');
  for (const key of Object.keys(value)) if (!REQUIRED_KEY_SET.has(key)) throw new Error(`unknown property: ${key}`);
  for (const key of REQUIRED_KEYS) if (!Object.hasOwn(value, key)) throw new Error(`missing required property: ${key}`);

  for (const key of ['method_id', 'version', 'category', 'origin', 'evidence_grade', 'allowed_scope', 'license_status', 'validation_status']) {
    if (!nonEmptyString(value[key])) throw new Error(`${key} must be a non-empty string`);
  }
  if (!stringArray(value.required_inputs)) throw new Error('required_inputs must be an array of strings');
  if (!stringArray(value.forbidden_uses)) throw new Error('forbidden_uses must be an array of strings');
  if (!INFERENCE_MODES.has(value.inference_mode)) throw new Error(`invalid inference_mode: ${value.inference_mode}`);

  const outputs = value.outputs;
  if (!outputs || typeof outputs !== 'object' || Array.isArray(outputs)) throw new Error('outputs must be an object');
  // Same forbidden-name set gate 4 enforces on API responses, applied here
  // to a method's declared output shape -- a method that itself declares
  // `outputs.overall_score` is a more direct violation of ADR-0004's
  // Decision bullet 3 than the scalar decision_weight below, and had no
  // enforcement at all before this fix (critic review, 2026-09-06 M1).
  for (const key of Object.keys(outputs)) {
    if (FORBIDDEN_AGGREGATE_KEY.test(key)) throw new Error(`ADR-0004: forbidden cross-domain field in outputs: ${key}`);
    if (!OUTPUTS_KEYS.has(key)) throw new Error(`outputs: unknown property: ${key}`);
  }
  if (!Array.isArray(outputs.domains) || outputs.domains.length === 0) throw new Error('outputs.domains must be a non-empty array');
  const domains = [...new Set(outputs.domains)];
  if (domains.length !== outputs.domains.length) throw new Error('outputs.domains must not repeat a domain');
  for (const domain of domains) if (!TRUST_DOMAINS.includes(domain)) throw new Error(`outputs.domains: invalid domain: ${domain}`);

  const weight = value.decision_weight;
  if (domains.length > 1) {
    if (!isPlainObject(weight)) {
      throw new Error('METHOD-CONTRACT-NEG-01: cross-domain decision_weight must be a per-domain object, not a scalar');
    }
    const weightKeys = Object.keys(weight);
    if (weightKeys.length !== domains.length || !domains.every((domain) => weightKeys.includes(domain))) {
      throw new Error('METHOD-CONTRACT-NEG-01: decision_weight keys must exactly match outputs.domains');
    }
    for (const domain of domains) if (typeof weight[domain] !== 'number' || !Number.isFinite(weight[domain])) throw new Error(`decision_weight.${domain} must be a finite number`);
  } else if (typeof weight !== 'number' || !Number.isFinite(weight)) {
    throw new Error('decision_weight must be a finite number for a single-domain method');
  }
  return value;
}
