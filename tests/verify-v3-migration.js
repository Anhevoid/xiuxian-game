// tests/verify-v3-migration.js -- 验证 v2/v1 旧存档迁移至 v3，补字段正确、不清档
// 复用 smoke.js 的 mock 思路：mock 浏览器全局后用 vm 加载 game.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeEl(){
  return {
    style:{}, classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    textContent:'', innerHTML:'', value:'', disabled:false, dataset:{},
    appendChild(){}, removeChild(){}, remove(){}, addEventListener(){},
    getBoundingClientRect(){return {left:0,top:0,width:0,height:0};},
    closest(){return null;}, querySelector(){return null;}, querySelectorAll(){return [];},
    children:[], scrollTop:0, scrollHeight:0,
  };
}
const elStore = {};
function getEl(id){ if(!elStore[id]) elStore[id]=makeEl(); return elStore[id]; }
const ctx = {
  localStorage:{ _s:{}, getItem(k){return this._s[k]||null;}, setItem(k,v){this._s[k]=String(v);}, removeItem(k){delete this._s[k];} },
  document:{
    getElementById:getEl, querySelectorAll(){return [];}, querySelector(){return null;},
    createElement(){return makeEl();}, addEventListener(){}, removeEventListener(){}, hidden:false,
  },
  window:{ addEventListener(){}, removeEventListener(){} },
  setInterval:()=>0, clearInterval:()=>{}, setTimeout:()=>0, clearTimeout:()=>{},
  Date, Math, JSON, console, parseInt, parseFloat, isNaN, isFinite,
  confirm:()=>true, alert:()=>{},
};
ctx.globalThis = ctx;
vm.createContext(ctx);

let code = fs.readFileSync(path.join(__dirname,'..','game.js'),'utf8');
code += '\n;globalThis.__t=(function(){var o={};'
 + 'Object.defineProperty(o,"state",{get(){return state;},set(v){state=v;}});'
 + '["load","save","newState","defaultMeta","migrateV2toV3","migrateV1toV2","SAVE_KEY","SAVE_KEY_V2","SAVE_KEY_V1","SAVE_VERSION"].forEach(function(k){'
 + 'Object.defineProperty(o,k,{get(){try{return eval(k);}catch(e){return undefined;}}});});'
 + 'return o;})();';
vm.runInContext(code, ctx);
const t = ctx.__t;
function assert(c,msg){ if(!c){ throw new Error('ASSERT FAIL: '+msg); } }

// 常量
assert(t.SAVE_KEY === 'xiuxian_save_v3', `SAVE_KEY=xiuxian_save_v3，实际 ${t.SAVE_KEY}`);
assert(t.SAVE_KEY_V2 === 'xiuxian_save_v2', `SAVE_KEY_V2，实际 ${t.SAVE_KEY_V2}`);
assert(t.SAVE_KEY_V1 === 'xiuxian_save_v1', `SAVE_KEY_V1，实际 ${t.SAVE_KEY_V1}`);
assert(t.SAVE_VERSION === 3, `SAVE_VERSION=3，实际 ${t.SAVE_VERSION}`);
console.log('v3 常量: OK');

// ---------- 默认 newState 含全部 v3 字段 ----------
const ns = t.newState();
assert(ns.version === 3, 'newState.version=3');
assert(ns.meta && typeof ns.meta.daoFruit === 'number', 'newState.meta 存在');
assert(ns.meta.daoFruit === 0 && ns.meta.reincarnations === 0, 'meta 默认空起步');
assert(ns.meta.lifetime && ns.meta.lifetime.kills === 0, 'meta.lifetime 默认');
assert(Array.isArray(ns.meta.unlockedPaths), 'meta.unlockedPaths 默认 []');
assert(ns.cave && typeof ns.cave.buildings === 'object', 'cave.buildings 默认');
assert(Array.isArray(ns.pets) && ns.petSlots === 1, 'pets/petSlots 默认');
assert(ns.luck === 50, 'luck 默认 50');
assert(ns.karma && ns.karma.kill === 0 && ns.karma.merit === 0, 'karma 默认');
assert(ns.daoPath === null && ns.daoPathChosen === false, 'daoPath 默认 null');
assert(ns.insight === 0 && typeof ns.insightTree === 'object', 'insight 默认');
assert(ns.trib === null && ns.activeEvent === null && ns.expedition === null, '进行中状态默认 null');
assert(ns.inv.kangjie === 0 && ns.inv.petEgg === 0 && ns.inv.petPill === 0 && ns.inv.fragments === 0, 'inv 补 v3 材料');
console.log('newState v3 字段: OK');

// ---------- v2 -> v3 迁移 ----------
// 清空 localStorage，写入一份 v2 存档
ctx.localStorage._s = {};
const v2save = {
  version: 2, sub: 16, xiuwei: 5000, lingshi: 99999, hp: 2000,
  techniques: ['t0','t1'],
  equip: { weapon:'w2', armor:'a2', treasure:'tr_fire' },
  treasures: ['tr_fire','tr_basin'],   // id[] 形式（T7 前保持原样）
  inv: { herb:5, core:3, huiqi:2, xiuwei:1, tupo:0 },
  sect: { id:'sect_sword', contribution:200, switches:1, techs:['st_sword'] },
  bounties: [], bountyRefreshAt: 0, bountyRound: 3,
  stats: { kills:50, deaths:2, breakthroughs:10, meditations:30, bounties:5 },
  tupoBuff: false, debuff: null, lastMeditate: 0,
  lastSave: Date.now() - 120000,   // 2 分钟前（<60s 不计离线，>60s 计；这里 >60s 会结算少量离线）
  won: false, activeTab: 'zone', shopSubtab: 'tech',
};
ctx.localStorage.setItem(t.SAVE_KEY_V2, JSON.stringify(v2save));
// 确保没有 v3 存档
assert(ctx.localStorage.getItem(t.SAVE_KEY) === null, '迁移前无 v3 存档');

const ok = t.load();
assert(ok === true, 'v2 迁移后 load 返回 true');
assert(t.state.version === 3, `迁移后 version=3，实际 ${t.state.version}`);
// 旧 v2 数据保留
assert(t.state.sub === 16, '迁移后 sub 保留');
assert(t.state.lingshi === 99999, '迁移后 lingshi 保留');
assert(JSON.stringify(t.state.treasures) === JSON.stringify([{id:'tr_fire',tier:0,inscriptions:[]},{id:'tr_basin',tier:0,inscriptions:[]}]), `treasures 迁移为对象数组(品阶归零)，实际 ${JSON.stringify(t.state.treasures)}`);
assert(t.state.sect && t.state.sect.id === 'sect_sword' && t.state.sect.contribution === 200, 'sect 保留');
assert(t.state.techniques.length === 2, 'techniques 保留');
// v3 新字段补齐
assert(t.state.meta && t.state.meta.daoFruit === 0, '迁移后 meta 空起步（不补偿道果）');
assert(t.state.meta.bestSub === 16, `meta.bestSub=16，实际 ${t.state.meta.bestSub}`);
assert(t.state.cave && typeof t.state.cave.buildings === 'object', '迁移后 cave 补齐');
assert(t.state.luck === 50, '迁移后 luck=50');
assert(t.state.karma.kill === 0 && t.state.karma.merit === 0, '迁移后 karma 补齐');
assert(t.state.inv.kangjie === 0 && t.state.inv.fragments === 0, '迁移后 inv 补 v3 材料');
// sub=16 >= 12，老档视为已选道途
assert(t.state.daoPathChosen === true, 'sub>=12 老档 daoPathChosen=true（避免强制弹窗）');
// v2 存档已被迁移：v3 写入、v2 备份并移除
assert(ctx.localStorage.getItem(t.SAVE_KEY) !== null, '迁移后 v3 存档已写入');
assert(ctx.localStorage.getItem(t.SAVE_KEY_V2) === null, '迁移后 v2 存档已移除');
assert(ctx.localStorage.getItem(t.SAVE_KEY_V2 + '_bak') !== null, '迁移后 v2 已备份为 _bak');
console.log('v2 -> v3 迁移: OK');

// ---------- v1 -> v3 迁移链 ----------
ctx.localStorage._s = {};
const v1save = {
  version: 1, sub: 8, xiuwei: 1000, lingshi: 5000, hp: 500,
  techniques: ['t0'],
  equip: { weapon:'w1', armor:'a1' },   // v1 无 treasure 槽
  treasures: [],
  inv: { herb:2, core:1, huiqi:1, xiuwei:0, tupo:0 },
  stats: { kills:10, deaths:1, breakthroughs:5, meditations:8 },
  lastSave: Date.now(),
  won: false, activeTab: 'zone',
};
ctx.localStorage.setItem(t.SAVE_KEY_V1, JSON.stringify(v1save));
const ok2 = t.load();
assert(ok2 === true, 'v1 迁移后 load 返回 true');
assert(t.state.version === 3, `v1 迁移后 version=3，实际 ${t.state.version}`);
assert(t.state.sub === 8, 'v1 迁移后 sub 保留');
assert(t.state.equip.treasure === null, 'v1->v2->v3 补 treasure 槽为 null');
assert(t.state.sect === null, 'v1 迁移后 sect=null（v2 补）');
assert(t.state.meta && t.state.meta.daoFruit === 0, 'v1 迁移后 meta 补齐');
assert(ctx.localStorage.getItem(t.SAVE_KEY_V1) === null, 'v1 迁移后旧档已移除');
assert(ctx.localStorage.getItem(t.SAVE_KEY_V1 + '_bak') !== null, 'v1 已备份');
console.log('v1 -> v3 迁移链: OK');

// ---------- 版本不兼容：备份旧档不清档 ----------
ctx.localStorage._s = {};
ctx.localStorage.setItem(t.SAVE_KEY, JSON.stringify({ version: 99, sub: 0 }));
const ok3 = t.load();
assert(ok3 === false, '版本不兼容 load 返回 false');
assert(ctx.localStorage.getItem(t.SAVE_KEY) === null, '不兼容存档已移除');
assert(ctx.localStorage.getItem(t.SAVE_KEY + '_bak') !== null, '不兼容存档已备份');
console.log('版本不兼容备份: OK');

// ---------- 无存档：返回 false ----------
ctx.localStorage._s = {};
const ok4 = t.load();
assert(ok4 === false, '无存档 load 返回 false');
console.log('无存档: OK');

console.log('ALL V3 MIGRATION OK');
