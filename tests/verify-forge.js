// tests/verify-forge.js -- 验证炼器升阶（模块 F）：结构迁移/品阶乘子/铭纹/分解/升阶
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
 + '["TREASURE_TIERS","INSCRIPTIONS","treasureById","treasureBonus","equippedTreasure","ownsTreasure","addTreasure","findOwnedTreasure","normalizeTreasures","treasureSlotCount","forgeUnlocked","refineTreasure","inscribeTreasure","disassembleItem","playerAtk","playerMaxHp","effectiveCultMult","renderInventory","upgradeCave","caveBuildingLv","newState","TREASURES"].forEach(function(k){'
 + 'Object.defineProperty(o,k,{get(){try{return eval(k);}catch(e){return undefined;}}});});'
 + 'return o;})();';
vm.runInContext(code, ctx);
const t = ctx.__t;
function assert(c,msg){ if(!c){ throw new Error('ASSERT FAIL: '+msg); } }
const origRandom = ctx.Math.random;
function setRand(v){ ctx.Math.random = () => v; }
function restoreRand(){ ctx.Math.random = origRandom; }

// ---------- 1) 配置 ----------
assert(t.TREASURE_TIERS.length === 5, '品阶 5 阶');
assert(t.TREASURE_TIERS[4].mult === 3.0, '神器 mult 3.0');
assert(t.INSCRIPTIONS.length === 5, '铭纹 5 种');
console.log('配置: OK');

// ---------- 2) normalizeTreasures: id[] -> 对象数组 ----------
const norm = t.normalizeTreasures(['tr_fire','tr_basin']);
assert(JSON.stringify(norm) === JSON.stringify([{id:'tr_fire',tier:0,inscriptions:[]},{id:'tr_basin',tier:0,inscriptions:[]}]), `normalizeTreasures 转换，实际 ${JSON.stringify(norm)}`);
// 已是对象则保留 + 复制 inscriptions
const norm2 = t.normalizeTreasures([{id:'tr_fire',tier:2,inscriptions:['ins_atk']}]);
assert(norm2[0].tier === 2 && norm2[0].inscriptions[0] === 'ins_atk', 'normalizeTreasure 保留已炼器法宝');
assert(norm2[0].inscriptions !== norm[0].inscriptions, 'inscriptions 为副本（非引用共享）');
console.log('normalizeTreasures: OK');

// ---------- 3) 品阶乘子渗透 treasureBonus ----------
t.state = t.newState();
t.state.treasures = [{ id:'tr_fire', tier:0, inscriptions:[] }];
t.state.equip.treasure = 'tr_fire';
// tr_fire bonus {atk:0.20}，凡器 mult 1.0 -> atk 0.20
assert(Math.abs(t.treasureBonus().atk - 0.20) < 1e-9, `凡器 atk 0.20，实际 ${t.treasureBonus().atk}`);
// 升到法器(tier2, mult 1.7) -> atk 0.34
t.state.treasures[0].tier = 2;
assert(Math.abs(t.treasureBonus().atk - 0.34) < 1e-9, `法器 atk 0.34，实际 ${t.treasureBonus().atk}`);
// 神器(tier4, mult 3.0) -> atk 0.60
t.state.treasures[0].tier = 4;
assert(Math.abs(t.treasureBonus().atk - 0.60) < 1e-9, `神器 atk 0.60，实际 ${t.treasureBonus().atk}`);
console.log('品阶乘子: OK');

// ---------- 4) 铭纹累加 ----------
t.state.treasures[0].tier = 2;  // 2 槽
t.state.treasures[0].inscriptions = ['ins_atk','ins_def'];
// atk: 0.34(法器) + 0.05(锋锐) = 0.39；def: 0 + 0.05(厚土) = 0.05
assert(Math.abs(t.treasureBonus().atk - 0.39) < 1e-9, `法器+锋锐 atk 0.39，实际 ${t.treasureBonus().atk}`);
assert(Math.abs(t.treasureBonus().def - 0.05) < 1e-9, `厚土 def 0.05，实际 ${t.treasureBonus().def}`);
console.log('铭纹累加: OK');

// ---------- 5) 槽位数 = 品阶数 ----------
assert(t.treasureSlotCount(0)===0 && t.treasureSlotCount(4)===4, '槽位数 = 品阶数');
console.log('槽位数: OK');

// ---------- 6) forgeUnlocked ----------
t.state = t.newState();
assert(t.forgeUnlocked() === false, '未建炼器炉时锁定');
t.state.cave.buildings.cave_forge = 1;
assert(t.forgeUnlocked() === true, '建炼器炉后解锁');
console.log('forgeUnlocked: OK');

// ---------- 7) refineTreasure 升阶扣费/解锁 ----------
t.state = t.newState();
t.state.cave.buildings.cave_forge = 1;
t.state.treasures = [{ id:'tr_fire', tier:0, inscriptions:[] }];
t.state.lingshi = 1e9; t.state.inv.core = 100; t.state.inv.fragments = 100; t.state.inv.petPill = 100;
setRand(0);  // 成功
t.refineTreasure('tr_fire');
assert(t.state.treasures[0].tier === 1, `升阶 0->1，实际 ${t.state.treasures[0].tier}`);
// 失败返还 50% 碎片（净损耗一半）
const fragB = t.state.inv.fragments;
const costFrag = (t.state.treasures[0].tier + 1) * 2;  // 当前 tier=1，目标 tier=2，碎片=4
setRand(1);  // 失败
t.refineTreasure('tr_fire');
assert(t.state.treasures[0].tier === 1, '失败不升阶');
// 净损耗 = costFrag - floor(costFrag/2) = 4 - 2 = 2
assert(t.state.inv.fragments === fragB - costFrag + Math.floor(costFrag/2), `失败返还 50% 碎片，实际 ${t.state.inv.fragments}（预期 ${fragB - costFrag + Math.floor(costFrag/2)}）`);
// 未解锁时拒绝
t.state.cave.buildings.cave_forge = 0;
const tierB = t.state.treasures[0].tier;
t.refineTreasure('tr_fire');
assert(t.state.treasures[0].tier === tierB, '未建炼器炉不可升阶');
restoreRand();
console.log('refineTreasure: OK');

// ---------- 8) inscribeTreasure 镶嵌/槽满 ----------
t.state = t.newState();
t.state.treasures = [{ id:'tr_fire', tier:1, inscriptions:[] }];  // 1 槽
t.state.inv.ins_atk = 2;
t.inscribeTreasure('tr_fire','ins_atk');
assert(t.state.treasures[0].inscriptions.length === 1, '镶嵌 1 枚铭纹');
assert((t.state.inv.ins_atk||0) === 1, '铭纹库存 -1');
// 槽满
t.inscribeTreasure('tr_fire','ins_atk');
assert(t.state.treasures[0].inscriptions.length === 1, '槽满不可再镶');
console.log('inscribeTreasure: OK');

// ---------- 9) disassembleItem 分解 ----------
t.state = t.newState();
t.state.inv.core = 5;
t.disassembleItem('core', null);
assert((t.state.inv.core) === 0 && (t.state.inv.ins_atk||0) === 1, '分解妖核得锋锐纹');
// 材料不足拒绝
t.state.inv.herb = 3;
t.disassembleItem('herb', null);
assert((t.state.inv.ins_hp||0) === 0, '灵草不足不分解');
console.log('disassembleItem: OK');

// ---------- 10) renderInventory 不抛错 ----------
t.state = t.newState();
t.state.treasures = [{ id:'tr_fire', tier:2, inscriptions:['ins_atk'] }];
t.state.cave.buildings.cave_forge = 1;
let html = t.renderInventory();
assert(html.indexOf('refine-treasure') >= 0, '行囊渲染升阶按钮');
assert(html.indexOf('法器') >= 0, '行囊显示品阶');
console.log('renderInventory: OK');

console.log('ALL FORGE OK');
