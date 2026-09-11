import express from 'express';
import pg from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateSubjectRecordPayload } from '../packages/contracts/validate-subject-record-payload.mjs';
import { rollupTrustDomains } from '../packages/intelligence/rollup-trust-domains.mjs';
import { classifyEvidenceQuality } from '../packages/intelligence/classify-evidence-quality.mjs';
import { detectSeverityFloor } from '../packages/intelligence/detect-severity-floor.mjs';
import { scoreRuleEngineFindings } from '../packages/intelligence/rule-engine.mjs';
import { combineDimensionSources } from '../packages/intelligence/combine-dimension-sources.mjs';
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
// migrations/0002:71 -- the five real, already-decided values, not invented
// for this demo.
const CASE_RISK_TIERS = ['R0', 'R1', 'R2', 'R3', 'R4'];
// hci.cases's cases_purpose_allowlist CHECK (migrations/0003, ADR-0012) --
// purpose is a regulated classification, not free text. Found by a real 409
// from the schema itself while wiring this endpoint (an earlier version of
// this form sent free text), not looked up in the migration first.
const CASE_PURPOSES = ['vendor_risk_assessment', 'fraud_investigation', 'personal_safety', 'journalism_research', 'general_due_diligence'];
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
// critic review (2026-09-08): without this, express.json()'s own parse
// failure (malformed JSON body) never reaches any route handler -- Express's
// default error response is a correct 400 but an HTML page, breaking this
// API's own application/problem+json contract for every route. Pre-existing
// gap (not introduced with today's two new endpoints); fixed once, here,
// rather than per-route.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return problem(res, 400, 'Bad Request', 'malformed JSON body');
  next(err);
});
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

app.post('/api/hci/v1/cases', async (req, res) => {
  const t = resolveTenant(req, res);
  if (!t) return;
  const { purpose, risk_tier, requester_context, relationship_context } = req.body || {};
  if (!CASE_PURPOSES.includes(purpose)) return problem(res, 400, 'Bad Request', `purpose must be one of: ${CASE_PURPOSES.join(', ')}`);
  if (!CASE_RISK_TIERS.includes(risk_tier)) return problem(res, 400, 'Bad Request', `risk_tier must be one of: ${CASE_RISK_TIERS.join(', ')}`);
  if (typeof requester_context !== 'string' || requester_context.trim() === '') return problem(res, 400, 'Bad Request', 'requester_context is required');
  // critic review (2026-09-08): a non-string, non-nullish relationship_context
  // (number/boolean/array/object) survived `?.trim()` as far as the try block
  // and only failed there with a raw "...trim is not a function" 409 -- the
  // wrong status and a message that leaks a JS expression, not a domain
  // reason. Guarded explicitly like every other field in this handler.
  if (relationship_context !== undefined && relationship_context !== null && typeof relationship_context !== 'string') {
    return problem(res, 400, 'Bad Request', 'relationship_context must be a string');
  }
  try {
    // hci.cases.tenant_authorization_id (migrations/0002) is only FK-checked
    // -- any row satisfies it, ACTIVE or not. Unlike hci.research_workflows,
    // hci.cases carries no hci.require_active_authorization() trigger
    // (migrations/0001:110-123 defines it, :123 attaches it to
    // research_workflows only). Opening a case under a revoked/expired
    // authorization would be silently, semantically wrong even though the
    // schema itself permits it, so this endpoint enforces the same
    // ACTIVE+non-expired rule the DB enforces one table over -- the correct
    // place for a rule the schema's own design leaves to its caller, not a
    // workaround for a missing constraint.
    const { rows: authRows } = await queryAsTenant(
      t.role,
      "SELECT id FROM hci.tenant_authorizations WHERE status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now()) ORDER BY id LIMIT 1"
    );
    if (authRows.length === 0) return problem(res, 409, 'Conflict', 'no active tenant authorization exists for this tenant; cannot open a new case');
    const id = crypto.randomUUID();
    await queryAsTenant(
      t.role,
      'INSERT INTO hci.cases (id, tenant_id, tenant_authorization_id, purpose, risk_tier, relationship_context, requester_context) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, t.tenantId, authRows[0].id, purpose, risk_tier, relationship_context?.trim() || null, requester_context.trim()]
    );
    // Re-SELECT rather than construct client-side: status/opened_at are
    // server/trigger-assigned (migrations/0002:151-155), not something this
    // endpoint's INSERT ever sets.
    const { rows } = await queryAsTenant(t.role, 'SELECT id, purpose, status, risk_tier, opened_at, closed_at FROM hci.cases WHERE id = $1', [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    problem(res, 409, 'Conflict', err.message);
  }
});

app.post('/api/hci/v1/cases/:caseId/reopen', async (req, res) => {
  const t = resolveTenant(req, res);
  if (!t) return;
  try {
    // migrations/0015 widened hci.cases's lifecycle trigger to allow
    // CLOSED->ACTIVE (operator-requested "歷史案件(可復活)") -- this is a
    // pure status-only UPDATE (no other column touched), so the trigger's
    // own CLOSED-immutability guard (migrations/0002) never fires: OLD/NEW
    // are IS NOT DISTINCT on every field except status. RLS's own
    // tenant_id-scoped WITH CHECK still applies unchanged, so this cannot
    // reopen another tenant's case even if the id were guessed.
    const { rowCount } = await queryAsTenant(t.role, "UPDATE hci.cases SET status = 'ACTIVE' WHERE id = $1 AND status = 'CLOSED'", [req.params.caseId]);
    if (rowCount === 0) return problem(res, 409, 'Conflict', 'no CLOSED case with that id is visible to this tenant');
    const { rows } = await queryAsTenant(t.role, 'SELECT id, purpose, status, risk_tier, opened_at, closed_at FROM hci.cases WHERE id = $1', [req.params.caseId]);
    res.json(rows[0]);
  } catch (err) {
    problem(res, 409, 'Conflict', err.message);
  }
});

app.post('/api/hci/v1/cases/:caseId/risk-tier', async (req, res) => {
  const t = resolveTenant(req, res);
  if (!t) return;
  const { risk_tier } = req.body || {};
  if (!CASE_RISK_TIERS.includes(risk_tier)) return problem(res, 400, 'Bad Request', `risk_tier must be one of: ${CASE_RISK_TIERS.join(', ')}`);
  try {
    // hci.flag_claims_on_risk_elevation() (migrations/0008) fires on ANY
    // change to this column, not something this endpoint drives itself --
    // raising the tier retroactively flags every eligible linked CLAIM
    // (reaudit_required=true), and is rejected outright (H1017) if any of
    // those Claims is already tied to a finalized PROCEED/PROCEED_WITH_
    // CONTROLS/EXIT decision. Lowering or re-selecting the same tier is a
    // plain no-op column write with no side effect -- this endpoint does
    // not special-case either direction, the trigger already does.
    const { rowCount } = await queryAsTenant(t.role, 'UPDATE hci.cases SET risk_tier = $1 WHERE id = $2', [risk_tier, req.params.caseId]);
    if (rowCount === 0) return problem(res, 404, 'Not Found', 'no case with that id visible to this tenant');
    const { rows } = await queryAsTenant(t.role, 'SELECT id, purpose, status, risk_tier, opened_at, closed_at FROM hci.cases WHERE id = $1', [req.params.caseId]);
    res.json(rows[0]);
  } catch (err) {
    problem(res, 409, 'Conflict', err.message);
  }
});

// HCI_RULE_ENGINE_SPEC.md §Combination / operator's "都要": mandatory human
// review by default (auto_promote_rule_findings defaults false, migrations/
// 0017), with this endpoint as the explicit per-case opt-out into letting a
// rule-engine-only dimension count toward the formal rollup without a
// matching human ASSESSMENT.
app.post('/api/hci/v1/cases/:caseId/auto-promote-rule-findings', async (req, res) => {
  const t = resolveTenant(req, res);
  if (!t) return;
  const { auto_promote_rule_findings } = req.body || {};
  if (typeof auto_promote_rule_findings !== 'boolean') return problem(res, 400, 'Bad Request', 'auto_promote_rule_findings must be a boolean');
  try {
    const { rowCount } = await queryAsTenant(t.role, 'UPDATE hci.cases SET auto_promote_rule_findings = $1 WHERE id = $2', [auto_promote_rule_findings, req.params.caseId]);
    if (rowCount === 0) return problem(res, 404, 'Not Found', 'no case with that id visible to this tenant');
    const { rows } = await queryAsTenant(t.role, 'SELECT id, purpose, status, risk_tier, opened_at, closed_at, auto_promote_rule_findings FROM hci.cases WHERE id = $1', [req.params.caseId]);
    res.json(rows[0]);
  } catch (err) {
    problem(res, 409, 'Conflict', err.message);
  }
});

app.post('/api/hci/v1/persons', async (req, res) => {
  const t = resolveTenant(req, res);
  if (!t) return;
  const { display_label } = req.body || {};
  if (typeof display_label !== 'string' || display_label.trim() === '') return problem(res, 400, 'Bad Request', 'display_label is required');
  try {
    const id = crypto.randomUUID();
    // hci.persons (migrations/0001:81-84) has no gate beyond a non-empty
    // label -- identity_candidates/identity_verifications are a separate,
    // still-unwired confirmation workflow (ADR-0015), not a precondition on
    // this table's own INSERT grant.
    await queryAsTenant(t.role, 'INSERT INTO hci.persons (id, tenant_id, display_label) VALUES ($1, $2, $3)', [id, t.tenantId, display_label.trim()]);
    res.status(201).json({ id, display_label: display_label.trim() });
  } catch (err) {
    problem(res, 409, 'Conflict', err.message);
  }
});

// Shared by the live GET below and POST /reports (report generation): both
// need the exact same computed shape, one live, one about to be frozen into
// hci.case_report_snapshots.report. Extracted 2026-09-10 rather than
// duplicated -- a report snapshot's whole value is being an honest copy of
// what the live view actually showed, not a second, driftable
// re-implementation of the same rollup.
async function buildCaseReportPayload(role, caseId) {
  const { rows: caseRows } = await queryAsTenant(role, 'SELECT id, purpose, status, risk_tier, opened_at, closed_at, auto_promote_rule_findings FROM hci.cases WHERE id = $1', [caseId]);
  if (caseRows.length === 0) return null;

  const { rows: persons } = await queryAsTenant(role, 'SELECT id, display_label FROM hci.persons ORDER BY display_label');
  const { rows: records } = await queryAsTenant(
    role,
    "SELECT id, kind, person_id, payload, reaudit_required FROM hci.subject_records WHERE case_id = $1 ORDER BY kind, id",
    [caseId]
  );
  const { rows: decisions } = await queryAsTenant(
    role,
    'SELECT id, outcome, rationale, valid_from FROM hci.decisions WHERE case_id = $1 AND valid_to IS NULL ORDER BY valid_from DESC',
    [caseId]
  );

  // HCI_RULE_ENGINE_SPEC.md §Combination: a rule-engine finding never
  // reaches the rollup by itself. scoreRuleEngineFindings() scans every
  // EVIDENCE/CLAIM's text against the versioned keyword table;
  // combineDimensionSources() then merges each dimension's human ASSESSMENT
  // (if any) with any rule-engine finding for that SAME dimension via
  // combine-method-findings.mjs's already-shipped, previously-unused
  // combineMethodFindings() -- disagreement disclosed, not averaged away.
  // A rule-engine finding with no human ASSESSMENT is held out entirely
  // and returned separately as `ruleEngineSuggestions`.
  const evidenceClaimRecords = records.filter(r => r.kind === 'EVIDENCE' || r.kind === 'CLAIM');
  const assessmentRecords = records.filter(r => r.kind === 'ASSESSMENT');
  const { findings: ruleEngineFindings, hitsByDimension: ruleEngineHits } = scoreRuleEngineFindings(evidenceClaimRecords);
  const { dimensionScores, disagreements: dimensionDisagreements, suggestions: ruleEngineSuggestions, autoPromoted: ruleEngineAutoPromoted } =
    combineDimensionSources(assessmentRecords, ruleEngineFindings, caseRows[0].auto_promote_rule_findings);

  let rollup = { domains: [] };
  let evidenceQuality = [];
  let severityAlerts = [];
  try {
    rollup = rollupTrustDomains(dimensionScores);
    // packages/intelligence/classify-evidence-quality.mjs -- SINGLE_SOURCE
    // vs MULTIPLE_SOURCES by distinct evidence-ref count, never a
    // corroboration claim this layer cannot verify (HCI_EVIDENCE_QUALITY_SPEC.md).
    evidenceQuality = classifyEvidenceQuality(dimensionScores);
    // packages/intelligence/detect-severity-floor.mjs (HCI_RISK_SPEC.md) --
    // built 2026-09-06, first real caller here: a VERY_LOW dimension is
    // surfaced explicitly even when its domain average looks fine.
    severityAlerts = detectSeverityFloor(dimensionScores);
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

  return {
    case: caseRows[0], persons, records, decisions, rollup, evidenceQuality, strengths, risks, unknowns,
    ruleEngineSuggestions, ruleEngineHits, dimensionDisagreements, severityAlerts, ruleEngineAutoPromoted,
  };
}

app.get('/api/hci/v1/cases/:caseId', async (req, res) => {
  const t = resolveTenant(req, res);
  if (!t) return;
  try {
    const payload = await buildCaseReportPayload(t.role, req.params.caseId);
    if (!payload) return problem(res, 404, 'Not Found', 'no case with that id visible to this tenant');
    res.json(payload);
  } catch (err) {
    problem(res, 500, 'Internal Server Error', err.message);
  }
});

// Report generation (operator-requested "產生信任評估報告", 2026-09-10; closes
// SEC-10, docs/HCI/HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md:265-284
// -- an exported report must permanently carry its claim-status labels and a
// disclaimer/purpose-reassertion, since a live app view can be re-rendered
// after the fact but a delivered document must not silently change under the
// person who received it). generated_at/generated_by are never client-
// supplied (migrations/0016 withholds generated_at from the INSERT grant
// entirely; generated_by is resolved server-side the same way decisions
// resolve their principal).
app.post('/api/hci/v1/cases/:caseId/reports', async (req, res) => {
  const t = resolveTenant(req, res);
  if (!t) return;
  try {
    const payload = await buildCaseReportPayload(t.role, req.params.caseId);
    if (!payload) return problem(res, 404, 'Not Found', 'no case with that id visible to this tenant');
    const principalId = await findOrCreateReviewerPrincipal(t.role);
    const id = crypto.randomUUID();
    await queryAsTenant(
      t.role,
      'INSERT INTO hci.case_report_snapshots (id, tenant_id, case_id, generated_by_principal_id, report) VALUES ($1, $2, $3, $4, $5)',
      [id, t.tenantId, req.params.caseId, principalId, JSON.stringify(payload)]
    );
    const { rows } = await queryAsTenant(t.role, 'SELECT id, generated_at, report FROM hci.case_report_snapshots WHERE id = $1', [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    problem(res, 409, 'Conflict', err.message);
  }
});

app.get('/api/hci/v1/cases/:caseId/reports', async (req, res) => {
  const t = resolveTenant(req, res);
  if (!t) return;
  try {
    // Lightweight: history list needs only enough to label each entry, not
    // the full frozen payload (fetched separately per-report below).
    const { rows } = await queryAsTenant(
      t.role,
      'SELECT id, generated_at FROM hci.case_report_snapshots WHERE case_id = $1 ORDER BY generated_at DESC',
      [req.params.caseId]
    );
    res.json({ data: rows });
  } catch (err) {
    problem(res, 500, 'Internal Server Error', err.message);
  }
});

app.get('/api/hci/v1/reports/:reportId', async (req, res) => {
  const t = resolveTenant(req, res);
  if (!t) return;
  try {
    const { rows } = await queryAsTenant(t.role, 'SELECT id, case_id, generated_at, report FROM hci.case_report_snapshots WHERE id = $1', [req.params.reportId]);
    if (rows.length === 0) return problem(res, 404, 'Not Found', 'no report with that id visible to this tenant');
    res.json(rows[0]);
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
