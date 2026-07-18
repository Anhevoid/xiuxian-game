# v2 玩法更新 — 实现计划
> 法宝 / 宗门 / 悬赏任务 三大系统
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 v1 修仙放置小游戏基础上新增法宝系统、宗门系统、悬赏任务三大玩法，实现悬赏闭环，SAVE_VERSION 1→2 温和迁移。

**Architecture:** 纯前端单文件 HTML/CSS/JS，所有新配置/逻辑/UI 均内联于 game.js / style.css / index.html。按 Task 1-5 顺序逐一实现，每个 Task 由子代理独立完成，完成后验证并提交。

**Tech Stack:** Vanilla HTML/CSS/JS (ES5 strict)，无依赖，file:// 可直接运行。

## Global Constraints
- 所有代码内联于现有 3 文件（game.js / style.css / index.html），不新增文件
- `SAVE_VERSION` 提升到 2，旧存档自动补字段不清档
- 保持 GROW=2.3 战力曲线不被破坏，所有加成温和叠加
- 复用现有 CSS 类（.item/.item-list/.subtabs/.zone-card/.tab-btn），新增样式需遵循现有设计 token 系统
- 战斗回合逻辑不变，法宝加成通过属性函数渗透而非修改战斗核心

---

### Task 1: 法宝系统

**Files:**
- Modify: `d:/src/html/xiuxian-game/game.js` — 新增 TREASURES 配置表、状态字段、属性集成、掉落逻辑、UI
- Modify: `d:/src/html/xiuxian-game/style.css` — 法宝卡片样式
- Modify: `d:/src/html/xiuxian-game/index.html` — 行囊法宝区、洞府法宝效果行

**Interfaces:**
- Consumes: state, realmOf, baseAtk/baseDef/baseMaxHp, effectiveCultMult, lingshiPerSec, endBattle, playerAtk/playerDef/playerMaxHp, renderInventory, refreshStats, save, fmt, log
- Produces: TREASURES[], state.treasures[], state.equip.treasure, treasureById(), treasureEquipped(), effectiveTreasureEffects() → 各属性函数调用

**配置表 TREASURES**（6 件）:
```
id: tr_lotus   name: 灵泉玉瓶  cultMul:1.30  source:sect   cost:{contribution:300}  desc:修炼速度+30%
id: tr_fire    name: 玄火鉴    atkMul:1.20   source:drop   desc:攻击+20%
id: tr_vajra   name: 金刚镯    defMul:1.25  hpMul:1.15  source:drop  desc:防御+25%气血+15%
id: tr_blood   name: 嗜血珠    lifesteal:0.30  source:sect  cost:{contribution:500}  desc:战斗吸血30%
id: tr_basin   name: 聚宝盆    lingshiMul:1.50  source:drop  desc:灵石获取+50%
id: tr_jade    name: 造化玉碟  cultMul:1.60  atkMul:1.10  defMul:1.10  source:sect  cost:{contribution:1200}  desc:修炼+60%攻防各+10%
```

**状态字段扩展**: newState()中补充 equip.treasure:null, treasures:[]

**属性函数集成**: effectiveCultMult/playerAtk/playerDef/playerMaxHp/lingshiPerSec 追加法宝乘子；endBattle灵石追加聚宝盆；battleRound吸血珠回血

**掉落逻辑**: endBattle(true)中vIdx===2时8%概率掉落drop类法宝，已有则折灵石5000

**UI**: 洞府.attrs下方法宝效果行；行囊新增法宝分区（装备/卸下按钮）

---

### Task 2: 宗门系统

**Files:**
- Modify: `d:/src/html/xiuxian-game/game.js` — SECTS配置/状态/加成/加入转宗/UI
- Modify: `d:/src/html/xiuxian-game/style.css` — 宗门卡片样式
- Modify: `d:/src/html/xiuxian-game/index.html` — 第5标签页"🏯 宗门"

**配置表 SECTS**（4宗门）:
```
sect_sword  万剑宗  dmgMul:1.15
sect_pill   药王谷  alchemyAdd:0.15  pillXiuweiMul:1.50
sect_talisman 天机阁  cultMul:1.15
sect_body   玄武宗  hpMul:1.20  defMul:1.10
```

**状态**: sect:null, sectJoinCount:0, sectContrib:0, sectTechs:[]

**加成**: sectBonus()返回当前宗门bonus，渗入playerAtk/playerDef/playerMaxHp/effectiveCultMult/alchemyChance/pillXiuwei

**转宗**: 花费500000*(1+sectJoinCount)灵石，sub>=4才可加入

**UI**: 第5标签页renderSect()，未加入显示4宗门卡片，已加入显示详情+转投按钮

---

### Task 3: 悬赏任务系统

**Files:**
- Modify: `d:/src/html/xiuxian-game/game.js` — BOUNTY_TEMPLATES/状态/三合一刷新/埋点/UI
- Modify: `d:/src/html/xiuxian-game/style.css` — 悬赏进度条样式
- Modify: `d:/src/html/xiuxian-game/index.html` — 宗门标签页悬赏榜区域

**BOUNTY_TEMPLATES**（5类）: kill/meditate/craft/break/wealth，gen(currentSub,round)返回{targetName,targetCount,rewardLingshi,rewardContrib,rewardHerb,rewardCore}

**状态**: bounties[], bountyRefreshAt, bountyRound, bountyProgress{}

**三合一刷新**: 清完自动刷新 / 30分钟定时刷新 / 手动5000灵石刷新

**埋点**: endBattle/meditate/craft成功/doBreakthrough成功时bountyProgress对应项++

**UI**: 宗门标签页上部悬赏榜（4卡片+进度条+领取按钮+倒计时+刷新按钮）

---

### Task 4: 宗门贡献商店

**Files:**
- Modify: `d:/src/html/xiuxian-game/game.js` — SECT_SHOP配置/buySectItem/UI

**SECT_SHOP**: 法宝(3件)/宗门专属功法(4本)/丹药(3种)，均用贡献兑换

**专属功法效果**: 万剑诀+25攻 / 神农经修为丹×1.5 / 天机策修炼+0.2 / 玄武真解气血×1.2

**UI**: 宗门标签页下部贡献商店（按法宝/功法/丹药分组）

---

### Task 5: 存档迁移 + 整体验证

**Files:**
- Modify: `d:/src/html/xiuxian-game/game.js` — SAVE_VERSION 1→2 + load()迁移逻辑

**迁移**: SAVE_KEY='xiuxian_save_v2'，load()先v2后v1，v1自动补字段(sect/sectJoinCount/sectContrib/equip.treasure/treasures/bounties/bountyRefreshAt/bountyRound/bountyProgress/sectTechs)→存v2

**验证清单**: 语法无误 / 函数定义调用匹配 / HTML id对应 / UI正常渲染 / 战斗吸血聚宝盆 / 存档迁移
