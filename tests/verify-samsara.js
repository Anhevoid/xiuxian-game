// tests/verify-samsara.js -- 验证轮回系统（模块 A）：天赋/结算/转世/天赋生效
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
 + '["samsaraBonus","buyTalent","talentLevel","talentNextCost","settleDaoFruit","reincarnSamsara","applySamsaraOnNewRun","accumulateLifetime","pathBonusForDaoFruit","SAMSAKA_TALENTS","SAMSAKA_MAX_LEVEL","TECHNIQUES","newState","defaultMeta","playerAtk","playerMaxHp","effectiveCultMult","playerDef","alchemyChance","TOTAL_SUB","realmName"].forEach(function(k){'
 + 'Object.defineProperty(o,k,{get(){try{return eval(k);}catch(e){return undefined;}}});});'
 + 'return o;})();';
vm.runInContext(code, ctx);
const t = ctx.__t;
function assert(c,msg){ if(!c){ throw new Error('ASSERT FAIL: '+msg); } }

// ---------- 1) 默认 samsaraBonus 全 0 ----------
const b0 = t.samsaraBonus();
assert(b0.cult === 0 && b0.atk === 0 && b0.def === 0 && b0.maxhp === 0, '默认 samsaraBonus 全 0');
assert(b0.meditateMul === 1 && b0.offlineCapHours === 0 && b0.memoryLevel === 0, '默认 samsaraBonus 放置/记忆 0');
console.log('默认 samsaraBonus: OK');

// ---------- 2) buyTalent 升级 + 扣道果 ----------
t.state.meta.daoFruit = 100;
t.state.meta.talents = {};
t.buyTalent('tal_vein');   // 价格 [3,5,8,12,18]，第一级 3
assert(t.talentLevel('tal_vein') === 1, `tal_vein 升至 1 级，实际 ${t.talentLevel('tal_vein')}`);
assert(t.state.meta.daoFruit === 97, `扣 3 道果，实际 ${t.state.meta.daoFruit}`);
assert(t.talentNextCost('tal_vein') === 5, `下一级价格 5，实际 ${t.talentNextCost('tal_vein')}`);
// 升满
for (let i = 0; i < 4; i++) t.buyTalent('tal_vein');
assert(t.talentLevel('tal_vein') === t.SAMSAKA_MAX_LEVEL, 'tal_vein 满级 5');
assert(t.talentNextCost('tal_vein') === null, '满级后下一级价格为 null');
console.log('buyTalent 升级/扣费: OK');

// ---------- 3) samsaraBonus 反映天赋等级 ----------
// tal_vein 满级 5 -> cult +0.75
assert(Math.abs(t.samsaraBonus().cult - 0.75) < 1e-9, `tal_vein 满级 cult=0.75，实际 ${t.samsaraBonus().cult}`);
// 点 tal_daoji 2 级 -> atk/def/maxhp 各 +0.10
t.state.meta.daoFruit = 100;
t.buyTalent('tal_daoji'); t.buyTalent('tal_daoji');
const b2 = t.samsaraBonus();
assert(Math.abs(b2.atk - 0.10) < 1e-9 && Math.abs(b2.def - 0.10) < 1e-9 && Math.abs(b2.maxhp - 0.10) < 1e-9, 'tal_daoji 2 级 atk/def/hp +0.10');
// tal_epiphany -> break/alch +0.03/级
t.buyTalent('tal_epiphany');
assert(Math.abs(t.samsaraBonus().break - 0.03) < 1e-9 && Math.abs(t.samsaraBonus().alch - 0.03) < 1e-9, 'tal_epiphany 1 级 break/alch +0.03');
console.log('samsaraBonus 反映等级: OK');

// ---------- 4) 渗透到属性函数 ----------
// 重置天赋，单独验证渗透
t.state = t.newState();
t.state.meta.talents = { tal_daoji: 3 };  // atk +0.15
const atkBefore = (() => { const save = t.state.meta.talents; t.state.meta.talents = {}; const v = t.playerAtk(); t.state.meta.talents = save; return v; })();
t.state.meta.talents = { tal_daoji: 3 };
const atkAfter = t.playerAtk();
assert(atkAfter === Math.round(atkBefore * 1.15), `tal_daoji 3 级 atk ×1.15，${atkBefore} -> ${atkAfter}`);
// tal_vein -> effectiveCultMult
t.state.meta.talents = { tal_vein: 2 };  // cult +0.30
assert(Math.abs(t.effectiveCultMult() - 1.30) < 1e-9, `tal_vein 2 级 effectiveCultMult=1.30，实际 ${t.effectiveCultMult()}`);
console.log('天赋渗透属性: OK');

// ---------- 5) settleDaoFruit 飞升结算 ----------
t.state = t.newState();
t.state.sub = 36;  // 飞升
t.state.meta.reincarnations = 0;
t.state.meta.lifetime = { kills:0, breakthroughs:0, meditations:0, ascensions:0 };
t.state.daoPath = null;  // 无道途 -> pathBonus 0
// 飞升 sub=36 -> floor(36/3)=12，首世 reincarnations=0
assert(t.settleDaoFruit(36, true) === 12, `飞升首世道果=12，实际 ${t.settleDaoFruit(36, true)}`);
// 兵解轮回 -30% 折扣：12 * 0.7 = 8.4 -> floor 8
assert(t.settleDaoFruit(36, false) === 8, `兵解折扣道果=8，实际 ${t.settleDaoFruit(36, false)}`);
// 道途加成：魔道 +2
t.state.daoPath = { id:'dao_demon' };
assert(t.settleDaoFruit(36, true) === 14, `魔道飞升道果=14，实际 ${t.settleDaoFruit(36, true)}`);
t.state.daoPath = { id:'dao_buddha' };
assert(t.settleDaoFruit(36, true) === 13, `佛道飞升道果=13，实际 ${t.settleDaoFruit(36, true)}`);
// 轮回次数保底 +2/次
t.state.daoPath = null;
t.state.meta.reincarnations = 3;
assert(t.settleDaoFruit(36, true) === 18, `3 次轮回保底道果=18，实际 ${t.settleDaoFruit(36, true)}`);
// lifetime kills 贡献
t.state.meta.reincarnations = 0;
t.state.meta.lifetime.kills = 500;
assert(t.settleDaoFruit(36, true) === 13, `500 击杀 +1 道果=13，实际 ${t.settleDaoFruit(36, true)}`);
console.log('settleDaoFruit 结算: OK');

// ---------- 6) reincarnSamsara: meta 保留 + 周目重置 + 道果入账 ----------
t.state = t.newState();
t.state.sub = 36;
t.state.xiuwei = 999999;
t.state.lingshi = 888888;
t.state.techniques = ['t3','t4'];
t.state.stats.kills = 100;
t.state.stats.breakthroughs = 40;
t.state.stats.meditations = 200;
t.state.won = true;
t.state.meta.daoFruit = 5;
t.state.meta.reincarnations = 1;
t.state.meta.talents = { tal_memory: 2, tal_vein: 1 };
t.state.daoPath = { id:'dao_demon', points:1, nodes:[] };
const daoBefore = t.state.meta.daoFruit;
t.reincarnSamsara(true);
// 周目字段重置
assert(t.state.sub === 0, `轮回后 sub=0，实际 ${t.state.sub}`);
assert(t.state.xiuwei === 0 && t.state.lingshi === 0, '轮回后修为/灵石清零');
assert(t.state.won === false, '轮回后 won=false');
assert(t.state.techniques.length === 2 && t.state.techniques.includes('t0') && t.state.techniques.includes('t1') && !t.state.techniques.includes('t3'), '轮回后旧功法清空、前世记忆赠 t0/t1');
// meta 保留 + 道果入账（飞升 sub=36 首世基础 12 + 魔道 2 + reincarnations(1)*2=2 = 16；daoFruit 5+16=21）
assert(t.state.meta.daoFruit === daoBefore + 16, `道果入账 5+16=21，实际 ${t.state.meta.daoFruit}`);
assert(t.state.meta.reincarnations === 2, `轮回次数 +1 = 2，实际 ${t.state.meta.reincarnations}`);
assert(t.state.meta.bestSub === 36, `bestSub=36，实际 ${t.state.meta.bestSub}`);
// lifetime 累加
assert(t.state.meta.lifetime.kills === 100 && t.state.meta.lifetime.breakthroughs === 40 && t.state.meta.lifetime.meditations === 200, 'lifetime 累加本世战绩');
assert(t.state.meta.lifetime.ascensions === 1, 'lifetime.ascensions +1');
// 已体验道途记录
assert(t.state.meta.unlockedPaths.includes('dao_demon'), 'unlockedPaths 记录魔道');
console.log('reincarnSamsara 转世: OK');

// ---------- 7) applySamsaraOnNewRun: 前世记忆赠功法 ----------
t.state = t.newState();
t.state.meta.talents = { tal_memory: 3 };  // 赠送 t0,t1,t2
t.state.techniques = [];
t.applySamsaraOnNewRun();
assert(t.state.techniques.length === 3 && t.state.techniques.includes('t0') && t.state.techniques.includes('t1') && t.state.techniques.includes('t2'), 'tal_memory 3 级赠送 t0~t2');
// tal_blessing 初始气运
t.state = t.newState();
t.state.meta.talents = { tal_blessing: 3 };  // 初始气运 +30
t.applySamsaraOnNewRun();
assert(t.state.luck === 80, `tal_blessing 3 级初始气运=80，实际 ${t.state.luck}`);
console.log('applySamsaraOnNewRun 天赋生效: OK');

console.log('ALL SAMSARA OK');
