// tests/verify-cave.js -- 验证洞府建设系统（模块 C）：建造/升级/前置/产出/渗透/离线
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
 + '["caveBonus","caveBuildingLv","upgradeCave","caveFieldHerbPerSec","cavePrereqMet","caveOfflineProduce","CAVE_BUILDINGS","CAVE_MAX_LEVEL","effectiveCultMult","playerMaxHp","lingshiPerSec","alchemyChance","renderAlchemy","renderCave","newState","RECIPES","realmOf"].forEach(function(k){'
 + 'Object.defineProperty(o,k,{get(){try{return eval(k);}catch(e){return undefined;}}});});'
 + 'return o;})();';
vm.runInContext(code, ctx);
const t = ctx.__t;
function assert(c,msg){ if(!c){ throw new Error('ASSERT FAIL: '+msg); } }

// ---------- 1) 默认 caveBonus 全 0 ----------
const b0 = t.caveBonus();
assert(b0.cult===0 && b0.lingshi===0 && b0.maxhp===0 && b0.alch===0 && b0.field===0, '默认 caveBonus 全 0');
assert(t.caveFieldHerbPerSec()===0, '无灵田时灵草产出 0');
console.log('默认 caveBonus: OK');

// ---------- 2) upgradeCave 建造/扣费/升级 ----------
t.state = t.newState();
t.state.lingshi = 100000000;
const arrCost = t.CAVE_BUILDINGS.find(x=>x.id==='cave_array').prices[0];  // 1000
const liBefore = t.state.lingshi;
t.upgradeCave('cave_array');
assert(t.caveBuildingLv('cave_array')===1, '聚灵阵建成 1 级');
assert(t.state.lingshi === liBefore - arrCost, `扣 ${arrCost} 灵石，实际余 ${t.state.lingshi}`);
// caveBonus().cult = 0.12
assert(Math.abs(t.caveBonus().cult - 0.12) < 1e-9, '聚灵阵 1 级 cult +0.12');
// 升满 5 级
for (let i=0;i<4;i++) t.upgradeCave('cave_array');
assert(t.caveBuildingLv('cave_array')===t.CAVE_MAX_LEVEL, '聚灵阵满级 5');
assert(Math.abs(t.caveBonus().cult - 0.60) < 1e-9, '聚灵阵 5 级 cult +0.60');
// 满级后再升级无效
const liAt = t.state.lingshi;
t.upgradeCave('cave_array');
assert(t.caveBuildingLv('cave_array')===t.CAVE_MAX_LEVEL, '满级后不可再升');
assert(t.state.lingshi === liAt, '满级后不扣费');
console.log('upgradeCave 建造/升级/满级: OK');

// ---------- 3) 前置校验 ----------
t.state = t.newState();
t.state.lingshi = 100000000;
// cave_alchemy 需 cave_field 2 级；未达前置 -> 不建造、不扣费
t.upgradeCave('cave_alchemy');
assert(t.caveBuildingLv('cave_alchemy')===0, '前置未达时丹房不可建造');
// 建 cave_field 至 2 级
t.upgradeCave('cave_field'); t.upgradeCave('cave_field');
assert(t.caveBuildingLv('cave_field')===2, '灵田 2 级');
// 现在可建丹房
t.upgradeCave('cave_alchemy');
assert(t.caveBuildingLv('cave_alchemy')===1, '前置达后丹房可建造');
assert(Math.abs(t.caveBonus().alch - 0.04) < 1e-9, '丹房 1 级 alch +0.04');
console.log('前置校验: OK');

// ---------- 4) 灵草产出随等级/境界 ----------
t.state = t.newState();
t.state.lingshi = 100000000;
t.state.sub = 0;  // realmOf 0
t.upgradeCave('cave_field');  // 1 级
// herbPerSec = (1 * (1 + 0*0.3))/60 = 1/60
assert(Math.abs(t.caveFieldHerbPerSec() - 1/60) < 1e-9, `sub0 灵田1级 1/60/秒，实际 ${t.caveFieldHerbPerSec()}`);
t.state.sub = 12;  // realmOf 3
// herbPerSec = (1 * (1 + 3*0.3))/60 = 1.9/60
assert(Math.abs(t.caveFieldHerbPerSec() - 1.9/60) < 1e-9, `sub12 灵田1级 1.9/60/秒，实际 ${t.caveFieldHerbPerSec()}`);
console.log('灵草产出: OK');

// ---------- 5) 加成渗透到属性函数 ----------
t.state = t.newState();
// 聚灵阵 -> effectiveCultMult
t.state.techniques = [];
const mBefore = t.effectiveCultMult();
t.state.cave.buildings.cave_array = 2;  // cult +0.24
assert(Math.abs(t.effectiveCultMult() - (mBefore + 0.24)) < 1e-9, `聚灵阵2级 effectiveCultMult +0.24，实际 ${t.effectiveCultMult()}`);
// 灵泉 -> lingshiPerSec & playerMaxHp
t.state.cave.buildings = { cave_spring: 2 };  // lingshi +0.20, maxhp +0.08
const lpBefore = (() => { const sv = t.state.cave.buildings; t.state.cave.buildings = {}; const v = t.lingshiPerSec(); t.state.cave.buildings = sv; return v; })();
t.state.cave.buildings = { cave_spring: 2 };
assert(Math.abs(t.lingshiPerSec() - lpBefore * 1.20) < 1e-6, `灵泉2级 lingshiPerSec ×1.20，实际 ${t.lingshiPerSec()}`);
const hpBefore = (() => { const sv = t.state.cave.buildings; t.state.cave.buildings = {}; const v = t.playerMaxHp(); t.state.cave.buildings = sv; return v; })();
t.state.cave.buildings = { cave_spring: 2 };
assert(t.playerMaxHp() === Math.round(hpBefore * 1.08), `灵泉2级 playerMaxHp ×1.08，${hpBefore} -> ${t.playerMaxHp()}`);
// 丹房 -> alchemyChance
t.state.cave.buildings = { cave_alchemy: 3 };  // alch +0.12
const aBefore = (() => { const sv = t.state.cave.buildings; t.state.cave.buildings = {}; const v = t.alchemyChance(); t.state.cave.buildings = sv; return v; })();
t.state.cave.buildings = { cave_alchemy: 3 };
assert(Math.abs(t.alchemyChance() - (aBefore + 0.12)) < 1e-9, `丹房3级 alchemyChance +0.12，实际 ${t.alchemyChance()}`);
console.log('加成渗透: OK');

// ---------- 6) 抗劫丹配方解锁 ----------
t.state = t.newState();
let alchHtml = t.renderAlchemy();
assert(alchHtml.indexOf('r_kangjie') < 0, '未建丹房时炼丹页不显示抗劫丹配方');
t.state.cave.buildings.cave_alchemy = 1;
alchHtml = t.renderAlchemy();
assert(alchHtml.indexOf('r_kangjie') >= 0, '建丹房后炼丹页显示抗劫丹配方');
console.log('抗劫丹配方解锁: OK');

// ---------- 7) 离线灵草结算 ----------
t.state = t.newState();
t.state.cave.buildings.cave_field = 5;  // 5 级
t.state.sub = 0;
const herbBefore = t.state.inv.herb;
// caveOfflineProduce(sec): herbs = floor(fieldHerbPerSec * sec * OFFLINE_EFF)
// fieldHerbPerSec = 5/60；sec=3600, OFFLINE_EFF=0.5 -> 5/60*3600*0.5 = 150
t.caveOfflineProduce(3600);
assert(t.state.inv.herb === herbBefore + 150, `离线1h灵田5级产 150 灵草，实际 ${t.state.inv.herb}`);
console.log('离线灵草结算: OK');

// ---------- 8) renderCave 不抛错 ----------
t.state = t.newState();
t.state.lingshi = 1000000;
let caveHtml = t.renderCave();
assert(caveHtml.indexOf('仙府') >= 0 || caveHtml.indexOf('灵田') >= 0, 'renderCave 渲染出洞府建筑');
assert(caveHtml.indexOf('upgrade-cave') >= 0, 'renderCave 含升级按钮');
console.log('renderCave: OK');

console.log('ALL CAVE OK');
