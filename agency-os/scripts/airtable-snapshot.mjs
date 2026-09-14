#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import readline from "node:readline";

const COMPUTED_TYPES = new Set(["formula", "lookup", "multipleLookupValues", "rollup", "count"]);

function parseArgs(argv) {
  const args = { downloadAttachments: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--output-dir") args.outputDir = argv[++index];
    else if (value === "--input-file") args.inputFile = argv[++index];
    else if (value === "--download-attachments") args.downloadAttachments = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.outputDir) throw new Error("--output-dir is required");
  return args;
}

async function readInput() {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    if (line.trim()) {
      input.close();
      return JSON.parse(line);
    }
  }
  throw new Error("Expected one JSON object on stdin");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function json(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function displayValue(value) {
  if (Array.isArray(value)) return value.map(displayValue);
  if (value && typeof value === "object") {
    if (typeof value.name === "string") return value.name;
    if (typeof value.filename === "string") return value.filename;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, displayValue(item)]));
  }
  return value;
}

function linkedRecordIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item : item?.id).filter((id) => /^rec[A-Za-z0-9]+$/.test(id));
}

function safeExtension(attachment) {
  const extension = extname(attachment.filename || "").slice(0, 12);
  return /^\.[A-Za-z0-9]+$/.test(extension) ? extension.toLowerCase() : "";
}

async function downloadWithRetry(url, target, expectedSize) {
  let lastError;
  const partial = `${target}.partial`;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      await pipeline(response.body, createWriteStream(partial, { flags: "wx" }));
      const actualSize = (await stat(partial)).size;
      if (Number.isFinite(expectedSize) && actualSize !== expectedSize) {
        throw new Error(`size mismatch: expected ${expectedSize}, got ${actualSize}`);
      }
      await rename(partial, target);
      return { size: actualSize, sha256: sha256(await readFile(target)) };
    } catch (error) {
      lastError = error;
      await rm(partial, { force: true });
      if (attempt < 4) await new Promise((resolveDelay) => setTimeout(resolveDelay, 250 * 2 ** attempt));
    }
  }
  throw lastError;
}

export async function createSnapshot(bundle, outputDir, { downloadAttachments = false } = {}) {
  if (!bundle || typeof bundle !== "object") throw new Error("Snapshot bundle must be an object");
  const absoluteOutput = resolve(outputDir);
  try {
    await stat(absoluteOutput);
    throw new Error(`Output directory already exists: ${absoluteOutput}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(join(absoluteOutput, "tables"), { recursive: true });

  const errors = [];
  const tableBasics = bundle.tables ?? [];
  const detailsByTable = new Map((bundle.schemaDetails ?? []).map((table) => [table.tableId, table]));
  const pagesByTable = new Map();
  for (const page of bundle.pages ?? []) {
    if (!pagesByTable.has(page.tableId)) pagesByTable.set(page.tableId, []);
    pagesByTable.get(page.tableId).push(page);
  }

  if (new Set(tableBasics.map((table) => table.id)).size !== tableBasics.length) errors.push("duplicate table id");
  if (bundle.expectedTableCount !== undefined && tableBasics.length !== bundle.expectedTableCount) {
    errors.push(`table count mismatch: expected ${bundle.expectedTableCount}, got ${tableBasics.length}`);
  }

  const schemas = [];
  const recordsByTable = new Map();
  const recordIdsByTable = new Map();
  const summaries = [];
  let fieldCount = 0;
  let recordCount = 0;

  for (const table of tableBasics) {
    const detail = detailsByTable.get(table.id);
    const detailByField = new Map((detail?.fields ?? []).map((field) => [field.id, field]));
    const fieldIds = new Set(table.fields.map((field) => field.id));
    if (!detail) errors.push(`${table.id}: missing schema details`);
    if (fieldIds.size !== table.fields.length) errors.push(`${table.id}: duplicate field id`);
    for (const field of table.fields) {
      const fieldDetail = detailByField.get(field.id);
      if (!fieldDetail) errors.push(`${table.id}/${field.id}: missing field config`);
      if (fieldDetail && field.type !== fieldDetail.type) errors.push(`${table.id}/${field.id}: field type mismatch`);
      if (COMPUTED_TYPES.has(field.type) && !fieldDetail?.config) errors.push(`${table.id}/${field.id}: computed field config missing`);
    }
    if (detail && detail.fields.length !== table.fields.length) errors.push(`${table.id}: schema field count mismatch`);

    const fields = table.fields.map((field) => ({ ...field, config: detailByField.get(field.id)?.config }));
    schemas.push({ ...table, fields });
    fieldCount += fields.length;

    const pages = (pagesByTable.get(table.id) ?? []).sort((left, right) => left.pageIndex - right.pageIndex);
    if (pages.length === 0) errors.push(`${table.id}: no record page captured`);
    for (let index = 0; index < pages.length; index += 1) {
      if (pages[index].pageIndex !== index) errors.push(`${table.id}: missing or duplicate page index ${index}`);
      if (index > 0 && pages[index].cursorIn !== pages[index - 1].nextCursor) errors.push(`${table.id}: cursor discontinuity at page ${index}`);
    }
    if (pages.at(-1)?.nextCursor) errors.push(`${table.id}: pagination incomplete`);

    const records = pages.flatMap((page) => page.records ?? []).sort((left, right) => left.id.localeCompare(right.id));
    const recordIds = new Set(records.map((record) => record.id));
    if (recordIds.size !== records.length) errors.push(`${table.id}: duplicate record id`);
    const expectedRecords = pages.find((page) => Number.isInteger(page.totalRecordCount))?.totalRecordCount;
    if (expectedRecords !== undefined && expectedRecords !== records.length) {
      errors.push(`${table.id}: record count mismatch: expected ${expectedRecords}, got ${records.length}`);
    }
    for (const record of records) {
      for (const sourceFieldId of Object.keys(record.cellValuesByFieldId ?? {})) {
        if (!fieldIds.has(sourceFieldId)) errors.push(`${table.id}/${record.id}: unknown field ${sourceFieldId}`);
      }
    }
    recordsByTable.set(table.id, records);
    recordIdsByTable.set(table.id, recordIds);
    recordCount += records.length;
    summaries.push({
      tableId: table.id,
      tableName: table.name,
      fieldCount: fields.length,
      recordCount: records.length,
      pageCount: pages.length,
    });
  }

  const attachmentJobs = [];
  let linkedValueCount = 0;
  for (const table of schemas) {
    const fieldsById = new Map(table.fields.map((field) => [field.id, field]));
    for (const record of recordsByTable.get(table.id) ?? []) {
      for (const [fieldId, value] of Object.entries(record.cellValuesByFieldId ?? {})) {
        const field = fieldsById.get(fieldId);
        if (field?.type === "multipleRecordLinks") {
          const targetTableId = field.config?.linkedTableId ?? field.config?.linkedTable?.id;
          const links = linkedRecordIds(value);
          linkedValueCount += links.length;
          if (!targetTableId) errors.push(`${table.id}/${fieldId}: linked table config missing`);
          else for (const linkedId of links) {
            if (!recordIdsByTable.get(targetTableId)?.has(linkedId)) errors.push(`${table.id}/${record.id}/${fieldId}: orphan link ${linkedId}`);
          }
        }
        if (field?.type === "multipleAttachments" && Array.isArray(value)) {
          for (const attachment of value) {
            if (!attachment?.id || !attachment?.url) errors.push(`${table.id}/${record.id}/${fieldId}: incomplete attachment metadata`);
            else attachmentJobs.push({ tableId: table.id, recordId: record.id, fieldId, attachment });
          }
        }
      }
    }
  }

  const schemaText = json({ baseId: bundle.baseId, extractedAt: bundle.extractedAt, tables: schemas });
  await writeFile(join(absoluteOutput, "schema.json"), schemaText, { encoding: "utf8", flag: "wx" });

  const files = [{ path: "schema.json", sha256: sha256(schemaText), bytes: Buffer.byteLength(schemaText) }];
  for (const table of schemas) {
    const tableDir = join(absoluteOutput, "tables", table.id);
    await mkdir(tableDir, { recursive: true });
    const pages = (pagesByTable.get(table.id) ?? []).sort((left, right) => left.pageIndex - right.pageIndex);
    const pageText = json(pages.map(({ records, ...metadata }) => ({ ...metadata, recordIds: (records ?? []).map((record) => record.id) })));
    const recordLines = (recordsByTable.get(table.id) ?? []).map((record) => JSON.stringify(stable({
      tableId: table.id,
      recordId: record.id,
      createdTime: record.createdTime,
      rawValueByFieldId: record.cellValuesByFieldId ?? {},
      displayValueByFieldId: Object.fromEntries(Object.entries(record.cellValuesByFieldId ?? {}).map(([fieldId, value]) => [fieldId, displayValue(value)])),
    }))).join("\n");
    const recordsText = recordLines ? `${recordLines}\n` : "";
    await writeFile(join(tableDir, "pages.json"), pageText, { encoding: "utf8", flag: "wx" });
    await writeFile(join(tableDir, "records.jsonl"), recordsText, { encoding: "utf8", flag: "wx" });
    files.push({ path: `tables/${table.id}/pages.json`, sha256: sha256(pageText), bytes: Buffer.byteLength(pageText) });
    files.push({ path: `tables/${table.id}/records.jsonl`, sha256: sha256(recordsText), bytes: Buffer.byteLength(recordsText) });
  }

  const attachmentManifest = [];
  if (downloadAttachments) {
    for (const job of attachmentJobs) {
      const attachmentDir = join(absoluteOutput, "attachments", job.tableId, job.recordId, job.fieldId);
      await mkdir(attachmentDir, { recursive: true });
      const relativePath = `attachments/${job.tableId}/${job.recordId}/${job.fieldId}/${job.attachment.id}${safeExtension(job.attachment)}`;
      const result = await downloadWithRetry(job.attachment.url, join(absoluteOutput, relativePath), job.attachment.size);
      attachmentManifest.push({
        tableId: job.tableId,
        recordId: job.recordId,
        fieldId: job.fieldId,
        attachmentId: job.attachment.id,
        filename: basename(job.attachment.filename ?? ""),
        mediaType: job.attachment.type,
        relativePath,
        ...result,
      });
      files.push({ path: relativePath, ...result });
    }
  } else {
    for (const job of attachmentJobs) {
      attachmentManifest.push({
        tableId: job.tableId,
        recordId: job.recordId,
        fieldId: job.fieldId,
        attachmentId: job.attachment.id,
        filename: basename(job.attachment.filename ?? ""),
        mediaType: job.attachment.type,
        size: job.attachment.size,
        sourceUrlCaptured: true,
        downloaded: false,
      });
    }
  }
  const attachmentText = attachmentManifest.map((entry) => JSON.stringify(stable(entry))).join("\n") + (attachmentManifest.length ? "\n" : "");
  await writeFile(join(absoluteOutput, "attachments.jsonl"), attachmentText, { encoding: "utf8", flag: "wx" });
  files.push({ path: "attachments.jsonl", sha256: sha256(attachmentText), bytes: Buffer.byteLength(attachmentText) });

  if (attachmentJobs.length > 0 && !downloadAttachments) errors.push(`${attachmentJobs.length} attachment(s) not downloaded`);
  const validation = {
    status: errors.length === 0 && attachmentManifest.length === attachmentJobs.length ? "PASS" : "FAIL",
    baseId: bundle.baseId,
    extractedAt: bundle.extractedAt,
    tableCount: tableBasics.length,
    fieldCount,
    recordCount,
    linkedValueCount,
    attachmentCount: attachmentJobs.length,
    attachmentDownloadedCount: downloadAttachments ? attachmentManifest.length : 0,
    supabaseApplicationWrites: 0,
    errors,
    tables: summaries,
  };
  const validationText = json(validation);
  await writeFile(join(absoluteOutput, "validation.json"), validationText, { encoding: "utf8", flag: "wx" });
  files.push({ path: "validation.json", sha256: sha256(validationText), bytes: Buffer.byteLength(validationText) });

  const checksumText = files.sort((left, right) => left.path.localeCompare(right.path)).map((file) => `${file.sha256}  ${file.path}`).join("\n") + "\n";
  await writeFile(join(absoluteOutput, "checksums.sha256"), checksumText, { encoding: "utf8", flag: "wx" });
  const manifestText = json({ formatVersion: 1, baseId: bundle.baseId, extractedAt: bundle.extractedAt, outputDirectory: absoluteOutput, validationStatus: validation.status, files: files.length + 2 });
  await writeFile(join(absoluteOutput, "manifest.json"), manifestText, { encoding: "utf8", flag: "wx" });

  return { outputDirectory: absoluteOutput, validation };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bundle = args.inputFile ? JSON.parse(await readFile(resolve(args.inputFile), "utf8")) : await readInput();
  const result = await createSnapshot(bundle, args.outputDir, { downloadAttachments: args.downloadAttachments });
  process.stdout.write(`${JSON.stringify({ outputDirectory: result.outputDirectory, ...result.validation })}\n`);
  process.stdin.destroy();
  if (result.validation.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"))) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
