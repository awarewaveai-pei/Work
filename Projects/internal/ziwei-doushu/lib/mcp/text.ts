import type { InterpretationContext } from '@/lib/divination/types';

const HEADER = {
  'zh-TW': '命盤事實(確定性計算結果,不含 AI 解讀;解讀請只依下列事實)',
  en: 'Chart facts (deterministic results, no AI interpretation; interpret from these facts only)',
} as const;

/** InterpretationContext → 給模型讀的純文字:標題、說明一行、每條事實一行「label: value」。 */
export function factsToText(context: InterpretationContext): string {
  return [
    `# ${context.headline}`,
    HEADER[context.locale],
    ...context.facts.map((f) => `- ${f.label}: ${f.value}`),
  ].join('\n');
}
