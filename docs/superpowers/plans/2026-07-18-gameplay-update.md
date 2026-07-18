# 玩法更新（法宝/宗门/悬赏）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 superpowers:subagent-driven-development 逐任务实现。步骤用 `- [ ]` 复选框跟踪。

**Goal:** 在 v1 八大系统上新增法宝、宗门、悬赏三大互补系统，形成「悬赏→贡献→法宝/功法强化→变强→推进悬赏」闭环。

**Architecture:** 单文件前端游戏（`index.html` + `style.css` + `game.js`），全局脚本无依赖。新系统全部加在 `game.js` 中，复用现有派生属性函数与事件委托模式；新增第 5 个标签页「宗门」；`SAVE_VERSION` 1→2 温和迁移。

**Tech Stack:** 纯 HTML/CSS/JS（无构建/无依赖/`file://` 可运行），`localStorage` 存档。

## Global Constraints

- 纯前端单文件，**禁止**引入 npm 依赖、ES module、构建步骤；`game.js` 必须保持全局脚本（`<script src>`），`file://` 双击可运行。
- 复用现有 CSS 类（`.item`/`.item-list`/`.item-info`/`.subtabs`/`.subtab`/`.zone-card`/`.zone-title`/`.tab-btn`/`.shop-sec`/`.inv-sec`/`.alch-mats`/`.lock-note`/`.hidden`）；新样式追加到 `style.css` 末尾，使用现有 CSS 变量（`--jade`/`--gold`/`--crimson`/`--purple` 等）。
- 不破坏现有战力曲线：法宝/宗门加成为温和百分比（10%~60%），不改 `GROW=2.3` 等核心常量。
- 所有新按钮沿用事件委托：`data-action="xxx"` + 在 `#tabContent` 的 click 委托里增加分支（宗门标签页内容也在 `#tabContent` 内）。
- 存档兼容：旧 v1 存档必须能迁移加载（补字段），**不得静默清档**。
- 验证方式（无测试框架）：① `node --check game.js` 语法校验；② `node tests/smoke.js` 冒烟测试（vm 加载 + 行为断言）；③ 控制器 diff 审查。每个任务结束前必须跑 ①② 并贴输出。

## 文件结构

- `game.js`（修改）：新增配置表 `TREASURES`/`SECTS`/`BOUNTY_TEMPLATES`/`SECT_SHOP`；新增状态字段；修改派生属性 `effectiveCultMult`/`playerAtk`/`playerDef`/`playerMaxHp`/`lingshiPerSec`/`alchemyChance`；修改 `battleRound`/`endBattle`/`meditate`/`craft`/`doBreakthrough`/`tick`/`load`/`newState`/`refreshStats`/`renderTab`/`renderInventory`/`refreshTabButtons`；新增 `renderSect`/`renderBountyBoard`/`renderSectShop` 及若干动作函数。
- `index.html`（修改）：标签栏新增「🏯 宗门」按钮；洞府面板新增法宝显示行。
- `style.css`（修改）：追加宗门/法宝/悬赏相关少量样式。
- `tests/smoke.js`（新建，dev-only）：vm 加载 `game.js` 的冒烟测试。

## 接口契约（跨任务共享，命名必须一致）

- `equippedTreasure()` → `TREASURES` 项 | null
- `treasureBonus()` → 装备中法宝的 `bonus` 对象 | `{}`
- `sectBonus()` → 当前宗门 `bonus` 对象 | `{}`
- `effectiveCultMult()` → 已含功法+法宝+宗门修炼加成
- `playerAtk()`/`playerDef()`/`playerMaxHp()` → 已含法宝+宗门加成（返回整数）
- `lingshiPerSec()` → 无参，读 `state.sub`，已含聚宝盆加成（原 `lingshiPerSec(s)` 改无参）
- `joinSect(id)`/`switchSect(id)`/`generateBounties()`/`refreshBounties(manual)`/`bountyProgress(type,amount,zone)`/`claimBounty(id)`/`exchangeSect(id)`/`equipTreasure(id)`
- 状态字段：`state.equip.treasure`、`state.treasures`、`state.sect`(`{id,contribution,switches}`)、`state.bounties`、`state.bountyRefreshAt`、`state.bountyRound`、`state.stats.bounties`

---

## Task 1: 法宝系统

**Files:**
- Modify: `game.js`（配置区、派生属性、`battleRound`/`endBattle`、`newState`/`load`、`refreshStats`、`renderInventory`、`refreshInventoryBtns`、事件委托）
- Modify: `index.html`（洞府法宝行）
- Create: `tests/smoke.js`

**Interfaces:**
- Produces: `TREASURES`, `equippedTreasure()`, `treasureBonus()`, `equipTreasure(id)`, `state.equip.treasure`, `state.treasures`

**步骤：**

- [ ] **Step 1: 新建冒烟测试骨架 `tests/smoke.js`**（vm 加载 game.js，断言无异常 + 基础断言）

```js
// tests/smoke.js —— dev-only 冒烟测试：mock 浏览器全局后用 vm 加载 game.js
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

console.log('SMOKE OK: '+(typeof process!=='undefined'?process.argv[1]:'smoke'));
```

- [ ] **Step 2: 运行测试，确认基础断言通过**（此时法宝未实现，断言 3-6 应失败——这是 RED）

Run: `node tests/smoke.js`
Expected: 抛错（`treasureBonus` 未定义 / effectiveCultMult 不含法宝）

- [ ] **Step 3: 在 `game.js` 配置区（`RECIPES` 之后、`ZONE_NAMES` 之前）新增法宝配置**

```js
/* ---------- 法宝（装备槽：treasure） ---------- */
const TREASURES = [
  { id:'tr_lotus', name:'灵泉玉瓶', icon:'🍶', desc:'修炼速度 +30%',          bonus:{cult:0.30},                        source:'sect' },
  { id:'tr_fire',  name:'玄火鉴',   icon:'🔥', desc:'攻击 +20%',              bonus:{atk:0.20},                         source:'drop' },
  { id:'tr_vajra', name:'金刚镯',   icon:'💍', desc:'防御 +25% / 气血 +15%',  bonus:{def:0.25, maxhp:0.15},             source:'drop' },
  { id:'tr_blood', name:'嗜血珠',   icon:'🩸', desc:'战斗吸血 30%',           bonus:{lifesteal:0.30},                   source:'sect' },
  { id:'tr_basin', name:'聚宝盆',   icon:'🏺', desc:'灵石获取 +50%',          bonus:{lingshi:0.50},                     source:'drop' },
  { id:'tr_jade',  name:'造化玉碟', icon:'💿', desc:'修炼 +60% / 攻防各 +10%', bonus:{cult:0.60, atk:0.10, def:0.10},    source:'sect' },
];
const TREASURE_DROP_CHANCE = 0.08;       // 强怪(vIdx=2)掉落概率
const TREASURE_DROP_ORDER  = ['tr_fire','tr_vajra','tr_basin']; // 按秘境层级递进
```

- [ ] **Step 4: 新增法宝派生属性函数（放在 `ownedTechniques` 之前）**

```js
function equippedTreasure(){
  return TREASURES.find(t => t.id === state.equip.treasure) || null;
}
function treasureBonus(){
  const t = equippedTreasure();
  return t ? t.bonus : {};
}
```

- [ ] **Step 5: 修改派生属性集成法宝（保留后续 Task 2 宗门加成的插入位置）**

把 `effectiveCultMult` 改为：
```js
function effectiveCultMult(){
  let m = 1;
  for (const t of ownedTechniques()) m += t.cultBonus;
  m += (treasureBonus().cult || 0);
  return m;
}
```
把 `playerAtk`/`playerDef`/`playerMaxHp` 改为：
```js
const playerAtk   = () => Math.round((baseAtk(state.sub) + ((WEAPONS.find(x=>x.id===state.equip.weapon)||{}).atk || 0)) * (1 + (treasureBonus().atk || 0)));
const playerDef   = () => Math.round((baseDef(state.sub) + ((ARMORS.find(x=>x.id===state.equip.armor)||{}).def || 0)) * (1 + (treasureBonus().def || 0)));
const playerMaxHp = () => Math.round(baseMaxHp(state.sub) * (1 + (treasureBonus().maxhp || 0)));
```
把 `lingshiPerSec` 改为无参（读 state.sub）并加聚宝盆加成：
```js
const lingshiPerSec = () => {
  const base = LINGSHI_AUTO_BASE * Math.pow(LINGSHI_AUTO_GROWTH, realmOf(state.sub));
  return base * (1 + (treasureBonus().lingshi || 0));
};
```
更新 `tick()` 中的调用：`state.lingshi += lingshiPerSec() * dt;`（删去 `state.sub` 实参）。
搜索全文件确认无其它 `lingshiPerSec(` 调用点（原仅 `tick()` 一处）。

- [ ] **Step 6: 战斗吸血 + 灵石加成（`battleRound` 与 `endBattle`）**

`battleRound` 改为：
```js
function battleRound(){
  const b = battleState; if (!b) return;
  const pd = dmgCalc(playerAtk(), b.mon.def);
  b.monHp -= pd;
  const ls = treasureBonus().lifesteal || 0;
  if (ls > 0 && state.hp < playerMaxHp()){
    state.hp = Math.min(playerMaxHp(), state.hp + Math.max(1, Math.round(pd * ls)));
  }
  if (b.monHp <= 0){ b.monHp = 0; return endBattle(true); }
  if (debugGodMode){ refreshBattle(); return; }
  const md = dmgCalc(b.mon.atk, playerDef());
  state.hp -= md;
  if (state.hp <= 0){ state.hp = 0; return endBattle(false); }
  refreshBattle();
}
```
`endBattle` 的 `win` 分支：灵石应用聚宝盆加成，并新增强怪法宝掉落：
```js
  if (win){
    const li = Math.round(b.mon.lingshi[0] + Math.random() * (b.mon.lingshi[1] - b.mon.lingshi[0]));
    const liGain = Math.round(li * (1 + (treasureBonus().lingshi || 0)));
    state.lingshi += liGain;
    state.stats.kills++;
    const drops = [];
    if (Math.random() < b.mon.herbChance){ state.inv.herb++; drops.push('灵草×1'); }
    if (Math.random() < b.mon.coreChance){ state.inv.core++; drops.push('妖核×1'); }
    if (b.var === 2 && Math.random() < TREASURE_DROP_CHANCE){
      const dropId = TREASURE_DROP_ORDER[Math.min(TREASURE_DROP_ORDER.length-1, Math.floor(b.zone/3))];
      if (!state.treasures.includes(dropId)){
        state.treasures.push(dropId);
        const tr = TREASURES.find(x=>x.id===dropId);
        drops.push(`法宝 ${tr.icon}${tr.name}`);
      }
    }
    log(`🏆 击杀 ${b.mon.name}，得灵石 ${fmt(liGain)}${drops.length ? '，掉落 ' + drops.join('、') : ''}`);
  } else {
    // ... 原战败分支不变
  }
```

- [ ] **Step 7: `newState()` 与 `load()` 补字段**

`newState()` 的 `equip` 改为 `{ weapon:null, armor:null, treasure:null }`，并在 `inv` 后新增 `treasures: [],`。
`load()` 中 `state.equip = Object.assign({weapon:null,armor:null}, s.equip || {});` 改为 `Object.assign({weapon:null,armor:null,treasure:null}, s.equip || {})`；并在该行后新增 `state.treasures = Array.isArray(s.treasures) ? s.treasures.slice() : [];`

- [ ] **Step 8: `equipTreasure` 函数 + 事件委托分支**

新增（放在 `usePill` 之后）：
```js
function equipTreasure(id){
  if (!state.treasures.includes(id)) return;
  const t = TREASURES.find(x=>x.id===id);
  if (state.equip.treasure === id){ state.equip.treasure = null; log(`📿 卸下法宝 ${t.name}`); }
  else { state.equip.treasure = id; log(`📿 装备法宝 ${t.name}`); }
  refreshStats(); renderTab(); save();
}
```
`#tabContent` click 委托里（`use-pill` 分支后）新增：`else if (a === 'equip-treasure') equipTreasure(btn.dataset.id);`

- [ ] **Step 9: 行囊 UI 新增法宝栏（`renderInventory`）**

在「装备」`inv-sec` 之后、「储物袋」之前插入：
```js
  h += '<div class="inv-sec"><h3>📿 法宝</h3>';
  const eqT = equippedTreasure();
  h += `<p>已装备：${eqT ? eqT.icon+eqT.name+' ('+eqT.desc+')' : '无'}</p>`;
  if (state.treasures.length){
    h += '<div class="item-list">';
    for (const id of state.treasures){
      const t = TREASURES.find(x=>x.id===id);
      const eq = state.equip.treasure === id;
      h += `<div class="item"><div class="item-info"><b>${t.icon} ${t.name}</b><span>${t.desc}</span></div>
        <button class="tab-btn" data-action="equip-treasure" data-id="${id}">${eq?'卸下':'装备'}</button></div>`;
    }
    h += '</div>';
  } else {
    h += '<p style="font-size:12px;color:var(--muted-dim)">尚无法宝（击杀"强"档妖兽或宗门兑换可得）</p>';
  }
  h += '</div>';
```

- [ ] **Step 10: 洞府面板法宝行**

`index.html` 洞府 `.tech-line` 后新增：
```html
        <div class="tech-line">📿 法宝：<b id="treasureText">无</b></div>
```
`refreshStats()` 中 `techText` 赋值后新增：
```js
  document.getElementById('treasureText').textContent = equippedTreasure() ? equippedTreasure().name : '无';
```

- [ ] **Step 11: 语法校验 + 冒烟测试**

Run: `node --check game.js && node tests/smoke.js`
Expected: `SMOKE OK`（断言 1-6 全过）

- [ ] **Step 12: 提交**

```bash
git add game.js index.html tests/smoke.js
git commit -m "feat: 法宝系统（配置/属性集成/掉落/行囊UI）"
```

---

## Task 2: 宗门系统

**Files:** Modify `game.js`（配置、派生属性、`newState`/`load`、`index.html` 标签、`renderTab`/`refreshTabButtons`、`renderSect`、事件委托、`style.css`）
**Interfaces:** Produces `SECTS`, `sectBonus()`, `joinSect(id)`, `switchSect(id)`, `state.sect`

**步骤：**

- [ ] **Step 1: 配置（`TREASURES` 配置之后）**

```js
/* ---------- 宗门 ---------- */
const SECTS = [
  { id:'sect_sword',    name:'万剑宗', icon:'⚔️', desc:'剑修 · 战斗伤害 +15%',                       bonus:{dmg:0.15} },
  { id:'sect_pill',     name:'药王谷', icon:'⚗️', desc:'丹修 · 炼丹成功率 +15%、修为丹效果 +50%',    bonus:{alch:0.15, pillXiuwei:0.50} },
  { id:'sect_talisman', name:'天机阁', icon:'📜', desc:'符修 · 修炼速度 +15%',                       bonus:{cult:0.15} },
  { id:'sect_body',     name:'玄武宗', icon:'🛡️', desc:'体修 · 气血上限 +20%、防御 +10%',            bonus:{maxhp:0.20, def:0.10} },
];
const SECT_UNLOCK_SUB  = 4;          // 筑基期可加入
const SECT_SWITCH_BASE = 500000;     // 转宗基础灵石
function sectBonus(){ return state.sect ? (SECTS.find(s=>s.id===state.sect.id)||{}).bonus || {} : {}; }
```

- [ ] **Step 2: 派生属性集成宗门加成**

`effectiveCultMult` 末尾 `return m;` 前新增：`m += (sectBonus().cult || 0);`
`playerDef` 乘数改为 `(1 + (treasureBonus().def || 0) + (sectBonus().def || 0))`
`playerMaxHp` 乘数改为 `(1 + (treasureBonus().maxhp || 0) + (sectBonus().maxhp || 0))`
`alchemyChance` 改为：`return Math.min(0.95, 0.6 + realmOf(state.sub) * 0.04 + (sectBonus().alch || 0));`
战斗伤害加成：`battleRound` 中 `const pd = dmgCalc(playerAtk(), b.mon.def);` 后改为：
```js
  const pdRaw = dmgCalc(playerAtk(), b.mon.def);
  const pd = Math.round(pdRaw * (1 + (sectBonus().dmg || 0)));
  b.monHp -= pd;
```
（注意：吸血 `pd` 也用这个含宗门加成的值，保持一致。）
`usePill` 的修为丹分支：`const g = Math.round(pillXiuwei(state.sub) * (1 + (sectBonus().pillXiuwei || 0)));`

- [ ] **Step 3: `joinSect` / `switchSect`（放 `equipTreasure` 之后）**

```js
function joinSect(id){
  if (state.sect) return;
  if (state.sub < SECT_UNLOCK_SUB){ log(`🏯 需达到 ${realmName(SECT_UNLOCK_SUB)} 方可拜入宗门。`); return; }
  const s = SECTS.find(x=>x.id===id);
  if (!s) return;
  state.sect = { id, contribution:0, switches:0 };
  state.bounties = generateBounties();          // Task 3 定义；此时若未定义则先返回占位
  state.bountyRefreshAt = Date.now() + BOUNTY_REFRESH_MS;
  log(`🏯 拜入 ${s.name}，${s.desc}！`);
  refreshStats(); renderTab(); save();
}
function switchSect(id){
  if (!state.sect || state.sect.id === id) return;
  const times = state.sect.switches || 0;
  const cost = Math.round(SECT_SWITCH_BASE * Math.pow(2, times));
  if (state.lingshi < cost){ log(`🏯 转宗需灵石 ${fmt(cost)}，不足！`); return; }
  state.lingshi -= cost;
  state.sect.id = id;
  state.sect.switches = times + 1;
  const s = SECTS.find(x=>x.id===id);
  log(`🏯 转投 ${s.name}，花费灵石 ${fmt(cost)}。${s.desc}`);
  refreshStats(); renderTab(); save();
}
```
> 注：Task 2 中 `generateBounties`/`BOUNTY_REFRESH_MS` 尚未定义。为避免 ReferenceError，在 Task 2 中先在配置区加占位：`const BOUNTY_REFRESH_MS = 30*60*1000; function generateBounties(){ return []; }`，Task 3 再替换为真实实现。`joinSect` 中调用占位函数返回 `[]` 即可。

- [ ] **Step 4: `newState`/`load` 补 `sect`**

`newState()` 新增 `sect:null, bounties:[], bountyRefreshAt:0, bountyRound:0,`；`stats` 新增 `bounties:0`。
`load()` 中新增：`state.sect = (s.sect && s.sect.id) ? { id:s.sect.id, contribution:s.sect.contribution||0, switches:s.sect.switches||0 } : null;`；`state.bounties = Array.isArray(s.bounties) ? s.bounties : [];`；`state.bountyRefreshAt = s.bountyRefreshAt || 0;`；`state.bountyRound = s.bountyRound || 0;`；`state.stats` merge 中补 `bounties:0`。

- [ ] **Step 5: `index.html` 标签栏新增宗门**

`<nav class="tabs">` 内「行囊」按钮后新增：
```html
          <button class="tab" data-tab="sect">🏯 宗门</button>
```

- [ ] **Step 6: `renderTab`/`refreshTabButtons` 新增 sect 分支**

`renderTab` 新增：`else if (state.activeTab === 'sect') c.innerHTML = renderSect();`
`refreshTabButtons` 新增：`else if (t === 'sect') refreshSectBtns();`
新增：
```js
function refreshSectBtns(){
  document.querySelectorAll('#tabContent [data-action="join-sect"]').forEach(b => {
    b.disabled = !!state.sect || state.sub < SECT_UNLOCK_SUB;
  });
  document.querySelectorAll('#tabContent [data-action="switch-sect"]').forEach(b => {
    const times = (state.sect && state.sect.switches) || 0;
    const cost = Math.round(SECT_SWITCH_BASE * Math.pow(2, times));
    b.disabled = !state.sect || state.lingshi < cost;
  });
}
```

- [ ] **Step 7: `renderSect`（含 Task 3/4 插入点）**

```js
function renderSect(){
  let h = '';
  if (!state.sect){
    if (state.sub < SECT_UNLOCK_SUB) h += `<div class="lock-note">需达到 ${realmName(SECT_UNLOCK_SUB)} 方可拜入宗门。</div>`;
    h += '<div class="zone-grid">';
    for (const s of SECTS){
      h += `<div class="zone-card"><div class="zone-title">${s.icon} ${s.name}</div>
        <div class="alch-mats" style="margin-bottom:8px">${s.desc}</div>
        <button class="tab-btn" data-action="join-sect" data-id="${s.id}" ${state.sub<SECT_UNLOCK_SUB?'disabled':''}>拜入</button></div>`;
    }
    h += '</div>';
    return h;
  }
  const s = SECTS.find(x=>x.id===state.sect.id);
  h += `<div class="inv-sec"><h3>${s.icon} ${s.name}</h3>
    <p>${s.desc}　|　宗门贡献：<b style="color:var(--gold-bright)">${fmt(state.sect.contribution)}</b></p></div>`;
  // 转宗
  h += '<div class="inv-sec"><h3>🔄 转投他宗</h3><div class="zone-grid">';
  for (const s2 of SECTS){
    if (s2.id === s.id) continue;
    const times = state.sect.switches || 0;
    const cost = Math.round(SECT_SWITCH_BASE * Math.pow(2, times));
    h += `<div class="zone-card"><div class="zone-title">${s2.icon} ${s2.name}</div>
      <div class="alch-mats" style="margin-bottom:8px">${s2.desc}</div>
      <button class="tab-btn" data-action="switch-sect" data-id="${s2.id}">💎 ${fmt(cost)}</button></div>`;
  }
  h += '</div></div>';
  h += renderBountyBoard();   // Task 3 实现；Task 2 中占位返回 ''
  h += renderSectShop();      // Task 4 实现；Task 2 中占位返回 ''
  return h;
}
```
Task 2 中先加占位函数（Task 3/4 替换）：
```js
function renderBountyBoard(){ return ''; }
function renderSectShop(){ return ''; }
```

- [ ] **Step 8: 事件委托新增 `join-sect`/`switch-sect`**

`#tabContent` 委托里新增：
```js
    else if (a === 'join-sect')   { joinSect(btn.dataset.id); renderTab(); refreshStats(); return; }
    else if (a === 'switch-sect') { switchSect(btn.dataset.id); renderTab(); refreshStats(); return; }
```

- [ ] **Step 9: 扩展冒烟测试 `tests/smoke.js`**（在末尾 `console.log` 前追加）

```js
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
```

- [ ] **Step 10: 语法 + 冒烟**

Run: `node --check game.js && node tests/smoke.js`
Expected: `SMOKE OK`

- [ ] **Step 11: 提交**

```bash
git add game.js index.html tests/smoke.js
git commit -m "feat: 宗门系统（4宗门/加入/付费转宗/加成/宗门标签页）"
```

---

## Task 3: 悬赏任务

**Files:** Modify `game.js`（替换 `BOUNTY_REFRESH_MS` 占位与 `generateBounties` 占位为真实实现、新增 `BOUNTY_TEMPLATES`/进度/刷新/领取、埋点、`renderBountyBoard`、事件委托、`tick`、冒烟测试）
**Interfaces:** Produces `BOUNTY_TEMPLATES`, `BOUNTY_COUNT`, `BOUNTY_REFRESH_MS`, `BOUNTY_MANUAL_COST`, `generateBounties()`, `refreshBounties(manual)`, `bountyProgress(type,amount,zone)`, `claimBounty(id)`, `checkBountyAutoRefresh()`, `state.bounties`, `state.bountyRefreshAt`, `state.bountyRound`

**步骤：**

- [ ] **Step 1: 配置（替换 Task 2 的 `BOUNTY_REFRESH_MS` 占位行，并在其旁新增）**

```js
/* ---------- 悬赏 ---------- */
const BOUNTY_COUNT        = 4;
const BOUNTY_REFRESH_MS   = 30 * 60 * 1000;   // 30 分钟定时刷新
const BOUNTY_MANUAL_COST  = 50000;            // 手动刷新灵石
const BOUNTY_TEMPLATES = [
  { type:'kill',  label:'击杀', desc:(n,z)=>`于${ZONE_NAMES[z]}击杀 ${n} 只妖兽` },
  { type:'med',   label:'打坐', desc:(n)=>`打坐吐纳 ${n} 次` },
  { type:'craft', label:'炼丹', desc:(n)=>`成功炼丹 ${n} 次` },
  { type:'break', label:'突破', desc:(n)=>`完成 ${n} 次突破` },
  { type:'hoard', label:'积攒', desc:(n)=>`持有 ${fmt(n)} 灵石` },
];
```

- [ ] **Step 2: 目标/奖励缩放函数**

```js
function bountyTargetN(tpl){
  const r = realmOf(state.sub);
  switch(tpl.type){
    case 'kill':  return 3 + r * 2;
    case 'med':   return 5 + r * 3;
    case 'craft': return 2 + r;
    case 'break': return 1 + Math.floor(r / 2);
    case 'hoard': return Math.round(200 * Math.pow(3, r));
    default: return 5;
  }
}
function bountyReward(tpl, n){
  const r = realmOf(state.sub);
  const baseLi = Math.round(20 * Math.pow(2.5, r));
  const contrib = 10 + r * 5 + (tpl.type === 'hoard' ? 5 : 0);
  return { lingshi: baseLi, contribution: contrib, herb: tpl.type==='kill'?1:0, core: tpl.type==='kill'?1:0 };
}
```

- [ ] **Step 3: `generateBounties` 真实实现（替换 Task 2 占位）**

```js
function generateBounties(){
  const arr = [];
  const maxZ = Math.max(0, Math.floor(state.sub / 4));
  for (let i = 0; i < BOUNTY_COUNT; i++){
    const tpl = BOUNTY_TEMPLATES[Math.floor(Math.random() * BOUNTY_TEMPLATES.length)];
    const n = bountyTargetN(tpl);
    const zone = tpl.type === 'kill' ? Math.max(0, maxZ - Math.floor(Math.random() * 3)) : 0;
    arr.push({
      id: 'b' + (state.bountyRound||0) + '_' + i,
      type: tpl.type, label: tpl.label,
      desc: tpl.desc(n, zone),
      target: n, zone, progress: 0,
      reward: bountyReward(tpl, n),
      done: false, claimed: false,
    });
  }
  return arr;
}
```

- [ ] **Step 4: 进度/刷新/领取**

```js
function bountyProgress(type, amount, zone){
  if (!state.sect || !state.bounties.length) return;
  let changed = false;
  for (const b of state.bounties){
    if (b.done || b.claimed || b.type !== type) continue;
    if (type === 'kill' && b.zone !== zone) continue;
    b.progress = Math.min(b.target, b.progress + amount);
    if (b.progress >= b.target){ b.done = true; }
    changed = true;
  }
  if (changed){ /* UI 在下次 renderTab 刷新 */ }
}
function checkBountyAutoRefresh(){
  if (state.bounties.length && state.bounties.every(b => b.claimed)){
    state.bountyRound = (state.bountyRound||0) + 1;
    state.bounties = generateBounties();
    state.bountyRefreshAt = Date.now() + BOUNTY_REFRESH_MS;
    log(`📜 悬赏全部完成，悬赏榜自动更新（第 ${state.bountyRound} 批）。`);
  }
}
function refreshBounties(manual){
  if (manual){
    if (state.lingshi < BOUNTY_MANUAL_COST){ log(`📜 刷新悬赏需灵石 ${fmt(BOUNTY_MANUAL_COST)}。`); return; }
    state.lingshi -= BOUNTY_MANUAL_COST;
  }
  state.bountyRound = (state.bountyRound||0) + 1;
  state.bounties = generateBounties();
  state.bountyRefreshAt = Date.now() + BOUNTY_REFRESH_MS;
  log(`📜 悬赏榜已更新（第 ${state.bountyRound} 批）。`);
  refreshStats(); renderTab(); save();
}
function claimBounty(id){
  const b = state.bounties.find(x=>x.id===id);
  if (!b || !b.done || b.claimed) return;
  if (b.type === 'hoard' && state.lingshi < b.target){ log(`📜 需持有 ${fmt(b.target)} 灵石方可领取。`); return; }
  b.claimed = true;
  state.lingshi += b.reward.lingshi;
  state.sect.contribution += b.reward.contribution;
  if (b.reward.herb) state.inv.herb += b.reward.herb;
  if (b.reward.core) state.inv.core += b.reward.core;
  state.stats.bounties = (state.stats.bounties||0) + 1;
  log(`📜 领取悬赏：灵石 +${fmt(b.reward.lingshi)}，贡献 +${b.reward.contribution}`);
  checkBountyAutoRefresh();
  refreshStats(); renderTab(); save();
}
```

- [ ] **Step 5: 埋点（在现有函数中加单行调用）**

- `meditate()`：`state.stats.meditations++;` 后加 `bountyProgress('med', 1);`
- `doBreakthrough()`：突破成功分支 `state.stats.breakthroughs++;` 后加 `bountyProgress('break', 1);`
- `craft()`：炼丹成功分支 `state.inv[r.out]++;` 后加 `bountyProgress('craft', 1);`
- `endBattle(win)`：`win` 分支 `state.stats.kills++;` 后加 `bountyProgress('kill', 1, b.zone);`（`b` 为 `battleState` 快照，在 `clearInterval` 之后、`battleState=null` 之前；实际 `endBattle` 开头 `const b = battleState;` 已有，直接用 `b.zone`）

- [ ] **Step 6: `tick()` 定时刷新**

`tick()` 中 `if (state.won || document.hidden) return;` 之后新增：
```js
  if (state.sect && state.bounties.length && state.bountyRefreshAt && Date.now() >= state.bountyRefreshAt){
    if (!state.bounties.every(b => b.claimed)){
      state.bountyRound = (state.bountyRound||0) + 1;
      state.bounties = generateBounties();
      log(`📜 悬赏榜定时更新（第 ${state.bountyRound} 批）。`);
    }
    state.bountyRefreshAt = Date.now() + BOUNTY_REFRESH_MS;
  }
```

- [ ] **Step 7: `renderBountyBoard` 真实实现（替换 Task 2 占位）**

```js
function renderBountyBoard(){
  if (!state.sect) return '';
  const remain = Math.max(0, Math.ceil((state.bountyRefreshAt - Date.now()) / 1000));
  let h = '<div class="inv-sec"><h3>📜 悬赏榜</h3>';
  h += `<div class="alch-mats" style="margin-bottom:8px">第 ${state.bountyRound||0} 批 · 定时刷新 ${fmtDur(remain)} 
    <button class="tab-btn" data-action="refresh-bounty" style="margin-left:8px">💎 ${fmt(BOUNTY_MANUAL_COST)} 立即刷新</button></div>`;
  h += '<div class="item-list">';
  for (const b of state.bounties){
    const status = b.claimed ? '✓已领取' : (b.done ? '★可领取' : `${b.progress}/${b.target}`);
    const rewardStr = `💎${fmt(b.reward.lingshi)} +🏯${b.reward.contribution}${b.reward.herb?' +🌿1':''}${b.reward.core?' +💀1':''}`;
    h += `<div class="item"><div class="item-info"><b>${b.label}：${b.desc}</b>
      <span>奖励 ${rewardStr}　|　${status}</span></div>
      <button class="tab-btn" data-action="claim-bounty" data-id="${b.id}" ${(!b.done||b.claimed)?'disabled':''}>${b.claimed?'已领':'领取'}</button></div>`;
  }
  h += '</div></div>';
  return h;
}
```
`refreshSectBtns()` 中追加（悬赏按钮状态）：
```js
  const rb = document.querySelector('#tabContent [data-action="refresh-bounty"]');
  if (rb) rb.disabled = state.lingshi < BOUNTY_MANUAL_COST;
```

- [ ] **Step 8: 事件委托新增 `refresh-bounty`/`claim-bounty`**

```js
    else if (a === 'refresh-bounty'){ refreshBounties(true); return; }
    else if (a === 'claim-bounty')  { claimBounty(btn.dataset.id); return; }
```

- [ ] **Step 9: 冒烟测试扩展**

```js
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
```

- [ ] **Step 10: 语法 + 冒烟**

Run: `node --check game.js && node tests/smoke.js`
Expected: `SMOKE OK`

- [ ] **Step 11: 提交**

```bash
git add game.js tests/smoke.js
git commit -m "feat: 悬赏任务（5模板/进度埋点/三合一刷新/悬赏榜UI）"
```

---

## Task 4: 宗门贡献商店

**Files:** Modify `game.js`（`SECT_SHOP` 配置、宗门专属功法、`exchangeSect`、`renderSectShop`、事件委托、冒烟测试）
**Interfaces:** Produces `SECT_SHOP`, `exchangeSect(id)`

**步骤：**

- [ ] **Step 1: 宗门专属功法（`TECHNIQUES` 数组末尾追加）**

```js
  { id:'t_sect', name:'太乙真诀', cultBonus:2.0, cost:0, sectOnly:true },
```
`renderShop` 功法循环改为 `for (const t of TECHNIQUES){ if (t.sectOnly) continue; ...`（跳过宗门专属，不在灵石商店售卖）。

- [ ] **Step 2: `SECT_SHOP` 配置（`SECTS` 配置之后）**

```js
/* ---------- 宗门贡献商店 ---------- */
const SECT_SHOP = [
  { id:'ss_lotus',  type:'treasure',  ref:'tr_lotus', contrib:200,  desc:'灵泉玉瓶（修炼+30%）' },
  { id:'ss_blood',  type:'treasure',  ref:'tr_blood', contrib:400,  desc:'嗜血珠（吸血30%）' },
  { id:'ss_jade',   type:'treasure',  ref:'tr_jade',  contrib:1200, desc:'造化玉碟（修炼+60%/攻防+10%）' },
  { id:'ss_tech',   type:'technique', ref:'t_sect',   contrib:300,  desc:'宗门功法·太乙真诀（修炼+2.0）' },
  { id:'ss_pill_x', type:'pill',      ref:'xiuwei',   contrib:50,   desc:'修为丹 ×3' },
  { id:'ss_pill_t', type:'pill',      ref:'tupo',     contrib:80,   desc:'突破丹 ×2' },
];
```

- [ ] **Step 3: `exchangeSect`（放 `claimBounty` 之后）**

```js
function exchangeSect(id){
  if (!state.sect) return;
  const item = SECT_SHOP.find(x=>x.id===id);
  if (!item) return;
  if (state.sect.contribution < item.contrib){ log(`🏯 贡献不足，需 ${item.contrib}。`); return; }
  if (item.type === 'treasure'){
    if (state.treasures.includes(item.ref)){ log('🏯 已拥有此法宝。'); return; }
    state.treasures.push(item.ref);
    const tr = TREASURES.find(x=>x.id===item.ref);
    log(`🏯 兑换 ${tr.icon}${tr.name}！`);
  } else if (item.type === 'technique'){
    if (state.techniques.includes(item.ref)){ log('🏯 已习得此功法。'); return; }
    state.techniques.push(item.ref);
    log(`🏯 习得宗门功法 太乙真诀，修炼速度大增！`);
  } else if (item.type === 'pill'){
    const qty = item.id.endsWith('_x') ? 3 : 2;
    state.inv[item.ref] = (state.inv[item.ref]||0) + qty;
    log(`🏯 兑换 ${PILL_DEFS[item.ref].name}×${qty}！`);
  }
  state.sect.contribution -= item.contrib;
  refreshStats(); renderTab(); save();
}
```

- [ ] **Step 4: `renderSectShop` 真实实现（替换 Task 2 占位）**

```js
function renderSectShop(){
  if (!state.sect) return '';
  let h = '<div class="inv-sec"><h3>🏯 贡献兑换</h3>';
  h += `<div class="alch-mats" style="margin-bottom:8px">当前贡献：<b style="color:var(--gold-bright)">${fmt(state.sect.contribution)}</b></div>`;
  h += '<div class="item-list">';
  for (const item of SECT_SHOP){
    let owned = false;
    if (item.type==='treasure') owned = state.treasures.includes(item.ref);
    if (item.type==='technique') owned = state.techniques.includes(item.ref);
    const icon = item.type==='treasure' ? (TREASURES.find(x=>x.id===item.ref)||{}).icon + ' ' : (item.type==='technique'?'📕 ':item.type==='pill'?(PILL_DEFS[item.ref]||{}).icon+' ':'');
    h += `<div class="item"><div class="item-info"><b>${icon}${item.desc}</b><span>🏯 ${item.contrib} 贡献</span></div>
      <button class="tab-btn" data-action="exchange-sect" data-id="${item.id}" ${owned?'disabled':''}>${owned?'已拥有':'兑换'}</button></div>`;
  }
  h += '</div></div>';
  return h;
}
```
`refreshSectBtns()` 追加：
```js
  document.querySelectorAll('#tabContent [data-action="exchange-sect"]').forEach(b => {
    const item = SECT_SHOP.find(x=>x.id===b.dataset.id);
    let owned = false;
    if (item.type==='treasure') owned = state.treasures.includes(item.ref);
    if (item.type==='technique') owned = state.techniques.includes(item.ref);
    b.disabled = owned || (state.sect && state.sect.contribution < item.contrib) || !state.sect;
  });
```

- [ ] **Step 5: 事件委托新增 `exchange-sect`**

```js
    else if (a === 'exchange-sect'){ exchangeSect(btn.dataset.id); return; }
```

- [ ] **Step 6: 冒烟测试扩展**

```js
// 宗门商店
t.state.sect = { id:'sect_sword', contribution:500, switches:0 };
t.state.treasures = []; t.state.techniques = []; t.state.inv = {herb:0,core:0,huiqi:0,xiuwei:0,tupo:0};
// 兑换灵泉玉瓶(200贡献)
t.exchangeSect('ss_lotus');
assert(t.state.treasures.includes('tr_lotus'), '兑换得灵泉玉瓶');
assert(t.state.sect.contribution===300, '扣 200 贡献');
// 重复兑换应失败
t.exchangeSect('ss_lotus');
assert(t.state.treasures.filter(x=>x==='tr_lotus').length===1, '不可重复兑换法宝');
// 贡献不足
t.exchangeSect('ss_jade'); // 需 1200
assert(!t.state.treasures.includes('tr_jade'), '贡献不足兑换失败');
// 兑换功法
t.state.sect.contribution = 300;
t.exchangeSect('ss_tech');
assert(t.state.techniques.includes('t_sect'), '兑换得太乙真诀');
// 兑换丹药
t.state.sect.contribution = 100;
t.exchangeSect('ss_pill_x');
assert(t.state.inv.xiuwei===3, '兑换修为丹×3');
t.state.sect = null;
```

- [ ] **Step 7: 语法 + 冒烟**

Run: `node --check game.js && node tests/smoke.js`
Expected: `SMOKE OK`

- [ ] **Step 8: 提交**

```bash
git add game.js tests/smoke.js
git commit -m "feat: 宗门贡献商店（兑换法宝/功法/丹药）"
```

---

## Task 5: 存档迁移 + 整体验证

**Files:** Modify `game.js`（`SAVE_VERSION`、`load()` 迁移逻辑）；冒烟测试迁移用例

**步骤：**

- [ ] **Step 1: `SAVE_VERSION` 升级**

`const SAVE_VERSION = 1;` → `const SAVE_VERSION = 2;`

- [ ] **Step 2: 重写 `load()` 版本分支为迁移逻辑**

把 `load()` 开头的版本检查块：
```js
    if (s.version !== SAVE_VERSION){
      try { localStorage.setItem(SAVE_KEY + '_bak', raw); } catch(e){}
      localStorage.removeItem(SAVE_KEY);
      log(`⚠️ 存档版本(v${s.version})与当前(v${SAVE_VERSION})不兼容，已备份旧档并重新开始。`);
      return false;
    }
```
替换为：
```js
    if (s.version !== SAVE_VERSION){
      if (s.version === 1){
        // v1 -> v2 温和迁移：补全新字段，保留玩家进度
        s.treasures = Array.isArray(s.treasures) ? s.treasures : [];
        s.equip = Object.assign({weapon:null, armor:null, treasure:null}, s.equip || {});
        s.sect = null;
        s.bounties = [];
        s.bountyRefreshAt = 0;
        s.bountyRound = 0;
        s.stats = Object.assign({kills:0,deaths:0,breakthroughs:0,meditations:0,bounties:0}, s.stats || {});
        s.version = 2;
        log('📦 存档已从 v1 迁移至 v2（新增法宝/宗门/悬赏系统）。');
      } else {
        try { localStorage.setItem(SAVE_KEY + '_bak', raw); } catch(e){}
        localStorage.removeItem(SAVE_KEY);
        log(`⚠️ 存档版本(v${s.version})与当前(v${SAVE_VERSION})不兼容，已备份旧档并重新开始。`);
        return false;
      }
    }
```

- [ ] **Step 3: 冒烟测试迁移用例（必须用全新 context，避免 `let`/`const` 重复声明）**

在 `tests/smoke.js` 末尾追加 `makeCtx(saveData)` 工厂，为迁移测试构造全新 context 并预置 v1 存档：
```js
// 存档迁移 v1 -> v2（独立 context，避免重复声明）
function makeCtx(saveData){
  const store = {};
  if (saveData) store['xiuxian_save_v1'] = JSON.stringify(saveData);
  const els = {};
  const c = {
    localStorage:{ _s:store, getItem(k){return this._s[k]||null;}, setItem(k,v){this._s[k]=String(v);}, removeItem(k){delete this._s[k];} },
    document:{ getElementById(id){ return (els[id]||(els[id]=makeEl())); }, querySelectorAll(){return [];}, querySelector(){return null;}, createElement(){return makeEl();}, addEventListener(){}, removeEventListener(){}, hidden:false },
    window:{ addEventListener(){}, removeEventListener(){} },
    setInterval:()=>0, clearInterval:()=>{}, setTimeout:()=>0, clearTimeout:()=>{},
    Date, Math, JSON, console, parseInt, parseFloat, isNaN, isFinite, confirm:()=>true, alert:()=>{},
  };
  c.globalThis = c;
  vm.createContext(c);
  return c;
}
const v1save = { version:1, sub:8, xiuwei:500, lingshi:1234, hp:200, techniques:['t0'], equip:{weapon:'w1',armor:null}, inv:{herb:1,core:0,huiqi:0,xiuwei:0,tupo:0}, stats:{kills:3,deaths:1,breakthroughs:2,meditations:10}, won:false, activeTab:'zone' };
const mctx = makeCtx(v1save);
let mErr = null;
try { vm.runInContext(code, mctx); } catch(e){ mErr = e; }
assert(!mErr, '迁移加载无异常: '+(mErr&&mErr.stack));
const mt = mctx.__t;
assert(mt.state.version===2, '迁移后 version=2');
assert(mt.state.sub===8, '迁移保留 sub=8');
assert(Array.isArray(mt.state.treasures) && mt.state.treasures.length===0, '迁移补 treasures=[]');
assert(mt.state.equip.treasure===null, '迁移补 equip.treasure=null');
assert(mt.state.sect===null, '迁移补 sect=null');
assert(Array.isArray(mt.state.bounties) && mt.state.bounties.length===0, '迁移补 bounties=[]');
assert(mt.state.stats && typeof mt.state.stats.bounties==='number', '迁移补 stats.bounties');
```
（注：`code` 末尾已含 `__t` 导出；每个新 context 独立运行，互不影响，避免同一 context 重复声明 `let state`/`const` 报错。）

- [ ] **Step 4: 全量语法 + 冒烟**

Run: `node --check game.js && node tests/smoke.js`
Expected: `SMOKE OK`（含迁移用例全过）

- [ ] **Step 5: 提交**

```bash
git add game.js tests/smoke.js
git commit -m "feat: 存档迁移 v1->v2 + 整体验证"
```

---

## 完成后：全分支代码审查

- [ ] 派发最终代码审查子代理，通读 `game.js`/`index.html`/`style.css` 全部 diff，检查：spec 覆盖、命名一致性、边界（无 sect 时悬赏/商店不渲染、load 迁移幂等、tick 定时刷新不与自动刷新冲突）、数值平衡、UI 复用现有样式。
- [ ] 控制器汇总各任务验证证据（`node --check` + `node tests/smoke.js` 输出）与审查结论，向用户汇报。
