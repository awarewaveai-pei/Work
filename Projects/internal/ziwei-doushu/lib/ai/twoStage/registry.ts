import type { SystemId } from '@/lib/divination/types';
import type { InputSpec } from '@/lib/divination/input';
import { ziweiSystem } from '@/lib/divination/systems/ziwei';
import { planZiweiReading, ZIWEI_VOCAB } from '@/lib/ziwei/twoStage';
import type { Vocabulary } from './factCheck';
import type { ReadingPlan } from './types';

/**
 * 接上兩段式解讀的系統。新增一個系統 = 補一列(輸入規格、確定性計畫、核對詞表、報告種類);生成與把關不改。
 * 目前只有紫微(卡 Z2);其他工具維持 /api/interpret。
 */
export interface TwoStageSystem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: InputSpec<any>;
  plan: (birth: never, today: string) => ReadingPlan;
  vocab: Vocabulary;
  /** 購買票上的 report 值 */
  report: string;
}

export const TWO_STAGE: Partial<Record<SystemId, TwoStageSystem>> = {
  ziwei: {
    input: ziweiSystem.input,
    plan: planZiweiReading as TwoStageSystem['plan'],
    vocab: ZIWEI_VOCAB,
    report: 'ziwei-deep',
  },
};
