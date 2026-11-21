import type { FieldSpec, Fields } from '@/lib/divination/input';
import { YEAR_MAX, YEAR_MIN } from '@/lib/divination/input';

/**
 * X1 輸入規格 → JSON Schema(MCP tools/list 的 inputSchema)。只做轉換,不另寫規格。
 * description 帶英文與繁中兩份說明。parseInput 仍是唯一的驗證者;這份 schema 只給模型看。
 */

export type JsonSchema = Record<string, unknown>;

const describe = (doc: { en: string; 'zh-TW': string }) => `${doc.en} / ${doc['zh-TW']}`;

function fieldSchema(spec: FieldSpec): JsonSchema {
  const description = describe(spec.doc);
  switch (spec.type) {
    case 'integer':
    case 'number':
      return { type: spec.type, minimum: spec.min, maximum: spec.max, description };
    case 'string':
      return { type: 'string', maxLength: spec.maxLength, description };
    case 'enum':
      return { type: 'string', enum: [...spec.values], description };
    case 'boolean':
      return { type: 'boolean', description };
    case 'timeZone':
      return { type: 'string', maxLength: 64, description: `${description} (IANA time zone, e.g. Asia/Taipei)` };
    case 'date':
      return {
        type: 'object',
        properties: {
          year: { type: 'integer', minimum: YEAR_MIN, maximum: YEAR_MAX },
          month: { type: 'integer', minimum: 1, maximum: 12 },
          day: { type: 'integer', minimum: 1, maximum: 31 },
        },
        required: ['year', 'month', 'day'],
        additionalProperties: false,
        description: `${description} (Gregorian date)`,
      };
    case 'object':
      return { ...objectSchema(spec.fields), description };
    case 'array':
      return { type: 'array', items: fieldSchema(spec.items), minItems: spec.minItems, maxItems: spec.maxItems, description };
  }
}

/** 一組欄位 → object schema(多餘欄位不收,與 parseInput 一致)。 */
export function objectSchema(fields: Fields): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const [k, spec] of Object.entries(fields)) {
    properties[k] = fieldSchema(spec);
    if (spec.required !== false) required.push(k);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false };
}
