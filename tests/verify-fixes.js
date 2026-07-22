// tests/verify-fixes.js -- 验证本次 bug 修复（CRITICAL/MEDIUM）
// 复用 smoke.js 的 mock 思路：mock 浏览器全局后用 vm 加载 game.js
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
// 让 querySelectorAll 对 #tabContent 内按钮返回空（与 smoke 一致），其余返回空
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
 + '["sectShopItems","buySectItem","claimBounty","generateBounties","bountyProgress","TREASURES","renderSectShop","TREASURE_DUP_REFUND","onVisibility","load","ownedTechniques","effectiveCultMult","SAVE_KEY"].forEach(function(k){'
 + 'Object.defineProperty(o,k,{get(){try{return eval(k);}catch(e){return undefined;}}});});'
 // 可读写模块级 let：hiddenSince / lastTick
 + '["hiddenSince","lastTick"].forEach(function(k){'
 + 'Object.defineProperty(o,k,{get(){try{return eval(k);}catch(e){return undefined;}},set(v){try{eval(k+"=("+JSON.stringify(v)+")");}catch(e){}}});});'
 + 'return o;})();';
vm.runInContext(code, ctx);
const t = ctx.__t;
function assert(c,msg){ if(!c){ throw new Error('ASSERT FAIL: '+msg); } }

// ---------- Fix 1: 宗门法宝 cost ----------
const sectTrs = t.sectShopItems().filter(x => x.type === 'treasure');
assert(sectTrs.length === 3, '宗门商店应有 3 件 sect 法宝，实际 ' + sectTrs.length);
for (const it of sectTrs){
  assert(it.cost && typeof it.cost.contribution === 'number',
    `法宝 ${it.id} cost.contribution 应为数字，实际 ${it.cost && it.cost.contribution}`);
}
// 具体价格（按 plan：lotus=300, blood=500, jade=1200）
const costMap = {};
sectTrs.forEach(it => costMap[it.id] = it.cost.contribution);
assert(costMap['tr_lotus'] === 300, `tr_lotus=300，实际 ${costMap['tr_lotus']}`);
assert(costMap['tr_blood'] === 500, `tr_blood=500，实际 ${costMap['tr_blood']}`);
assert(costMap['tr_jade']  === 1200, `tr_jade=1200，实际 ${costMap['tr_jade']}`);
// renderSectShop 不应抛错（此前因 item.cost 为 undefined 崩溃）
t.state.sect = { id:'sect_sword', contribution:9999, switches:0, techs:[] };
let rendered = t.renderSectShop();  // 此前在此抛 TypeError
assert(rendered.indexOf('贡献商店') >= 0, 'renderSectShop 应渲染出贡献商店');

// buySectItem 购买法宝不应抛错且扣贡献
t.state.sect.contribution = 9999;
t.state.treasures = [];
t.buySectItem('treasure', 'tr_lotus');
assert(t.state.treasures.some(x => (x.id||x) === 'tr_lotus'), 'buySectItem 购买 tr_lotus 后应入囊');
assert(t.state.sect.contribution === 9999 - 300, `扣 300 贡献，实际 ${t.state.sect.contribution}`);
console.log('Fix 1 (宗门法宝 cost): OK');

// ---------- Fix 2: hoard 悬赏可领取 ----------
t.state.sect = { id:'sect_sword', contribution:0, switches:0, techs:[] };
t.state.lingshi = 0;
t.state.bountyRound = 0;
// 构造两条悬赏：一条 hoard + 一条未完成 kill，避免领取后触发"全部完成自动刷新"
t.state.bounties = [
  { id:'b_hoard_0', type:'hoard', label:'积攒', desc:'持有 1000 灵石',
    target:1000, zone:0, progress:0, done:false, claimed:false,
    reward:{ lingshi:500, contribution:10, herb:0, core:0 } },
  { id:'b_kill_0', type:'kill', label:'击杀', desc:'击杀 3 只', target:3, zone:0, progress:1, done:false, claimed:false,
    reward:{ lingshi:100, contribution:5, herb:1, core:1 } },
];
// 灵石不足：不可领取
t.state.lingshi = 500;
t.claimBounty('b_hoard_0');
assert(t.state.bounties[0].claimed === false, '灵石不足时 hoard 不可领取');
assert(t.state.lingshi === 500 && t.state.sect.contribution === 0, '灵石不足时不应发放奖励');
// 灵石达标：可领取（此前因 !b.done 被拦截，永远不可领取）
t.state.lingshi = 1000;
const liBefore = t.state.lingshi;
const coBefore = t.state.sect.contribution;
t.claimBounty('b_hoard_0');
assert(t.state.bounties[0].claimed === true, '灵石达标后 hoard 应可领取（claimed=true）');
assert(t.state.lingshi === liBefore + 500, `领取应加灵石 500，实际 ${t.state.lingshi}`);
assert(t.state.sect.contribution === coBefore + 10, `领取应加贡献 10，实际 ${t.state.sect.contribution}`);
console.log('Fix 2 (hoard 悬赏可领取): OK');

// 普通类型仍须 done 才可领（未 done 不可领，行为不变）
// 重置为两条悬赏：待测 kill + 一条未完成 filler，确保只领 kill 时不触发全部完成自动刷新
t.state.bounties = [
  { id:'b_kill_0', type:'kill', label:'击杀', desc:'击杀 3 只', target:3, zone:0, progress:1, done:false, claimed:false,
    reward:{ lingshi:100, contribution:5, herb:1, core:1 } },
  { id:'b_fill_0', type:'med', label:'打坐', desc:'打坐 5 次', target:5, zone:0, progress:0, done:false, claimed:false,
    reward:{ lingshi:50, contribution:5, herb:0, core:0 } },
];
t.claimBounty('b_kill_0');
assert(t.state.bounties[0].claimed === false, 'kill 未 done 不可领取（行为不变）');
t.state.bounties[0].done = true;
t.claimBounty('b_kill_0');
assert(t.state.bounties[0].claimed === true, 'kill done 后可领取');
console.log('Fix 2 (普通悬赏行为不变): OK');

// ---------- Fix 6: 重复掉落折灵石 ----------
assert(t.TREASURE_DUP_REFUND === 5000, `TREASURE_DUP_REFUND=5000，实际 ${t.TREASURE_DUP_REFUND}`);
console.log('Fix 6 (重复掉落折灵石常量): OK');

// ---------- Fix 3: onVisibility 恢复后重置 lastTick ----------
// 模拟：120s 前页面隐藏（hiddenSince + lastTick 都指向 120s 前），现在恢复
ctx.document.hidden = false;
t.state.won = false;
t.state.sub = 0;
t.state.techniques = [];
t.state.sect = null;
t.state.equip = { weapon:null, armor:null, treasure:null };
t.state.xiuwei = 0;
t.hiddenSince = Date.now() - 120000;
t.lastTick    = Date.now() - 120000;
const lastTickOld = t.lastTick;
t.onVisibility();
assert(t.hiddenSince === null, '恢复后 hiddenSince 应清空');
assert(t.state.xiuwei > 0, '应结算 >60s 的离线收益');
assert(t.lastTick > lastTickOld, '恢复后 lastTick 应被重置为当前（避免 tick 重复结算）');
console.log('Fix 3 (onVisibility 重置 lastTick): OK');

// ---------- Fix 4: load() 规范化 techniques ----------
// 构造一份 techniques 字段被损坏( null )的 v2 存档
ctx.localStorage.setItem(t.SAVE_KEY, JSON.stringify({
  version:2, sub:0, xiuwei:0, lingshi:0, hp:100,
  techniques:null,  // 损坏：非数组
  equip:{weapon:null,armor:null,treasure:null},
  treasures:[], inv:{}, lastSave:Date.now(),
}));
t.load();
assert(Array.isArray(t.state.techniques) && t.state.techniques.length === 0,
  `techniques 应被规范化为 []，实际 ${t.state.techniques}`);
// 此前若 techniques=null，ownedTechniques().map 会抛 TypeError
assert(Array.isArray(t.ownedTechniques()), 'ownedTechniques() 不应抛错');
assert(t.effectiveCultMult() === 1, '规范化后 effectiveCultMult 应为 1');
console.log('Fix 4 (load 规范化 techniques): OK');

console.log('ALL VERIFY OK');
