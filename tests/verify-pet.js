// tests/verify-pet.js -- 验证灵宠系统（模块 D）：槽位/装备/加成/升星/孵化/掉落/助战
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
 + '["petBonus","petMaxSlots","equippedPets","petSpecies","equipPet","evolvePet","hatchPet","petOnBattleWin","petAttackDamage","petDmgRatio","petEvolveCost","petAffinityNeed","PET_SPECIES","PET_MAX_STAR","PET_DROP_CHANCE","playerAtk","newState","caveBuildingLv","upgradeCave","renderPet"].forEach(function(k){'
 + 'Object.defineProperty(o,k,{get(){try{return eval(k);}catch(e){return undefined;}}});});'
 + 'return o;})();';
vm.runInContext(code, ctx);
const t = ctx.__t;
function assert(c,msg){ if(!c){ throw new Error('ASSERT FAIL: '+msg); } }
const origRandom = ctx.Math.random;
function setRand(v){ ctx.Math.random = () => v; }
function restoreRand(){ ctx.Math.random = origRandom; }

// ---------- 1) 默认 petBonus 全 0，无兽栏槽位 0 ----------
t.state = t.newState();
const b0 = t.petBonus();
assert(b0.atk===0 && b0.def===0 && b0.maxhp===0 && b0.luck===0 && b0.drop===0 && b0.crit===0, '默认 petBonus 全 0');
assert(t.petMaxSlots()===0, '无兽栏时槽位 0');
console.log('默认 petBonus/槽位: OK');

// ---------- 2) 建兽栏 -> 槽位随等级 ----------
t.state = t.newState();
t.state.lingshi = 1e9;
t.upgradeCave('cave_field'); t.upgradeCave('cave_field');  // 灵田2（兽栏前置）
assert(t.petMaxSlots()===0, '兽栏未建槽位仍 0');
t.upgradeCave('cave_beast');  // 1 级
assert(t.petMaxSlots()===1, `兽栏1级槽位1，实际 ${t.petMaxSlots()}`);
t.upgradeCave('cave_beast');  // 2 级
assert(t.petMaxSlots()===2, `兽栏2级槽位2，实际 ${t.petMaxSlots()}`);
t.upgradeCave('cave_beast'); t.upgradeCave('cave_beast'); t.upgradeCave('cave_beast');  // 5 级
assert(t.petMaxSlots()===3, `兽栏5级槽位3（上限），实际 ${t.petMaxSlots()}`);
console.log('兽栏槽位: OK');

// ---------- 3) 装备/卸下 + 槽位上限 ----------
t.state = t.newState();
t.state.cave.buildings.cave_beast = 1;  // 1 槽
t.state.pets = [
  { uid:'pa', speciesId:'pet_finch', level:1, star:1, exp:0, affinity:0, equipped:false },
  { uid:'pb', speciesId:'pet_turtle', level:1, star:1, exp:0, affinity:0, equipped:false },
];
t.equipPet('pa');
assert(t.equippedPets().length===1 && t.equippedPets()[0].uid==='pa', '装备 pa');
t.equipPet('pb');  // 槽位已满，应失败
assert(t.equippedPets().length===1, '槽位满时不可再装备');
t.equipPet('pa');  // 卸下
assert(t.equippedPets().length===0, '卸下 pa');
console.log('装备/卸下/槽位上限: OK');

// ---------- 4) petBonus 反映已装备灵宠 ----------
t.state = t.newState();
t.state.cave.buildings.cave_beast = 5;
t.state.pets = [{ uid:'pf', speciesId:'pet_finch', level:10, star:1, exp:0, affinity:0, equipped:true }];
// finch: atk +0.08/级，power = 10*(1+0) = 10 -> atk +0.8
assert(Math.abs(t.petBonus().atk - 0.8) < 1e-9, `finch Lv10 atk +0.8，实际 ${t.petBonus().atk}`);
// 渗透到 playerAtk
const atkBefore = (() => { const sv = t.state.pets[0].equipped; t.state.pets[0].equipped = false; const v = t.playerAtk(); t.state.pets[0].equipped = sv; return v; })();
assert(t.playerAtk() === Math.round(atkBefore * 1.8), `finch atk 渗透 ×1.8，${atkBefore} -> ${t.playerAtk()}`);
// star 放大：升到 5 星
t.state.pets[0].star = 5;
// power = 10*(1+4*0.15)=10*1.6=16 -> atk +1.28
assert(Math.abs(t.petBonus().atk - 1.28) < 1e-9, `finch Lv10 5★ atk +1.28，实际 ${t.petBonus().atk}`);
console.log('petBonus/渗透: OK');

// ---------- 5) evolvePet 升星扣材料 + 满星 ----------
t.state = t.newState();
t.state.cave.buildings.cave_beast = 1;
t.state.pets = [{ uid:'pe', speciesId:'pet_finch', level:1, star:1, exp:0, affinity:0, equipped:false }];
t.state.inv.petPill = 5; t.state.inv.core = 20; t.state.lingshi = 1e8;
const cost1 = t.petEvolveCost(1);
t.equipPet('pe'); t.equipPet('pe');  // 确保未装备（两次切换回原态无所谓）
t.state.pets[0].equipped = false;
const pillB = t.state.inv.petPill, coreB = t.state.inv.core, liB = t.state.lingshi;
t.evolvePet('pe');
assert(t.state.pets[0].star===2, `升星 1->2，实际 ${t.state.pets[0].star}`);
assert(t.state.inv.petPill===pillB-cost1.petPill && t.state.inv.core===coreB-cost1.core && t.state.lingshi===liB-cost1.lingshi, '升星扣材料正确');
// 升满到 5 星
t.state.inv.petPill = 999; t.state.inv.core = 999; t.state.lingshi = 1e9;
while (t.state.pets[0].star < t.PET_MAX_STAR) t.evolvePet('pe');
assert(t.state.pets[0].star===t.PET_MAX_STAR, '满星 5');
const liAt = t.state.lingshi;
t.evolvePet('pe');
assert(t.state.pets[0].star===t.PET_MAX_STAR && t.state.lingshi===liAt, '满星后不可再升、不扣费');
console.log('evolvePet 升星: OK');

// ---------- 6) hatchPet 孵化 ----------
t.state = t.newState();
t.state.inv.petEgg = 2;
t.state.pets = [];
t.hatchPet();
assert(t.state.inv.petEgg===1 && t.state.pets.length===1, '孵化消耗 1 卵、得 1 灵宠');
assert(t.state.pets[0].star===1 && t.state.pets[0].level===1, '新灵宠 1★ Lv1');
t.state.inv.petEgg = 0;
t.hatchPet();  // 无卵
assert(t.state.pets.length===1, '无卵时孵化不增加灵宠');
console.log('hatchPet 孵化: OK');

// ---------- 7) 掉落去重：新种族 -> 灵宠；已有 -> 灵宠丹 ----------
t.state = t.newState();
t.state.cave.buildings.cave_beast = 1;
t.state.pets = [];
setRand(0);  // 强制掉落命中、选 pool[0]
const drop1 = t.petOnBattleWin({ var:2, zone:0 });  // zone0 -> finch
assert(drop1 && drop1.indexOf('火眼云雀') >= 0, `新种族掉落灵宠：${drop1}`);
assert(t.state.pets.length===1 && t.state.pets[0].speciesId==='pet_finch', '掉落 finch 入队');
// 再次掉落同种族 -> 灵宠丹
const pillBefore = t.state.inv.petPill || 0;
const drop2 = t.petOnBattleWin({ var:2, zone:0 });
assert(drop2 && drop2.indexOf('灵宠丹') >= 0, `已有种族折灵宠丹：${drop2}`);
assert((t.state.inv.petPill||0) === pillBefore + 1, '灵宠丹 +1');
restoreRand();
console.log('掉落去重: OK');

// ---------- 8) 亲和成长 ----------
t.state = t.newState();
t.state.cave.buildings.cave_beast = 1;
t.state.pets = [{ uid:'pk', speciesId:'pet_finch', level:1, star:1, exp:0, affinity:0, equipped:true }];
setRand(1);  // 不触发掉落
const affNeed = t.petAffinityNeed(1);  // 15
for (let i = 0; i < affNeed; i++) t.petOnBattleWin({ var:2, zone:0 });
assert(t.state.pets[0].level===2, `亲和满阈值升级 Lv1->2（需 ${affNeed} 场），实际 Lv${t.state.pets[0].level}`);
restoreRand();
console.log('亲和成长: OK');

// ---------- 9) 助战伤害段 ----------
t.state = t.newState();
t.state.cave.buildings.cave_beast = 1;
t.state.pets = [{ uid:'pat', speciesId:'pet_finch', level:5, star:3, exp:0, affinity:0, equipped:true }];
const fakeB = { mon:{ def: 10 } };
restoreRand();
const dmg = t.petAttackDamage(fakeB);
assert(dmg > 0, `灵宠助战伤害 >0，实际 ${dmg}`);
// 无装备灵宠时伤害 0
t.state.pets[0].equipped = false;
assert(t.petAttackDamage(fakeB) === 0, '无出战灵宠时助战伤害 0');
console.log('助战伤害段: OK');

// ---------- 10) petDmgRatio 1★~5★ ----------
assert(t.petDmgRatio(1)===0.2 && t.petDmgRatio(5)===0.5, 'petDmgRatio 1★0.2 ~ 5★0.5');
console.log('petDmgRatio: OK');

// ---------- 11) renderPet 解锁/锁定 ----------
t.state = t.newState();
let htmlLocked = t.renderPet();
assert(htmlLocked.indexOf('兽栏') >= 0, '无兽栏时 renderPet 显示锁定提示');
t.state.cave.buildings.cave_beast = 1;
t.state.pets = [{ uid:'pr', speciesId:'pet_finch', level:1, star:1, exp:0, affinity:0, equipped:false }];
let html = t.renderPet();
assert(html.indexOf('equip-pet') >= 0 && html.indexOf('evolve-pet') >= 0, 'renderPet 渲染装备/升星按钮');
console.log('renderPet: OK');

console.log('ALL PET OK');
