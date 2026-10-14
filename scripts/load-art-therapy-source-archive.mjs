#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { verifyChecksumManifest } from "./airtable-audit.mjs";

const snapshot = process.argv[2];
const output = process.argv[3];
if (!snapshot || !output) throw new Error("usage: load-art-therapy-source-archive.mjs <snapshot> <new-output-dir>");
const sourceManifest = await verifyChecksumManifest(snapshot);
await mkdir(output);
const snapshotMetadata = JSON.parse(await readFile(join(snapshot, "manifest.json"), "utf8"));
const snapshotName = sourceManifest.digest;
const schema = JSON.parse(await readFile(join(snapshot, "schema.json"), "utf8"));
const q = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;
const j = (value) => `${q(JSON.stringify(value ?? {}))}::jsonb`;
const iso = (value) => value ? `${q(value)}::timestamptz` : "null";
const sqlHeader = `-- Generated from immutable Airtable snapshot ${snapshotName}.\nbegin;\n`;
const sqlFooter = "commit;\n";
const tableSql = [sqlHeader];
const fieldSql = [sqlHeader];
const recordSql = [sqlHeader];
const valueSql = [sqlHeader];
const linkSql = [sqlHeader];
for (const table of schema.tables) {
  const recordsPath = join(snapshot, "tables", table.id, "records.jsonl");
  const records = (await readFile(recordsPath, "utf8")).split(/\r?\n/u).filter(Boolean).map(JSON.parse);
  tableSql.push(`insert into art_therapy._source_tables(id,name,record_count,field_count,source_snapshot,metadata) values(${q(table.id)},${q(table.name)},${records.length},${table.fields.length},${q(snapshotName)},${j(table)}) on conflict (id) do update set source_snapshot=case when row(_source_tables.name,_source_tables.record_count,_source_tables.field_count,_source_tables.source_snapshot,_source_tables.metadata) is not distinct from row(excluded.name,excluded.record_count,excluded.field_count,excluded.source_snapshot,excluded.metadata) then _source_tables.source_snapshot else null end;`);
  table.fields.forEach((field, index) => fieldSql.push(`insert into art_therapy._source_fields(id,table_id,name,field_type,field_order,metadata) values(${q(field.id)},${q(table.id)},${q(field.name)},${q(field.type)},${index},${j(field)}) on conflict (id) do update set name=case when row(_source_fields.table_id,_source_fields.name,_source_fields.field_type,_source_fields.field_order,_source_fields.metadata) is not distinct from row(excluded.table_id,excluded.name,excluded.field_type,excluded.field_order,excluded.metadata) then _source_fields.name else null end;`));
  for (const record of records) {
    recordSql.push(`insert into art_therapy._source_records(id,table_id,created_time,raw_values,display_values,source_snapshot) values(${q(record.recordId)},${q(table.id)},${iso(record.createdTime)},${j(record.rawValueByFieldId)},${j(record.displayValueByFieldId)},${q(snapshotName)}) on conflict (id) do update set source_snapshot=case when row(_source_records.table_id,_source_records.created_time,_source_records.raw_values,_source_records.display_values,_source_records.source_snapshot) is not distinct from row(excluded.table_id,excluded.created_time,excluded.raw_values,excluded.display_values,excluded.source_snapshot) then _source_records.source_snapshot else null end;`);
    for (const field of table.fields) {
      const raw = record.rawValueByFieldId?.[field.id];
      const display = record.displayValueByFieldId?.[field.id];
      const present = raw !== null && raw !== undefined && raw !== "" && (!Array.isArray(raw) || raw.length > 0);
      if (present) valueSql.push(`insert into art_therapy._source_record_values(record_id,field_id,raw_value,display_value,source_snapshot) values(${q(record.recordId)},${q(field.id)},${j(raw)},${display === null || display === undefined ? "null" : j(display)},${q(snapshotName)}) on conflict (record_id,field_id) do update set source_snapshot=case when row(_source_record_values.raw_value,_source_record_values.display_value,_source_record_values.source_snapshot) is not distinct from row(excluded.raw_value,excluded.display_value,excluded.source_snapshot) then _source_record_values.source_snapshot else null end;`);
    }
    const fieldsById = new Map(table.fields.map((field) => [field.id, field]));
    for (const [fieldId, raw] of Object.entries(record.rawValueByFieldId ?? {})) {
      if (fieldsById.get(fieldId)?.type !== "multipleRecordLinks" || !Array.isArray(raw)) continue;
      raw.forEach((linked, ordinal) => { if (linked?.id) linkSql.push(`insert into art_therapy._source_links(source_record_id,source_field_id,linked_record_id,ordinal,source_snapshot) values(${q(record.recordId)},${q(fieldId)},${q(linked.id)},${ordinal},${q(snapshotName)}) on conflict (source_record_id,source_field_id,linked_record_id,ordinal) do update set source_snapshot=case when _source_links.source_snapshot is not distinct from excluded.source_snapshot then _source_links.source_snapshot else null end;`); });
    }
  }
}
tableSql.push(sqlFooter); fieldSql.push(sqlFooter); recordSql.push(sqlFooter); valueSql.push(sqlFooter); linkSql.push(sqlFooter);
const writeChunks = async (prefix, lines, size = 80) => {
  const body = lines.slice(1, -1);
  const files = [];
  for (let i = 0; i < body.length; i += size) {
    const path = join(output, `${prefix}-${String(files.length + 1).padStart(3, "0")}.sql`);
    const content = `${sqlHeader}${body.slice(i, i + size).join("\n")}\n${sqlFooter}`;
    await writeFile(path, content, { encoding: "utf8", flag: "wx" });
    files.push({ name: basename(path), sha256: createHash("sha256").update(content).digest("hex"), bytes: Buffer.byteLength(content) });
  }
  return files;
};
const counts = { tables: tableSql.length - 2, fields: fieldSql.length - 2, records: recordSql.length - 2, values: valueSql.length - 2, links: linkSql.length - 2 };
if (JSON.stringify(counts) !== JSON.stringify({ tables: 60, fields: 1484, records: 1114, values: 10957, links: 1582 })) throw new Error(`Source archive count mismatch: ${JSON.stringify(counts)}`);
const files = [
  ...(await writeChunks("source-archive-tables", tableSql, 60)),
  ...(await writeChunks("source-archive-fields", fieldSql, 300)),
  ...(await writeChunks("source-archive-records", recordSql, 25)),
  ...(await writeChunks("source-archive-values", valueSql, 100)),
  ...(await writeChunks("source-archive-links", linkSql, 100)),
];
const archiveManifest = {
  version: 1,
  sourceSnapshot: {
    extractedAt: snapshotMetadata.extractedAt,
    checksumManifestSha256: sourceManifest.digest,
    checksumEntries: sourceManifest.entries,
  },
  counts,
  files,
};
await writeFile(join(output, "source-archive-manifest.json"), `${JSON.stringify(archiveManifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify({ ...counts, files: files.length, sourceManifestSha256: sourceManifest.digest }));
