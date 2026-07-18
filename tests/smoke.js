// tests/smoke.js -- dev-only 冒烟测试：mock 浏览器全局后用 vm 加载 game.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeEl(){
  const el = {
    style:{}, classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    textContent:'', innerHTML:'', value:'', disabled:false, dataset:{},
    appendChild(){}, removeChild(){}, remove(){}, addEventListener(){},
    getBoundingClientRect(){return {left:0,top:0,width:0,height:0};},
    closest(){return null;}, querySelector(){return null;}, querySelectorAll(){return [];},
    children:[], scrollTop:0, scrollHeight:0,
  };
  return el;
}
const elStore = {};
function getEl(id){ if(!elStore[id]) elStore[id]=makeEl(); return elStore[id]; }
const ctx = {
  localStorage:{ _s:{}, getItem(k){return this._s[k]||null;}, setItem(k,v){this._s[k]=String(v);}, removeItem(k){delete this._s[k];} },
  document:{
    getElementById:getEl, querySelectorAll(){return [];}, querySelector(){return null;},
    createElement(){return makeEl();}, addEventListener(){}, removeEventListener(){},
    hidden:false,
  },
  window:{ addEventListener(){}, removeEventListener(){} },
  setInterval:()=>0, clearInterval:()=>{}, setTimeout:()=>0, clearTimeout:()=>{},
  Date, Math, JSON, console, parseInt, parseFloat, isNaN, isFinite,
  confirm:()=>true, alert:()=>{},
};
ctx.globalThis = ctx;
vm.createContext(ctx);

let code = fs.readFileSync(path.join(__dirname,'..','game.js'),'utf8');
// 追加测试导出（仅测试字符串中，不写入 game.js 文件）。
// 用 eval 安全收集：未定义的标识符返回 undefined，不抛错；各任务阶段都可用，无需逐任务改导出。
code += '\n;globalThis.__t=(function(){var o={};'
 + 'Object.defineProperty(o,"state",{get(){return state;},set(v){state=v;}});'
 + '["effectiveCultMult","treasureBonus","equippedTreasure","playerAtk","playerDef","playerMaxHp","lingshiPerSec","ownedTechniques","equipTreasure","joinSect","switchSect","sectBonus","generateBounties","refreshBounties","claimBounty","exchangeSect","bountyProgress","checkBountyAutoRefresh","xiuweiNeed","realmName","fmt","genMonster","TREASURES","SECTS","BOUNTY_TEMPLATES","SECT_SHOP"].forEach(function(k){'
 + 'Object.defineProperty(o,k,{get(){try{return eval(k);}catch(e){return undefined;}}});});'
 + 'return o;})();';

let loadErr = null;
try { vm.runInContext(code, ctx); } catch(e){ loadErr = e; }

const t = ctx.__t;
function assert(c,msg){ if(!c){ throw new Error('ASSERT FAIL: '+msg); } }

// 1) 加载无异常
assert(!loadErr, 'game.js 加载/init 抛错: '+(loadErr&&loadErr.stack));
assert(t, '__t 导出存在');
// 2) 纯函数
assert(t.xiuweiNeed(0)===100, 'xiuweiNeed(0)===100');
assert(t.realmName(0)==='练气期初期', 'realmName(0)');
// 3) 默认无法宝：treasureBonus()==={}
assert(JSON.stringify(t.treasureBonus())==='{}', '默认无法宝 bonus 为空对象');
// 4) 装备灵泉玉瓶后修炼加成 +0.30
t.state.treasures = ['tr_lotus'];
t.state.equip.treasure = 'tr_lotus';
assert(Math.abs(t.treasureBonus().cult-0.30)<1e-9, '灵泉玉瓶 cult=0.30');
assert(t.effectiveCultMult()===1.3, '装备灵泉玉瓶后 effectiveCultMult=1.3');
// 5) 卸下后恢复
t.equipTreasure('tr_lotus'); // 卸下
assert(t.state.equip.treasure===null, '卸下法宝后 equip.treasure=null');
assert(t.effectiveCultMult()===1, '卸下后修炼倍率=1');
// 6) 玄火鉴攻击加成
t.state.treasures=['tr_fire']; t.state.equip.treasure='tr_fire';
const atkNoTr = (()=>{ t.state.equip.treasure=null; const v=t.playerAtk(); t.state.equip.treasure='tr_fire'; return v; })();
assert(t.playerAtk()===Math.round(atkNoTr*1.2), '玄火鉴攻击 +20%');
t.state.treasures=[]; t.state.equip.treasure=null;

// 宗门
t.state.sect = null; t.state.sub = 4;
assert(sectBonusEmpty(), '无宗门 sectBonus 为空');
function sectBonusEmpty(){ return JSON.stringify(t.sectBonus())==='{}'; }
t.joinSect('sect_sword');
assert(t.state.sect && t.state.sect.id==='sect_sword', '加入万剑宗');
assert(Math.abs(t.sectBonus().dmg-0.15)<1e-9, '万剑宗 dmg=0.15');
t.state.lingshi = 0;
t.state.sect.switches = 0;
// 转宗费用 500000，灵石不足应保持原宗门
t.switchSect('sect_body');
assert(t.state.sect.id==='sect_sword', '灵石不足不可转宗');
t.state.lingshi = 1000000;
t.switchSect('sect_body');
assert(t.state.sect.id==='sect_body', '灵石足够可转宗到玄武宗');
assert(t.state.lingshi === 500000, '转宗扣 500000 灵石');
assert(t.state.sect.switches===1, 'switches=1');
// 玄武宗 maxhp/def 加成
assert(Math.abs(t.sectBonus().maxhp-0.20)<1e-9 && Math.abs(t.sectBonus().def-0.10)<1e-9, '玄武宗 bonus');
// 天机阁修炼加成
t.state.lingshi = 1e9; t.switchSect('sect_talisman');
assert(Math.abs(t.effectiveCultMult() - (1 + 0.15))<1e-9 || t.effectiveCultMult()===1.15, '天机阁修炼 +15%');
t.state.sect = null; t.state.sub = 0; t.state.lingshi = 0;

// 悬赏
t.state.sect = { id:'sect_sword', contribution:0, switches:0 };
t.state.sub = 4; t.state.bountyRound = 0;
const bs = t.generateBounties();
assert(Array.isArray(bs) && bs.length===4, 'generateBounties 返回 4 条');
assert(bs.every(b=>b.target>0 && !b.done && !b.claimed), '初始悬赏未完成未领取');
// 进度推进：把第一条设为 kill 类型并填满
bs[0].type='kill'; bs[0].zone=1; bs[0].target=2; bs[0].progress=0;
t.state.bounties = bs;
t.bountyProgress('kill', 1, 1);
assert(t.state.bounties[0].progress===1 && !t.state.bounties[0].done, 'kill 进度+1 未满');
t.bountyProgress('kill', 1, 1);
assert(t.state.bounties[0].done===true, 'kill 进度满 done=true');
t.bountyProgress('kill', 1, 99); // zone 不匹配不应推进其它
// 不同 zone 不推进
bs[0].zone=1; bs[0].done=false; bs[0].progress=0;
t.bountyProgress('kill', 1, 2); // zone=2 != 1
assert(t.state.bounties[0].progress===0, 'kill zone 不匹配不推进');
// 领取
t.state.bounties[0].done=true; t.state.bounties[0].zone=1;
const li0 = t.state.lingshi, c0 = t.state.sect.contribution;
t.claimBounty(t.state.bounties[0].id);
assert(t.state.bounties[0].claimed===true, '领取后 claimed=true');
assert(t.state.lingshi > li0 && t.state.sect.contribution > c0, '领取增加灵石与贡献');
// 手动刷新
t.state.lingshi = 0;
t.refreshBounties(true); // 灵石不足，应不变
t.state.lingshi = 100000;
const before = t.state.bountyRound;
t.refreshBounties(true);
assert(t.state.bountyRound === before+1, '手动刷新批次+1');
assert(t.state.lingshi === 50000, '手动刷新扣 50000');
assert(t.state.bounties.length===4, '刷新后 4 条新悬赏');
t.state.sect = null; t.state.sub = 0; t.state.lingshi = 0; t.state.bounties=[];

console.log('SMOKE OK: '+(typeof process!=='undefined'?process.argv[1]:'smoke'));
