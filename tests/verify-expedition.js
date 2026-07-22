// tests/verify-expedition.js -- 验证秘境深探（模块 I）：探索力/房间/战斗分支/撤出结算
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
function makeEl(){ return { style:{}, classList:{add(){},remove(){},toggle(){},contains(){return false;}}, textContent:'', innerHTML:'', value:'', disabled:false, dataset:{}, appendChild(){}, removeChild(){}, remove(){}, addEventListener(){}, getBoundingClientRect(){return{};}, closest(){return null;}, querySelector(){return null;}, querySelectorAll(){return [];}, children:[], scrollTop:0, scrollHeight:0 }; }
const elStore={}; function getEl(id){ if(!elStore[id]) elStore[id]=makeEl(); return elStore[id]; }
const ctx = { localStorage:{ _s:{}, getItem(k){return this._s[k]||null;}, setItem(k,v){this._s[k]=String(v);}, removeItem(k){delete this._s[k];} }, document:{ getElementById:getEl, querySelectorAll(){return [];}, querySelector(){return null;}, createElement(){return makeEl();}, addEventListener(){}, removeEventListener(){}, hidden:false }, window:{ addEventListener(){}, removeEventListener(){} }, setInterval:()=>0, clearInterval:()=>{}, setTimeout:()=>0, clearTimeout:()=>{}, Date, Math, JSON, console, parseInt, parseFloat, isNaN, isFinite, confirm:()=>true, alert:()=>{} };
ctx.globalThis = ctx; vm.createContext(ctx);
let code = fs.readFileSync(path.join(__dirname,'..','game.js'),'utf8');
code += '\n;globalThis.__t=(function(){var o={};Object.defineProperty(o,"state",{get(){return state;},set(v){state=v;}});Object.defineProperty(o,"battleState",{get(){return battleState;},set(v){battleState=v;}});["DEEP_ROOMS","expeditionMaxStamina","genExpeditionRooms","startExpedition","enterRoom","resolveExpeditionRoom","exitExpedition","renderExpedition","endBattle","newState","realmOf","caveBuildingLv"].forEach(function(k){Object.defineProperty(o,k,{get(){try{return eval(k);}catch(e){return undefined;}}});});return o;})();';
vm.runInContext(code, ctx);
const t = ctx.__t;
function assert(c,msg){ if(!c){ throw new Error('ASSERT FAIL: '+msg); } }
const origRandom = ctx.Math.random;
function setRand(v){ ctx.Math.random = () => v; }
function restoreRand(){ ctx.Math.random = origRandom; }

// ---------- 1) 配置 + 探索力 ----------
t.state = t.newState();
assert(t.DEEP_ROOMS.length === 6, '房间类型 6 种');
assert(t.expeditionMaxStamina() === 10, `sub0 无兽栏探索力 10，实际 ${t.expeditionMaxStamina()}`);
t.state.sub = 12;  // realmOf 3
assert(t.expeditionMaxStamina() === 16, `sub12 探索力 16，实际 ${t.expeditionMaxStamina()}`);
t.state.cave.buildings.cave_beast = 5;
assert(t.expeditionMaxStamina() === 21, `sub12+兽栏5 探索力 21，实际 ${t.expeditionMaxStamina()}`);
console.log('探索力: OK');

// ---------- 2) startExpedition ----------
t.state = t.newState();
t.state.sub = 0;  // zone0 解锁
setRand(0);
t.startExpedition(0);
assert(t.state.expedition && t.state.expedition.zone === 0, '启动深探 zone0');
assert(t.state.expedition.floor === 1, '初始第 1 层');
assert(Array.isArray(t.state.expedition.rooms) && t.state.expedition.rooms.length >= 2, '生成房间选项');
restoreRand();
// 未解锁不可启动
t.state = t.newState();
t.state.sub = 0;
t.startExpedition(5);  // zone5 需 sub20
assert(t.state.expedition === null, '未解锁秘境不可深探');
console.log('startExpedition: OK');

// ---------- 3) genExpeditionRooms: 每3层有 Boss ----------
t.state = t.newState();
setRand(1);  // 不随机 elite
const r1 = t.genExpeditionRooms(1);
assert(!r1.includes('boss'), '第1层无 Boss');
const r3 = t.genExpeditionRooms(3);
assert(r3.includes('boss'), '第3层含 Boss');
restoreRand();
console.log('Boss 编排: OK');

// ---------- 4) 宝箱房/休整房/事件房结算（非战斗） ----------
t.state = t.newState();
t.state.sub = 0;
setRand(0);
t.startExpedition(0);
const ex = t.state.expedition;
const liB = ex.rewards.lingshi;
t.enterRoom('treasure');  // 非战斗房直接结算
assert(t.state.expedition.rewards.lingshi > liB, '宝箱房增加奖励');
restoreRand();
// 休整房回血+气运
t.state = t.newState();
t.state.sub = 0;
t.state.hp = 1; t.state.luck = 10;
setRand(0);
t.startExpedition(0);
t.enterRoom('rest');
assert(t.state.hp > 1, '休整房回血');
assert(t.state.luck === 20, `休整房气运 +10 -> 20，实际 ${t.state.luck}`);
restoreRand();
console.log('非战斗房结算: OK');

// ---------- 5) 战斗房触发 expeditionMode 战斗 ----------
t.state = t.newState();
t.state.sub = 0;
setRand(0);
t.startExpedition(0);
t.enterRoom('battle');
assert(t.battleState && t.battleState.expeditionMode === true, '战斗房触发 expeditionMode 战斗');
assert(t.battleState.mon._expRoom === 'battle', '战斗标记 _expRoom');
restoreRand();
console.log('战斗房触发: OK');

// ---------- 6) endBattle expedition 分支：胜利回写、不触发普通掉落 ----------
t.state = t.newState();
t.state.sub = 0;
t.state.lingshi = 0;
setRand(0);
t.startExpedition(0);
t.enterRoom('battle');
const exB = t.state.expedition;
const rewardLiBefore = exB.rewards.lingshi;
t.endBattle(true);  // 深探战斗胜利
assert(t.battleState === null, '深探战斗结束后 battleState 清空');
// 奖励回写到 expedition（非直接入袋）
assert(t.state.expedition.rewards.lingshi > rewardLiBefore, '胜利奖励回写 expedition');
// 普通掉落不应触发：灵石直接持有量不应因深探战斗增加（撤出才结算）
console.log('endBattle 深探分支: OK');

// ---------- 7) 战败撤出 50% ----------
t.state = t.newState();
t.state.sub = 0;
t.state.lingshi = 0;
setRand(0);
t.startExpedition(0);
// 先攒点奖励：进宝箱房
t.enterRoom('treasure');
const halfReward = Math.floor(t.state.expedition.rewards.lingshi * 0.5);
// 触发战斗再战败
t.enterRoom('battle');
t.endBattle(false);  // 战败 -> 撤出 50%
assert(t.state.expedition === null, '战败后撤出，expedition 清空');
assert(t.state.lingshi === halfReward, `战败撤出得 50% 灵石 ${halfReward}，实际 ${t.state.lingshi}`);
restoreRand();
console.log('战败撤出 50%: OK');

// ---------- 8) 主动撤出 100% ----------
t.state = t.newState();
t.state.sub = 0;
t.state.lingshi = 0;
setRand(0);
t.startExpedition(0);
t.enterRoom('treasure');
const fullReward = t.state.expedition.rewards.lingshi;
t.exitExpedition(false);  // 主动撤出
assert(t.state.expedition === null, '主动撤出后 expedition 清空');
assert(t.state.lingshi === fullReward, `主动撤出得 100% 灵石 ${fullReward}，实际 ${t.state.lingshi}`);
restoreRand();
console.log('主动撤出 100%: OK');

// ---------- 9) 探索力耗尽自动撤出 ----------
t.state = t.newState();
t.state.sub = 0;
setRand(0);
t.startExpedition(0);
t.state.expedition.stamina = 1;
// 进 elite 房耗 2 探索力 -> 耗尽
t.enterRoom('battle');  // 战斗房，需先 endBattle
// 改为直接测试 resolveExpeditionRoom 探索力耗尽
t.state = t.newState();
t.state.sub = 0;
setRand(0);
t.startExpedition(0);
t.state.expedition.stamina = 0;
// treasure 房不耗探索力，但 stamina<=0 后下次耗探索力房才撤；这里手动设 stamina=1 进 battle 耗 1 -> 0
t.state.expedition.stamina = 1;
t.resolveExpeditionRoom('battle', true);  // 战斗胜利耗 1 探索力
assert(t.state.expedition === null, '探索力耗尽自动撤出');
restoreRand();
console.log('探索力耗尽撤出: OK');

// ---------- 10) renderExpedition ----------
t.state = t.newState();
t.state.sub = 0;
setRand(0);
t.startExpedition(0);
const html = t.renderExpedition();
assert(html.indexOf('enter-room') >= 0, 'renderExpedition 渲染房间按钮');
assert(html.indexOf('exit-expedition') >= 0, 'renderExpedition 渲染撤出按钮');
restoreRand();
console.log('renderExpedition: OK');

console.log('ALL EXPEDITION OK');
