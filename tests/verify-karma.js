// tests/verify-karma.js -- 验证气运因果（模块 G）：luckFactor 封顶/卜卦/因果埋点/渗透
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
function makeEl(){ return { style:{}, classList:{add(){},remove(){},toggle(){},contains(){return false;}}, textContent:'', innerHTML:'', value:'', disabled:false, dataset:{}, appendChild(){}, removeChild(){}, remove(){}, addEventListener(){}, getBoundingClientRect(){return{};}, closest(){return null;}, querySelector(){return null;}, querySelectorAll(){return [];}, children:[], scrollTop:0, scrollHeight:0 }; }
const elStore={}; function getEl(id){ if(!elStore[id]) elStore[id]=makeEl(); return elStore[id]; }
const ctx = { localStorage:{ _s:{}, getItem(k){return this._s[k]||null;}, setItem(k,v){this._s[k]=String(v);}, removeItem(k){delete this._s[k];} }, document:{ getElementById:getEl, querySelectorAll(){return [];}, querySelector(){return null;}, createElement(){return makeEl();}, addEventListener(){}, removeEventListener(){}, hidden:false }, window:{ addEventListener(){}, removeEventListener(){} }, setInterval:()=>0, clearInterval:()=>{}, setTimeout:()=>0, clearTimeout:()=>{}, Date, Math, JSON, console, parseInt, parseFloat, isNaN, isFinite, confirm:()=>true, alert:()=>{} };
ctx.globalThis = ctx; vm.createContext(ctx);
let code = fs.readFileSync(path.join(__dirname,'..','game.js'),'utf8');
code += '\n;globalThis.__t=(function(){var o={};Object.defineProperty(o,"state",{get(){return state;},set(v){state=v;}});["luckFactor","karmaMod","divine","breakthroughChance","alchemyChance","newState","generateBounties","BOUNTY_REFRESH_MS"].forEach(function(k){Object.defineProperty(o,k,{get(){try{return eval(k);}catch(e){return undefined;}}});});return o;})();';
vm.runInContext(code, ctx);
const t = ctx.__t;
function assert(c,msg){ if(!c){ throw new Error('ASSERT FAIL: '+msg); } }

// ---------- 1) luckFactor 范围封顶 ----------
t.state = t.newState();
t.state.luck = 50;
assert(t.luckFactor() === 0, `luck=50 -> 0，实际 ${t.luckFactor()}`);
t.state.luck = 100;
assert(Math.abs(t.luckFactor() - 0.10) < 1e-9, `luck=100 -> +0.10，实际 ${t.luckFactor()}`);
t.state.luck = 0;
assert(Math.abs(t.luckFactor() - (-0.10)) < 1e-9, `luck=0 -> -0.10，实际 ${t.luckFactor()}`);
// 超界封顶
t.state.luck = 200;
assert(t.luckFactor() === 0.10, 'luck=200 封顶 +0.10');
t.state.luck = -50;
assert(t.luckFactor() === -0.10, 'luck=-50 封顶 -0.10');
console.log('luckFactor 封顶: OK');

// ---------- 2) karmaMod 天劫/掉落缩放 ----------
t.state = t.newState();
t.state.karma = { kill:0, merit:0 };
let km = t.karmaMod();
assert(km.tribScale === 1 && km.dropScale === 1, '无因果时缩放 1');
t.state.karma = { kill:100, merit:0 };
km = t.karmaMod();
assert(Math.abs(km.tribScale - 1.5) < 1e-9, `杀业100 -> tribScale 1.5，实际 ${km.tribScale}`);
t.state.karma = { kill:0, merit:100 };
km = t.karmaMod();
assert(Math.abs(km.dropScale - 1.2) < 1e-9, `功德100 -> dropScale 1.2，实际 ${km.dropScale}`);
// 杀业=功德 互相抵消，tribScale=1
t.state.karma = { kill:50, merit:50 };
km = t.karmaMod();
assert(km.tribScale === 1, '杀业=功德 -> tribScale 1');
console.log('karmaMod 缩放: OK');

// ---------- 3) 卜卦消耗气运 + 各效果 ----------
t.state = t.newState();
t.state.luck = 50;
// 气运不足
t.state.luck = 5;
t.divine('break');
assert(t.state.luck === 5, '气运不足时不消耗');
// 突破必成
t.state.luck = 50;
t.divine('break');
assert(t.state.luck === 40, `卜卦消耗 10 气运 -> 40，实际 ${t.state.luck}`);
assert(t.state.tupoBuff === true, '卜卦 break 设 tupoBuff');
// 探明奇遇
t.state.luck = 40;
t.state.eventCooldownAt = Date.now() + 999999;
t.divine('event');
assert(t.state.luck === 30, '卜卦 event 消耗 10 气运');
assert(t.state.eventCooldownAt <= Date.now(), '卜卦 event 清空奇遇冷却');
console.log('卜卦: OK');

// ---------- 4) 气运渗透突破/炼丹 ----------
t.state = t.newState();
t.state.techniques = [];
t.state.luck = 50;
const bc50 = t.breakthroughChance(t.state.sub);
t.state.luck = 100;
const bc100 = t.breakthroughChance(t.state.sub);
assert(bc100 > bc50, `气运高突破率更高：${bc50} -> ${bc100}`);
// 炼丹同理
t.state.luck = 50;
const ac50 = t.alchemyChance();
t.state.luck = 100;
const ac100 = t.alchemyChance();
assert(ac100 > ac50, '气运高炼丹率更高');
console.log('气运渗透: OK');

// ---------- 5) 因果埋点（endBattle 杀业）在 verify-event 已覆盖，此处验证 karmaMod 一致性 ----------
t.state = t.newState();
t.state.karma = { kill:200, merit:50 };
km = t.karmaMod();
// tribScale = 1 + max(0, 200-50)/200 = 1 + 0.75 = 1.75
assert(Math.abs(km.tribScale - 1.75) < 1e-9, `杀业200功德50 -> tribScale 1.75，实际 ${km.tribScale}`);
console.log('因果一致性: OK');

console.log('ALL KARMA OK');
