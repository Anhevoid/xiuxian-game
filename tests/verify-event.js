// tests/verify-event.js -- 验证奇遇事件系统（模块 E）：触发/冷却/选项/因果/强制战斗天劫
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
 + 'Object.defineProperty(o,"battleState",{get(){return battleState;}});'
 + '["EVENTS","triggerEvent","chooseEvent","renderEvent","eventAvailable","giveRandomTechnique","newState","startTribulation"].forEach(function(k){'
 + 'Object.defineProperty(o,k,{get(){try{return eval(k);}catch(e){return undefined;}}});});'
 + 'return o;})();';
vm.runInContext(code, ctx);
const t = ctx.__t;
function assert(c,msg){ if(!c){ throw new Error('ASSERT FAIL: '+msg); } }
const origRandom = ctx.Math.random;
function setRand(v){ ctx.Math.random = () => v; }
function restoreRand(){ ctx.Math.random = origRandom; }

// ---------- 1) 事件池规模 ----------
assert(t.EVENTS.length >= 12, `事件池 >=12，实际 ${t.EVENTS.length}`);
// 每个事件有 id/name/choices
for (const e of t.EVENTS){
  assert(e.id && e.name && Array.isArray(e.choices) && e.choices.length >= 2, `事件 ${e.id} 结构完整`);
}
console.log('事件池结构: OK');

// ---------- 2) eventAvailable 境界/稀有过滤 ----------
t.state = t.newState();
t.state.sub = 0;
const avail0 = t.EVENTS.filter(e => t.eventAvailable(e));
assert(avail0.every(e => e.minSub === 0), 'sub0 时只出现 minSub=0 事件');
assert(!t.eventAvailable(t.EVENTS.find(e=>e.id==='ev_ambush')), '筑基事件 sub0 不可用');
t.state.sub = 24;
assert(t.eventAvailable(t.EVENTS.find(e=>e.id==='ev_relic')), '合体期 ev_relic 可用');
// 稀有限频：记录一次后不可再用
t.state.eventHistory['ev_relic'] = 1;
assert(!t.eventAvailable(t.EVENTS.find(e=>e.id==='ev_relic')), '稀有事件每世限 1 次');
console.log('eventAvailable 过滤: OK');

// ---------- 3) triggerEvent 设置 activeEvent + 记录历史 ----------
t.state = t.newState();
t.state.sub = 0;
setRand(0);  // 选 pool[0] = ev_elder
t.triggerEvent();
assert(t.state.activeEvent && t.state.activeEvent.id === 'ev_elder', `触发 ev_elder，实际 ${t.state.activeEvent && t.state.activeEvent.id}`);
assert((t.state.eventHistory['ev_elder'] || 0) === 1, 'eventHistory 记录');
restoreRand();
console.log('triggerEvent: OK');

// ---------- 4) chooseEvent 清除 activeEvent + 设冷却 ----------
t.state = t.newState();
t.state.activeEvent = { id:'ev_elder' };
t.state.eventCooldownAt = 0;
restoreRand();
const now = Date.now();
t.chooseEvent('leave');  // 礼貌告退 -> +5 功德
assert(t.state.activeEvent === null, 'chooseEvent 后 activeEvent 清空');
assert(t.state.eventCooldownAt > now, 'chooseEvent 后设冷却（未来时间）');
assert((t.state.karma.merit || 0) === 5, `ev_elder leave 功德 +5，实际 ${t.state.karma.merit}`);
console.log('chooseEvent 冷却/因果: OK');

// ---------- 5) ev_pickup 选项因果埋点 ----------
t.state = t.newState();
t.state.activeEvent = { id:'ev_pickup' };
const fragB = t.state.inv.fragments || 0;
const liB = t.state.lingshi;
t.chooseEvent('take');  // 拾取 -> 碎片+2、灵石+、杀业+10
assert((t.state.inv.fragments || 0) === fragB + 2, '拾取 碎片 +2');
assert(t.state.lingshi > liB, '拾取 灵石增加');
assert((t.state.karma.kill || 0) === 10, `拾取 杀业 +10，实际 ${t.state.karma.kill}`);
// 上交宗门
t.state.activeEvent = { id:'ev_pickup' };
t.state.sect = { id:'sect_sword', contribution:0, switches:0, techs:[] };
t.chooseEvent('submit');
assert((t.state.karma.merit || 0) >= 30, '上交 功德 +30');
assert(t.state.sect.contribution === 30, `上交 贡献 +30，实际 ${t.state.sect.contribution}`);
console.log('ev_pickup 因果埋点: OK');

// ---------- 6) ev_gamble 卜卦消耗气运 ----------
t.state = t.newState();
t.state.luck = 50;
t.state.activeEvent = { id:'ev_gamble' };
setRand(0.5);  // r<0.7 中吉签
t.chooseEvent('divine');
assert(t.state.luck === 40, `卜卦消耗 10 气运 -> 40，实际 ${t.state.luck}`);
restoreRand();
// 气运不足时不消耗
t.state.luck = 5;
t.state.activeEvent = { id:'ev_gamble' };
t.chooseEvent('divine');
assert(t.state.luck === 5, '气运不足时不消耗');
console.log('ev_gamble 卜卦: OK');

// ---------- 7) 强制战斗衔接（ev_ambush 应战） ----------
t.state = t.newState();
t.state.sub = 4;
t.state.activeEvent = { id:'ev_ambush' };
restoreRand();
t.chooseEvent('fight');
assert(t.battleState !== null, 'ev_ambush fight 触发强怪战斗（battleState 已设）');
console.log('强制战斗衔接: OK');

// ---------- 8) 强制天劫衔接（ev_relic 探索 30% 天劫） ----------
t.state = t.newState();
t.state.sub = 24;
t.state.activeEvent = { id:'ev_relic' };
setRand(0.8);  // r>=0.7 -> 触发天劫
t.chooseEvent('explore');
assert(t.state.trib !== null, 'ev_relic explore 触发天劫（state.trib 已设）');
assert(t.state.trib.isEvent === true, '奇遇天劫标记 isEvent=true');
console.log('强制天劫衔接: OK');

// ---------- 9) renderEvent 不抛错 ----------
t.state = t.newState();
t.state.activeEvent = { id:'ev_elder' };
t.renderEvent();  // 应渲染选项
restoreRand();
console.log('renderEvent: OK');

console.log('ALL EVENT OK');
