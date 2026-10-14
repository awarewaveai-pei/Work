#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";

const UUID_NAMESPACE = "8fc138cb-2f44-5a67-93d8-331f01564de2";
const ACTIVE_TABLES = new Set([
  "五階段療程簡介", "五階段療程系統", "藝術治療工具", "輔助工具", "理論分類", "理論模式",
  "適用對象/族群", "核心概念&問題類型", "治療場所", "藝術治療工具標題", "Art-Therapy Tool（英文版）",
]);
const ENTITY_SPECS = new Map(Object.entries({
  "五階段療程簡介": { table: "healing_stages", localization: "healing_stage_localizations", prefix: "STAGE", titleField: "fld8rNHMhUMcVSmLD" },
  "藝術治療工具": { table: "tools", localization: "tool_localizations", prefix: "TOOL", titleField: "fldFrh2Fhj6OyGkSE" },
  "輔助工具": { table: "support_methods", localization: "support_method_localizations", prefix: "SUPPORT", titleField: "fldUoV51TtmDKrRMg" },
  "理論分類": { table: "theory_categories", localization: "theory_category_localizations", prefix: "THEORY-CAT", titleField: "fldC4cbI9kYzdDUuL" },
  "理論模式": { table: "theories", localization: "theory_localizations", prefix: "THEORY", titleField: "fldgHSiRLrnDz7PHX" },
  "核心概念&問題類型": { table: "therapeutic_focuses", localization: "therapeutic_focus_localizations", prefix: "FOCUS", titleField: "fldr0glIS8r5No4yU" },
  "治療場所": { table: "settings", localization: null, prefix: "SETTING", titleField: "fld9lPoNO9TOsBHlD" },
}));
const TARGET_OVERRIDES = new Map(Object.entries({
  fldhURlARgvRxQD70: "tool_localizations(locale='zh-TW').support_method_names_text",
  fld76eIafmTzChT3b: "tool_localizations(locale='en').title",
  fldXVlb09Cqow2mSq: "support_method_localizations(locale='en').title",
  fldF1NM1I7zbsYzEM: "theory_category_localizations(locale='en').title",
  fld5oHQJ6BE16Jzc0: "theory_localizations(locale='en').title",
}));
const LOCALIZATION_ENTITIES = new Map(Object.entries({
  tool_localizations: ["tools", "tool_id"],
  healing_stage_localizations: ["healing_stages", "healing_stage_id"],
  support_method_localizations: ["support_methods", "support_method_id"],
  theory_category_localizations: ["theory_categories", "theory_category_id"],
  theory_localizations: ["theories", "theory_id"],
  condition_localizations: ["conditions", "condition_id"],
  presenting_concern_localizations: ["presenting_concerns", "presenting_concern_id"],
  therapeutic_focus_localizations: ["therapeutic_focuses", "therapeutic_focus_id"],
}));

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--snapshot") args.snapshot = argv[++index];
    else if (argv[index] === "--audit-dir") args.auditDir = argv[++index];
    else if (argv[index] === "--output-dir") args.outputDir = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  for (const key of ["snapshot", "auditDir", "outputDir"]) if (!args[key]) throw new Error(`Missing --${key.replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`)}`);
  return args;
}

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...values] = rows.filter((item) => item.some((value) => value !== ""));
  return values.map((item) => Object.fromEntries(headers.map((header, index) => [header, item[index] ?? ""])));
}

export function normalize(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, "");
}

export function splitExactList(value) {
  return String(value ?? "").split(/[,，、;；\n]+/u).map((item) => item.trim()).filter(Boolean);
}

export function uuidV5(name, namespace = UUID_NAMESPACE) {
  const namespaceBytes = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const bytes = createHash("sha1").update(namespaceBytes).update(name).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function assertAuthoritativeEntityCount(entityName, canonicalRows, authoritativeSourceRows) {
  if (canonicalRows !== authoritativeSourceRows) {
    throw new Error(`${entityName} identity count must equal its authoritative source table: expected ${authoritativeSourceRows}, got ${canonicalRows}`);
  }
}

function present(value) {
  return value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function verifyChecksumManifest(rootDirectory, manifestName) {
  const root = resolve(rootDirectory);
  const manifestPath = resolve(root, manifestName);
  if (manifestPath !== root && !manifestPath.startsWith(`${root}${sep}`)) throw new Error(`Unsafe manifest path: ${manifestName}`);
  const text = await readFile(manifestPath, "utf8");
  const entries = text.split(/\r?\n/u).filter(Boolean).map((line) => {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/u);
    if (!match) throw new Error(`Invalid checksum line in ${manifestName}: ${line}`);
    const relativePath = match[2];
    if (isAbsolute(relativePath)) throw new Error(`Absolute checksum path is not allowed: ${relativePath}`);
    const filePath = resolve(root, relativePath);
    if (!filePath.startsWith(`${root}${sep}`)) throw new Error(`Checksum path escapes root: ${relativePath}`);
    return { expected: match[1], relativePath, filePath };
  });
  if (new Set(entries.map((entry) => entry.relativePath)).size !== entries.length) throw new Error(`Duplicate paths in ${manifestName}`);
  for (const entry of entries) {
    const actual = sha256(await readFile(entry.filePath));
    if (actual !== entry.expected) throw new Error(`Checksum mismatch: ${entry.relativePath}`);
  }
  return { text, digest: sha256(text), entries };
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}

function scalar(record, fieldId) {
  const display = record.displayValueByFieldId[fieldId];
  const raw = record.rawValueByFieldId[fieldId];
  const value = present(display) ? display : raw;
  if (!present(value)) return null;
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (value?.name) return String(value.name);
  return null;
}

function linkedIds(record, fieldId) {
  const raw = record.rawValueByFieldId[fieldId];
  return Array.isArray(raw) ? raw.map((item) => item?.id).filter(Boolean) : [];
}

function lookupNames(record, fieldId) {
  const value = record.displayValueByFieldId[fieldId] ?? record.rawValueByFieldId[fieldId];
  if (!present(value)) return [];
  if (Array.isArray(value)) return value.flatMap((item) => item?.name ?? item).map(String);
  if (value?.valuesByLinkedRecordId) return Object.values(value.valuesByLinkedRecordId).flat(3).map((item) => item?.name ?? item).filter(present).map(String);
  return [String(value?.name ?? value)];
}

function lookupValueRecordIds(record, fieldId) {
  const value = record.rawValueByFieldId[fieldId];
  const ids = [];
  const visit = (item) => {
    if (Array.isArray(item)) for (const child of item) visit(child);
    else if (item && typeof item === "object") {
      if (typeof item.id === "string" && item.id.startsWith("rec")) ids.push(item.id);
      else for (const child of Object.values(item)) visit(child);
    }
  };
  if (value?.valuesByLinkedRecordId) visit(Object.values(value.valuesByLinkedRecordId));
  return ids;
}

function sameSet(left, right) {
  const a = [...new Set(left.map(normalize).filter(Boolean))].sort();
  const b = [...new Set(right.map(normalize).filter(Boolean))].sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

async function readJsonLines(path) {
  const text = await readFile(path, "utf8");
  return text.trim() ? text.trim().split(/\r?\n/).map(JSON.parse) : [];
}

function sqlIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return value;
}

function sqlLoad(table, rows, types, chunkSize = 50) {
  if (!rows.length) return [];
  const columns = Object.keys(types).filter((column) => rows.some((row) => row[column] !== undefined));
  const columnSql = columns.map(sqlIdentifier).join(", ");
  const recordsSql = columns.map((column) => `${sqlIdentifier(column)} ${types[column]}`).join(", ");
  const statements = [];
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize).map((row) => Object.fromEntries(columns.filter((column) => row[column] !== undefined).map((column) => [column, row[column]])));
    const json = JSON.stringify(chunk).replaceAll("$migration$", "$migration_split$");
    statements.push(`insert into art_therapy.${sqlIdentifier(table)} (${columnSql})\nselect ${columnSql} from jsonb_to_recordset($migration$${json}$migration$::jsonb) as x(${recordsSql});\n`);
  }
  return statements;
}

function createDdl(localizationColumns) {
  const entityTables = ["tools", "healing_stages", "therapeutic_focuses", "theory_categories", "theories", "support_methods", "conditions", "presenting_concerns"];
  const sections = [
    "create extension if not exists pgcrypto;",
    "create schema if not exists art_therapy;",
    "revoke all on schema art_therapy from public, anon, authenticated;",
    "grant usage on schema art_therapy to anon, authenticated;",
  ];
  for (const table of entityTables) sections.push(`create table art_therapy.${table} (\n  id uuid primary key default gen_random_uuid(),\n  code text not null unique,\n  status text not null default 'active' check (status in ('active','retired')),\n  retired_at timestamptz,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now(),\n  check ((status = 'retired') = (retired_at is not null))\n);`);
  sections.push(`create table art_therapy.settings (\n  id uuid primary key default gen_random_uuid(),\n  code text not null unique,\n  title text not null,\n  setting_category text,\n  status text not null default 'active' check (status in ('active','retired')),\n  retired_at timestamptz,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now(),\n  check ((status = 'retired') = (retired_at is not null))\n);`);
  for (const [table, [entityTable, fk]] of LOCALIZATION_ENTITIES) {
    const columns = [...(localizationColumns.get(table) ?? [])].sort();
    if (!columns.includes("title")) columns.unshift("title");
    sections.push(`create table art_therapy.${table} (\n  id uuid primary key default gen_random_uuid(),\n  ${fk} uuid not null references art_therapy.${entityTable}(id) on delete cascade,\n  locale text not null check (locale in ('zh-TW','en')),\n${columns.map((column) => `  ${sqlIdentifier(column)} text`).join(",\n")},\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now(),\n  unique (${fk}, locale)\n);\ncreate index ${table}_${fk}_idx on art_therapy.${table} (${fk});`);
  }
  const junctions = [
    ["tool_focuses", "tool_id", "tools", "therapeutic_focus_id", "therapeutic_focuses"],
    ["tool_theories", "tool_id", "tools", "theory_id", "theories"],
    ["theory_category_links", "theory_id", "theories", "theory_category_id", "theory_categories"],
    ["tool_support_methods", "tool_id", "tools", "support_method_id", "support_methods"],
    ["tool_settings", "tool_id", "tools", "setting_id", "settings"],
  ];
  for (const [table, left, leftTable, right, rightTable] of junctions) sections.push(`create table art_therapy.${table} (\n  id uuid primary key default gen_random_uuid(),\n  ${left} uuid not null references art_therapy.${leftTable}(id) on delete cascade,\n  ${right} uuid not null references art_therapy.${rightTable}(id) on delete cascade,\n  created_at timestamptz not null default now(),\n  unique (${left}, ${right})\n);\ncreate index ${table}_${left}_idx on art_therapy.${table} (${left});\ncreate index ${table}_${right}_idx on art_therapy.${table} (${right});`);
  sections.push(`create table art_therapy.tool_healing_stages (\n  id uuid primary key default gen_random_uuid(),\n  tool_id uuid not null references art_therapy.tools(id) on delete cascade,\n  healing_stage_id uuid references art_therapy.healing_stages(id) on delete cascade,\n  phase_kind text not null check (phase_kind in ('healing_stage','pre_assessment')),\n  label_override text,\n  created_at timestamptz not null default now(),\n  check ((phase_kind = 'healing_stage' and healing_stage_id is not null and label_override is null) or (phase_kind = 'pre_assessment' and healing_stage_id is null and label_override is not null)),\n  unique nulls not distinct (tool_id, healing_stage_id, phase_kind, label_override)\n);\ncreate index tool_healing_stages_tool_id_idx on art_therapy.tool_healing_stages (tool_id);\ncreate index tool_healing_stages_healing_stage_id_idx on art_therapy.tool_healing_stages (healing_stage_id);`);
  sections.push(`create table art_therapy._schema_version (version text primary key, applied_at timestamptz not null default now());
create table art_therapy._migration_runs (id uuid primary key, snapshot_checksum text not null, mapping_version text not null, source_extracted_at timestamptz not null, status text not null check (status in ('dry_run_passed','production_loaded','verified')), counts jsonb not null, created_at timestamptz not null default now());
create table art_therapy._migration_field_map (id bigint generated always as identity primary key, run_id uuid not null references art_therapy._migration_runs(id), source_table_id text not null, source_table_name text not null, source_field_id text not null, source_field_name text not null, source_field_type text not null, nonempty_count integer not null, disposition text not null, target text, transform_rule text not null, approval_status text not null check (approval_status = 'approved'), unique (run_id, source_table_id, source_field_id));
create index migration_field_map_run_id_idx on art_therapy._migration_field_map (run_id);
create table art_therapy._migration_source_map (id bigint generated always as identity primary key, run_id uuid not null references art_therapy._migration_runs(id), source_table_id text not null, source_table_name text not null, source_record_id text not null, target_table text, target_id uuid, disposition text not null, unique nulls not distinct (run_id, source_table_id, source_record_id, target_table, target_id));
create index migration_source_map_run_id_idx on art_therapy._migration_source_map (run_id);
create index migration_source_map_source_idx on art_therapy._migration_source_map (source_table_id, source_record_id);
create table art_therapy._migration_exceptions (id uuid primary key, run_id uuid not null references art_therapy._migration_runs(id), exception_code text not null, source_table_id text, source_record_id text, source_field_id text, detail text not null, resolution text not null, approved boolean not null check (approved), created_at timestamptz not null default now());
create index migration_exceptions_run_id_idx on art_therapy._migration_exceptions (run_id);
create table art_therapy._migration_attachments (id uuid primary key, run_id uuid not null references art_therapy._migration_runs(id), source_table_id text not null, source_record_id text not null, source_field_id text not null, source_attachment_id text not null, filename text not null, media_type text, external_relative_path text not null, sha256 text not null, size_bytes bigint not null, unique (run_id, source_attachment_id));
create index migration_attachments_run_id_idx on art_therapy._migration_attachments (run_id);`);
  sections.push(`create view art_therapy.tool_details with (security_invoker = true) as
select t.id, t.code, zh.title as title_zh, en.title as title_en,
  coalesce((select array_agg(distinct coalesce(hsl.title, ths.label_override) order by coalesce(hsl.title, ths.label_override)) from art_therapy.tool_healing_stages ths left join art_therapy.healing_stage_localizations hsl on hsl.healing_stage_id = ths.healing_stage_id and hsl.locale = 'zh-TW' where ths.tool_id = t.id), '{}'::text[]) as healing_stage_names,
  coalesce((select array_agg(distinct fl.title order by fl.title) from art_therapy.tool_focuses tf join art_therapy.therapeutic_focus_localizations fl on fl.therapeutic_focus_id = tf.therapeutic_focus_id and fl.locale = 'zh-TW' where tf.tool_id = t.id), '{}'::text[]) as therapeutic_focus_names,
  coalesce((select array_agg(distinct tcl.title order by tcl.title) from art_therapy.tool_theories tt join art_therapy.theory_category_links tclink on tclink.theory_id = tt.theory_id join art_therapy.theory_category_localizations tcl on tcl.theory_category_id = tclink.theory_category_id and tcl.locale = 'zh-TW' where tt.tool_id = t.id), '{}'::text[]) as theory_category_names
from art_therapy.tools t
left join art_therapy.tool_localizations zh on zh.tool_id = t.id and zh.locale = 'zh-TW'
left join art_therapy.tool_localizations en on en.tool_id = t.id and en.locale = 'en';
create view art_therapy.theory_details with (security_invoker = true) as
select t.id, t.code, zh.title as title_zh, en.title as title_en,
  coalesce((select array_agg(distinct tcl.title order by tcl.title) from art_therapy.theory_category_links l join art_therapy.theory_category_localizations tcl on tcl.theory_category_id = l.theory_category_id and tcl.locale = 'zh-TW' where l.theory_id = t.id), '{}'::text[]) as theory_category_names
from art_therapy.theories t
left join art_therapy.theory_localizations zh on zh.theory_id = t.id and zh.locale = 'zh-TW'
left join art_therapy.theory_localizations en on en.theory_id = t.id and en.locale = 'en';`);
  const rlsTables = [...entityTables, "settings", ...LOCALIZATION_ENTITIES.keys(), "tool_healing_stages", ...junctions.map((row) => row[0]), "_schema_version", "_migration_runs", "_migration_field_map", "_migration_source_map", "_migration_exceptions", "_migration_attachments"];
  sections.push(rlsTables.map((table) => `alter table art_therapy.${table} enable row level security;\nalter table art_therapy.${table} force row level security;\nrevoke all on art_therapy.${table} from public, anon, authenticated;`).join("\n"));
  sections.push(`do $$
declare table_name text;
begin
  foreach table_name in array array[${rlsTables.map((table) => `'${table}'`).join(", ")}]
  loop
    execute format('create policy %I on art_therapy.%I for all to anon, authenticated using (false) with check (false)', table_name || '_explicit_default_deny', table_name);
  end loop;
end $$;`);
  sections.push("revoke all on art_therapy.tool_details, art_therapy.theory_details from public, anon, authenticated;\n");
  return `${sections.join("\n\n")}\n`;
}

function tableTypes(localizationColumns) {
  const result = {};
  for (const table of ["tools", "healing_stages", "therapeutic_focuses", "theory_categories", "theories", "support_methods", "conditions", "presenting_concerns"]) result[table] = { id: "uuid", code: "text" };
  result.settings = { id: "uuid", code: "text", title: "text", setting_category: "text" };
  for (const [table, [, fk]] of LOCALIZATION_ENTITIES) result[table] = { id: "uuid", [fk]: "uuid", locale: "text", ...Object.fromEntries([...(localizationColumns.get(table) ?? []), "title"].map((column) => [column, "text"])) };
  result.tool_healing_stages = { id: "uuid", tool_id: "uuid", healing_stage_id: "uuid", phase_kind: "text", label_override: "text" };
  result.tool_focuses = { id: "uuid", tool_id: "uuid", therapeutic_focus_id: "uuid" };
  result.tool_theories = { id: "uuid", tool_id: "uuid", theory_id: "uuid" };
  result.theory_category_links = { id: "uuid", theory_id: "uuid", theory_category_id: "uuid" };
  result.tool_support_methods = { id: "uuid", tool_id: "uuid", support_method_id: "uuid" };
  result.tool_settings = { id: "uuid", tool_id: "uuid", setting_id: "uuid" };
  result._schema_version = { version: "text" };
  result._migration_runs = { id: "uuid", snapshot_checksum: "text", mapping_version: "text", source_extracted_at: "timestamptz", status: "text", counts: "jsonb" };
  result._migration_field_map = { run_id: "uuid", source_table_id: "text", source_table_name: "text", source_field_id: "text", source_field_name: "text", source_field_type: "text", nonempty_count: "integer", disposition: "text", target: "text", transform_rule: "text", approval_status: "text" };
  result._migration_source_map = { run_id: "uuid", source_table_id: "text", source_table_name: "text", source_record_id: "text", target_table: "text", target_id: "uuid", disposition: "text" };
  result._migration_exceptions = { id: "uuid", run_id: "uuid", exception_code: "text", source_table_id: "text", source_record_id: "text", source_field_id: "text", detail: "text", resolution: "text", approved: "boolean" };
  result._migration_attachments = { id: "uuid", run_id: "uuid", source_table_id: "text", source_record_id: "text", source_field_id: "text", source_attachment_id: "text", filename: "text", media_type: "text", external_relative_path: "text", sha256: "text", size_bytes: "bigint" };
  return result;
}

export async function transformMigration(snapshotDirectory, auditDirectory, outputDirectory) {
  const snapshot = resolve(snapshotDirectory), audit = resolve(auditDirectory), output = resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  const [snapshotManifest, auditManifest] = await Promise.all([
    verifyChecksumManifest(snapshot, "checksums.sha256"),
    verifyChecksumManifest(audit, "checksums.sha256"),
  ]);
  const [schema, validation, mappingText, translationText, populationText, approvalText, attachmentRows] = await Promise.all([
    readFile(join(snapshot, "schema.json"), "utf8").then(JSON.parse),
    readFile(join(snapshot, "validation.json"), "utf8").then(JSON.parse),
    readFile(join(audit, "airtable_field_mapping.csv"), "utf8"),
    readFile(join(audit, "translation_mapping.csv"), "utf8"),
    readFile(join(audit, "population_semantic_review.csv"), "utf8"),
    readFile(join(audit, "migration-approval.json"), "utf8"),
    readJsonLines(join(snapshot, "attachments.jsonl")),
  ]);
  if (validation.status !== "PASS") throw new Error("Source validation must PASS");
  const approval = JSON.parse(approvalText);
  const snapshotChecksum = snapshotManifest.digest;
  assertEqual(approval.source_manifest_sha256, snapshotChecksum, "Approval source manifest");
  assertEqual(approval.audit_manifest_sha256, auditManifest.digest, "Approval audit manifest");
  for (const section of ["field_mapping", "translation_mapping", "population_mapping", "table_disposition"]) {
    const approvedFile = approval[section];
    const entry = auditManifest.entries.find((candidate) => candidate.relativePath === approvedFile.file);
    if (!entry) throw new Error(`Approved file is absent from audit manifest: ${approvedFile.file}`);
    assertEqual(entry.expected, approvedFile.sha256, `Approved digest for ${approvedFile.file}`);
  }
  const candidateMappings = parseCsv(mappingText);
  assertEqual(candidateMappings.length, approval.field_mapping.expected_rows, "Approved field mapping rows");
  assertEqual(candidateMappings.filter((row) => Number(row.nonempty_count) > 0 && ACTIVE_TABLES.has(row.source_table_name)).length, approval.field_mapping.expected_active_nonempty_rows, "Approved active nonempty mappings");
  assertEqual(candidateMappings.filter((row) => row.candidate_target.includes("REVIEW_REQUIRED")).length, approval.field_mapping.expected_review_required_targets, "Review-required mappings");
  if (approval.field_mapping.decision !== "approve_every_digest_locked_candidate_target_and_transform_rule") throw new Error("Field mapping approval decision is invalid");
  for (const [fieldId, target] of TARGET_OVERRIDES) {
    const row = candidateMappings.find((candidate) => candidate.source_field_id === fieldId);
    if (!row || row.candidate_target !== target) throw new Error(`Approved localization target mismatch for ${fieldId}`);
  }
  const mappings = candidateMappings.map((row) => ({ ...row, approval_status: "approved" }));
  const translationApprovals = parseCsv(translationText);
  const populationApprovals = parseCsv(populationText);
  assertEqual(translationApprovals.length, approval.translation_mapping.expected_rows, "Approved translation rows");
  assertEqual(populationApprovals.length, approval.population_mapping.expected_rows, "Approved population rows");
  for (const [status, expected] of Object.entries(approval.translation_mapping.expected_status_counts)) assertEqual(countBy(translationApprovals, "match_status")[status] ?? 0, expected, `Translation status ${status}`);
  for (const [entity, expected] of Object.entries(approval.population_mapping.expected_entity_counts)) assertEqual(countBy(populationApprovals, "candidate_entity")[entity] ?? 0, expected, `Population entity ${entity}`);
  if (translationApprovals.some((row) => row.match_status === "AMBIGUOUS")) throw new Error("Ambiguous English translation approval");
  if (populationApprovals.some((row) => !["condition", "presenting_concern"].includes(row.candidate_entity))) throw new Error("Invalid population approval");
  const mappingVersion = sha256(approvalText);
  const runId = uuidV5(`run:${snapshotChecksum}:${mappingVersion}`);
  const tables = new Map(schema.tables.map((table) => [table.name, table]));
  const records = new Map();
  for (const table of schema.tables) records.set(table.name, await readJsonLines(join(snapshot, "tables", table.id, "records.jsonl")));
  const actualCounts = {
    tables: schema.tables.length,
    fields: schema.tables.reduce((sum, table) => sum + table.fields.length, 0),
    records: [...records.values()].reduce((sum, rows) => sum + rows.length, 0),
    linkedValues: schema.tables.reduce((sum, table) => {
      const linkedFieldIds = new Set(table.fields.filter((field) => field.type === "multipleRecordLinks").map((field) => field.id));
      return sum + (records.get(table.name) ?? []).reduce((recordSum, record) => recordSum + [...linkedFieldIds].reduce((fieldSum, fieldId) => fieldSum + (Array.isArray(record.rawValueByFieldId[fieldId]) ? record.rawValueByFieldId[fieldId].length : 0), 0), 0);
    }, 0),
    attachments: attachmentRows.length,
  };
  for (const [key, actual] of Object.entries(actualCounts)) assertEqual(actual, validation[`${key.slice(0, -1)}Count`] ?? validation[`${key}Count`], `Source ${key}`);

  const localizationColumns = new Map([...LOCALIZATION_ENTITIES.keys()].map((table) => [table, new Set()]));
  for (const row of mappings.filter((item) => ACTIVE_TABLES.has(item.source_table_name) && Number(item.nonempty_count) > 0)) {
    const target = row.candidate_target.replace("conditions_or_presenting_concerns", "condition_localizations");
    const match = target.match(/^([a-z_]+)\(locale='[^']+'\)\.([a-z0-9_]+)$/);
    if (match && localizationColumns.has(match[1])) localizationColumns.get(match[1]).add(match[2]);
    if (row.candidate_target.startsWith("conditions_or_presenting_concerns")) localizationColumns.get("presenting_concern_localizations").add(match?.[2]);
  }
  for (const columns of localizationColumns.values()) columns.delete(undefined);

  const translationApprovalByRecord = new Map(translationApprovals.map((row) => [row.english_record_id, row]));
  const populationApprovalByRecord = new Map(populationApprovals.map((row) => [row.record_id, row]));
  if (translationApprovalByRecord.size !== translationApprovals.length) throw new Error("Duplicate English translation approval");
  if (populationApprovalByRecord.size !== populationApprovals.length) throw new Error("Duplicate population approval");
  const approvedExceptionRules = new Map(approval.exception_rules.map((rule) => [`${rule.code}:${rule.source_table_name}`, rule]));
  const approvedExceptionCounts = new Map([...approvedExceptionRules].map(([key]) => [key, 0]));
  const data = new Map(), canonicalBySource = new Map(), localizations = new Map(), explicitSourceMaps = new Map(), exceptions = [];
  const addRow = (table, row) => { if (!data.has(table)) data.set(table, []); data.get(table).push(row); return row; };
  const sourceKey = (tableId, recordId) => `${tableId}:${recordId}`;
  const addSourceMap = (table, record, targetTable, targetId, disposition = "canonical") => {
    const key = sourceKey(table.id, record.recordId);
    if (!explicitSourceMaps.has(key)) explicitSourceMaps.set(key, []);
    const candidate = { run_id: runId, source_table_id: table.id, source_table_name: table.name, source_record_id: record.recordId, target_table: targetTable, target_id: targetId, disposition };
    const duplicate = explicitSourceMaps.get(key).some((row) => row.target_table === targetTable && row.target_id === targetId && row.disposition === disposition);
    if (!duplicate) explicitSourceMaps.get(key).push(candidate);
  };
  const addException = (code, table, record, fieldId, detail, resolution) => {
    const approvalKey = `${code}:${table?.name ?? ""}`;
    const rule = approvedExceptionRules.get(approvalKey);
    if (rule) approvedExceptionCounts.set(approvalKey, approvedExceptionCounts.get(approvalKey) + 1);
    exceptions.push({
      id: uuidV5(`exception:${code}:${table?.id ?? ""}:${record?.recordId ?? ""}:${fieldId ?? ""}:${detail}`), run_id: runId,
      exception_code: code, source_table_id: table?.id, source_record_id: record?.recordId, source_field_id: fieldId,
      detail, resolution, approved: Boolean(rule),
    });
  };
  const ensureLocalization = (tableName, entityId, locale) => {
    const [, fk] = LOCALIZATION_ENTITIES.get(tableName);
    const key = `${tableName}:${entityId}:${locale}`;
    if (!localizations.has(key)) localizations.set(key, addRow(tableName, { id: uuidV5(key), [fk]: entityId, locale }));
    return localizations.get(key);
  };
  const setValue = (row, column, value, context) => {
    if (!present(value)) return;
    if (present(row[column]) && row[column] !== value && normalize(row[column]) !== normalize(value)) addException("LOCALIZATION_VALUE_PRECEDENCE", context.table, context.record, context.fieldId, `${column}: existing and incoming values differ semantically`, "Authoritative table value used; both raw values remain in immutable snapshot");
    row[column] = value;
  };
  const mappingsFor = (tableName) => mappings.filter((row) => row.source_table_name === tableName && Number(row.nonempty_count) > 0);
  const applyMappedFields = (sourceTable, record, entityId, populationKind = null) => {
    for (const mapping of mappingsFor(sourceTable.name)) {
      let target = mapping.candidate_target;
      if (populationKind) target = target.replace("conditions_or_presenting_concerns", `${populationKind}_localizations`);
      const match = target.match(/^([a-z_]+)\(locale='([^']+)'\)\.([a-z0-9_]+)$/);
      if (match && LOCALIZATION_ENTITIES.has(match[1])) {
        const value = scalar(record, mapping.source_field_id);
        if (present(value)) setValue(ensureLocalization(match[1], entityId, match[2]), match[3], value, { table: sourceTable, record, fieldId: mapping.source_field_id });
      } else if (sourceTable.name === "治療場所" && target.startsWith("settings.")) {
        const column = target.slice("settings.".length), entity = data.get("settings").find((row) => row.id === entityId), value = scalar(record, mapping.source_field_id);
        if (present(value)) entity[column] = value;
      }
    }
  };

  for (const [tableName, spec] of ENTITY_SPECS) {
    const table = tables.get(tableName), sourceRows = records.get(tableName);
    let sequence = 0;
    for (const record of sourceRows) {
      const title = scalar(record, spec.titleField);
      if (!normalize(title)) { addException("EMPTY_CANONICAL_IDENTITY", table, record, spec.titleField, "Record has no usable identity", "Source archive only"); continue; }
      sequence += 1;
      const id = uuidV5(`${table.id}:${record.recordId}`), row = { id, code: `${spec.prefix}-${String(sequence).padStart(6, "0")}` };
      if (spec.table === "settings") { row.title = title; row.setting_category = scalar(record, "fldSLKKy2YoE3KqRp"); }
      addRow(spec.table, row);
      canonicalBySource.set(sourceKey(table.id, record.recordId), { table: spec.table, id });
      addSourceMap(table, record, spec.table, id);
      applyMappedFields(table, record, id);
    }
  }
  assertAuthoritativeEntityCount("support_methods", data.get("support_methods").length, records.get("輔助工具").length);

  const populationTable = tables.get("適用對象/族群");
  let conditionSequence = 0, concernSequence = 0;
  for (const record of records.get(populationTable.name)) {
    const title = scalar(record, "fldkc5ARMKZwhvmVA");
    if (!normalize(title)) { addException("EMPTY_CANONICAL_IDENTITY", populationTable, record, "fldkc5ARMKZwhvmVA", "Population row has no usable identity", "Source archive only"); continue; }
    const populationApproval = populationApprovalByRecord.get(record.recordId);
    if (!populationApproval) throw new Error(`Missing population approval for ${record.recordId}`);
    const kind = populationApproval.candidate_entity;
    const targetTable = kind === "condition" ? "conditions" : "presenting_concerns";
    const sequence = kind === "condition" ? ++conditionSequence : ++concernSequence;
    const prefix = kind === "condition" ? "CONDITION" : "CONCERN", id = uuidV5(`${populationTable.id}:${record.recordId}`);
    addRow(targetTable, { id, code: `${prefix}-${String(sequence).padStart(6, "0")}` });
    canonicalBySource.set(sourceKey(populationTable.id, record.recordId), { table: targetTable, id });
    addSourceMap(populationTable, record, targetTable, id);
    applyMappedFields(populationTable, record, id, kind);
  }

  const zhToolTable = tables.get("藝術治療工具"), enToolTable = tables.get("Art-Therapy Tool（英文版）");
  const zhTools = records.get(zhToolTable.name), enTools = records.get(enToolTable.name);
  let englishMatched = 0, englishCreated = 0, englishEmpty = 0, nextToolSequence = data.get("tools").length;
  for (const record of enTools) {
    const sourceZh = scalar(record, "fldhMYlkfXI5NSuHL"), sourceEn = scalar(record, "fld76eIafmTzChT3b");
    const translationApproval = translationApprovalByRecord.get(record.recordId);
    if (!translationApproval) throw new Error(`Missing English translation approval for ${record.recordId}`);
    const approvedResolution = approval.translation_mapping.resolutions[translationApproval.match_status];
    if (!approvedResolution) throw new Error(`Unapproved English translation status ${translationApproval.match_status}`);
    if (translationApproval.match_status === "EMPTY") {
      if (normalize(sourceZh) || normalize(sourceEn) || approvedResolution !== "source_archive_only") throw new Error(`Invalid EMPTY English resolution for ${record.recordId}`);
      englishEmpty += 1;
      addException("EMPTY_ENGLISH_TOOL_IDENTITY", enToolTable, record, "fldhMYlkfXI5NSuHL", "English tool row contains no meaningful identity", "Source archive only");
      continue;
    }
    let toolId;
    if (translationApproval.match_status === "MATCHED") {
      if (approvedResolution !== "merge_only_into_the_single_exact_candidate_tool_record_id") throw new Error(`Invalid MATCHED resolution for ${record.recordId}`);
      const candidateIds = splitExactList(translationApproval.candidate_tool_record_ids.replaceAll(";", ","));
      if (candidateIds.length !== 1) throw new Error(`MATCHED English row must have exactly one approved candidate: ${record.recordId}`);
      englishMatched += 1;
      toolId = canonicalBySource.get(sourceKey(zhToolTable.id, candidateIds[0]))?.id;
      if (!toolId) throw new Error(`Approved English candidate does not exist: ${record.recordId}`);
    } else if (translationApproval.match_status === "UNMATCHED") {
      if (approvedResolution !== "create_new_canonical_tool_to_avoid_guessing_or_data_loss") throw new Error(`Invalid UNMATCHED resolution for ${record.recordId}`);
      englishCreated += 1; nextToolSequence += 1;
      toolId = uuidV5(`${enToolTable.id}:${record.recordId}`);
      addRow("tools", { id: toolId, code: `TOOL-${String(nextToolSequence).padStart(6, "0")}` });
      if (present(sourceZh)) ensureLocalization("tool_localizations", toolId, "zh-TW").title = sourceZh;
    } else throw new Error(`Unsupported English translation status ${translationApproval.match_status}`);
    canonicalBySource.set(sourceKey(enToolTable.id, record.recordId), { table: "tools", id: toolId });
    addSourceMap(enToolTable, record, "tools", toolId, translationApproval.match_status === "MATCHED" ? "merged_localization" : "created_from_english_source");
    applyMappedFields(enToolTable, record, toolId);
  }

  const canonicalId = (tableName, recordId) => canonicalBySource.get(sourceKey(tables.get(tableName).id, recordId))?.id;
  const relationRows = new Map();
  const addRelation = (tableName, key, row, sourceTable = null, sourceRecord = null) => {
    const mapKey = `${tableName}:${key}`;
    let target = relationRows.get(mapKey);
    if (!target) { target = addRow(tableName, { id: uuidV5(mapKey), ...row }); relationRows.set(mapKey, target); }
    if (sourceTable && sourceRecord) addSourceMap(sourceTable, sourceRecord, tableName, target.id, "relationship");
    return target;
  };
  const requireId = (tableName, recordId, context) => {
    const id = canonicalId(tableName, recordId);
    if (!id) throw new Error(`Unresolved linked record ${tableName}:${recordId} from ${context}`);
    return id;
  };

  const stageTable = tables.get("五階段療程簡介"), stageIndex = new Map(records.get(stageTable.name).map((record) => [normalize(scalar(record, "fld8rNHMhUMcVSmLD")), canonicalId(stageTable.name, record.recordId)]));
  const stageRelationTable = tables.get("五階段療程系統");
  for (const record of records.get(stageRelationTable.name)) {
    const label = scalar(record, "fld56Iklm0rnr0oIG");
    for (const toolRecordId of linkedIds(record, "fldooKlAYvEhYjH8q")) {
      const toolId = requireId(zhToolTable.name, toolRecordId, record.recordId);
      if (label === "癒療前：人格類型測試") addRelation("tool_healing_stages", `${toolId}:pre:${label}`, { tool_id: toolId, phase_kind: "pre_assessment", label_override: label }, stageRelationTable, record);
      else {
        const stageId = stageIndex.get(normalize(label));
        if (!stageId) throw new Error(`Unresolved healing stage '${label}' at ${record.recordId}`);
        addRelation("tool_healing_stages", `${toolId}:${stageId}`, { tool_id: toolId, healing_stage_id: stageId, phase_kind: "healing_stage" }, stageRelationTable, record);
      }
    }
  }
  for (const record of zhTools) {
    const toolId = canonicalId(zhToolTable.name, record.recordId);
    for (const focusRecordId of linkedIds(record, "fld3yyeurxaQsROYd")) {
      const focusId = requireId("核心概念&問題類型", focusRecordId, record.recordId);
      addRelation("tool_focuses", `${toolId}:${focusId}`, { tool_id: toolId, therapeutic_focus_id: focusId }, zhToolTable, record);
    }
    for (const theoryRecordId of linkedIds(record, "fld0M3Vqp8frbx1Sx")) {
      const theoryId = requireId("理論模式", theoryRecordId, record.recordId);
      addRelation("tool_theories", `${toolId}:${theoryId}`, { tool_id: toolId, theory_id: theoryId }, zhToolTable, record);
    }
  }
  const theoryTable = tables.get("理論模式");
  for (const record of records.get(theoryTable.name)) {
    const theoryId = canonicalId(theoryTable.name, record.recordId);
    for (const categoryRecordId of linkedIds(record, "fldHecJpxMcimoH2I")) {
      const categoryId = requireId("理論分類", categoryRecordId, record.recordId);
      addRelation("theory_category_links", `${theoryId}:${categoryId}`, { theory_id: theoryId, theory_category_id: categoryId }, theoryTable, record);
    }
  }

  const byLocalizedTitle = (localTable, locale = null) => {
    const [, fk] = LOCALIZATION_ENTITIES.get(localTable), result = new Map();
    for (const row of data.get(localTable) ?? []) {
      if ((locale && row.locale !== locale) || !normalize(row.title)) continue;
      const key = normalize(row.title);
      if (!result.has(key)) result.set(key, []);
      if (!result.get(key).includes(row[fk])) result.get(key).push(row[fk]);
    }
    return result;
  };
  const toolIndex = byLocalizedTitle("tool_localizations");
  const settingIndex = new Map();
  for (const row of data.get("settings") ?? []) {
    const key = normalize(row.title);
    if (!settingIndex.has(key)) settingIndex.set(key, []);
    settingIndex.get(key).push(row.id);
  }
  for (const record of zhTools) {
    const toolId = canonicalId(zhToolTable.name, record.recordId);
    for (const token of splitExactList(scalar(record, "fldUiLrwTdUj479nu"))) {
      const settingCandidates = settingIndex.get(normalize(token)) ?? [];
      if (settingCandidates.length === 1) {
        const settingId = settingCandidates[0];
        addRelation("tool_settings", `${toolId}:${settingId}`, { tool_id: toolId, setting_id: settingId }, zhToolTable, record);
      } else addException(settingCandidates.length ? "AMBIGUOUS_SETTING_TEXT" : "UNRESOLVED_SETTING_TEXT", zhToolTable, record, "fldUiLrwTdUj479nu", token, "Relationship token preserved in source snapshot; no guessed link created");
    }
  }
  const supportTable = tables.get("輔助工具");
  for (const record of records.get(supportTable.name)) {
    const supportId = canonicalId(supportTable.name, record.recordId);
    for (const token of splitExactList(scalar(record, "fldkk1fobcNr2Us9c"))) {
      const toolCandidates = toolIndex.get(normalize(token)) ?? [];
      if (toolCandidates.length === 1) {
        const toolId = toolCandidates[0];
        addRelation("tool_support_methods", `${toolId}:${supportId}`, { tool_id: toolId, support_method_id: supportId }, supportTable, record);
      } else addException(toolCandidates.length ? "AMBIGUOUS_TOOL_TEXT" : "UNRESOLVED_TOOL_TEXT", supportTable, record, "fldkk1fobcNr2Us9c", token, "Relationship token preserved in source snapshot; no guessed link created");
    }
  }

  const reconstructedStages = new Map(), reconstructedFocuses = new Map(), theoryCategories = new Map();
  const append = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
  const stageTitleById = new Map((data.get("healing_stage_localizations") ?? []).filter((row) => row.locale === "zh-TW").map((row) => [row.healing_stage_id, row.title]));
  for (const row of data.get("tool_healing_stages") ?? []) append(reconstructedStages, row.tool_id, row.label_override ?? stageTitleById.get(row.healing_stage_id));
  const focusTitleById = new Map((data.get("therapeutic_focus_localizations") ?? []).filter((row) => row.locale === "zh-TW").map((row) => [row.therapeutic_focus_id, row.title]));
  for (const row of data.get("tool_focuses") ?? []) append(reconstructedFocuses, row.tool_id, focusTitleById.get(row.therapeutic_focus_id));
  const categoryTitleById = new Map((data.get("theory_category_localizations") ?? []).filter((row) => row.locale === "zh-TW").map((row) => [row.theory_category_id, row.title]));
  for (const row of data.get("theory_category_links") ?? []) append(theoryCategories, row.theory_id, categoryTitleById.get(row.theory_category_id));
  let computedComparisons = 0;
  for (const record of zhTools) {
    const toolId = canonicalId(zhToolTable.name, record.recordId);
    if (present(record.rawValueByFieldId.fldttIzJSOurCCuI3)) { computedComparisons += 1; if (!sameSet(lookupNames(record, "fldttIzJSOurCCuI3"), reconstructedStages.get(toolId) ?? [])) throw new Error(`Stage lookup mismatch ${record.recordId}`); }
    if (present(record.rawValueByFieldId.fldWOin26XdDY3Ebr)) { computedComparisons += 1; if (!sameSet(lookupNames(record, "fldWOin26XdDY3Ebr"), reconstructedFocuses.get(toolId) ?? [])) throw new Error(`Focus lookup mismatch ${record.recordId}`); }
    if (present(record.rawValueByFieldId.fld31khhkhspFexkd)) {
      computedComparisons += 1;
      const sourceCategoryIds = lookupValueRecordIds(record, "fld31khhkhspFexkd").map((recordId) => canonicalId("理論分類", recordId));
      const canonicalCategoryIds = (data.get("tool_theories") ?? []).filter((row) => row.tool_id === toolId).flatMap((row) => (data.get("theory_category_links") ?? []).filter((link) => link.theory_id === row.theory_id).map((link) => link.theory_category_id));
      if (!sameSet(sourceCategoryIds, canonicalCategoryIds)) throw new Error(`Tool theory-category lookup mismatch ${record.recordId}`);
    }
  }
  for (const record of records.get(theoryTable.name)) {
    if (!present(record.rawValueByFieldId.fldmbBt1lgTuU0bU4)) continue;
    computedComparisons += 1;
    const theoryId = canonicalId(theoryTable.name, record.recordId);
    if (!sameSet(lookupNames(record, "fldmbBt1lgTuU0bU4"), theoryCategories.get(theoryId) ?? [])) throw new Error(`Theory-category lookup mismatch ${record.recordId}`);
  }

  for (const table of schema.tables) for (const record of records.get(table.name)) {
    const key = sourceKey(table.id, record.recordId);
    if (!explicitSourceMaps.has(key)) addSourceMap(table, record, null, null, ACTIVE_TABLES.has(table.name) ? "approved_source_archive_only" : "excluded_or_deferred_source_archive_only");
  }
  const sourceMaps = [...explicitSourceMaps.values()].flat();
  if (new Set(sourceMaps.map((row) => sourceKey(row.source_table_id, row.source_record_id))).size !== validation.recordCount) throw new Error("Not every source record is traceable");

  const fieldMapRows = mappings.map((row) => ({
    run_id: runId, source_table_id: row.source_table_id, source_table_name: row.source_table_name, source_field_id: row.source_field_id,
    source_field_name: row.source_field_name, source_field_type: row.source_field_type, nonempty_count: Number(row.nonempty_count),
    disposition: row.candidate_status, target: row.candidate_target === "-" ? undefined : row.candidate_target,
    transform_rule: row.transform_rule, approval_status: "approved",
  }));
  const attachmentMapRows = attachmentRows.map((row) => ({
    id: uuidV5(`attachment:${row.attachmentId}`), run_id: runId, source_table_id: row.tableId, source_record_id: row.recordId,
    source_field_id: row.fieldId, source_attachment_id: row.attachmentId, filename: row.filename, media_type: row.mediaType,
    external_relative_path: row.relativePath, sha256: row.sha256, size_bytes: row.size,
  }));
  for (const row of exceptions) for (const key of Object.keys(row)) if (row[key] === undefined) delete row[key];
  if (approvedExceptionRules.size !== approval.exception_rules.length) throw new Error("Duplicate approved exception rule");
  for (const [key, rule] of approvedExceptionRules) assertEqual(approvedExceptionCounts.get(key), rule.expected_count, `Approved exception count ${key}`);
  const checks = {
    sourceValidation: validation.status === "PASS",
    snapshotManifestVerified: true,
    auditManifestVerified: true,
    actualSourceCountsMatch: Object.entries(actualCounts).every(([key, actual]) => actual === (validation[`${key.slice(0, -1)}Count`] ?? validation[`${key}Count`])),
    allSourceRecordsTraceable: new Set(sourceMaps.map((row) => sourceKey(row.source_table_id, row.source_record_id))).size === validation.recordCount,
    fieldMappingCountMatches: fieldMapRows.length === validation.fieldCount,
    attachmentCountMatches: attachmentMapRows.length === validation.attachmentCount,
    translationApprovalsComplete: translationApprovalByRecord.size === enTools.length,
    populationApprovalsComplete: populationApprovalByRecord.size === records.get(populationTable.name).length,
    unresolvedLinkedRecordIds: 0,
    ambiguousEnglishTools: 0,
    unapprovedExceptions: exceptions.filter((row) => !row.approved).length,
  };
  if (Object.entries(checks).some(([key, value]) => key === "unapprovedExceptions" || key === "unresolvedLinkedRecordIds" || key === "ambiguousEnglishTools" ? value !== 0 : value !== true)) {
    throw new Error(`Migration checks failed: ${JSON.stringify(checks)}`);
  }
  const counts = Object.fromEntries([...data].map(([table, rows]) => [table, rows.length]));
  counts._migration_field_map = fieldMapRows.length;
  counts._migration_source_map = sourceMaps.length;
  counts._migration_exceptions = exceptions.length;
  counts._migration_attachments = attachmentMapRows.length;
  const runRow = { id: runId, snapshot_checksum: snapshotChecksum, mapping_version: mappingVersion, source_extracted_at: validation.extractedAt, status: "dry_run_passed", counts };
  data.set("_schema_version", [{ version: "2026-09-14.art-therapy-v2.1" }]);
  data.set("_migration_runs", [runRow]);
  data.set("_migration_field_map", fieldMapRows);
  data.set("_migration_source_map", sourceMaps);
  data.set("_migration_exceptions", exceptions);
  data.set("_migration_attachments", attachmentMapRows);

  const ddl = createDdl(localizationColumns), types = tableTypes(localizationColumns);
  await writeFile(join(output, "001_art_therapy_v2_schema.sql"), ddl, { encoding: "utf8", flag: "wx" });
  const loadOrder = ["tools", "healing_stages", "therapeutic_focuses", "theory_categories", "theories", "support_methods", "conditions", "presenting_concerns", "settings", ...LOCALIZATION_ENTITIES.keys(), "tool_healing_stages", "tool_focuses", "tool_theories", "theory_category_links", "tool_support_methods", "tool_settings", "_schema_version", "_migration_runs", "_migration_field_map", "_migration_source_map", "_migration_exceptions", "_migration_attachments"];
  const loadFiles = [];
  for (const table of loadOrder) {
    const statements = sqlLoad(table, data.get(table) ?? [], types[table]);
    for (let index = 0; index < statements.length; index += 1) {
      const name = `load_${String(loadFiles.length + 1).padStart(3, "0")}_${table}_${String(index + 1).padStart(3, "0")}.sql`;
      await writeFile(join(output, name), statements[index], { encoding: "utf8", flag: "wx" });
      loadFiles.push(name);
    }
  }
  const report = {
    status: "PASS", runId, snapshotChecksum, mappingVersion,
    approval: { status: "approved", version: approval.version, authority: approval.authority },
    source: actualCounts,
    englishReconciliation: { matched: englishMatched, created: englishCreated, emptyArchiveOnly: englishEmpty },
    population: { conditions: conditionSequence, presentingConcerns: concernSequence }, derivedSupportMethods: 0,
    computedComparisons, canonicalCounts: counts, approvedExceptions: exceptions.reduce((acc, row) => ({ ...acc, [row.exception_code]: (acc[row.exception_code] ?? 0) + 1 }), {}),
    checks,
    ddlFile: "001_art_therapy_v2_schema.sql", loadFiles,
  };
  await writeFile(join(output, "canonical-data.json"), `${JSON.stringify(Object.fromEntries(data), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await writeFile(join(output, "dry-run-report.json"), `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  const outputFiles = ["001_art_therapy_v2_schema.sql", "canonical-data.json", "dry-run-report.json", ...loadFiles];
  const checksums = [];
  for (const name of outputFiles) checksums.push(`${createHash("sha256").update(await readFile(join(output, name))).digest("hex")}  ${name}`);
  await writeFile(join(output, "checksums.sha256"), `${checksums.sort().join("\n")}\n`, { encoding: "utf8", flag: "wx" });
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await transformMigration(args.snapshot, args.auditDir, args.outputDir);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"))) {
  main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
}
