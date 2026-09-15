#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { verifyChecksumManifest } from "./airtable-audit.mjs";
import { transformMigration } from "./art-therapy-transform.mjs";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--container") args.container = argv[++index];
    else if (argv[index] === "--canonical-data") args.canonicalData = argv[++index];
    else if (argv[index] === "--snapshot") args.snapshot = argv[++index];
    else if (argv[index] === "--audit-dir") args.auditDir = argv[++index];
    else if (argv[index] === "--output") args.output = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  for (const key of ["container", "canonicalData", "snapshot", "auditDir", "output"]) if (!args[key]) throw new Error(`Missing --${key.replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`)}`);
  return args;
}

function query(container, sql) {
  return execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

function queryOutcome(container, sql) {
  const result = spawnSync("docker", ["exec", container, "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-At", "-c", sql], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim() };
}

function expectPermissionDenied(container, role, relation) {
  if (!["anon", "authenticated"].includes(role)) throw new Error(`Unexpected denied role: ${role}`);
  if (![
    "art_therapy_api.tool_details",
    "art_therapy_api.theory_details",
    "art_therapy._source_tables",
    "art_therapy._source_fields",
    "art_therapy._source_records",
    "art_therapy._source_record_values",
    "art_therapy._source_links",
  ].includes(relation)) throw new Error(`Unexpected denied relation: ${relation}`);
  const outcome = queryOutcome(container, `set role ${role}; select count(*) from ${relation};`);
  return !outcome.ok && /42501|permission denied/iu.test(outcome.output);
}

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe identifier: ${value}`);
  return `"${value}"`;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) return date.toISOString();
  }
  return value;
}

function digest(value) {
  const normalized = canonicalize(value);
  if (Array.isArray(normalized) && normalized.every((item) => item && typeof item === "object" && !Array.isArray(item))) normalized.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceManifest = await verifyChecksumManifest(args.snapshot);
  const canonicalManifest = await verifyChecksumManifest(dirname(resolve(args.canonicalData)));
  const rebuiltDirectory = await mkdtemp(join(tmpdir(), "art-therapy-verify-"));
  let rebuilt;
  try {
    await transformMigration(args.snapshot, args.auditDir, rebuiltDirectory);
    rebuilt = JSON.parse(await readFile(join(rebuiltDirectory, "canonical-data.json"), "utf8"));
  } finally {
    const safeTemporaryRoot = resolve(tmpdir());
    const safeRebuiltDirectory = resolve(rebuiltDirectory);
    if (!safeRebuiltDirectory.startsWith(`${safeTemporaryRoot}\\`) && !safeRebuiltDirectory.startsWith(`${safeTemporaryRoot}/`)) throw new Error(`Unsafe temporary cleanup target: ${safeRebuiltDirectory}`);
    await rm(safeRebuiltDirectory, { recursive: true, force: true });
  }
  const expected = JSON.parse(await readFile(resolve(args.canonicalData), "utf8"));
  const canonicalRebuildDigestMatch = digest(rebuilt) === digest(expected);
  const directRelationshipTables = ["tool_healing_stages", "tool_focuses", "tool_theories", "theory_category_links"];
  const directRelationships = directRelationshipTables.reduce((total, table) => total + (rebuilt[table]?.length ?? 0), 0);
  const mappedDirectRelationships = rebuilt._migration_source_map.filter((row) => row.disposition === "relationship" && directRelationshipTables.includes(row.target_table)).length;
  const canonicalTargetIds = new Map(Object.entries(rebuilt).map(([table, rows]) => [table, new Set(rows.filter((row) => row.id !== undefined).map((row) => row.id))]));
  const missingMappedTargets = rebuilt._migration_source_map.filter((row) => canonicalTargetIds.has(row.target_table) && !canonicalTargetIds.get(row.target_table).has(row.target_id)).length;
  const tables = {};
  for (const [table, rows] of Object.entries(expected)) {
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
    const selectColumns = columns.map(quoteIdentifier).join(", ");
    const orderColumns = columns.includes("id") ? '"id"' : columns.map(quoteIdentifier).join(", ");
    const actualText = query(args.container, `select coalesce(jsonb_agg(to_jsonb(q) order by ${orderColumns}), '[]'::jsonb) from (select ${selectColumns} from art_therapy.${quoteIdentifier(table)}) q;`);
    const actual = JSON.parse(actualText || "[]");
    const filledExpected = rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))).sort((left, right) => String(left.id ?? JSON.stringify(left)).localeCompare(String(right.id ?? JSON.stringify(right))));
    const postgresDigestText = query(args.container, `select count(*)::int || '|' || encode(digest(coalesce(string_agg(to_jsonb(q)::text, E'\\n' order by encode(digest(to_jsonb(q)::text, 'sha256'), 'hex')), ''), 'sha256'), 'hex') from (select ${selectColumns} from art_therapy.${quoteIdentifier(table)}) q;`);
    const [postgresRows, postgresDigest] = postgresDigestText.split("|");
    tables[table] = { columns, expectedRows: rows.length, actualRows: actual.length, expectedDigest: digest(filledExpected), actualDigest: digest(actual), postgresRows: Number(postgresRows), postgresDigest, pass: rows.length === actual.length && digest(filledExpected) === digest(actual) && Number(postgresRows) === rows.length };
  }
  const invalidForeignKeys = Number(query(args.container, "select count(*) from pg_constraint where connamespace = 'art_therapy'::regnamespace and contype = 'f' and not convalidated;"));
  const missingForeignKeyIndexes = Number(query(args.container, `select count(*) from pg_constraint c where c.connamespace = 'art_therapy'::regnamespace and c.contype = 'f' and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and c.conkey <@ i.indkey::smallint[]);`));
  const tableCount = Number(query(args.container, "select count(*) from pg_tables where schemaname = 'art_therapy';"));
  const rlsEnabledCount = Number(query(args.container, "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'art_therapy' and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity;"));
  const serviceRoleViewCounts = {
    tool_details: Number(query(args.container, "set role service_role; select count(*) from art_therapy_api.tool_details;")),
    theory_details: Number(query(args.container, "set role service_role; select count(*) from art_therapy_api.theory_details;")),
  };
  const deniedRelations = {
    tool_details: "art_therapy_api.tool_details",
    theory_details: "art_therapy_api.theory_details",
    source_tables: "art_therapy._source_tables",
    source_fields: "art_therapy._source_fields",
    source_records: "art_therapy._source_records",
    source_record_values: "art_therapy._source_record_values",
    source_links: "art_therapy._source_links",
  };
  const deniedRoles = Object.fromEntries(["anon", "authenticated"].map((role) => [role,
    Object.fromEntries(Object.entries(deniedRelations).map(([name, relation]) => [name, expectPermissionDenied(args.container, role, relation)])),
  ]));
  const apiConfig = {
    dedicatedSchemaExists: query(args.container, "select to_regnamespace('art_therapy_api') is not null;") === "t",
    dedicatedSchemaExposed: query(args.container, `select coalesce(bool_or(cfg like '%art_therapy_api%'), false) from pg_db_role_setting s join pg_roles r on r.oid=s.setrole cross join lateral unnest(s.setconfig) cfg where r.rolname='authenticator' and cfg like 'pgrst.db_schemas=%';`) === "t",
    canonicalSchemaNotExposed: query(args.container, `select not coalesce(bool_or(cfg like '%art_therapy,%' or cfg like '%art_therapy' or cfg like 'art_therapy,%'), false) from pg_db_role_setting s join pg_roles r on r.oid=s.setrole cross join lateral unnest(s.setconfig) cfg where r.rolname='authenticator' and cfg like 'pgrst.db_schemas=%';`) === "t",
  };
  const sourceCountsText = query(args.container, "select (select count(*) from art_therapy._source_tables) || '|' || (select count(*) from art_therapy._source_fields) || '|' || (select count(*) from art_therapy._source_records) || '|' || (select count(*) from art_therapy._source_record_values) || '|' || (select count(*) from art_therapy._source_links);");
  const [sourceTables, sourceFields, sourceRecords, sourceValues, sourceLinks] = sourceCountsText.split("|").map(Number);
  const valueDiffText = query(args.container, `with expected as (
    select r.id record_id, e.key field_id, e.value raw_value, r.display_values->e.key display_value
    from art_therapy._source_records r cross join lateral jsonb_each(r.raw_values) e
    where e.value <> 'null'::jsonb
      and not (jsonb_typeof(e.value)='string' and e.value='""'::jsonb)
      and not (jsonb_typeof(e.value)='array' and jsonb_array_length(e.value)=0)
  ) select count(*) || '|' || count(*) filter (where a.record_id is null) || '|' || count(*) filter (where e.record_id is null) || '|' || count(*) filter (where e.raw_value is distinct from a.raw_value or e.display_value is distinct from a.display_value)
  from expected e full join art_therapy._source_record_values a using(record_id,field_id);`);
  const [expectedValues, missingValues, extraValues, changedValues] = valueDiffText.split("|").map(Number);
  const linkDiffText = query(args.container, `with expected as (
    select v.record_id, v.field_id, e.ordinality-1 ordinal, e.item->>'id' linked_record_id
    from art_therapy._source_record_values v
    join art_therapy._source_fields f on f.id=v.field_id
    cross join lateral jsonb_array_elements(v.raw_value) with ordinality e(item,ordinality)
    where f.field_type='multipleRecordLinks'
  ) select count(*) || '|' || count(*) filter (where a.source_record_id is null) || '|' || count(*) filter (where e.record_id is null)
  from expected e full join art_therapy._source_links a on a.source_record_id=e.record_id and a.source_field_id=e.field_id and a.linked_record_id=e.linked_record_id and a.ordinal=e.ordinal;`);
  const [expectedLinks, missingLinks, extraLinks] = linkDiffText.split("|").map(Number);
  const sourceSchema = JSON.parse(await readFile(join(resolve(args.snapshot), "schema.json"), "utf8"));
  const snapshotId = sourceManifest.digest;
  const sourceExpected = { tables: [], fields: [], records: [], values: [], links: [] };
  for (const table of sourceSchema.tables) {
    const recordsText = await readFile(join(resolve(args.snapshot), "tables", table.id, "records.jsonl"), "utf8");
    const records = recordsText.split(/\r?\n/u).filter(Boolean).map(JSON.parse);
    sourceExpected.tables.push({ id: table.id, name: table.name, record_count: records.length, field_count: table.fields.length, source_snapshot: snapshotId, metadata: table });
    table.fields.forEach((field, field_order) => sourceExpected.fields.push({ id: field.id, table_id: table.id, name: field.name, field_type: field.type, field_order, metadata: field }));
    const fieldsById = new Map(table.fields.map((field) => [field.id, field]));
    for (const record of records) {
      sourceExpected.records.push({ id: record.recordId, table_id: table.id, created_time: record.createdTime ?? null, raw_values: record.rawValueByFieldId ?? {}, display_values: record.displayValueByFieldId ?? {}, source_snapshot: snapshotId });
      for (const field of table.fields) {
        const raw = record.rawValueByFieldId?.[field.id];
        const display = record.displayValueByFieldId?.[field.id];
        const present = raw !== null && raw !== undefined && raw !== "" && (!Array.isArray(raw) || raw.length > 0);
        if (present) sourceExpected.values.push({ record_id: record.recordId, field_id: field.id, raw_value: raw, display_value: display ?? null, source_snapshot: snapshotId });
      }
      for (const [fieldId, raw] of Object.entries(record.rawValueByFieldId ?? {})) {
        if (fieldsById.get(fieldId)?.type !== "multipleRecordLinks" || !Array.isArray(raw)) continue;
        raw.forEach((linked, ordinal) => { if (linked?.id) sourceExpected.links.push({ source_record_id: record.recordId, source_field_id: fieldId, linked_record_id: linked.id, ordinal, source_snapshot: snapshotId }); });
      }
    }
  }
  const sourceActual = {
    tables: JSON.parse(query(args.container, "select coalesce(jsonb_agg(to_jsonb(q) order by id), '[]'::jsonb) from (select id,name,record_count,field_count,source_snapshot,metadata from art_therapy._source_tables) q;") || "[]"),
    fields: JSON.parse(query(args.container, "select coalesce(jsonb_agg(to_jsonb(q) order by id), '[]'::jsonb) from (select id,table_id,name,field_type,field_order,metadata from art_therapy._source_fields) q;") || "[]"),
    records: JSON.parse(query(args.container, "select coalesce(jsonb_agg(to_jsonb(q) order by id), '[]'::jsonb) from (select id,table_id,created_time,raw_values,display_values,source_snapshot from art_therapy._source_records) q;") || "[]"),
    values: JSON.parse(query(args.container, "select coalesce(jsonb_agg(to_jsonb(q) order by record_id,field_id), '[]'::jsonb) from (select record_id,field_id,raw_value,display_value,source_snapshot from art_therapy._source_record_values) q;") || "[]"),
    links: JSON.parse(query(args.container, "select coalesce(jsonb_agg(to_jsonb(q) order by source_record_id,source_field_id,ordinal), '[]'::jsonb) from (select source_record_id,source_field_id,linked_record_id,ordinal,source_snapshot from art_therapy._source_links) q;") || "[]"),
  };
  const sourceDigests = Object.fromEntries(Object.keys(sourceExpected).map((name) => [name, { expected: digest(sourceExpected[name]), actual: digest(sourceActual[name]), match: digest(sourceExpected[name]) === digest(sourceActual[name]) }]));
  const attachmentText = await readFile(join(resolve(args.snapshot), "attachments.jsonl"), "utf8");
  const expectedAttachments = attachmentText.split(/\r?\n/u).filter(Boolean).map(JSON.parse).map((row) => ({ tableId: row.tableId, recordId: row.recordId, fieldId: row.fieldId, attachmentId: row.attachmentId, filename: row.filename, mediaType: row.mediaType, relativePath: row.relativePath, sha256: row.sha256, size: row.size }));
  const actualAttachments = JSON.parse(query(args.container, `select coalesce(jsonb_agg(to_jsonb(q) order by "attachmentId"), '[]'::jsonb) from (select source_table_id as "tableId", source_record_id as "recordId", source_field_id as "fieldId", source_attachment_id as "attachmentId", filename, media_type as "mediaType", external_relative_path as "relativePath", sha256, size_bytes as size from art_therapy._migration_attachments) q;`) || "[]");
  const attachmentDigestMatch = digest(expectedAttachments) === digest(actualAttachments);
  const sourceArchive = {
    counts: { tables: sourceTables, fields: sourceFields, records: sourceRecords, values: sourceValues, links: sourceLinks },
    valueDiff: { expected: expectedValues, missing: missingValues, extra: extraValues, changed: changedValues },
    linkDiff: { expected: expectedLinks, missing: missingLinks, extra: extraLinks },
    snapshotManifest: { sha256: sourceManifest.digest, entries: sourceManifest.entries },
    digests: sourceDigests,
    attachments: { expected: expectedAttachments.length, actual: actualAttachments.length, digestMatch: attachmentDigestMatch },
  };
  const sourceArchivePass = sourceTables === 60 && sourceFields === 1484 && sourceRecords === 1114 && sourceValues === 10957 && sourceLinks === 1582 && expectedValues === sourceValues && missingValues === 0 && extraValues === 0 && changedValues === 0 && expectedLinks === sourceLinks && missingLinks === 0 && extraLinks === 0 && Object.values(sourceDigests).every((row) => row.match) && expectedAttachments.length === 6 && actualAttachments.length === 6 && attachmentDigestMatch;
  const rolesDenied = Object.values(deniedRoles).every((relations) => Object.values(relations).every(Boolean));
  const serviceRoleBypassesRls = query(args.container, "select rolbypassrls from pg_roles where rolname='service_role';") === "t";
  const canonicalRebuild = { artifactChecksumManifestSha256: canonicalManifest.digest, digestMatch: canonicalRebuildDigestMatch, directRelationships, mappedDirectRelationships, missingMappedTargets };
  const report = {
    status: Object.values(tables).every((row) => row.pass) && sourceArchivePass && canonicalRebuildDigestMatch && directRelationships === 753 && mappedDirectRelationships === 753 && missingMappedTargets === 0 && invalidForeignKeys === 0 && missingForeignKeyIndexes === 0 && tableCount === rlsEnabledCount && rolesDenied && serviceRoleBypassesRls && apiConfig.dedicatedSchemaExists && apiConfig.dedicatedSchemaExposed && apiConfig.canonicalSchemaNotExposed && serviceRoleViewCounts.tool_details === expected.tools.length && serviceRoleViewCounts.theory_details === expected.theories.length ? "PASS" : "FAIL",
    tables,
    sourceArchive,
    canonicalRebuild,
    constraints: { invalidForeignKeys, missingForeignKeyIndexes },
    rls: { tableCount, enabledAndForced: rlsEnabledCount, serviceRoleBypassesRls, deniedRoles },
    api: { ...apiConfig, serviceRoleViewCounts },
  };
  await writeFile(resolve(args.output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ status: report.status, verifiedTables: Object.keys(tables).length, sourceArchive, canonicalRebuild, invalidForeignKeys, missingForeignKeyIndexes, rls: report.rls, api: report.api })}\n`);
  if (report.status !== "PASS") process.exitCode = 1;
}

main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
