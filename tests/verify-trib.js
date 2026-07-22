// tests/verify-trib.js -- 验证九重天劫（模块 B）：类型/应对/推进/失败/遮罩渲染
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
function makeEl(){
  const el = { style:{}, classList:{add(){},remove(){},toggle(){},contains(){return false;}}, textContent:'', innerHTML:'', value:'', disabled:false, dataset:{}, _children:[], appendChild(c){ this._children.push(c); }, removeChild(){}, remove(){}, addEventListener(){}, getBoundingClientRect(){return{};}, closest(){return null;}, querySelector(){return null;}, querySelectorAll(){return [];}, children:[], scrollTop:0, scrollHeight:0 };
  return el;
}
const elStore={};
function getEl(id){ if(!elStore[id]) elStore[id]=makeEl(); return elStore[id]; }
const ctx = { localStorage:{ _s:{}, getItem(k){return this._s[k]||null;}, setItem(k,v){this._s[k]=String(v);}, removeItem(k){delete this._s[k];} }, document:{ getElementById:getEl, querySelectorAll(){return [];}, querySelector(){return null;}, createElement(){return makeEl();}, addEventListener(){}, removeEventListener(){}, hidden:false }, window:{ addEventListener(){}, removeEventListener(){} }, setInterval:()=>0, clearInterval:()=>{}, setTimeout:()=>0, clearTimeout:()=>{}, Date, Math, JSON, console, parseInt, parseFloat, isNaN, isFinite, confirm:()=>true, alert:()=>{} };
ctx.globalThis = ctx; vm.createContext(ctx);
let code = fs.readFileSync(path.join(__dirname,'..','game.js'),'utf8');
code += '\n;globalThis.__t=(function(){var o={};Object.defineProperty(o,"state",{get(){return state;},set(v){state=v;}});["TRIB_TYPES","TRIB_TOTAL_WAVES","startTribulation","respondTribulation","endTribulation","renderTribulation","tribIntensity","newState","playerMaxHp"].forEach(function(k){Object.defineProperty(o,k,{get(){try{return eval(k);}catch(e){return undefined;}}});});return o;})();';
vm.runInContext(code, ctx);
const t = ctx.__t;
function assert(c,msg){ if(!c){ throw new Error('ASSERT FAIL: '+msg); } }
const origRandom = ctx.Math.random;
function setRand(v){ ctx.Math.random = () => v; }
function restoreRand(){ ctx.Math.random = origRandom; }

// ---------- 1) 配置 ----------
assert(t.TRIB_TYPES.length === 6, '劫难类型 6 种（含混沌雷劫）');
assert(t.TRIB_TOTAL_WAVES === 9, '九重');
console.log('配置: OK');

// ---------- 2) startTribulation 初始化 9 重 ----------
t.state = t.newState();
setRand(0);
t.startTribulation(false);
assert(t.state.trib && t.state.trib.waves.length === 9, '初始化 9 重 waves');
assert(t.state.trib.wave === 0, '从第 0 重开始');
assert(t.state.trib.waves[7] === 'trib_demon', '第 8 重固定心魔劫');
assert(t.state.trib.waves[8] === 'trib_karma', '非飞升第 9 重业火劫');
// 飞升第 9 重混沌雷劫
t.state.trib = null;
t.startTribulation(true);
assert(t.state.trib.waves[8] === 'trib_chaos', '飞升第 9 重混沌雷劫');
assert(t.state.trib.isFinal === true, '飞升劫 isFinal');
restoreRand();
console.log('startTribulation: OK');

// ---------- 3) respondTribulation 推进 ----------
t.state = t.newState();
setRand(0);
t.startTribulation(false);
const startWave = t.state.trib.wave;
// 硬抗推进（不致死的话）
t.state.hp = t.playerMaxHp() * 10;  // 确保不被硬抗致死
t.respondTribulation('endure');
assert(t.state.trib.wave === startWave + 1, `硬抗后推进 wave +1，实际 ${t.state.trib.wave}`);
restoreRand();
console.log('respondTribulation 推进: OK');

// ---------- 4) 服丹化解（消耗抗劫丹，伤害归零） ----------
t.state = t.newState();
setRand(0);
t.startTribulation(false);
t.state.inv.kangjie = 5;
const hpBefore = t.state.hp;
t.respondTribulation('pill');
assert(t.state.inv.kangjie === 4, '服丹消耗 1 抗劫丹');
// 服丹伤害归零，hp 不降
assert(t.state.hp >= hpBefore, '服丹化解伤害，hp 不降');
restoreRand();
console.log('服丹化解: OK');

// ---------- 5) 飞升劫服丹需 2 颗 ----------
t.state = t.newState();
setRand(0);
t.startTribulation(true);  // 飞升劫
t.state.inv.kangjie = 1;   // 只有 1 颗
t.respondTribulation('pill');  // 应拒绝
assert(t.state.inv.kangjie === 1, '飞升劫 1 颗丹不足，不消耗');
assert(t.state.trib.wave === 0, '丹不足不推进');
t.state.inv.kangjie = 2;
t.respondTribulation('pill');
assert(t.state.inv.kangjie === 0, '飞升劫服丹消耗 2 颗');
restoreRand();
console.log('飞升劫服丹: OK');

// ---------- 6) 遁避成功/失败 ----------
t.state = t.newState();
setRand(0);  // 遁避成功（chance=0.3+luckFactor(0)=0.3，rand0<0.3 成功）
t.startTribulation(false);
t.state.hp = t.playerMaxHp() * 10;
t.respondTribulation('flee');
assert(t.state.trib.fledThisTrib === false, '遁避成功不标记 fled');
// 遁避失败
setRand(0.9);  // 0.9 > 0.3 失败
t.respondTribulation('flee');
assert(t.state.trib.fledThisTrib === true, '遁避失败标记 fled');
// 已失败不可再遁
const wBefore = t.state.trib.wave;
t.respondTribulation('flee');
assert(t.state.trib.wave === wBefore, '已遁失败后不可再遁');
restoreRand();
console.log('遁避: OK');

// ---------- 7) 9 重熬过 -> endTribulation(true) 突破 ----------
t.state = t.newState();
setRand(0);
t.startTribulation(false);
t.state.hp = t.playerMaxHp() * 100;  // 确保不死
const subBefore = t.state.sub;
for (let i = 0; i < 9; i++) t.respondTribulation('endure');
assert(t.state.trib === null, '9 重后 trib 清空');
assert(t.state.sub === subBefore + 1, `9 重熬过突破 sub+1，实际 ${t.state.sub}`);
restoreRand();
console.log('9 重突破: OK');

// ---------- 8) 气血归零 -> 失败 ----------
t.state = t.newState();
setRand(0);
t.startTribulation(false);
t.state.hp = 1;  // 极低血，硬抗必死
t.respondTribulation('endure');
assert(t.state.trib === null, '气血归零天劫失败');
assert(t.state.debuff && t.state.debuff.cultMult === 0.5, '失败走火入魔');
restoreRand();
console.log('失败惩罚: OK');

// ---------- 9) renderTribulation 渲染遮罩 ----------
t.state = t.newState();
setRand(0);
t.startTribulation(false);
// 确保 #tribulation 与 #tribBody 元素存在（mock）
t.renderTribulation();
const body = ctx.document.getElementById('tribBody');
assert(body.innerHTML.indexOf('trib-endure') >= 0, 'renderTribulation 渲染硬抗按钮');
assert(body.innerHTML.indexOf('trib-dots') >= 0, '渲染 9 重进度圆点');
restoreRand();
console.log('renderTribulation: OK');

console.log('ALL TRIB OK');
