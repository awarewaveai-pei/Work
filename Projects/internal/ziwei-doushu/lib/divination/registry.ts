import type { DivinationSystem, SystemId } from './types';

/**
 * 命理系統登錄表 (F3)。各系統於 lib/divination/index.ts 註冊。
 * 以 Map 維護 → 查找/列舉 O(1)/O(n);新增系統不動此檔。
 */
const registry = new Map<SystemId, DivinationSystem>();

export function registerSystem(system: DivinationSystem): void {
  if (registry.has(system.meta.id)) {
    throw new Error(`命理系統重複註冊: ${system.meta.id}`);
  }
  registry.set(system.meta.id, system);
}

export function getSystem(id: SystemId): DivinationSystem | undefined {
  return registry.get(id);
}

export function listSystems(): DivinationSystem[] {
  return [...registry.values()];
}

/** 僅供測試:清空登錄表以隔離測試狀態。 */
export function __resetRegistry(): void {
  registry.clear();
}
