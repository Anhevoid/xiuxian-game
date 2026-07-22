# v3「轮回劫·万象」玩法更新 - 实现计划

> **十大系统：** 轮回转世(元进度) / 九重天劫重构 / 洞府建设 / 灵宠相伴 / 奇遇事件 / 炼器升阶 / 气运因果 / 三道分支 / 秘境深探 / 斗法论道
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 任务按 Phase 1→2→3 顺序推进，每 Task 由子代理独立完成后验证并提交。

**Goal:** 在 v2 闭环（悬赏→贡献→法宝→变强→推进）之上，引入「轮回」元进度作为终极长线目标，使飞升从"结局"变为"新周目的起点"；同时以九重天劫、洞府、灵宠、奇遇等系统深化单周目体验，以三道分支与气运因果提供差异化重玩。`SAVE_VERSION` 2→3 温和迁移，旧存档自动补字段、不清档。

**Architecture:** 纯前端单文件 HTML/CSS/JS（ES5 strict），无依赖，`file://` 可直接运行。所有新配置/逻辑/UI 内联于 `game.js` / `style.css` / `index.html`。若 `game.js` 因体量过大（预计 3000+ 行）难以维护，**允许**将配置表抽取为额外 `<script src>` 引入的纯数据文件（如 `data-cave.js`、`data-pets.js`），仍是全局脚本、仍兼容 `file://`，但**不引入 ES module**。

**Tech Stack:** Vanilla HTML/CSS/JS (ES5 strict)，零依赖，localStorage 存档。

---

## 核心理念（Design Philosophy）

1. **飞升即起点，不是终点** —— 当前 v2 飞升即通关、归档重开毫无继承。v3 引入「轮回」：飞升（或渡劫期主动轮回）可结算「道果」，跨周目点亮「轮回天赋树」，让每一世都更强、更快、更深。这是放置游戏 prestige 机制与修仙"轮回"概念的天然融合。
2. **单周目深化，避免数值膨胀** —— 新系统通过**温和乘子叠加**渗透到现有属性函数（`effectiveCultMult` / `playerAtk` / `playerDef` / `playerMaxHp` / `lingshiPerSec` / `alchemyChance`），绝不改写战斗核心与 `GROW=2.3` 曲线。
3. **风险×收益×因果** —— 天劫从"一次概率判定"升级为"九重多波事件"，气运影响概率、因果影响天劫，杀业与功德交织，让玩家的选择有重量。
4. **差异化重玩** —— 三道分支（仙/魔/佛）× 轮回天赋 × 灵宠/洞府配装，使每一周目体验不同；配合本地论道排行榜，给予长线目标。
5. **放置友好不动摇** —— 离线收益、自动修炼、悬赏自动刷新等 v2 体验全部保留；洞府/灵宠产出纳入离线结算。

---

## Global Constraints

- 所有代码内联于现有 3 文件（`game.js` / `style.css` / `index.html`），不强制新增文件；若拆分，仅拆配置数据为全局 `<script>`。
- `SAVE_VERSION` 提升到 3，旧 v2 存档自动补字段、不清档；`SAVE_KEY` 升级为 `xiuxian_save_v3`，`load()` 依次尝试 v3→v2→v1 迁移链。
- 保持 `GROW=2.3` 战力曲线不被破坏，所有新加成**温和叠加**（同类加性、异类乘性，单源上限封顶）。
- 复用现有 CSS 类（`.item` / `.item-list` / `.subtabs` / `.zone-card` / `.tab-btn` / `.inv-sec`），新增样式遵循现有 token 系统（`--jade` / `--gold` / `--crimson` / `--purple` / `--bg*`）。
- 战斗回合核心（`battleRound` / `dmgCalc`）不变；灵宠助战、气运影响通过**额外伤害段**与**概率微调函数**渗透，不改伤害主公式。
- 轮回元进度（`state.meta`）与单周目状态分离：轮回时重置周目字段、保留 `meta`。

---

## 闭环设计（Loop Design）

```
                    ┌──────────── v3 轮回元进度闭环（跨周目）────────────┐
                    │                                                    │
                    │   飞升/主动轮回 ──结算──> 道果(meta.daoFruit)        │
                    │        ▲                            │              │
                    │        │                            ▼              │
                    │   更强的新一周目 <──点亮── 轮回天赋树(meta.talents)  │
                    │                                                    │
                    └────────────────────────────────────────────────────┘

          ┌──────────────── v3 单周目深化闭环（周目内）────────────────┐
          │                                                            │
          │  洞府建设 ──产出/加成──> 灵石/灵草/修炼 ──> 突破(九重天劫)   │
          │     ▲                          │                  │         │
          │     │                          ▼                  ▼         │
          │  灵宠相伴 <──捕捉/培养── 战斗掉落(秘境深探)  气运/因果影响   │
          │     │                          │                  │         │
          │     ▼                          ▼                  ▼         │
          │  助战+被动加成            奇遇事件(随机)     三道分支(元婴后) │
          │     │                          │                  │         │
          │     └────────── 斗法论道 <──感悟<─────────────────┘         │
          │                  │                                      │
          │                  ▼                                      │
          │            本地排行榜 / 悟道树                            │
          └────────────────────────────────────────────────────────────┘
```

---

## 加成渗透总表（Bonus Penetration Matrix）

> 所有新系统的加成统一通过下表函数渗透，确保单一入口、便于平衡。

| 目标函数 | 现有来源 | v3 新增来源 |
|----------|----------|-------------|
| `effectiveCultMult()` | 功法 / 法宝 / 宗门 / 宗门秘传 | + 洞府「聚灵阵」/ 灵宠 / 道途 / 轮回天赋「灵脉·顿悟」 |
| `playerAtk()` | 基础+武器+宗门秘传 ×(1+法宝) | ×(1+灵宠+道途+轮回天赋「道基」) × 法宝品阶系数 |
| `playerDef()` | 基础+护甲 ×(1+法宝+宗门) | ×(1+灵宠+道途+轮回天赋) × 法宝品阶系数 |
| `playerMaxHp()` | 基础 ×(1+法宝+宗门+秘传) | ×(1+灵宠+道途+轮回天赋+洞府「灵泉」) |
| `lingshiPerSec()` | 基础 ×(1+法宝聚宝盆) | ×(1+洞府「灵泉」+灵宠+道途) |
| `alchemyChance()` | 0.6+sub×0.04+宗门 | +洞府「丹房」+道途 + `luckFactor()` |
| `breakthroughChance/majorBreakChance` | 固定公式 + 突破丹 | +轮回天赋 + `luckFactor()`；大境界走「九重天劫」 |
| 掉落概率 | `herbChance/coreChance` + 法宝 8% | +灵宠九尾狐 + `luckFactor()` + 因果修正 |

新增核心微调函数：
```js
function luckFactor(){ /* 气运 0~100 映射到 [-0.05, +0.08] 的概率微调，封顶防溢出 */ }
function karmaMod(){  /* 因果(杀业/功德) 返回对天劫强度/掉落的修正对象 */ }
```

---

# Phase 1：核心重构（轮回 + 天劫 + 洞府）

## 模块 A：轮回转世系统（Samsara · 元进度）★核心创新

**概念：** 飞升（或渡劫期 sub>=32 主动「兵解轮回」）时结算「道果」，作为跨周目元货币。轮回后从练气期重开，但点亮「轮回天赋树」获得永久加成。`state.meta` 跨轮回保留，周目字段重置。

**配置 · 轮回结算公式：**
```
道果 = floor(subReached / 3) + floor(lifetimeKills / 500) + (pathBonus) + reincarnations*2
// subReached: 本世达到的最高小阶；pathBonus: 仙+0/魔+2/佛+1；reincarnations: 已轮回次数（递增保底）
// 例：飞升 sub=36 → 12 道果；首世无 path → 约 12~14 道果起步
```

**配置 · 轮回天赋树 `SAMSAKA_TALENTS`**（6 支，每支 5 级，逐级加价）：
```
id: tal_memory   名称: 前世记忆   支: 功法   效果: 开局赠送 t0~t{level-1} 功法   价格: [2,4,6,8,12]
id: tal_vein     名称: 灵脉觉醒   支: 修炼   效果: cultMul +0.15/级            价格: [3,5,8,12,18]
id: tal_daoji    名称: 道基深厚   支: 战力   效果: atk/def/hp 各 +0.05/级       价格: [3,5,8,12,18]
id: tal_epiphany 名称: 顿悟前尘   支: 突破   效果: 突破率 +0.03/级, 炼丹 +0.03/级 价格: [4,6,9,14,20]
id: tal_blessing 名称: 宿世福缘   支: 气运   效果: 初始气运 +10/级, 掉落 +0.02/级 价格: [3,5,8,12,18]
id: tal_wisdom   名称: 宿慧通明   支: 放置   效果: 打坐 ×(1+0.1/级), 离线上限 +1h/级 价格: [3,5,8,12,18]
```

**状态字段（meta，跨轮回保留）：**
```
state.meta = {
  daoFruit: 0,           // 可用道果
  reincarnations: 0,     // 累计轮回次数
  talents: {},           // { talId: level }
  lifetime: { kills:0, breakthroughs:0, meditations:0, ascensions:0 }, // 跨世累计
  bestSub: 0,            // 历史最高小阶
  unlockedPaths: [],     // 已体验过的道途（解锁图鉴）
}
```

**机制：**
- 飞升成功界面新增「轮回转世」按钮（替代/并列于"轮回重修"）：结算道果 → 累加 lifetime → `reincarnSamsara()` 重置周目字段、保留 `meta`、应用 `samsaraBonus()`。
- 渡劫期（sub>=32）洞府面板新增「兵解轮回」：主动提前轮回，道果按当前 sub 结算（未飞升有 -30% 折扣，但可保留更灵活的轮次节奏）。
- `samsaraBonus()` 汇总 `meta.talents` → 渗透到各属性函数（见渗透表）。
- `applySamsaraOnNewRun()`：新周目 init 时按 `tal_memory` 赠送功法、按 `tal_blessing` 设初始气运。

**UI：**
- 飞升遮罩 `#victory` 改造：显示本世战绩 + 结算道果 + 「轮回转世」按钮。
- 新增「轮回」入口（洞府面板底部或顶栏道果徽章点击）→ 弹出轮回天赋树面板（modal 或新标签页）：6 支 × 5 级节点，可点亮/查看，显示当前 `meta.daoFruit`。
- 顶栏新增道果徽章 `💎 道果 N`（与灵石并列，紫色高亮）。

**文件：**
- Modify: `game.js` — `SAMSAKA_TALENTS`、`state.meta`、`samsaraBonus()`、`reincarnSamsara()`、`applySamsaraOnNewRun()`、属性函数集成、飞升 UI 改造、轮回树 `renderSamsakaTree()`
- Modify: `index.html` — 顶栏道果徽章、飞升遮罩按钮、轮回树容器
- Modify: `style.css` — 道果徽章、天赋树节点（点亮/未点亮态、连线）

---

## 模块 B：九重天劫重构（Ninefold Tribulation）

**概念：** 大境界突破（圆满→下一境）与最终飞升不再是一次概率判定，而是触发「九重天劫」事件：连续 9 波类型化劫难，玩家每波选择应对策略（硬抗 / 法宝挡 / 服丹 / 遁避），累积损伤，撑过即突破、中途崩则失败。因果与气运影响劫难强度。

**配置 · 劫难类型 `TRIB_TYPES`：**
```
id: trib_thunder  名称: 雷劫   icon: ⚡  伤害模型: 当前气血 25%~40% 真伤（无视防御）
id: trib_fire     名称: 火劫   icon: 🔥  伤害模型: 3 回合灼烧 DoT，每回合 8% 气血
id: trib_demon    名称: 心魔劫 icon: 👹  伤害模型: 修炼减半 90s + 损 20% 修为（走火入魔加强版）
id: trib_wind     名称: 风劫   icon: 🌪  伤害模型: 掠走 15%~30% 灵石
id: trib_karma    名称: 业火劫 icon: 🔱  伤害模型: 按"杀业"缩放（杀业越高越重），功德可减免
```
**九重编排：** 前 7 重按境界随机抽取类型，第 8 重固定「心魔劫」，第 9 重固定「业火劫」（飞升第 9 重为「混沌雷劫」，强度 ×2）。

**配置 · 应对策略 `TRIB_RESPONSES`：**
```
endure   硬抗:     吃全额伤害，无需消耗
treasure 法宝挡:   装备法宝时可用，伤害 ×0.4，消耗法宝"灵力"（临时，不影响装备）
pill     服丹:     消耗 1 颗"抗劫丹"，该重伤害归零（飞升劫需 2 颗）
flee     遁避:     成功率 = 0.3 + luckFactor()，成功跳过该重无损，失败吃 1.5× 伤害且无法再遁
```

**新增丹药 · 抗劫丹：** 炼丹新增配方 `r_kangjie`（5 妖核 + 3 灵草 + 2000 灵石 → 抗劫丹），效果仅在天劫中使用；亦可宗门贡献兑换。

**状态字段：**
```
state.trib = null  // 天劫进行中: { wave:1~9, type, totalWaves:9, responses:[], isFinal }
state.inv.kangjie  // 抗劫丹数量（并入 inv）
```

**机制 / 集成：**
- `doBreakthrough()`：当 `isMajor`（含 `isFinal`）时，**不再直接 `Math.random()` 判定**，改为 `startTribulation()`。小境界突破沿用原 0.9 逻辑（含 `tal_epiphany`/`luckFactor` 微调）。
- `startTribulation()`：初始化 `state.trib`，劫难强度 = 基础 ×(1 + realmOf(sub)×0.08) × `karmaMod().tribScale` ×(飞升 ×1.5)；进入天劫 UI。
- `respondTribulation(choice)`：按策略结算该重伤害/消耗，推进 wave；`state.hp` 归零或主动放弃 → `endTribulation(false)`；撑过 9 重 → `endTribulation(true)` → 执行原突破成功逻辑（扣修为、sub+1、触发飞升判定）。
- 因果影响：`karmaMod().tribScale` = 1 + max(0, killKarma - meritKarma)/100 × 0.5（杀业重则业火劫与整体更强）；功德高可 -20% 强度。
- 洞府「避劫阵」（模块 C）提供每重固定减免；轮回天赋「顿悟前尘」降低劫难强度。

**UI：**
- 天劫进行时全屏遮罩（复用 `.overlay`），中央显示：当前第 N/9 重 · 劫难类型 icon+名 · 预估伤害 · 4 个应对按钮（不可用的禁用并提示原因）。
- 劫难背景随类型变色（雷=紫、火=红、心魔=暗紫、风=青、业火=金红）。
- 顶部进度：9 个圆点表示已过/当前/未至。

**文件：**
- Modify: `game.js` — `TRIB_TYPES`/`TRIB_RESPONSES`、`state.trib`、`startTribulation()`/`respondTribulation()`/`endTribulation()`、`doBreakthrough` 改造、`karmaMod()`、抗劫丹配方与 `usePill` 分支、天劫 `renderTribulation()`
- Modify: `index.html` — 天劫遮罩容器
- Modify: `style.css` — 天劫遮罩、9 重进度圆点、类型配色

---

## 模块 C：洞府建设系统（Cave Dwelling）

**概念：** 当前左侧「洞府」为静态修炼面板。v3 新增可建造、可升级的洞府设施：产出资源 + 提供被动加成 + 部分离线产出。是新周目早期灵石/灵草/修炼的重要来源，也是天劫备战（避劫阵）与灵宠（兽栏）、炼器（炼器炉）的前置。

**配置 · 洞府建筑 `CAVE_BUILDINGS`**（8 类）：
```
id: cave_field    名称: 灵田     icon: 🌾  产出: 灵草/分(随级)            价格: [500, 1.2k, 3k, 8k, 20k]  前置: 无
id: cave_spring   名称: 灵泉     icon: 💧  加成: lingshiMul+0.1/级         价格: [800, 2k, 5k, 12k, 30k]  前置: 无
id: cave_array    名称: 聚灵阵   icon: 🔯  加成: cultMul+0.12/级           价格: [1k, 3k, 8k, 20k, 50k]  前置: 无
id: cave_alchemy  名称: 丹房     icon: ⚗️  加成: alchemy+0.04/级, 解锁抗劫丹 价格: [1.5k, 4k, 10k, 25k, 60k] 前置: 灵田2
id: cave_library  名称: 藏书阁   icon: 📚  加成: 功法效果+5%/级, 随机悟功法 价格: [2k, 6k, 15k, 40k, 100k] 前置: 聚灵阵2
id: cave_beast    名称: 兽栏     icon: 🐾  解锁灵宠系统, 灵宠成长+10%/级    价格: [3k, 8k, 20k, 50k, 120k] 前置: 灵田2
id: cave_forge    名称: 炼器炉   icon: 🔨  解锁炼器, 法宝升阶成功率+5%/级   价格: [3k, 8k, 20k, 50k, 120k] 前置: 丹房2
id: cave_ward     名称: 避劫阵   icon: 🛡  天劫每重伤害减免 6%/级           价格: [4k, 10k, 25k, 60k, 150k] 前置: 聚灵阵3
```
（价格为数组索引=等级-1，升级按 `buildings[id]+1` 取价；最高 5 级。）

**状态字段：**
```
state.cave = { buildings: { cave_field:0, ... } }   // 0=未建, 1~5=等级
state.caveProd = { lastFieldTick: 0 }               // 灵田产出累积时间基准
```

**机制 / 集成：**
- `caveBonus()` 汇总建筑等级 → 渗透（灵泉→`lingshiPerSec`/`playerMaxHp`、聚灵阵→`effectiveCultMult`、丹房→`alchemyChance`+解锁抗劫丹配方、藏书阁→功法 `cultBonus` 放大、避劫阵→天劫减免）。
- 灵田在 `tick()` 中按 `cave_field` 等级产出灵草（`herbPerMin = level * (1+realmOf*0.3)`），离线结算同样计入（扩展 `load()`/`onVisibility()` 离线段）。
- 藏书阁每 30 分钟有概率"顿悟"一本未习得功法（低概率，防白嫖）。
- `buildCave(id)` / `upgradeCave(id)`：扣灵石、校验前置、等级 +1。
- 兽栏/炼器炉等级作为模块 D/F 的解锁开关与加成源。

**UI：**
- 新增第 6 个标签页「🏘 洞府」（左侧修炼面板保留"洞府"名，标签页用"仙府"或图标区分；或直接命名标签为「🏘 仙府」避免歧义）。
- 8 建筑以 `.zone-card` 网格展示：图标+名称+等级(★) +当前效果 +升级按钮(价格/前置未达禁用)。
- 灵田产出在顶部资源条新增"🌿 灵草/分"小字提示。

**文件：**
- Modify: `game.js` — `CAVE_BUILDINGS`、`state.cave`、`caveBonus()`、`buildCave()`/`upgradeCave()`、`tick()` 灵田产出、离线结算扩展、属性函数集成、`renderCave()`
- Modify: `index.html` — 新标签页按钮
- Modify: `style.css` — 建筑卡片等级星标、产出提示

---

# Phase 2：相伴与变数（灵宠 + 奇遇 + 炼器）

## 模块 D：灵宠相伴系统（Spirit Pet）

**概念：** 击杀"强"档妖兽有概率掉落「灵兽幼崽」（或兽栏解锁后捕获率提升），孵化培养后可装备一只出战助战 + 提供被动加成。灵宠可进化升星、提升亲密度，是中后期重要战力与养成线。

**配置 · 灵宠种族 `PET_SPECIES`**（6 种）：
```
id: pet_finch   名称: 火眼云雀  icon: 🐦  属性: atk+0.08/级   技能: 烈焰啄(额外伤害段)  来源: 后山/落云强怪
id: pet_turtle  名称: 玄冰龟    icon: 🐢  属性: def+0.10/级   技能: 玄冰甲(减伤1回合)    来源: 幽冥/万妖
id: pet_marten  名称: 紫电貂    icon: 🦊  属性: 暴击+0.05/级  技能: 紫电(偶发2倍伤害)    来源: 焚天/冰魄
id: pet_ape     名称: 灵猿      icon: 🐵  属性: hp+0.12/级    技能: 撼地(stun概率)       来源: 九幽/天魔
id: pet_fox     名称: 九尾狐    icon: 🦊  属性: luck+5/级, drop+0.03/级  技能: 魅惑(降敌攻) 来源: 混沌海(稀有)
id: pet_peng    名称: 金翅大鹏  icon: 🦅  属性: 全属性+0.05/级  技能: 穿云(无视部分防)   来源: 飞升后/轮回解锁
```
**进化星阶：** 1★→2★→3★→4★(灵兽)→5★(神兽)。升星消耗：同种族灵宠丹 + 妖核 + 灵石，星级解锁技能等级上限。

**状态字段：**
```
state.pets = [ { uid, speciesId, level, star, exp, affinity, equipped } ]  // uid 去重
state.petSlots = 1   // 兽栏每 2 级 +1 槽，最多 3
state.inv.petEgg    // 灵兽卵(未孵化)
state.inv.petPill   // 灵宠丹(升星材料)
```

**机制 / 集成：**
- 掉落：`endBattle(true)` 中 `b.var===2` 时，`TREASURE_DROP_CHANCE` 之外叠加 `PET_DROP_CHANCE=0.05`（兽栏每级 +0.01），按 `zone` 决定可掉种族；已有同种族则折为「灵宠丹」。
- `petBonus()` 汇总已装备灵宠 → 渗透（atk/def/hp/luck/drop）。
- 战斗 `battleRound()`：玩家攻击后追加灵宠伤害段 `petAtk = playerAtk() * petDmgRatio(star)`（约 0.2~0.5），受技能修正（紫电偶发 ×2、穿云无视 50% 防）。灵宠不承伤（简化），每场战斗 `affinity += 1`，满阈值升 `exp`。
- `hatchPet()`（卵→随机种族）、`evolvePet(uid)`（升星）、`equipPet(uid)`（切换出战）。
- 离线/挂机时灵宠仍随战斗累计亲和（仅在线战斗计数，防离线白嫖）。

**UI：**
- 新增标签页「🐾 灵宠」（兽栏建成后解锁，否则锁定提示）。
- 顶部：出战槽位（1~3）+ 灵宠列表卡片（种族/星级★/等级/亲和进度/技能/装备按钮）。
- 卵孵化区、升星按钮（材料不足禁用）。

**文件：**
- Modify: `game.js` — `PET_SPECIES`、`state.pets`、`petBonus()`、掉落扩展、`battleRound` 助战段、`hatchPet`/`evolvePet`/`equipPet`、`renderPet()`
- Modify: `index.html` — 灵宠标签页
- Modify: `style.css` — 灵宠卡片、星级、出战槽

---

## 模块 E：奇遇事件系统（Serenpidity Events）

**概念：** 修炼途中随机触发奇遇事件，以模态卡片呈现 2~3 选项，每个选项有不同结果（资源/ buff/debuff/隐藏功法/因果）。事件按境界池抽取，有冷却防刷。为放置过程注入"叙事性变数"与惊喜。

**配置 · 事件池 `EVENTS`**（示例 12+，按境界分组）：
```
id: ev_elder      境界: 练气~金丹  名称: 山中遇老者  选项:
   ├ 请求传功 → 修为 +大量, 30% 概率得随机功法
   ├ 拜师学艺 → 得"无名残卷"(下次突破+10%), 损灵石
   └ 礼貌告退 → 无事, +5 功德
id: ev_pickup     境界: 全  名称: 路拾遗宝  选项:
   ├ 拾取 → 得法宝碎片/灵石, +10 杀业(贪念)
   ├ 上交宗门 → +30 功德 +贡献
   └ 置之不理 → 无事
id: ev_ambush     境界: 筑基+  名称: 魔修截杀  选项:
   ├ 应战 → 触发强怪战斗(必打), 胜得魔修掉落
   ├ 贿赂 → 损 30% 灵石脱身
   └ 遁逃 → luckFactor 判定, 失败损 10% 气血
id: ev_anomaly    境界: 元婴+  名称: 秘境异变  选项:
   ├ 深入探索 → 得稀有材料/灵宠卵, 30% 损大量气血
   └ 撤离 → 无事
id: ev_fairy      境界: 化神+  名称: 仙子论道  选项:
   ├ 论道 → 得"感悟"×5, 50% 气运+
   └ 辞别 → 无事
id: ev_relic      境界: 合体+  名称: 上古遗迹  选项:
   ├ 探索 → 70% 得高阶法宝/升阶材料, 30% 触发天劫(强制)
   └ 离开 → 无事
（另含: ev_hearthest 灵脉涌动 / ev_demonheart 心魔试炼 / ev_charity 济世 / ev_gamble 卜卦摊 / ev_beast_tide 兽潮 / ev_meteor 流星陨铁 ...）
```

**状态字段：**
```
state.eventCooldownAt = 0   // 下次可触发时间
state.activeEvent = null    // 当前进行中事件 { id, choices }
state.eventHistory = {}     // { evId: count } 用于稀有事件限频
```

**机制 / 集成：**
- `tick()` 中检查 `Date.now() >= eventCooldownAt` 且非战斗/非天劫时，按概率(每 tick ~0.3%)触发 `triggerEvent()`；从符合境界的池中加权抽取（稀有事件权重低、限频）。
- `chooseEvent(choiceId)`：执行结果（发奖/扣减/因果/触发战斗/触发天劫），写日志，设冷却（基础 5~15 分钟，`tal_wisdom`/气运可缩短）。
- 事件可与因果（模块 G）联动：贪念选项 +杀业、善行 +功德，影响后续天劫。
- 部分事件触发"强制战斗"或"强制天劫"，复用现有 `startBattle`/`startTribulation`。

**UI：**
- 事件触发时全屏遮罩（复用 `.overlay`），中央卡片：事件名+描述+图标，下方选项按钮（每个显示简短预览，结果揭晓后日志详述）。
- 顶栏小图标显示距下次奇遇的倒计时（可选）。

**文件：**
- Modify: `game.js` — `EVENTS`、`state.activeEvent`、`triggerEvent()`/`chooseEvent()`、`tick` 触发、`renderEvent()`
- Modify: `index.html` — 事件遮罩容器
- Modify: `style.css` — 事件卡片、选项按钮

---

## 模块 F：炼器与法宝升阶（Artifact Refining）

**概念：** v2 法宝固定效果、固定品阶。v3 引入炼器：法宝可升阶（凡→灵→法→仙→神，每阶效果乘子递增），可镶嵌「铭纹」（额外词条），并新增"法宝碎片"用于升阶。让法宝成为可深度养成的线。

**配置 · 法宝品阶 `TREASURE_TIERS`：**
```
0: 凡器  mult: 1.0   color: --muted
1: 灵器  mult: 1.3   color: --jade
2: 法器  mult: 1.7   color: --purple
3: 仙器  mult: 2.2   color: --gold
4: 神器  mult: 3.0   color: --crimson-bright
```
（`treasureBonus()` 乘以 `TREASURE_TIERS[tier].mult`。）

**配置 · 铭纹 `INSCRIPTIONS`**（5 种，从分解妖核/材料获得）：
```
id: ins_atk    名称: 锋锐纹  效果: atk+0.05      来源: 分解妖核
id: ins_def    名称: 厚土纹  效果: def+0.05      来源: 分解妖核
id: ins_hp     名称: 长生纹  效果: maxhp+0.08    来源: 分解灵草(批量)
id: ins_cult   名称: 悟道纹  效果: cult+0.08     来源: 分解功法残卷(奇遇)
id: ins_luck   名称: 天命纹  效果: luck+8        来源: 分解法宝碎片(稀有)
```
每件法宝铭纹槽 = 品阶数（凡器0/灵器1/法器2/仙器3/神器4）。

**状态字段（破坏性变更，需迁移）：**
```
state.treasures: []  // v2 为 id[]；v3 迁移为 [{ id, tier:0, inscriptions:[] }]
state.inv.fragments   // 法宝碎片
```

**机制 / 集成：**
- `treasureById(id)` 返回 `{...TREASURES 配置, tier, inscriptions}`；`treasureBonus()` 汇总时乘品阶系数 + 累加铭纹效果。
- `refineTreasure(id)`：消耗灵石 + 妖核 + 法宝碎片 + 灵宠丹(高阶)，成功率 = 0.6 + cave_forge 等级×0.05 + `luckFactor()`；失败返还 50% 碎片。
- `inscribeTreasure(id, insId)`：消耗铭纹，镶嵌到空槽；可拆卸（损耗 1 铭纹）。
- `disassembleItem(type, id)`：分解妖核/灵草/功法残卷 → 铭纹。
- 法宝掉落/兑换时基础 tier=0；飞升后轮回可保留"已炼器法宝"到 `meta`（轮回天赋「前世记忆」扩展支可保留 1 件法宝跨世，作为高级天赋目标）。

**UI：**
- 行囊「法宝」分区改造：每件法宝卡片显示品阶色边 + ★(品阶) + 铭纹槽(已镶/空) +「升阶」「铭纹」按钮。
- 炼器炉（洞府）建成后解锁；炼器操作可在行囊或洞府炼器炉入口进行。
- 升阶/铭纹为子面板（modal 或行囊内展开）。

**文件：**
- Modify: `game.js` — `TREASURE_TIERS`/`INSCRIPTIONS`、`treasures` 结构迁移、`treasureById`/`treasureBonus` 重构、`refineTreasure`/`inscribeTreasure`/`disassembleItem`、`renderInventory` 法宝区改造
- Modify: `index.html` — 炼器子面板容器
- Modify: `style.css` — 品阶色边、铭纹槽

---

# Phase 3：道途与长线（三道 + 气运因果 + 秘境深探 + 斗法论道）

## 模块 G：气运与因果（Luck & Karma）

**概念：** 引入两条隐性数值轴：**气运**（0~100，可恢复、可消耗，影响一切概率）与**因果**（杀业 vs 功德，单向积累，影响天劫与掉落）。让玩家的行为（杀戮/善行/卜卦）有长期回响。

**状态字段：**
```
state.luck = 50           // 0~100，基础 50
state.karma = { kill:0, merit:0 }   // 杀业/功德
```

**机制 / 集成：**
- `luckFactor()`：返回 `(luck-50)/500`，范围约 [-0.10, +0.10]，封顶 ±0.10；渗透到突破率、炼丹率、掉落率、遁避率、奇遇稀有度。
- 气运恢复：每分钟 +1（洞府「悟道台」+1/min）；卜卦/事件可消耗气运换确定性。
- 因果：`endBattle(true)` 每杀 +1 杀业；悬赏"济世"类、奇遇善行选项 +功德；`karmaMod()` = `{ tribScale: 1 + max(0,kill-merit)/200, dropScale: 1 + merit/500 }`。
- 新增"卜卦"操作（洞府或顶栏）：消耗 10 气运，三选一效果（重置悬赏/下次突破必成/探明奇遇），气运低时禁用。
- 轮回天赋「宿世福缘」提升初始气运上限与恢复。

**UI：**
- 顶栏灵石旁新增气运徽章 `🍀 50`（青色，低气运变灰）。
- 因果为隐性，仅在洞府「悟道台」面板显示数值条（杀业红/功德金）。

**文件：**
- Modify: `game.js` — `state.luck`/`state.karma`、`luckFactor()`/`karmaMod()`、`tick` 气运恢复、`endBattle`/`claimBounty`/`chooseEvent` 因果埋点、卜卦 `divine()`、属性函数集成
- Modify: `index.html` — 气运徽章
- Modify: `style.css` — 气运徽章、因果条

---

## 模块 H：三道分支（Three Dao Paths）

**概念：** 突破至元婴期（sub=12）时，选择道途：**仙道**（正统均衡）/ **魔道**（激进杀伐）/ **佛道**（金身守成）。每条道途有独立小技能树（道途点 = 每个大境界突破 +1），影响加成倾向、天劫风味、结局文案，并解锁不同灵宠/法宝偏好。是差异化重玩的核心。

**配置 · 道途 `DAO_PATHS`：**
```
id: dao_immortal  名称: 仙道  icon: 🌤  色: --jade  加成倾向: cult+0.10/级, 突破+0.03/级  天劫: 标准雷劫  结局: 正果飞升
id: dao_demon     名称: 魔道  icon: 🩸  色: --crimson  加成倾向: atk+0.10/级, 吸血+0.05/级  天劫: 心魔劫加重  结局: 魔尊降世(杀业重)
id: dao_buddha    名称: 佛道  icon: 🪷  色: --gold  加成倾向: hp+0.12/级, def+0.08/级, 炼丹+0.05/级  天劫: 业火劫加重(若杀业)  结局: 金身成佛
```
**道途技能树（每途 5 节点）：** 仙：紫气/朝元/化神/混元/造化；魔：噬血/魔化/煞气/天魔/大自在；佛：慈悲/金刚/般若/菩提/大乘。节点效果叠加到对应属性。

**状态字段：**
```
state.daoPath = null      // { id, points:0, nodes:[] }
state.daoPathChosen = false  // 是否已选（sub>=12 时强制弹窗选择）
```

**机制 / 集成：**
- 突破到 sub=12 时若未选道途，强制弹出三选一遮罩（不可跳过）；选定后 `state.daoPath = { id, points:1, nodes:[] }`。
- 每次大境界突破成功 `daoPath.points += 1`；在道途面板点亮节点消耗 1 点。
- `pathBonus()` 渗透到属性函数与 `karmaMod`（魔道杀业折损减免、佛道功德加成放大）。
- 飞升结局文案按道途变化；魔道飞升需额外"煞气"达标（否则变 Bad End 重来）。
- 与轮回联动：`meta.unlockedPaths` 记录已体验道途，集齐三道解锁隐藏天赋「三教合一」。

**UI：**
- 突破至元婴触发道途选择遮罩（3 大卡片，各列加成/天劫/结局预览）。
- 宗门标签页或新增「道途」区显示当前道途 + 技能树（5 节点连线）+ 剩余点数。

**文件：**
- Modify: `game.js` — `DAO_PATHS`/`DAO_NODES`、`state.daoPath`、`chooseDaoPath()`/`learnDaoNode()`、`pathBonus()`、`doBreakthrough` 触发选择、结局文案分支、`renderDaoPath()`
- Modify: `index.html` — 道途选择遮罩
- Modify: `style.css` — 道途卡片、技能树节点连线

---

## 模块 I：秘境深探（Roguelike Deep Realm）

**概念：** 每个秘境在"强"档之外新增「深处」入口，进入后为 Roguelike 探索：有限「探索力」，逐层推进，每层随机房间（战斗/宝箱/事件/休整/Boss），岔路选择，深层稀有奖励。失败损失进度但保留部分收获。为战斗玩家提供高强度长线玩法。

**配置 · 房间类型 `DEEP_ROOMS`：**
```
battle   战斗房:  强档妖兽(同区), 胜: 探索力-1, 得灵石/材料/碎片
elite    精英房:  ×1.5 强怪, 胜: 探索力-2, 得灵宠卵/铭纹
treasure 宝箱房:  得资源(灵石/材料/抗劫丹/碎片), 探索力-0
event    事件房:  触发小型奇遇(2选1), 探索力-0
rest     休整房:  回血 50% + 气运+10, 探索力-0
boss     Boss房:  区境 Boss(×2 强怪), 胜: 大量奖励 + 深入下一层, 探索力-3
```
**探索力：** 初始 = 10 + realmOf×2 + 兽栏等级；每层消耗；归零强制撤出。

**状态字段：**
```
state.expedition = null   // { zone, floor, roomIdx, path:[], stamina, rewards:{}, alive }
```

**机制 / 集成：**
- 秘境标签页每区"强"档下方新增「深入秘境」按钮（需该区 unlocked）→ `startExpedition(zone)`。
- 每层生成 2~3 个房间选项（岔路），玩家选一进入，结算后推进 `floor`；每 3 层一个 Boss。
- 战斗房复用 `startBattle`，但标记 `expeditionMode`，`endBattle` 时回写到 `state.expedition` 而非正常结算（不触发普通掉落，按房间奖励发放）。
- 撤出/失败：保留已得 `rewards` 的 50%，`expedition=null`。
- 深层（floor>=5）掉落法宝碎片、灵宠卵、铭纹等稀有物。

**UI：**
- 进入深探时秘境标签页切换为"探索地图"视图：当前层 + 房间卡片选项 + 探索力条 + 已得奖励清单 + 撤出按钮。
- 房间卡片用图标区分类型，Boss 房高亮。

**文件：**
- Modify: `game.js` — `DEEP_ROOMS`、`state.expedition`、`startExpedition`/`enterRoom`/`exitExpedition`、`endBattle` expedition 分支、`renderExpedition()`
- Modify: `index.html` — 深探地图容器
- Modify: `style.css` — 探索力条、房间卡片、Boss 高亮

---

## 模块 J：斗法论道（Dueling & Dao Discussion）

**概念：** 与 AI 生成的"修士"切磋斗法（战斗）或论道（比拼道行分），胜得「感悟」货币，消耗于"悟道树"获得本世永久小加成；本地排行榜记录击败的对手与自身段位。给予玩家长线竞争目标与 pvE 挑战。

**配置 · 对手生成 `DUEL_OPPONENTS`：**
```
按 realmOf 生成: 名字(随机道号) + 战力 = playerPower × [0.9, 1.1, 1.3] 三档(切磋/同阶/越阶)
战力映射: atk/def/hp 由对手战力反推(复用 genMonster 思路)
```
**论道：** 道行分 = sub×100 + 功法数×50 + 法宝品阶分 + 灵宠分；比拼分高者胜，平局双方均得少量感悟。

**状态字段：**
```
state.insight = 0         // 感悟
state.insightTree = {}    // { nodeId: learned }
state.duelRank = 0        // 段位(0~9, 由击败数累加)
state.duelDefeated = 0    // 累计击败数
```

**配置 · 悟道树 `INSIGHT_NODES`**（8 节点，本世永久，轮回不保留）：
```
id: ins_cult1  感悟:20  效果: cult+0.10
id: ins_atk1   感悟:30  效果: atk+0.08
id: ins_def1   感悟:30  效果: def+0.08
id: ins_hp1    感悟:40  效果: hp+0.10
id: ins_luck   感悟:50  效果: 气运上限+20
id: ins_alch   感悟:40  效果: 炼丹+0.08
id: ins_crit   感悟:60  效果: 暴击+0.10(战斗偶发1.8倍)
id: ins_offline 感悟:50 效果: 离线效率 +0.1
```

**机制 / 集成：**
- `duelOpponent(tier)`：生成对手，进入特殊战斗（复用 `startBattle`，标记 `duelMode`），胜得感悟 = 10 + tier×5 + rank×2；败无损（切磋不扣灵石/修为，仅 CD）。
- `discussDao()`：论道，按道行分判定，胜得感悟 5~15。
- `insightBonus()` 渗透到属性函数；`learnInsightNode(id)` 消耗感悟点亮。
- 排行榜：本地 localStorage 存储击败的命名对手列表 + 自身段位（青铜→练气→…→仙王 9 段），纯展示无联网。
- 每日（实时 24h）前 3 次斗法感悟 ×2（防刷但鼓励日常）。

**UI：**
- 新增标签页「⚔️ 论道」（sub>=8 解锁）。
- 上部：斗法挑战（3 档对手卡片，显示战力预览）+ 论道按钮 + 段位徽章 + 感悟数。
- 下部：悟道树（8 节点）+ 击败对手名录（滚动列表）。

**文件：**
- Modify: `game.js` — `DUEL_OPPONENTS`/`INSIGHT_NODES`、`state.insight`/`state.duelRank`、`duelOpponent`/`discussDao`/`learnInsightNode`、`insightBonus()`、`endBattle` duel 分支、`renderDuel()`
- Modify: `index.html` — 论道标签页
- Modify: `style.css` — 段位徽章、悟道树、对手卡片

---

# 存档迁移（v2 → v3）

- `SAVE_VERSION` 2→3；`SAVE_KEY` 升级为 `xiuxian_save_v3`。
- `load()` 迁移链：优先读 v3 → 否则尝试 v2 (`xiuxian_save_v2`) 迁移 → 否则 v1 (`xiuxian_save_v1`) 迁移（沿用 v2 的 v1→v2 逻辑）。
- **v2→v3 补字段：**
  - `state.meta = { daoFruit:0, reincarnations:0, talents:{}, lifetime:{...}, bestSub:state.sub, unlockedPaths:[] }`（meta 默认空起步，老玩家不补偿道果，保证公平）
  - `state.cave = { buildings:{} }`（全 0）
  - `state.pets = []`、`state.petSlots = 1`
  - `state.treasures` 从 `id[]` 迁移为 `[{ id, tier:0, inscriptions:[] }]`（保留已拥有法宝，品阶归零）
  - `state.luck = 50`、`state.karma = { kill:0, merit:0 }`
  - `state.daoPath = null`、`state.daoPathChosen = (state.sub < 12 ? false : true 且补默认仙道)`
  - `state.insight = 0`、`state.insightTree = {}`、`state.duelRank = 0`、`state.duelDefeated = 0`
  - `state.inv` 补 `kangjie:0, petEgg:0, petPill:0, fragments:0`
  - `state.trib = null`、`state.activeEvent = null`、`state.eventCooldownAt = Date.now()+初始CD`、`state.eventHistory = {}`、`state.expedition = null`
- 迁移后写 v3、备份 v2 为 `xiuxian_save_v2_bak`，日志提示「📦 存档已迁移至 v3」。
- 版本不兼容仍沿用 v2 策略：备份旧档 + 提示 + 重新开始，避免静默清档。

---

# 实现顺序（Task Breakdown）

> 按 Phase 1→2→3 顺序，模块间有依赖（如灵宠/炼器依赖洞府兽栏/炼器炉，三道依赖天劫）。每 Task 完成后跑 `tests/` 冒烟 + 该模块验证，提交一次。

## Phase 1（核心重构）
- [x] **T1** 存档迁移 v2→v3 + `state.meta` 骨架 + 道果徽章（先搭骨架，便于后续模块挂载）
- [x] **T2** 模块 A 轮回系统：天赋树配置 + `samsaraBonus()` + 飞升结算 + `reincarnSamsara()` + 天赋树 UI
- [x] **T3** 模块 B 九重天劫：劫难类型 + `startTribulation`/`respondTribulation`/`endTribulation` + `doBreakthrough` 改造 + 抗劫丹 + 天劫 UI
- [x] **T4** 模块 C 洞府建设：8 建筑 + `caveBonus()` + `buildCave`/`upgradeCave` + 灵田产出 + 离线扩展 + 洞府标签页 UI

## Phase 2（相伴与变数）
- [x] **T5** 模块 D 灵宠：种族配置 + `petBonus()` + 掉落 + `battleRound` 助战 + 孵化/升星/装备 + 灵宠标签页 UI
- [x] **T6** 模块 E 奇遇事件：事件池 + `triggerEvent`/`chooseEvent` + `tick` 触发 + 事件遮罩 UI
- [x] **T7** 模块 F 炼器升阶：品阶/铭纹配置 + `treasures` 结构迁移 + `refineTreasure`/`inscribeTreasure`/`disassembleItem` + 行囊法宝区改造 UI

## Phase 3（道途与长线）
- [x] **T8** 模块 G 气运因果：`luck`/`karma` + `luckFactor`/`karmaMod` + 卜卦 + 各埋点 + 气运徽章 UI
- [x] **T9** 模块 H 三道分支：道途/节点配置 + `chooseDaoPath`/`learnDaoNode` + `pathBonus()` + 突破触发 + 道途选择遮罩 UI
- [x] **T10** 模块 I 秘境深探：房间配置 + `startExpedition`/`enterRoom`/`exitExpedition` + `endBattle` 分支 + 探索地图 UI
- [x] **T11** 模块 J 斗法论道：对手/悟道树配置 + `duelOpponent`/`discussDao`/`learnInsightNode` + `insightBonus()` + 论道标签页 UI
- [x] **T12** 全局平衡调参 + 加成渗透总表回归验证 + README 更新 + 最终代码审查

---

# 平衡性考量（Balance）

- **GROW=2.3 不破：** 所有新乘子均为"百分比加成"叠加到现有乘子链，单源封顶（如灵宠 atk 单宠上限 +0.08/级 × 5★ ≈ +0.4，三宠满星 ≈ +1.2，属后期目标，不破坏指数曲线）。
- **前快后慢不动摇：** 修炼需求 1.4× 增长仍快于修炼速度 1.16×；洞府/灵宠/轮回天赋提供的是"系数"而非"基数指数"，越后期边际收益越被需求曲线压制，避免数值爆炸。
- **轮回防速通：** 道果结算与 sub 挂钩（飞升 ≈12 道果），天赋逐级加价，首世仅能点 3~5 节点；轮回次数递增保底 `+2 道果/次` 防止后期卡点。
- **天劫可备战：** 抗劫丹、避劫阵、气运遁避、法宝挡多手段并存，确保失败可归因而非纯运气；因果惩罚魔道但不致死（金身/避劫阵可对冲）。
- **离线不失控：** 灵田/灵泉产出纳入离线结算，但沿用 8h 上限与 50% 效率；`tal_wisdom` 可提升上限但每级仅 +1h。
- **奇遇/深探防刷：** 奇遇 5~15 分钟 CD；深探探索力有限、失败 50% 损失，限制单位时间收益。
- **迁移公平：** 老玩家 meta 空起步（不补偿道果），但保留已拥有法宝（品阶归零可重新炼器）、已加入宗门、已习功法，不损失既有进度。

---

# 验证清单（Verification）

- [ ] 语法无误（`node --check game.js`）+ `tests/smoke.js` 全过
- [ ] `SAVE_VERSION=3`，v2/v1 旧存档迁移链均能加载且补字段正确（写 `tests/verify-v3-migration.js`）
- [ ] 加成渗透总表每一格均有对应函数调用，无遗漏/重复
- [ ] 轮回：飞升结算道果 → 重置周目字段 → `meta` 保留 → 天赋生效（写断言）
- [ ] 九重天劫：大境界突破进入天劫、9 重推进、各应对策略结算正确、失败惩罚正确
- [ ] 洞府：建筑升级扣费、前置校验、灵田产出、离线结算扩展
- [ ] 灵宠：掉落去重、助战伤害段、升星材料、装备切换
- [ ] 奇遇：触发 CD、选项结果、因果埋点、强制战斗/天劫衔接
- [ ] 炼器：`treasures` 结构迁移、品阶乘子、铭纹镶嵌/拆卸、分解获得
- [ ] 气运因果：`luckFactor` 范围封顶、卜卦消耗、因果埋点
- [ ] 三道：sub=12 强制选择、节点点亮、结局文案分支
- [ ] 秘境深探：探索力消耗、房间奖励、失败 50% 保留、`endBattle` 分支不污染普通战斗
- [ ] 斗法论道：对手生成、感悟发放、悟道树点亮、段位累加
- [ ] UI：8 标签页渲染正常、移动端换行不溢出、所有按钮禁用态正确
- [ ] README 更新 v3 系统一览

---

# 附：标签页与 UI 布局变化

**标签页（8 个，flex 换行）：**
```
⚔️ 秘境 | 🏪 集市 | ⚗️ 炼丹 | 🎒 行囊 | 🏯 宗门 | 🏘 洞府 | 🐾 灵宠 | ⚔️ 论道
（灵宠/论道/洞府深处等按前置条件解锁，未解锁显示锁态）
```
**顶栏：** 道果徽章(紫) + 灵石(玉) + 气运徽章(青) + HP + 调试齿轮。
**遮罩层：** 飞升(改) / 天劫(新) / 奇遇(新) / 道途选择(新)。
**左侧洞府面板：** 保留修炼/打坐/突破，底部新增「兵解轮回」入口（渡劫期显示）。

---

*v3「轮回劫·万象」——飞升不是终点，是轮回的起点；万象森罗，皆可证道。*
