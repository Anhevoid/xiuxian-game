// tests/verify-dao.js -- 验证三道分支（模块 H）：选择/节点/前置/渗透/结局
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
function makeEl(){ return { style:{}, classList:{add(){},remove(){},toggle(){},contains(){return false;}}, textContent:'', innerHTML:'', value:'', disabled:false, dataset:{}, appendChild(){}, removeChild(){}, remove(){}, addEventListener(){}, getBoundingClientRect(){return{};}, closest(){return null;}, querySelector(){return null;}, querySelectorAll(){return [];}, children:[], scrollTop:0, scrollHeight:0 }; }
const elStore={}; function getEl(id){ if(!elStore[id]) elStore[id]=makeEl(); return elStore[id]; }
const ctx = { localStorage:{ _s:{}, getItem(k){return this._s[k]||null;}, setItem(k,v){this._s[k]=String(v);}, removeItem(k){delete this._s[k];} }, document:{ getElementById:getEl, querySelectorAll(){return [];}, querySelector(){return null;}, createElement(){return makeEl();}, addEventListener(){}, removeEventListener(){}, hidden:false }, window:{ addEventListener(){}, removeEventListener(){} }, setInterval:()=>0, clearInterval:()=>{}, setTimeout:()=>0, clearTimeout:()=>{}, Date, Math, JSON, console, parseInt, parseFloat, isNaN, isFinite, confirm:()=>true, alert:()=>{} };
ctx.globalThis = ctx; vm.createContext(ctx);
let code = fs.readFileSync(path.join(__dirname,'..','game.js'),'utf8');
code += '\n;globalThis.__t=(function(){var o={};Object.defineProperty(o,"state",{get(){return state;},set(v){state=v;}});["DAO_PATHS","DAO_NODES","DAO_UNLOCK_SUB","chooseDaoPath","learnDaoNode","pathBonus","daoPathDef","maybePromptDaoPath","renderDaoPath","playerAtk","playerMaxHp","effectiveCultMult","breakthroughChance","alchemyChance","newState"].forEach(function(k){Object.defineProperty(o,k,{get(){try{return eval(k);}catch(e){return undefined;}}});});return o;})();';
vm.runInContext(code, ctx);
const t = ctx.__t;
function assert(c,msg){ if(!c){ throw new Error('ASSERT FAIL: '+msg); } }

// ---------- 1) 配置 ----------
assert(t.DAO_PATHS.length === 3, '道途 3 条');
for (const pid of ['dao_immortal','dao_demon','dao_buddha']){
  assert(t.DAO_NODES[pid].length === 5, `${pid} 有 5 节点`);
}
assert(t.DAO_UNLOCK_SUB === 12, '元婴期(sub=12)解锁');
console.log('配置: OK');

// ---------- 2) chooseDaoPath ----------
t.state = t.newState();
t.state.sub = 12;
assert(t.state.daoPath === null && t.state.daoPathChosen === false, '初始未选道途');
t.chooseDaoPath('dao_demon');
assert(t.state.daoPath && t.state.daoPath.id === 'dao_demon', '选择魔道');
assert(t.state.daoPath.points === 1, '初始 1 道途点');
assert(t.state.daoPathChosen === true, 'daoPathChosen=true');
// 已选不可再选
t.chooseDaoPath('dao_immortal');
assert(t.state.daoPath.id === 'dao_demon', '已选后不可改道途');
// 境界不足不可选
t.state = t.newState();
t.state.sub = 8;
t.chooseDaoPath('dao_immortal');
assert(t.state.daoPath === null, '境界不足不可选道途');
console.log('chooseDaoPath: OK');

// ---------- 3) learnDaoNode 前置 + 扣点 ----------
t.state = t.newState();
t.state.sub = 12;
t.chooseDaoPath('dao_demon');
// 首节点 dn_d1 (cost1)
t.learnDaoNode('dn_d1');
assert(t.state.daoPath.nodes.includes('dn_d1'), '点亮首节点 dn_d1');
assert(t.state.daoPath.points === 0, '扣 1 点 -> 0');
// 跳点：dn_d3 需先 dn_d2
t.state.daoPath.points = 5;
t.learnDaoNode('dn_d3');
assert(!t.state.daoPath.nodes.includes('dn_d3'), '未点前置不可跳点');
// 点 dn_d2 再 dn_d3
t.learnDaoNode('dn_d2');
t.learnDaoNode('dn_d3');
assert(t.state.daoPath.nodes.includes('dn_d3'), '前置达后可点 dn_d3');
// 重复点亮
const nBefore = t.state.daoPath.nodes.length;
t.learnDaoNode('dn_d1');
assert(t.state.daoPath.nodes.length === nBefore, '已点亮节点不可重复');
console.log('learnDaoNode: OK');

// ---------- 4) pathBonus 渗透 ----------
t.state = t.newState();
t.state.techniques = [];
t.state.sub = 12;
t.chooseDaoPath('dao_demon');
// 点 dn_d1(atk+0.10) + dn_d3(atk+0.15) -> atk +0.25
t.state.daoPath.points = 5;
t.learnDaoNode('dn_d1'); t.learnDaoNode('dn_d2'); t.learnDaoNode('dn_d3');
assert(Math.abs(t.pathBonus().atk - 0.25) < 1e-9, `魔道3节点 atk +0.25，实际 ${t.pathBonus().atk}`);
// 渗透 playerAtk
const atkBefore = (() => { const sv = t.state.daoPath; t.state.daoPath = null; const v = t.playerAtk(); t.state.daoPath = sv; return v; })();
assert(t.playerAtk() === Math.round(atkBefore * 1.25), `魔道 atk 渗透 ×1.25，${atkBefore} -> ${t.playerAtk()}`);
console.log('pathBonus 渗透: OK');

// ---------- 5) 仙道修炼/突破 + 佛道气血/炼丹 ----------
t.state = t.newState();
t.state.techniques = [];
t.state.sub = 12;
t.chooseDaoPath('dao_immortal');
t.state.daoPath.points = 5;
t.learnDaoNode('dn_i1');  // cult +0.10
assert(Math.abs(t.effectiveCultMult() - 1.10) < 1e-9, `仙道紫气 effectiveCultMult 1.10，实际 ${t.effectiveCultMult()}`);
t.learnDaoNode('dn_i2');  // break +0.03
const bc = t.breakthroughChance(t.state.sub);
assert(Math.abs(bc - (0.9 + 0.03)) < 1e-9, `仙道朝元 突破率 +0.03，实际 ${bc}`);
// 佛道炼丹
t.state = t.newState();
t.state.sub = 12;
t.chooseDaoPath('dao_buddha');
t.state.daoPath.points = 5;
t.learnDaoNode('dn_b1'); t.learnDaoNode('dn_b2'); t.learnDaoNode('dn_b3');  // maxhp+0.12, def+0.08, alch+0.05
assert(Math.abs(t.pathBonus().alch - 0.05) < 1e-9, '佛道般若 alch +0.05');
console.log('三道差异化: OK');

// ---------- 6) renderDaoPath ----------
t.state = t.newState();
t.state.sub = 12;
t.chooseDaoPath('dao_immortal');
const html = t.renderDaoPath();
assert(html.indexOf('learn-dao') >= 0, 'renderDaoPath 渲染节点按钮');
console.log('renderDaoPath: OK');

console.log('ALL DAO OK');
