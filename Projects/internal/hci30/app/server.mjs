import express from 'express';
import pg from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateSubjectRecordPayload } from '../packages/contracts/validate-subject-record-payload.mjs';
import { rollupTrustDomains } from '../packages/intelligence/rollup-trust-domains.mjs';
import { classifyEvidenceQuality } from '../packages/intelligence/classify-evidence-quality.mjs';
import { TRUST_DOMAINS } from '../packages/contracts/trust-domains.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Self-contained rather than relying on the launcher to forward env vars
// (preview_start's launch.json schema does not document env-passing) --
// read the same gitignored password file scripts/dev-db-init.ps1 generated.
function readDevDbPassword() {
  if (process.env.HCI_DEV_DB_PASSWORD) return process.env.HCI_DEV_DB_PASSWORD;
  const envPath = path.join(__dirname, '..', 'infra', 'local', '.env.dev');
  const line = fs.readFileSync(envPath, 'utf8').split('\n').find(l => l.startsWith('HCI_DEV_DB_PASSWORD='));
  if (!line) throw new Error(`HCI_DEV_DB_PASSWORD not found in ${envPath} -- run scripts/dev-db-init.ps1 first.`);
  return line.slice('HCI_DEV_DB_PASSWORD='.length).trim();
}

// hci_app_test_a/b are NOLOGIN roles (migrations/0001_wave1_synthetic_up.sql) --
// this pool connects as the owner and SET ROLEs per request, exactly the
// mechanism api/API_CONTRACT_STANDARD.md#tenant-context-propagation names.
// No auth layer exists yet (that is P0-06's own still-OPEN scope), so which
// tenant to act as is an explicit, visible query param here -- honest about
// there being no real auth, not a disguised one.
const TENANT_ROLES = { a: 'hci_app_test_a', b: 'hci_app_test_b' };
// From hci.app_tenant_bindings (database/fixtures/0001_synthetic.sql) --
// needed because INSERTs must supply tenant_id explicitly (no DB default),
// and RLS's WITH CHECK independently rejects a mismatch against whichever
// role actually SET ROLE'd, so this cannot be spoofed by a client even if
// it tried.
const TENANT_IDS = { a: '11111111-1111-1111-1111-111111111111', b: '22222222-2222-2222-2222-222222222222' };
// TRUST_DOMAIN excluded from this list deliberately -- see the POST handler
// below for why it is not a directly-creatable kind in this app.
const SUBJECT_RECORD_KINDS = ['EVIDENCE', 'CLAIM', 'ASSESSMENT'];
// ADR-0019 (hci.enforce_field_author_class(), migrations/0008) requires this
// exact value per kind, discovered by a real 409 from the schema itself
// while wiring this endpoint, not looked up in the trigger source first.
// EVIDENCE's DETERMINISTIC label is honest about what the DB constraint
// demands, not about how this demo form actually captures it (a human
// typing free text is not "deterministic" in the epistemic sense the label
// implies) -- a real ingestion pipeline, not manual entry, is what should
// set this for EVIDENCE; CLAIM/ASSESSMENT's HUMAN_ONLY is honest either way,
// since a human really is authoring them through this form.
const AUTHOR_CLASS_BY_KIND = { EVIDENCE: 'DETERMINISTIC', CLAIM: 'HUMAN_ONLY', ASSESSMENT: 'HUMAN_ONLY' };
// CLAIM alone (ADR-0019 gate 3, migrations/0008) also requires claim_state
// and human_spotcheck_status -- DRAFT/PENDING is the correct starting state
// for a freshly human-authored claim nothing has spot-checked yet; the
// existing hci.enforce_claim_state_admission() trigger (already real-Docker
// verified, not new here) is what would later refuse to admit it to
// ASSESSMENT_CANDIDATE without a real APPROVED spot-check -- this form does
// not attempt to add that review workflow, only to stop conflicting with it.
const CLAIM_EXTRA_COLUMNS = { claim_state: 'DRAFT', human_spotcheck_status: 'PENDING' };

const pool = new pg.Pool({
  host: '127.0.0.1',
  port: 5433,
  user: 'hci_owner',
  password: readDevDbPassword(),
  database: 'hci_wave1_synthetic',
});

async function queryAsTenant(role, sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query(`SET ROLE ${role}`);
    return await client.query(sql, params);
  } finally {
    await client.query('RESET ROLE');
    client.release();
  }
}

function problem(res, status, title, detail) {
  // RFC 7807 shape, per api/API_CONTRACT_STANDARD.md#errors.
  res.status(status).type('application/problem+json').json({ type: 'about:blank', title, status, detail });
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function resolveTenant(req, res) {
  const tenant = req.query.tenant || req.body?.tenant;
  const role = TENANT_ROLES[tenant];
  if (!role) { problem(res, 400, 'Bad Request', `tenant must be one of: ${Object.keys(TENANT_ROLES).join(', ')}`); return null; }
  return { tenant, role, tenantId: TENANT_IDS[tenant] };
}

app.get('/api/hci/v1/cases', async (req, res) => {
  const t = resolveTenant(req, res);
  if (!t) return;
  try {
    const { rows } = await queryAsTenant(
      t.role,
      'SELECT id, purpose, status, risk_tier, opened_at, closed_at FROM hci.cases ORDER BY opened_at DESC LIMIT 50'
    );
    res.json({ data: rows, next_cursor: null });
  } catch (err) {
    problem(res, 500, 'Internal Server Error', err.message);
  }
});

app.get('/api/hci/v1/cases/:caseId', async (req, res) => {
  const t = resolveTenant(req, res);
  if (!t) return;
  try {
    const { rows: caseRows } = await queryAsTenant(t.role, 'SELECT id, purpose, status, risk_tier, opened_at, closed_at FROM hci.cases WHERE id = $1', [req.params.caseId]);
    if (caseRows.length === 0) return problem(res, 404, 'Not Found', 'no case with that id visible to this tenant');

    const { rows: persons } = await queryAsTenant(t.role, 'SELECT id, display_label FROM hci.persons ORDER BY display_label');
    const { rows: records } = await queryAsTenant(
      t.role,
      "SELECT id, kind, person_id, payload FROM hci.subject_records WHERE case_id = $1 ORDER BY kind, id",
      [req.params.caseId]
    );
    const { rows: decisions } = await queryAsTenant(
      t.role,
      'SELECT id, outcome, rationale, valid_from FROM hci.decisions WHERE case_id = $1 AND valid_to IS NULL ORDER BY valid_from DESC',
      [req.params.caseId]
    );

    // Reuses the already-shipped, already-tested roll-up formula
    // (packages/intelligence/rollup-trust-domains.mjs, HCI_TRUST_DOMAIN_SPEC.md)
    // rather than re-deriving it -- this endpoint's only new work is
    // shaping ASSESSMENT rows' real payload (ADR-0034) into the
    // {dimension, value, evidence_refs} shape that function has always
    // expected, which nothing could supply until today.
    const dimensionScores = records.filter(r => r.kind === 'ASSESSMENT').map(r => r.payload);
    let rollup = { domains: [] };
    let evidenceQuality = [];
    try {
      rollup = rollupTrustDomains(dimensionScores);
      // packages/intelligence/classify-evidence-quality.mjs -- SINGLE_SOURCE
      // vs MULTIPLE_SOURCES by distinct evidence-ref count, never a
      // corroboration claim this layer cannot verify (HCI_EVIDENCE_QUALITY_SPEC.md).
      evidenceQuality = classifyEvidenceQuality(dimensionScores);
    } catch (err) { rollup = { domains: [], error: err.message }; }

    // Derived directly from the real roll-up, not a separate invented
    // signal: HCI_TRUST_DOMAIN_SPEC.md's own band scale (VERY_LOW..VERY_HIGH)
    // read as strength (HIGH/VERY_HIGH) or risk (LOW/VERY_LOW), matching the
    // Subject Dashboard's "Top Strengths"/"Material Risks" sections
    // (19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md). "Unknowns" is the
    // complement: which of the 7 domains have no Assessment evidence at all
    // yet -- never silently treated as MODERATE, matching that spec's
    // §Score semantics the roll-up formula itself already enforces.
    const strengths = rollup.domains.filter(d => d.value === 'HIGH' || d.value === 'VERY_HIGH');
    const risks = rollup.domains.filter(d => d.value === 'LOW' || d.value === 'VERY_LOW');
    const coveredDomains = new Set(rollup.domains.map(d => d.domain));
    const unknowns = TRUST_DOMAINS.filter(d => !coveredDomains.has(d));

    res.json({ case: caseRows[0], persons, records, decisions, rollup, evidenceQuality, strengths, risks, unknowns });
  } catch (err) {
    problem(res, 500, 'Internal Server Error', err.message);
  }
});

app.post('/api/hci/v1/cases/:caseId/records', async (req, res) => {
  const t = resolveTenant(req, res);
  if (!t) return;
  const { kind, person_id, payload } = req.body || {};
  if (!SUBJECT_RECORD_KINDS.includes(kind)) return problem(res, 400, 'Bad Request', `kind must be one of: ${SUBJECT_RECORD_KINDS.join(', ')}`);
  if (typeof person_id !== 'string' || !person_id) return problem(res, 400, 'Bad Request', 'person_id is required');
  try {
    validateSubjectRecordPayload(kind, payload);
  } catch (err) {
    return problem(res, 400, 'Bad Request', err.message);
  }
  try {
    const id = crypto.randomUUID();
    const extra = kind === 'CLAIM' ? { ...CLAIM_EXTRA_COLUMNS } : {};
    // EVIDENCE/CLAIM require encryption_key_ref (migrations/0007) -- app
    // roles hold zero privilege on hci.data_encryption_keys directly (by
    // design), so this goes through hci.mint_encryption_key() (migration
    // 0013), the narrow SECURITY DEFINER primitive added specifically
    // because that gap blocked this exact endpoint. ASSESSMENT never takes
    // a key (0007's CHECK scopes it to EVIDENCE/CLAIM only).
    if (kind === 'EVIDENCE' || kind === 'CLAIM') {
      const { rows: keyRows } = await queryAsTenant(t.role, 'SELECT hci.mint_encryption_key() AS id');
      extra.encryption_key_ref = keyRows[0].id;
    }
    const extraCols = Object.keys(extra);
    const cols = ['id', 'tenant_id', 'person_id', 'kind', 'case_id', 'payload', 'author_class', ...extraCols];
    const vals = [id, t.tenantId, person_id, kind, req.params.caseId, JSON.stringify(payload), AUTHOR_CLASS_BY_KIND[kind], ...extraCols.map(c => extra[c])];
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    await queryAsTenant(t.role, `INSERT INTO hci.subject_records (${cols.join(', ')}) VALUES (${placeholders})`, vals);
    res.status(201).json({ id, kind, person_id, payload });
  } catch (err) {
    // H1xxx domain errors (database/ERROR_CODE_REGISTRY.md) surface here as
    // Postgres error.code (e.g. '23503' FK violation for an unknown
    // case_id/person_id) -- passed through rather than swallowed, per
    // api/API_CONTRACT_STANDARD.md#errors.
    problem(res, 409, 'Conflict', err.message);
  }
});

const DECISION_OUTCOMES = ['PROCEED', 'PROCEED_WITH_CONTROLS', 'LIMIT_ACCESS', 'PAUSE', 'REVIEW_REQUIRED', 'EXIT'];
// 19_HCI_UI_REPORTING_AND_EXPLAINABILITY.md §Decision visualization -- the
// six real, already-decided outcome values, not invented for this demo.
const REVIEWER_LABEL = 'Demo Reviewer (this app)';

async function findOrCreateReviewerPrincipal(role) {
  // hci.principals.display_name (migrations/0008) -- NOT display_label,
  // hci.persons's column for the same concept. Caught by a real 409, not
  // caught while writing this the first time.
  const { rows } = await queryAsTenant(role, 'SELECT id FROM hci.principals WHERE display_name = $1 LIMIT 1', [REVIEWER_LABEL]);
  if (rows.length > 0) return rows[0].id;
  const id = crypto.randomUUID();
  await queryAsTenant(role, 'INSERT INTO hci.principals (id, tenant_id, display_name) VALUES ($1, $2, $3)', [id, TENANT_IDS[Object.keys(TENANT_ROLES).find(k => TENANT_ROLES[k] === role)], REVIEWER_LABEL]);
  return id;
}

app.post('/api/hci/v1/cases/:caseId/decisions', async (req, res) => {
  const t = resolveTenant(req, res);
  if (!t) return;
  const { outcome, rationale } = req.body || {};
  if (!DECISION_OUTCOMES.includes(outcome)) return problem(res, 400, 'Bad Request', `outcome must be one of: ${DECISION_OUTCOMES.join(', ')}`);
  if (typeof rationale !== 'string' || rationale.trim() === '') return problem(res, 400, 'Bad Request', 'rationale is required');
  // No Collaboration Stage is modelled anywhere in this app yet, so the
  // Stage-4+ bias-check blocking precondition
  // (docs/intelligence/HCI_DECISION_BIAS_CHECK_GATE.md,
  // packages/intelligence/bias-check-gate.mjs) is NOT enforced here --
  // disclosed, not silently skipped. hci.record_decision() itself (migration
  // 0014) is the real gate this endpoint does enforce: cross-tenant
  // case_id/principal_id is rejected inside that SECURITY DEFINER function,
  // not just assumed safe because this app only ever passes its own tenant's
  // ids.
  try {
    const principalId = await findOrCreateReviewerPrincipal(t.role);
    const { rows } = await queryAsTenant(
      t.role,
      'SELECT hci.record_decision($1, $2, $3, $4) AS id',
      [req.params.caseId, principalId, outcome, rationale]
    );
    res.status(201).json({ id: rows[0].id, outcome, rationale });
  } catch (err) {
    problem(res, 409, 'Conflict', err.message);
  }
});

const port = process.env.PORT || 4030;
app.listen(port, () => console.log(`hci30 app listening on http://localhost:${port}`));
