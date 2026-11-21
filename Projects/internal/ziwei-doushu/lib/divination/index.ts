/**
 * 命理系統註冊入口 (F3)。
 * import 此模組即完成所有系統註冊;app 端用 getSystem/listSystems 取用。
 * 只在伺服器端 import(占星、吠陀載入 wasm 檔)。
 * 新增系統:在此 import 並 registerSystem 一行即可。
 */
import { registerSystem } from './registry';
import { ziweiSystem } from './systems/ziwei';
import { baziSystem } from './systems/bazi';
import { ichingSystem } from './systems/iching';
import { tarotSystem } from './systems/tarot';
import { hehunSystem } from './systems/hehun';
import { fengshuiSystem } from './systems/fengshui';
import { qimenSystem } from './systems/qimen';
import { qianSystem } from './systems/qian';
import { zeriSystem } from './systems/zeri';
import { astrologySystem } from './systems/astrology';
import { vedicSystem } from './systems/vedicSystem';
import { dailySystem } from './systems/daily';

registerSystem(ziweiSystem);
registerSystem(baziSystem);
registerSystem(ichingSystem);
registerSystem(tarotSystem);
registerSystem(hehunSystem);
registerSystem(fengshuiSystem);
registerSystem(qimenSystem);
registerSystem(qianSystem);
registerSystem(zeriSystem);
registerSystem(astrologySystem);
registerSystem(vedicSystem);
registerSystem(dailySystem);

export * from './types';
export { getSystem, listSystems } from './registry';
