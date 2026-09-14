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
const SOURCE_ARCHIVE_FIELD_IDS = new Set([
  "fld0Wu0P49JOyKgSW", "fldqi8EanpcvSmEi7", "fldDREwCgkOC5C7PO", "fldCiMZbBPTRhwuFd",
  "fldnmWFv5yAdBAgNU", "fldzl2rvkMhTmLK0J", "fldXVmSTTf6wgjcZj", "fldhMYlkfXI5NSuHL",
  "fldJh6rE9gH39cmFV", "fld2gVqiIsxQ920zz", "fldRdMN8ZEIekski6", "fldKYiNy4peNIDIWD", "fld8yVQYXSyZ7HERa",
]);
const RELATION_TARGETS = new Map(Object.entries({
  fldrAhoRhQDqSw4qd: "tool_healing_stages.(tool_id,healing_stage_id)",
  fld3yyeurxaQsROYd: "tool_focuses.(tool_id,therapeutic_focus_id)",
  fld0M3Vqp8frbx1Sx: "tool_theories.(tool_id,theory_id)",
  fldhURlARgvRxQD70: "tool_support_methods.(tool_id,support_method_id)",
  fldUiLrwTdUj479nu: "tool_settings.(tool_id,setting_id)",
  fldkk1fobcNr2Us9c: "tool_support_methods.tool_id",
  fldooKlAYvEhYjH8q: "tool_healing_stages.tool_id",
  fld56Iklm0rnr0oIG: "tool_healing_stages.healing_stage_id",
  fld7HZZFURCOln7Cu: "theory_category_links.theory_id",
  fldgASfyFCQAWLm2S: "tool_theories.tool_id",
  fldHecJpxMcimoH2I: "theory_category_links.theory_category_id",
  fld5DnCGgHLubzNXf: "tool_focuses.tool_id",
}));
const TEXT_RELATION_FIELD_IDS = new Set(["fldhURlARgvRxQD70", "fldUiLrwTdUj479nu", "fldkk1fobcNr2Us9c"]);
const COMPUTED_TARGETS = new Map(Object.entries({
  fldttIzJSOurCCuI3: "tool_details.healing_stage_names",
  fldWOin26XdDY3Ebr: "tool_details.therapeutic_focus_names",
  fld31khhkhspFexkd: "tool_details.theory_category_names",
  fldmbBt1lgTuU0bU4: "theory_details.theory_category_names",
}));
const BROKEN_FORMULA_FIELD_IDS = new Set(["fldQEDoNGSoC2nh7v", "fld1xoDFdVh9kjeHb"]);
const COLUMN_BY_SOURCE_NAME = new Map(Object.entries({
  "階段名稱": "title",
  "對應五生": "five_life_correspondence",
  "核心任務": "core_task",
  "單次任務重點": "session_task_focus",
  "主題與任務": "themes_and_tasks",
  "階段任務簡述": "task_summary",
  "是否需反覆探索": "repeat_exploration_guidance",
  "建議次數（2.5hr/次）": "recommended_session_count_text",
  "五氣": "five_qi",
  "五元": "five_origin",
  "氣入位置": "qi_entry_location",
  "克服的五滅": "five_destructions_overcome",
  "五行對應": "five_phase_correspondence",
  "臟腑對應": "organ_correspondence",
  "五階段癒療": "healing_process_description",
  "常見個案語句": "common_client_statements",
  "治療目標摘要": "therapeutic_goal_summary",
  "藝術治療工具": "title",
  "英文": "title",
  "心理面向": "psychological_dimension",
  "可解讀出": "interpretive_possibilities",
  "可能會遇到的困難": "common_difficulties",
  "提示用語": "facilitation_prompts",
  "輔助工具": "title",
  "如何幫助": "how_it_helps",
  "為什麼可以幫助": "clinical_rationale",
  "延伸進階工具": "advanced_extensions",
  "為什麼適合（臨床說明）": "suitability_rationale",
  "治療場所": "title",
  "詳細流程步驟": "instructions",
  "空間與設備要求": "space_and_equipment_requirements",
  "材料與工具": "materials_summary",
  "時間（總長度／分段）": "duration_guidance",
  "反應紀錄建議方式": "response_recording_guidance",
  "藝術治療資源": "resources_summary",
  "免費線上工具": "free_online_resources",
  "付費線上工具": "paid_online_resources",
  "用途": "purpose",
  "類別": "category_name",
  "類別(英文)": "category_name",
  "理論分類": "title",
  "理論名稱": "title",
  "分類定義": "definition",
  "分類核心依據": "core_basis",
  "一句話讓小白懂": "plain_language_summary",
  "用途說明": "purpose",
  "創始人物與背景": "founders_and_background",
  "主要心理假設／人性觀": "psychological_assumptions_and_view_of_human_nature",
  "改變歷程的觀點": "view_of_change_process",
  "自我與意識系統的結構": "self_and_consciousness_structure",
  "症狀產生機制與診斷邏輯": "symptom_mechanism_and_diagnostic_logic",
  "對案主的理解": "understanding_of_client",
  "治療目標與改變歷程": "treatment_goals_and_change_process",
  "關係觀與治療者角色": "therapeutic_relationship_and_therapist_role",
  "運作機制（投射／敘事／象徵等）": "mechanisms_of_action",
  "常見技術與介入方式": "common_techniques_and_interventions",
  "藝術治療運用方式": "art_therapy_applications",
  "推薦媒材與活動": "recommended_media_and_activities",
  "與藝術治療融合的困難": "art_therapy_integration_challenges",
  "臨床適用族群與場域": "clinical_populations_and_settings",
  "國際採用與研究支持": "international_adoption_and_research_support",
  "與其他理論整合潛力": "integration_with_other_theories",
  "與創作心理歷程的關聯": "creative_psychological_process_relationship",
  "個體觀點與發展階段": "individual_perspective_and_developmental_stages",
  "文化脈絡中的適用性": "cultural_applicability",
  "適合哪類學生學習": "suitable_student_profiles",
  "教學重點建議": "teaching_priorities",
  "適合搭配哪些工具教學": "recommended_teaching_tools",
  "常見誤解與澄清點": "common_misunderstandings_and_clarifications",
  "適合搭配的閱讀文本／影片": "recommended_readings_and_videos",
  "與現代神經科學的對應觀點": "modern_neuroscience_correspondence",
  "跨文化應用建議": "cross_cultural_application_guidance",
  "與藝術創作歷程的哲學關聯": "philosophical_relationship_to_artmaking",
  "可作為教材模組的教學格式建議": "teaching_module_format_guidance",
  "可設計的評量指標": "assessment_indicator_guidance",
  "教學時常見學生反應與處理": "common_student_responses_and_handling",
  "與其他課程整合建議": "course_integration_guidance",
  "適合工作坊或模擬教學方式": "workshop_and_simulation_methods",
  "對臨床轉譯能力的影響": "clinical_translation_competency_impact",
  "可搭配的案例練習格式": "case_practice_formats",
  "觀察學生學習困難的線索": "student_learning_difficulty_indicators",
  "適合發展的學習成果任務": "learning_outcome_tasks",
  "教師需留意的教學倫理點": "teaching_ethics_considerations",
  "在職治療師進修的應用層次": "continuing_education_application_levels",
  "國際教材發展潛力": "international_curriculum_potential",
  "適合的個案狀態與療癒階段": "suitable_client_states_and_healing_stages",
  "個案可能的內在感受變化": "possible_client_internal_changes",
  "個案常見問題與回應建議": "common_client_questions_and_responses",
  "為什麼這個方法會有幫助？": "why_this_method_helps",
  "適合此理論的參與風格": "suitable_participation_styles",
  "需要的心理準備或態度": "psychological_readiness_and_attitude",
  "個案在療癒歷程中的角色轉變": "client_role_changes_during_healing",
  "案主可攜帶的作品象徵意涵": "portable_artwork_symbolism",
  "如果我感到混亂／不舒服怎麼辦？": "guidance_for_confusion_or_discomfort",
  "案主在此療法中的權利與選擇": "client_rights_and_choices",
  "可能的情緒風險與資源支持": "emotional_risks_and_support_resources",
  "個案常見的情緒迴避與防衛": "common_emotional_avoidance_and_defenses",
  "案主創作風格的個體差異": "individual_differences_in_artmaking_style",
  "與過往創傷經驗的關聯": "relationship_to_past_trauma",
  "個案可能對創作的誤解": "possible_client_misunderstandings_of_artmaking",
  "適合個案書寫或創作的引導句": "client_writing_and_artmaking_prompts",
  "個案在作品中投射的常見主題": "common_projected_themes_in_artwork",
  "案主的文化與信仰考量": "client_cultural_and_belief_considerations",
  "如何向個案說明理論來源與用途": "explaining_theory_origin_and_use_to_clients",
  "個案療癒歷程的自我回顧方式": "client_self_review_methods",
  "適合個案帶回家的日常練習": "take_home_practices",
  "創作結束後可開展的自我行動": "post_artmaking_self_actions",
  "療癒完成階段的象徵封存方式": "symbolic_closure_methods",
  "對象/族群（Who）": "name",
  "英文名稱 copy": "name",
  "主要治療目標（心理／情緒／生理面向）": "primary_therapeutic_goals",
  "問題分類": "concern_category",
  "分類（心理、類病理、病理）": "clinical_classification",
  "表現特徵": "presenting_features",
  "核心概念/問題類型": "title",
  "英文Core Concepts & Issue Categories": "title",
  "分類原因": "classification_rationale",
  "適用狀況": "applicable_situations",
  "典型觸發因子": "typical_triggers",
  "內在狀態": "internal_state",
  "生理反應": "physiological_responses",
  "表現行為": "observable_behaviors",
  "臨床關鍵詞": "clinical_keywords",
  "臨床風險等級": "clinical_risk_level",
  "幫助效益": "benefits",
  "效益說明": "benefit_rationale",
  "場所分類": "setting_category",
}));

function snakeAscii(value) {
  const result = value.normalize("NFKC").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return result || null;
}

function localizationTarget(tableName, fieldName) {
  const column = COLUMN_BY_SOURCE_NAME.get(fieldName) ?? snakeAscii(fieldName);
  if (!column) return null;
  const isEnglish = fieldName.includes("_EN") || fieldName.includes("英文") || (/[A-Za-z]/.test(fieldName) && !/[\u3400-\u9fff]/u.test(fieldName) && !fieldName.includes("_CH") && fieldName !== "Pinyin");
  if (tableName === "五階段療程簡介") return `healing_stage_localizations(locale='${isEnglish ? "en" : "zh-TW"}').${column}`;
  if (tableName === "藝術治療工具") return `tool_localizations(locale='${fieldName === "英文" ? "en" : "zh-TW"}').${column}`;
  if (tableName === "Art-Therapy Tool（英文版）") return `tool_localizations(locale='en').${column}`;
  if (tableName === "輔助工具") return `support_method_localizations(locale='${isEnglish ? "en" : "zh-TW"}').${column}`;
  if (tableName === "理論分類") return `theory_category_localizations(locale='${isEnglish ? "en" : "zh-TW"}').${column}`;
  if (tableName === "理論模式") return `theory_localizations(locale='${isEnglish ? "en" : "zh-TW"}').${column}`;
  if (tableName === "適用對象/族群") return `conditions_or_presenting_concerns(locale='${fieldName.includes("英文") ? "en" : "zh-TW"}').${column}`;
  if (tableName === "核心概念&問題類型") return `therapeutic_focus_localizations(locale='${fieldName.includes("英文") ? "en" : "zh-TW"}').${column}`;
  if (tableName === "治療場所") return `settings.${column}`;
  return null;
}

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
  if (SOURCE_ARCHIVE_FIELD_IDS.has(field.id)) return { status: "source_archive_only", target: "-", transform: "comparison_or_migration_key_only" };
  if (RELATION_TARGETS.has(field.id)) return {
    status: "relationship",
    target: RELATION_TARGETS.get(field.id),
    transform: TEXT_RELATION_FIELD_IDS.has(field.id) ? "normalized_exact_name_match_else_exception" : "map_record_ids_to_canonical_ids",
  };
  if (BROKEN_FORMULA_FIELD_IDS.has(field.id)) return { status: "source_archive_only", target: "-", transform: "preserve_broken_formula_definition_and_error_results" };
  if (COMPUTED_TARGETS.has(field.id)) return { status: "computed_definition", target: COMPUTED_TARGETS.get(field.id), transform: "rebuild_from_approved_relationship_join" };
  if (table.name === "Art-Therapy Tool（英文版）" || table.name === "Tool Translations") {
    if (COMPUTED_TYPES.has(field.type) || field.type === "createdTime") return { status: "source_archive_only", target: "-", transform: "preserve_migration_metadata" };
    const exactTarget = localizationTarget(table.name, field.name);
    return exactTarget
      ? { status: "localization", target: exactTarget, transform: "reconcile_to_canonical_tool_then_copy" }
      : { status: "approved_exception", target: "REVIEW_REQUIRED", transform: "manual_semantic_mapping" };
  }
  if (COMPUTED_TYPES.has(field.type)) return { status: "computed_definition", target: "derived_read_model.REVIEW_REQUIRED", transform: "rebuild_from_dependency_not_copy" };
  if (field.type === "multipleRecordLinks") return { status: "relationship", target: "relationship.REVIEW_REQUIRED", transform: "map_record_ids_to_canonical_ids" };
  if (table.name === "五階段療程系統") return { status: "relationship", target: "tool_healing_stages.REVIEW_REQUIRED", transform: "relationship_metadata" };
  if (table.name === "藝術治療工具標題") return { status: "source_archive_only", target: "-", transform: "preserve_as_documentation" };
  const exactTarget = localizationTarget(table.name, field.name);
  if (exactTarget) return { status: exactTarget.includes("localizations") ? "localization" : "canonical_field", target: exactTarget, transform: "copy_preserving_unicode_and_linebreaks" };
  return { status: "approved_exception", target: "REVIEW_REQUIRED", transform: "manual_semantic_mapping" };
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
  await mkdir(output, { recursive: true });
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
  const reviewRequiredMappings = activeNonemptyMappings.filter((row) => row.candidate_target.includes("REVIEW_REQUIRED"));
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
    activeNonemptyFields: activeNonemptyMappings.length, pendingMappings: pendingMappings.length, reviewRequiredTargets: reviewRequiredMappings.length,
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
