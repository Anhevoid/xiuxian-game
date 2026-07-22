// tests/verify-duel.js -- 验证斗法论道（模块 J）：对手生成/感悟发放/悟道树/段位/渗透
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
function makeEl(){ return { style:{}, classList:{add(){},remove(){},toggle(){},contains(){return false;}}, textContent:'', innerHTML:'', value:'', disabled:false, dataset:{}, appendChild(){}, removeChild(){}, remove(){}, addEventListener(){}, getBoundingClientRect(){return{};}, closest(){return null;}, querySelector(){return null;}, querySelectorAll(){return [];}, children:[], scrollTop:0, scrollHeight:0 }; }
const elStore={}; function getEl(id){ if(!elStore[id]) elStore[id]=makeEl(); return elStore[id]; }
const ctx = { localStorage:{ _s:{}, getItem(k){return this._s[k]||null;}, setItem(k,v){this._s[k]=String(v);}, removeItem(k){delete this._s[k];} }, document:{ getElementById:getEl, querySelectorAll(){return [];}, querySelector(){return null;}, createElement(){return makeEl();}, addEventListener(){}, removeEventListener(){}, hidden:false }, window:{ addEventListener(){}, removeEventListener(){} }, setInterval:()=>0, clearInterval:()=>{}, setTimeout:()=>0, clearTimeout:()=>{}, Date, Math, JSON, console, parseInt, parseFloat, isNaN, isFinite, confirm:()=>true, alert:()=>{} };
ctx.globalThis = ctx; vm.createContext(ctx);
let code = fs.readFileSync(path.join(__dirname,'..','game.js'),'utf8');
code += '\n;globalThis.__t=(function(){var o={};Object.defineProperty(o,"state",{get(){return state;},set(v){state=v;}});Object.defineProperty(o,"battleState",{get(){return battleState;},set(v){battleState=v;}});["INSIGHT_NODES","DUEL_TIERS","RANK_NAMES","DUEL_UNLOCK_SUB","duelUnlocked","playerPower","daoScore","genDuelOpponent","duelOpponent","discussDao","learnInsightNode","insightBonus","duelRankName","renderDuel","endBattle","newState","playerAtk","effectiveCultMult","luckMaxCap"].forEach(function(k){Object.defineProperty(o,k,{get(){try{return eval(k);}catch(e){return undefined;}}});});return o;})();';
vm.runInContext(code, ctx);
const t = ctx.__t;
function assert(c,msg){ if(!c){ throw new Error('ASSERT FAIL: '+msg); } }
const origRandom = ctx.Math.random;
function setRand(v){ ctx.Math.random = () => v; }
function restoreRand(){ ctx.Math.random = origRandom; }

// ---------- 1) 配置 ----------
assert(t.INSIGHT_NODES.length === 8, '悟道树 8 节点');
assert(t.DUEL_TIERS.length === 3, '斗法 3 档');
assert(t.RANK_NAMES.length === 10, '段位 10 阶');
assert(t.DUEL_UNLOCK_SUB === 8, '筑基后期(sub=8)解锁');
console.log('配置: OK');

// ---------- 2) duelUnlocked ----------
t.state = t.newState();
t.state.sub = 4;
assert(t.duelUnlocked() === false, 'sub4 未解锁');
t.state.sub = 8;
assert(t.duelUnlocked() === true, 'sub8 已解锁');
console.log('duelUnlocked: OK');

// ---------- 3) genDuelOpponent 战力缩放 ----------
t.state = t.newState();
t.state.sub = 8;
restoreRand();
const power = t.playerPower();
const op0 = t.genDuelOpponent(0);  // 0.9x
const op2 = t.genDuelOpponent(2);  // 1.3x
// op2 总战力(op.maxHp+atk*2+def*2 近似) 应高于 op0
assert(op2.maxHp > op0.maxHp, '越阶对手强于切磋');
assert(Math.abs(op0.maxHp - Math.round(power*0.9*0.5)) < 1, `切磋 hp=${op0.maxHp} 预期 ${Math.round(power*0.9*0.5)}`);
console.log('genDuelOpponent: OK');

// ---------- 4) duelOpponent 触发 duelMode 战斗 ----------
t.state = t.newState();
t.state.sub = 8;
restoreRand();
t.duelOpponent(1);
assert(t.battleState && t.battleState.duelMode === true, '斗法触发 duelMode 战斗');
assert(t.battleState.duelTier === 1, '记录 duelTier');
console.log('duelOpponent: OK');

// ---------- 5) endBattle duel 分支：胜得感悟+段位，败无损 ----------
t.state = t.newState();
t.state.sub = 8;
t.state.insight = 0;
t.state.duelRank = 0;
t.state.duelDefeated = 0;
restoreRand();
t.duelOpponent(0);
const liB = state_lingshi(t), xwB = state_xiuwei(t);
t.endBattle(true);  // 胜
assert(t.battleState === null, '斗法结束 battleState 清空');
assert(t.state.insight > 0, `胜利得感悟 >0，实际 ${t.state.insight}`);
assert(t.state.duelDefeated === 1, '击败数 +1');
// 灵石/修为不变（无损）
assert(state_lingshi(t) === liB && state_xiuwei(t) === xwB, '斗法胜利不改变灵石/修为');
// 败：无损
t.state.insight = 0;
t.duelOpponent(0);
t.endBattle(false);
assert(t.state.insight === 0, '斗法败无感悟');
assert(state_lingshi(t) === liB, '斗法败不扣灵石');
console.log('endBattle duel 分支: OK');
function state_lingshi(t){ return t.state.lingshi; }
function state_xiuwei(t){ return t.state.xiuwei; }

// ---------- 6) 段位累加 ----------
t.state = t.newState();
t.state.sub = 8;
t.state.duelDefeated = 0;
t.state.duelRank = 0;
restoreRand();
// 击败 3 次升 1 段
for (let i = 0; i < 3; i++){ t.duelOpponent(0); t.endBattle(true); }
assert(t.state.duelRank === 1, `3 胜升 1 段，实际 ${t.state.duelRank}`);
console.log('段位累加: OK');

// ---------- 7) learnInsightNode 扣感悟/已悟 ----------
t.state = t.newState();
t.state.insight = 100;
t.state.insightTree = {};
t.learnInsightNode('in_cult1');  // cost 20
assert(t.state.insightTree['in_cult1'] === true, '点亮 in_cult1');
assert(t.state.insight === 80, `扣 20 感悟 -> 80，实际 ${t.state.insight}`);
// 重复点亮
t.learnInsightNode('in_cult1');
assert(t.state.insight === 80, '已悟节点不再扣感悟');
// 感悟不足
t.state.insight = 5;
t.learnInsightNode('in_atk1');  // cost 30
assert(!t.state.insightTree['in_atk1'], '感悟不足不可点亮');
console.log('learnInsightNode: OK');

// ---------- 8) insightBonus 渗透 ----------
t.state = t.newState();
t.state.techniques = [];
t.state.insightTree = { in_cult1:true, in_atk1:true };  // cult+0.10, atk+0.08
assert(Math.abs(t.insightBonus().cult - 0.10) < 1e-9, '悟道 cult +0.10');
assert(Math.abs(t.insightBonus().atk - 0.08) < 1e-9, '悟道 atk +0.08');
assert(Math.abs(t.effectiveCultMult() - 1.10) < 1e-9, `悟道渗透 effectiveCultMult 1.10，实际 ${t.effectiveCultMult()}`);
// atk 渗透
const atkBefore = (() => { const sv = t.state.insightTree; t.state.insightTree = {}; const v = t.playerAtk(); t.state.insightTree = sv; return v; })();
assert(t.playerAtk() === Math.round(atkBefore * 1.08), `悟道 atk 渗透 ×1.08，${atkBefore} -> ${t.playerAtk()}`);
console.log('insightBonus 渗透: OK');

// ---------- 9) discussDao 论道 ----------
t.state = t.newState();
t.state.sub = 8;
t.state.insight = 0;
setRand(0);  // opScore = myScore*0.85 -> 必胜
t.discussDao();
assert(t.state.insight > 0, `论道胜得感悟 >0，实际 ${t.state.insight}`);
// 道行不足败
t.state.insight = 0;
setRand(0.999);  // opScore = myScore*1.15 -> 必败
t.discussDao();
assert(t.state.insight === 0, '论道败无感悟');
restoreRand();
console.log('discussDao: OK');

// ---------- 10) renderDuel ----------
t.state = t.newState();
t.state.sub = 4;
assert(t.renderDuel().indexOf('需达到') >= 0, '未解锁 renderDuel 提示');
t.state.sub = 8;
const html = t.renderDuel();
assert(html.indexOf('duel') >= 0 && html.indexOf('learn-insight') >= 0, 'renderDuel 渲染斗法/悟道树');
console.log('renderDuel: OK');

console.log('ALL DUEL OK');
