#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ACTIVE_TABLES = new Set([
  "五階段療程簡介", "五階段療程系統", "藝術治療工具", "輔助工具", "理論分類", "理論模式",
  "適用對象/族群", "核心概念&問題類型", "治療場所", "藝術治療工具標題", "Art-Therapy Tool（英文版）",
]);
const COMPUTED_TYPES = new Set(["formula", "lookup", "multipleLookupValues", "rollup", "count"]);
const ARCHIVE_RECOMMENDATIONS = /Exclude|Replace|Documentation\/config/i;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--snapshot") args.snapshot = argv[++index];
    else if (argv[index] === "--master-plan") args.masterPlan = argv[++index];
    else if (argv[index] === "--output-dir") args.outputDir = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  for (const key of ["snapshot", "masterPlan", "outputDir"]) if (!args[key]) throw new Error(`--${key.replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`)} is required`);
  return args;
}

export function parseDispositionMatrix(markdown) {
  const result = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
    if (match) result.set(match[2].trim(), { order: Number(match[1]), recommendation: match[3].trim(), explanation: match[4].trim() });
  }
  return result;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  return `${keys.join(",")}\n${rows.map((row) => keys.map((key) => csvCell(row[key])).join(",")).join("\n")}\n`;
}

function valuePresent(value) {
  return value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);
}

function normalizeTitle(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, "");
}

function diceSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const pairs = (value) => Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2));
  const remaining = pairs(right);
  let matches = 0;
  for (const pair of pairs(left)) {
    const index = remaining.indexOf(pair);
    if (index >= 0) { matches += 1; remaining.splice(index, 1); }
  }
  return (2 * matches) / (Math.max(0, left.length - 1) + Math.max(0, right.length - 1) || 1);
}

function candidateTarget(table, field, disposition, rowCount, nonemptyCount) {
  if (rowCount === 0 || nonemptyCount === 0) return { status: "source_archive_only", target: "-", transform: "preserve_schema_only" };
  if (ARCHIVE_RECOMMENDATIONS.test(disposition.recommendation)) return { status: "source_archive_only", target: "-", transform: "preserve_in_external_snapshot" };
  if (table.name === "Art-Therapy Tool（英文版）" || table.name === "Tool Translations") {
    if (COMPUTED_TYPES.has(field.type) || field.type === "createdTime") return { status: "source_archive_only", target: "-", transform: "preserve_migration_metadata" };
    return { status: "localization", target: "tool_localizations(locale='en').REVIEW_REQUIRED", transform: "reconcile_to_canonical_tool_then_copy" };
  }
  if (COMPUTED_TYPES.has(field.type)) return { status: "computed_definition", target: "derived_read_model.REVIEW_REQUIRED", transform: "rebuild_from_dependency_not_copy" };
  if (field.type === "multipleRecordLinks") return { status: "relationship", target: "relationship.REVIEW_REQUIRED", transform: "map_record_ids_to_canonical_ids" };
  if (table.name === "五階段療程系統") return { status: "relationship", target: "tool_healing_stages.REVIEW_REQUIRED", transform: "relationship_metadata" };
  if (table.name === "藝術治療工具標題") return { status: "source_archive_only", target: "-", transform: "preserve_as_documentation" };
  const codeTarget = disposition.explanation.match(/`([^`]+)`/)?.[1] ?? "canonical.REVIEW_REQUIRED";
  const localized = ["richText", "multilineText"].includes(field.type) || table.name === "藝術治療工具";
  return localized
    ? { status: "localization", target: `${codeTarget}_localization.REVIEW_REQUIRED`, transform: "copy_preserving_unicode_and_linebreaks" }
    : { status: "canonical_field", target: `${codeTarget}.REVIEW_REQUIRED`, transform: "typed_copy_after_approval" };
}

function readRecords(snapshot, tableId) {
  return readFile(join(snapshot, "tables", tableId, "records.jsonl"), "utf8").then((text) => text.trim() ? text.trim().split(/\r?\n/).map(JSON.parse) : []);
}

function linkedTableId(field) {
  return field.config?.linkedTableId ?? field.config?.linkedTable?.id ?? "UNKNOWN";
}

function mdTable(headers, rows) {
  return `| ${headers.join(" | ")} |\n|${headers.map(() => "---").join("|")}|\n${rows.map((row) => `| ${row.join(" | ")} |`).join("\n")}\n`;
}

export async function buildAudit(snapshotDirectory, masterPlanPath, outputDirectory) {
  const snapshot = resolve(snapshotDirectory);
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: false });
  const [schema, validation, masterPlan] = await Promise.all([
    readFile(join(snapshot, "schema.json"), "utf8").then(JSON.parse),
    readFile(join(snapshot, "validation.json"), "utf8").then(JSON.parse),
    readFile(resolve(masterPlanPath), "utf8"),
  ]);
  if (validation.status !== "PASS") throw new Error("Source snapshot validation is not PASS");
  const dispositions = parseDispositionMatrix(masterPlan);
  if (dispositions.size !== 60) throw new Error(`Expected 60 master-plan dispositions, got ${dispositions.size}`);

  const recordsByTable = new Map();
  for (const table of schema.tables) recordsByTable.set(table.id, await readRecords(snapshot, table.id));
  const tablesById = new Map(schema.tables.map((table) => [table.id, table]));
  const tableRows = [];
  const mappingRows = [];
  const relationships = [];
  const computed = [];
  for (const table of schema.tables) {
    const records = recordsByTable.get(table.id);
    const disposition = dispositions.get(table.name);
    if (!disposition) throw new Error(`No master-plan disposition for ${table.name}`);
    tableRows.push({
      order: disposition.order, table_id: table.id, table_name: table.name, record_count: records.length,
      field_count: table.fields.length, master_plan_disposition: disposition.recommendation,
      current_migration_scope: ACTIVE_TABLES.has(table.name) ? "active" : "archive_or_defer", approval_status: "pending",
    });
    for (const field of table.fields) {
      const nonempty = records.filter((record) => valuePresent(record.rawValueByFieldId[field.id])).length;
      const candidate = candidateTarget(table, field, disposition, records.length, nonempty);
      const row = {
        source_table_id: table.id, source_table_name: table.name, source_record_count: records.length,
        source_field_id: field.id, source_field_name: field.name, source_field_type: field.type, nonempty_count: nonempty,
        candidate_status: candidate.status, candidate_target: candidate.target, transform_rule: candidate.transform,
        preservation_rule: "external_snapshot_by_field_id", validation_rule: nonempty ? "nonempty_count_and_record_traceability" : "schema_presence",
        approval_status: "pending",
      };
      mappingRows.push(row);
      if (field.type === "multipleRecordLinks") relationships.push({
        source_table_id: table.id, source_table_name: table.name, source_field_id: field.id, source_field_name: field.name,
        target_table_id: linkedTableId(field), target_table_name: tablesById.get(linkedTableId(field))?.name ?? "UNKNOWN",
        nonempty_count: nonempty, candidate_target: candidate.target, approval_status: "pending",
      });
      if (COMPUTED_TYPES.has(field.type)) computed.push({
        source_table_id: table.id, source_table_name: table.name, source_field_id: field.id, source_field_name: field.name,
        source_type: field.type, nonempty_count: nonempty, config: JSON.stringify(field.config ?? {}),
        candidate_target: candidate.target, parity_rule: "compare_every_nonempty_source_result", approval_status: "pending",
      });
    }
  }
  tableRows.sort((left, right) => left.order - right.order);

  const chineseTable = schema.tables.find((table) => table.name === "藝術治療工具");
  const englishTable = schema.tables.find((table) => table.name === "Art-Therapy Tool（英文版）");
  const chineseRows = recordsByTable.get(chineseTable.id);
  const englishRows = recordsByTable.get(englishTable.id);
  const zhTitleIds = ["fldFrh2Fhj6OyGkSE", "flduaxljjFwshOzGp"];
  const enTitleIds = ["fldhMYlkfXI5NSuHL", "fld76eIafmTzChT3b"];
  const titleIndex = new Map();
  for (const record of chineseRows) for (const fieldId of zhTitleIds) {
    const key = normalizeTitle(record.rawValueByFieldId[fieldId]);
    if (key) {
      if (!titleIndex.has(key)) titleIndex.set(key, new Set());
      titleIndex.get(key).add(record.recordId);
    }
  }
  const chineseCandidates = chineseRows.map((record) => ({
    recordId: record.recordId,
    normalizedEnglishTitle: normalizeTitle(record.rawValueByFieldId[zhTitleIds[1]]),
  })).filter((candidate) => candidate.normalizedEnglishTitle);
  const translationRows = englishRows.map((record) => {
    const keys = enTitleIds.map((fieldId) => normalizeTitle(record.rawValueByFieldId[fieldId])).filter(Boolean);
    const matches = [...new Set(keys.flatMap((key) => [...(titleIndex.get(key) ?? [])]))];
    const status = keys.length === 0 ? "EMPTY" : matches.length === 1 ? "MATCHED" : matches.length > 1 ? "AMBIGUOUS" : "UNMATCHED";
    const normalizedEnglishTitle = normalizeTitle(record.rawValueByFieldId[enTitleIds[1]]);
    const suggestions = status === "UNMATCHED" && normalizedEnglishTitle
      ? chineseCandidates.map((candidate) => ({ ...candidate, score: diceSimilarity(normalizedEnglishTitle, candidate.normalizedEnglishTitle) }))
        .sort((left, right) => right.score - left.score).slice(0, 3).filter((candidate) => candidate.score >= 0.35)
      : [];
    return {
      english_record_id: record.recordId,
      source_title_zh: record.rawValueByFieldId[enTitleIds[0]] ?? "",
      source_title_en: record.rawValueByFieldId[enTitleIds[1]] ?? "",
      candidate_tool_record_ids: matches.join(";"), fuzzy_candidate_record_ids: suggestions.map((candidate) => candidate.recordId).join(";"),
      fuzzy_scores: suggestions.map((candidate) => candidate.score.toFixed(3)).join(";"), match_status: status,
      match_rule: status === "MATCHED" ? "exact_normalized_zh_or_en_title" : "manual_review_required", approval_status: "pending",
    };
  });
  const translationCounts = Object.fromEntries(["MATCHED", "UNMATCHED", "AMBIGUOUS", "EMPTY"].map((status) => [status, translationRows.filter((row) => row.match_status === status).length]));

  const populationTable = schema.tables.find((table) => table.name === "適用對象/族群");
  const populationRows = recordsByTable.get(populationTable.id).map((record) => {
    const clinicalCategory = record.displayValueByFieldId.fldlE8mVBrE3b3dWC ?? "";
    return {
      record_id: record.recordId,
      source_label_zh: record.rawValueByFieldId[populationTable.primaryFieldId] ?? "",
      source_label_en: record.rawValueByFieldId.fldmrGM9iq83ELnnv ?? "",
      source_problem_category: record.displayValueByFieldId.fldte4jCwzdWbsbrg ?? "",
      source_clinical_category: clinicalCategory,
      candidate_entity: clinicalCategory === "病理" ? "condition" : "presenting_concern",
      candidate_rule: clinicalCategory === "病理" ? "source clinical category = 病理" : "source clinical category = 心理 or 類病理",
      approval_status: "pending",
    };
  });
  const populationCandidateCounts = {
    condition: populationRows.filter((row) => row.candidate_entity === "condition").length,
    presenting_concern: populationRows.filter((row) => row.candidate_entity === "presenting_concern").length,
  };

  const activeNonemptyMappings = mappingRows.filter((row) => ACTIVE_TABLES.has(row.source_table_name) && row.nonempty_count > 0);
  const pendingMappings = activeNonemptyMappings.filter((row) => row.approval_status !== "approved");
  const zeroTables = tableRows.filter((row) => row.record_count === 0);
  const excludedPopulated = tableRows.filter((row) => row.record_count > 0 && ARCHIVE_RECOMMENDATIONS.test(row.master_plan_disposition));
  const hardBlocks = translationCounts.UNMATCHED + translationCounts.AMBIGUOUS + translationCounts.EMPTY + populationRows.length + pendingMappings.length;

  const files = new Map();
  files.set("airtable_table_disposition.md", `# Airtable table disposition\n\nSnapshot: \`${validation.extractedAt}\`. All decisions remain pending until user approval.\n\n${mdTable(["#", "table_id", "table", "rows", "fields", "master plan", "scope", "approval"], tableRows.map((row) => [row.order, row.table_id, row.table_name, row.record_count, row.field_count, row.master_plan_disposition, row.current_migration_scope, row.approval_status]))}`);
  files.set("airtable_field_mapping.csv", csv(mappingRows));
  files.set("airtable_relationship_graph.md", `# Airtable relationship graph\n\n${relationships.length} linked-record fields; ${relationships.filter((row) => row.nonempty_count > 0).length} currently nonempty. Target relationship names require approval.\n\n${mdTable(["source table", "field_id", "field", "target table", "nonempty", "candidate", "approval"], relationships.map((row) => [row.source_table_name, row.source_field_id, row.source_field_name, row.target_table_name, row.nonempty_count, row.candidate_target, row.approval_status]))}`);
  files.set("lookup_formula_rollup_map.md", `# Lookup / formula / rollup map\n\nComputed values are preserved in the snapshot. They must be rebuilt from approved dependencies and compared row-by-row; they are never copied as canonical truth.\n\n${mdTable(["table", "field_id", "field", "type", "nonempty", "candidate", "approval"], computed.map((row) => [row.source_table_name, row.source_field_id, row.source_field_name, row.source_type, row.nonempty_count, row.candidate_target, row.approval_status]))}`);
  files.set("v2_entity_catalog.md", `# V2 entity catalog candidate\n\nOnly active populated knowledge tables are in this migration wave. Empty research/training schemas are deferred.\n\n${mdTable(["source", "rows", "master-plan disposition", "approval"], tableRows.filter((row) => row.current_migration_scope === "active").map((row) => [row.table_name, row.record_count, row.master_plan_disposition, row.approval_status]))}`);
  files.set("v2_erd.md", `# V2 ERD candidate — approval required\n\n\`tools\` is the single Tool identity. Chinese and English content use \`tool_localizations\`. Lookup values are derived from joins.\n\n\`\`\`mermaid\nerDiagram\n  tools ||--o{ tool_localizations : has\n  tools ||--o{ tool_healing_stages : uses\n  healing_stages ||--o{ tool_healing_stages : classifies\n  tools }o--o{ therapeutic_focuses : tool_focuses\n  tools }o--o{ theories : tool_theories\n  theories }o--o{ theory_categories : theory_category_links\n  tools }o--o{ settings : tool_settings\n  tools }o--o{ support_methods : tool_support_methods\n\`\`\`\n\nStatus: **PENDING APPROVAL**. No DDL may be generated as approved until every active nonempty field has an exact target.\n`);
  files.set("translation_mapping.csv", csv(translationRows));
  files.set("migration_exceptions.md", `# Migration exceptions and blockers\n\n| blocker | count | required action |\n|---|---:|---|\n| Active nonempty field mappings pending approval | ${pendingMappings.length} | Approve exact target, transform and validation rule |\n| English Tool unmatched | ${translationCounts.UNMATCHED} | Select canonical Tool or approve archive-only |\n| English Tool ambiguous | ${translationCounts.AMBIGUOUS} | Select one canonical Tool |\n| English Tool empty identity | ${translationCounts.EMPTY} | Identify, archive-only, or approved exception |\n| Population semantic split | ${populationRows.length} | Classify each row as population, concern, or condition |\n| Populated excluded tables | ${excludedPopulated.length} | Confirm snapshot-only exclusion |\n| Zero-row tables | ${zeroTables.length} | Confirm deferred schema-only preservation |\n\nHard-block total (not deduplicated): **${hardBlocks}**.\n`);
  files.set("population_semantic_review.csv", csv(populationRows));
  files.set("research_data_classification.md", `# Research and clinical data classification\n\n- Research/training source tables with 0 rows: preserved as schema metadata only; no empty Supabase tables in this wave.\n- \`Clients\`, \`Appointments\`, \`Treatment Plans\`, \`Assessment Results\`, \`Therapists\`, and \`Finance\`: populated but excluded from the knowledge schema by the master plan; values remain in the encrypted/local source snapshot pending explicit domain decision.\n- Research participant identity data must be pseudonymous before any future canonical write.\n- Approval status: **PENDING**.\n`);
  files.set("v2_acceptance_criteria.md", `# V2 migration gates\n\n| gate | status | evidence / blocker |\n|---|---|---|\n| G1 source extract | PASS | 60 tables; 1,484 fields; 1,114 records; 1,582 linked values; 6/6 attachments; checksum failures 0 |\n| G2 mapping and ERD | BLOCKED | ${pendingMappings.length} active nonempty fields pending; English ${translationCounts.MATCHED}/${englishRows.length} exact matches; ${populationRows.length} semantic classifications pending |\n| G3 dry-run | NOT STARTED | Requires approved G2 |\n| G4 production write / verify / restore | NOT STARTED | Requires approved G3 and backup |\n\nSupabase application writes during G1/G2: **0**.\n`);
  files.set("audit-summary.json", `${JSON.stringify({
    sourceSnapshot: snapshot, sourceValidation: validation.status, tables: schema.tables.length,
    fields: mappingRows.length, records: validation.recordCount, activeTables: tableRows.filter((row) => row.current_migration_scope === "active").length,
    activeNonemptyFields: activeNonemptyMappings.length, pendingMappings: pendingMappings.length,
    relationships: relationships.length, computedFields: computed.length, zeroRowTables: zeroTables.length,
    excludedPopulatedTables: excludedPopulated.length, englishReconciliation: translationCounts,
    populationSemanticReview: { total: populationRows.length, ...populationCandidateCounts }, g1: "PASS", g2: "BLOCKED", supabaseApplicationWrites: 0,
  }, null, 2)}\n`);

  const checksums = [];
  for (const [name, content] of files) {
    await writeFile(join(output, name), content, { encoding: "utf8", flag: "wx" });
    checksums.push(`${createHash("sha256").update(content).digest("hex")}  ${name}`);
  }
  await writeFile(join(output, "checksums.sha256"), `${checksums.sort().join("\n")}\n`, { encoding: "utf8", flag: "wx" });
  return JSON.parse(files.get("audit-summary.json"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = await buildAudit(args.snapshot, args.masterPlan, args.outputDir);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"))) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
