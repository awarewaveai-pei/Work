/**
 * 命理系統註冊入口 (F3)。
 * import 此模組即完成所有系統註冊;app 端用 getSystem/listSystems 取用。
 * 新增系統:在此 import 並 registerSystem 一行即可。
 */
import { registerSystem } from './registry';
import { ziweiSystem } from './systems/ziwei';
import { baziSystem } from './systems/bazi';

registerSystem(ziweiSystem);
registerSystem(baziSystem);
// 後續系統(按 PLAN §18 路線圖):
// registerSystem(ichingSystem);
// registerSystem(tarotSystem);
// registerSystem(astrologySystem);

export * from './types';
export { getSystem, listSystems } from './registry';
