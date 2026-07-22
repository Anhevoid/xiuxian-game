'use strict';
/* =========================================================
   修仙小游戏 · 一念成仙  —— game.js
   纯前端 / 无依赖 / 全局脚本（保证 file:// 可直接运行）
   ========================================================= */

/* ---------- 配置常量（可调平衡） ---------- */
const SAVE_KEY        = 'xiuxian_save_v3';
const SAVE_KEY_V2     = 'xiuxian_save_v2';   // 旧版存档键，用于迁移
const SAVE_KEY_V1     = 'xiuxian_save_v1';   // 更旧版存档键，用于迁移
const SAVE_VERSION    = 3;
const TICK_MS         = 200;      // 主循环间隔
const AUTOSAVE_MS     = 10000;    // 自动存档间隔
const OFFLINE_CAP_SEC = 8 * 3600; // 离线收益最多算 8 小时
const OFFLINE_EFF     = 0.5;      // 离线效率

const SUB_NEED_BASE    = 100;     // 第 1 小阶修为需求
const SUB_NEED_GROWTH  = 1.4;     // 每小阶需求增长
const AUTO_CULT_BASE   = 3;       // 练气初期 修为/秒
const CULT_GROWTH      = 1.16;    // 每小阶修炼速度增长（远低于需求增长，前快后慢）
const LINGSHI_AUTO_BASE   = 0.4;  // 自动灵石基础
const LINGSHI_AUTO_GROWTH = 1.35; // 每大境灵石增长
const MEDITATE_CD   = 500;        // 打坐冷却 ms
const MEDITATE_MULT = 4;          // 打坐一次 = 多少秒自动修炼
const BATTLE_ROUND_MS = 450;      // 战斗回合间隔
const TRIB_COST = 200000;         // 渡劫所需灵石

/* ---------- 境界表 ---------- */
const REALMS = ['练气期','筑基期','金丹期','元婴期','化神期','炼虚期','合体期','大乘期','渡劫期'];
const SUB_NAMES = ['初期','中期','后期','圆满'];
const TOTAL_SUB = REALMS.length * 4; // 36 小阶，突破第 36 即飞升

const realmOf   = s => Math.floor(s / 4);
const subOf     = s => s % 4;
const realmName = s => REALMS[Math.min(realmOf(s), REALMS.length - 1)] + SUB_NAMES[subOf(s)];
const xiuweiNeed    = s => Math.floor(SUB_NEED_BASE * Math.pow(SUB_NEED_GROWTH, s));
const autoCultPerSec= s => AUTO_CULT_BASE * Math.pow(CULT_GROWTH, s);
const regenPerSec   = s => 4 + realmOf(s) * 3;                          // 非战斗回血(HP/秒，固定数值)
const pillXiuwei    = s => Math.round(300 * Math.pow(1.7, realmOf(s))); // 修为丹固定数值(前期强后期弱)
const GROW = 2.3;                       // 每大境战力指数增长
const baseAtk   = s => Math.round(8  * Math.pow(GROW, s / 4));
const baseDef   = s => Math.round(4  * Math.pow(GROW, s / 4));
const baseMaxHp = s => Math.round(100 * Math.pow(GROW, s / 4));
const lingshiPerSec = () => {
  const base = LINGSHI_AUTO_BASE * Math.pow(LINGSHI_AUTO_GROWTH, realmOf(state.sub));
  return base * (1 + (treasureBonus().lingshi || 0)) * (1 + (caveBonus().lingshi || 0));
};
function breakthroughChance(s){ return Math.min(0.99, 0.9 + (samsaraBonus().break || 0) + (pathBonus().break || 0) + luckFactor()); }  // 小境界突破 + 轮回天赋 + 道途 + 气运
function majorBreakChance(s){ return Math.max(0.3, Math.min(0.95, 0.65 - realmOf(s) * 0.03 + (samsaraBonus().break || 0) + (pathBonus().break || 0) + luckFactor())); } // 大境界突破 + 轮回天赋 + 道途 + 气运
function alchemyChance(){ return Math.min(0.95, 0.6 + realmOf(state.sub) * 0.04 + (sectBonus().alch || 0) + (samsaraBonus().alch || 0) + (caveBonus().alch || 0) + (pathBonus().alch || 0) + (insightBonus().alch || 0) + luckFactor()); }

/* ---------- 功法 ---------- */
const TECHNIQUES = [
  { id:'t0', name:'吐纳术',     cultBonus:0.5, cost:100     },
  { id:'t1', name:'紫气东来',   cultBonus:1.0, cost:1500    },
  { id:'t2', name:'太上忘情录', cultBonus:1.5, cost:12000   },
  { id:'t3', name:'混元功',     cultBonus:2.5, cost:60000   },
  { id:'t4', name:'九转玄功',   cultBonus:4.0, cost:300000  },
  { id:'t5', name:'鸿蒙造化功', cultBonus:7.0, cost:1500000 },
];

/* ---------- 装备（9 级，每级战力 ×2.3） ---------- */
const WEAPON_NAMES = ['凡铁剑','寒铁剑','紫电','青莲剑','诛仙剑','盘古剑','天罡剑','混元剑','造化之剑'];
const ARMOR_NAMES  = ['布衣','玄铁甲','天蚕宝衣','金丝软甲','混沌战甲','太极道袍','玄武甲','太清道袍','鸿蒙仙衣'];
const WEAPONS = WEAPON_NAMES.map((name, z) => ({ id:'w'+z, name, atk: Math.round(8 * Math.pow(GROW, z)), cost: Math.round(80 * Math.pow(3.0, z)) }));
const ARMORS  = ARMOR_NAMES.map((name, z) => ({ id:'a'+z, name, def: Math.round(6 * Math.pow(GROW, z)), cost: Math.round(80 * Math.pow(3.0, z)) }));

/* ---------- 丹药 / 材料 ---------- */
const PILL_DEFS = {
  huiqi:  { name:'回血丹', icon:'🩸', desc:'回满气血' },
  xiuwei: { name:'修为丹', icon:'✨', desc:'立即获得修为' },
  tupo:   { name:'突破丹', icon:'⚡', desc:'下次突破成功率 +30%' },
  kangjie:{ name:'抗劫丹', icon:'🛡', desc:'天劫中服用，化解一重劫难' },
};
const MAT_DEFS = {
  herb: { name:'灵草', icon:'🌿' },
  core: { name:'妖核', icon:'💀' },
};
const SHOP_PILL_PRICE = { huiqi:60, xiuwei:300, tupo:900 };
const RECIPES = [
  { id:'r_huiqi',  out:'huiqi',  mats:{herb:2},         cost:30,  desc:'2 灵草 -> 回血丹' },
  { id:'r_xiuwei', out:'xiuwei', mats:{core:2, herb:1}, cost:150, desc:'2 妖核+1 灵草 -> 修为丹' },
  { id:'r_tupo',   out:'tupo',   mats:{core:3, herb:2}, cost:400, desc:'3 妖核+2 灵草 -> 突破丹' },
  { id:'r_kangjie',out:'kangjie',mats:{core:5, herb:3}, cost:2000, desc:'5 妖核+3 灵草 -> 抗劫丹', requires:'cave_alchemy' },  // 需洞府丹房解锁（模块 C）
];

/* ---------- 法宝（装备槽：treasure） ---------- */
const TREASURES = [
  { id:'tr_lotus', name:'灵泉玉瓶', icon:'🍶', desc:'修炼速度 +30%',          bonus:{cult:0.30},                        source:'sect', cost:{contribution:300} },
  { id:'tr_fire',  name:'玄火鉴',   icon:'🔥', desc:'攻击 +20%',              bonus:{atk:0.20},                         source:'drop' },
  { id:'tr_vajra', name:'金刚镯',   icon:'💍', desc:'防御 +25% / 气血 +15%',  bonus:{def:0.25, maxhp:0.15},             source:'drop' },
  { id:'tr_blood', name:'嗜血珠',   icon:'🩸', desc:'战斗吸血 30%',           bonus:{lifesteal:0.30},                   source:'sect', cost:{contribution:500} },
  { id:'tr_basin', name:'聚宝盆',   icon:'🏺', desc:'灵石获取 +50%',          bonus:{lingshi:0.50},                     source:'drop' },
  { id:'tr_jade',  name:'造化玉碟', icon:'💿', desc:'修炼 +60% / 攻防各 +10%', bonus:{cult:0.60, atk:0.10, def:0.10},    source:'sect', cost:{contribution:1200} },
];
const TREASURE_DROP_CHANCE = 0.08;       // 强怪(vIdx=2)掉落概率
const TREASURE_DROP_ORDER  = ['tr_fire','tr_vajra','tr_basin']; // 按秘境层级递进
const TREASURE_DUP_REFUND  = 5000;       // 掉落法宝已拥有时的折价灵石补偿

/* ---------- 法宝品阶 / 铭纹（模块 F·炼器升阶） ---------- */
// 品阶：treasureBonus() 乘以对应 mult；铭纹槽数 = 品阶数（凡器0/灵器1/.../神器4）
const TREASURE_TIERS = [
  { name:'凡器', mult:1.0, color:'muted'   },
  { name:'灵器', mult:1.3, color:'jade'    },
  { name:'法器', mult:1.7, color:'purple'  },
  { name:'仙器', mult:2.2, color:'gold'    },
  { name:'神器', mult:3.0, color:'crimson' },
];
// 铭纹：镶嵌到法宝空槽，效果累加到 treasureBonus()
const INSCRIPTIONS = [
  { id:'ins_atk',  name:'锋锐纹', icon:'⚔️', desc:'攻击 +5%',   bonus:{atk:0.05} },
  { id:'ins_def',  name:'厚土纹', icon:'🛡️', desc:'防御 +5%',   bonus:{def:0.05} },
  { id:'ins_hp',   name:'长生纹', icon:'❤️', desc:'气血 +8%',   bonus:{maxhp:0.08} },
  { id:'ins_cult', name:'悟道纹', icon:'📖', desc:'修炼 +8%',   bonus:{cult:0.08} },
  { id:'ins_luck', name:'天命纹', icon:'🍀', desc:'气运 +8',    bonus:{luck:8} },
];

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

/* ---------- 宗门专属功法（贡献兑换，每宗一本） ---------- */
const SECT_TECHS = [
  { id:'st_sword', sect:'sect_sword', name:'万剑诀',   icon:'⚔️', desc:'攻击力 +25',              cost:300, bonus:{atkFlat:25} },
  { id:'st_pill',  sect:'sect_pill',  name:'神农经',   icon:'🌿', desc:'修为丹效果 ×1.4',          cost:300, bonus:{pillXiuweiMul:0.40} },
  { id:'st_talisman', sect:'sect_talisman', name:'天机策', icon:'📜', desc:'修炼速度 +20%',        cost:300, bonus:{cult:0.20} },
  { id:'st_body',  sect:'sect_body',  name:'玄武真解', icon:'🏔', desc:'气血上限 +18%',           cost:300, bonus:{maxhp:0.18} },
];
function sectTechBonus(){
  if (!state.sect || !state.sect.techs || !state.sect.techs.length) return {};
  const out = {};
  for (const tid of state.sect.techs){
    const st = SECT_TECHS.find(x => x.id === tid);
    if (st) Object.assign(out, st.bonus);
  }
  return out;
}

/* ---------- 轮回系统 · Samsara（模块 A，元进度） ---------- */
// 6 支天赋，每支 5 级，逐级加价；prices[level-1] 为升到该级所需道果
const SAMSAKA_TALENTS = [
  { id:'tal_memory',   name:'前世记忆', branch:'功法', icon:'📖', effect:'开局赠送 t0~t{L-1} 功法',          prices:[2,4,6,8,12] },
  { id:'tal_vein',     name:'灵脉觉醒', branch:'修炼', icon:'🌿', effect:'修炼速度 +15%/级',                  prices:[3,5,8,12,18] },
  { id:'tal_daoji',    name:'道基深厚', branch:'战力', icon:'🪨', effect:'攻/防/气血各 +5%/级',                prices:[3,5,8,12,18] },
  { id:'tal_epiphany', name:'顿悟前尘', branch:'突破', icon:'💡', effect:'突破率 +3%/级, 炼丹 +3%/级',          prices:[4,6,9,14,20] },
  { id:'tal_blessing', name:'宿世福缘', branch:'气运', icon:'🍀', effect:'初始气运 +10/级, 掉落 +2%/级',        prices:[3,5,8,12,18] },
  { id:'tal_wisdom',   name:'宿慧通明', branch:'放置', icon:'🧿', effect:'打坐 ×(1+10%/级), 离线上限 +1h/级',  prices:[3,5,8,12,18] },
];
const SAMSAKA_MAX_LEVEL = 5;
// 当前某天赋等级（0=未点）
function talentLevel(id){ return (state.meta && state.meta.talents && state.meta.talents[id]) || 0; }
// 升到下一级所需道果（已满级返回 null）
function talentNextCost(id){
  const lv = talentLevel(id);
  if (lv >= SAMSAKA_MAX_LEVEL) return null;
  const t = SAMSAKA_TALENTS.find(x => x.id === id);
  return t ? t.prices[lv] : null;
}
// 汇总 meta.talents -> 渗透到各属性函数（见加成渗透总表）
function samsaraBonus(){
  const b = { cult:0, atk:0, def:0, maxhp:0, break:0, alch:0, luckInit:0, drop:0, meditateMul:1, offlineCapHours:0, memoryLevel:0 };
  if (!state.meta || !state.meta.talents) return b;
  b.memoryLevel   = talentLevel('tal_memory');
  b.cult          = talentLevel('tal_vein') * 0.15;
  const dj        = talentLevel('tal_daoji');
  b.atk = dj * 0.05; b.def = dj * 0.05; b.maxhp = dj * 0.05;
  const ep        = talentLevel('tal_epiphany');
  b.break = ep * 0.03; b.alch = ep * 0.03;
  const bl        = talentLevel('tal_blessing');
  b.luckInit = bl * 10; b.drop = bl * 0.02;
  const ws        = talentLevel('tal_wisdom');
  b.meditateMul = 1 + ws * 0.1; b.offlineCapHours = ws * 1;
  return b;
}
// 道途对道果结算的加成（仙+0/魔+2/佛+1）；道途系统(T9)定义 DAO_PATHS，此处仅按 id 判断
function pathBonusForDaoFruit(){
  if (!state.daoPath || !state.daoPath.id) return 0;
  if (state.daoPath.id === 'dao_demon')  return 2;
  if (state.daoPath.id === 'dao_buddha') return 1;
  return 0; // 仙道
}
// 结算本世道果：飞升满额，兵解轮回(-30% 折扣)
function settleDaoFruit(subReached, isAscension){
  const kills = (state.meta.lifetime && state.meta.lifetime.kills) || 0;
  let fruit = Math.floor(subReached / 3) + Math.floor(kills / 500) + pathBonusForDaoFruit() + (state.meta.reincarnations || 0) * 2;
  if (!isAscension) fruit = Math.floor(fruit * 0.7); // 兵解轮回折扣
  return Math.max(0, fruit);
}
// 累加本世战绩到 lifetime（在结算前调用）
function accumulateLifetime(){
  const L = state.meta.lifetime || (state.meta.lifetime = {kills:0,breakthroughs:0,meditations:0,ascensions:0});
  L.kills         += (state.stats && state.stats.kills) || 0;
  L.breakthroughs += (state.stats && state.stats.breakthroughs) || 0;
  L.meditations   += (state.stats && state.stats.meditations) || 0;
  L.ascensions    += state.won ? 1 : 0;
}
// 新周目初始化时应用轮回天赋（前世记忆赠功法、宿世福缘初始气运）
function applySamsaraOnNewRun(){
  const b = samsaraBonus();
  for (let i = 0; i < (b.memoryLevel || 0); i++){
    if (TECHNIQUES[i] && !state.techniques.includes(TECHNIQUES[i].id)) state.techniques.push(TECHNIQUES[i].id);
  }
  state.luck = Math.min(100, 50 + (b.luckInit || 0));
  state.hp = playerMaxHp();
}
// 轮回转世：结算道果 -> 累加 lifetime -> 重置周目字段 -> 保留 meta -> 应用天赋
function reincarnSamsara(isAscension){
  accumulateLifetime();
  const fruit = settleDaoFruit(state.sub, isAscension);
  state.meta.daoFruit = (state.meta.daoFruit || 0) + fruit;
  state.meta.bestSub = Math.max(state.meta.bestSub || 0, state.sub);
  if (state.daoPath && state.daoPath.id && !state.meta.unlockedPaths.includes(state.daoPath.id)){
    state.meta.unlockedPaths.push(state.daoPath.id);
  }
  state.meta.reincarnations = (state.meta.reincarnations || 0) + 1;
  const meta = state.meta;
  state = newState();
  state.meta = meta;
  applySamsaraOnNewRun();
  clearBattle();
  document.getElementById('victory').classList.add('hidden');
  const tag = isAscension ? '飞升' : '兵解';
  log(`🔄 ${tag}轮回！结算道果 +${fruit}，累计 ${meta.daoFruit} 道果。再入轮回，重踏仙途。`);
  render(); save();
}
// 点亮/升级轮回天赋
function buyTalent(id){
  const t = SAMSAKA_TALENTS.find(x => x.id === id);
  if (!t) return;
  const cost = talentNextCost(id);
  if (cost === null){ log(`🌟 ${t.name} 已满级。`); return; }
  if ((state.meta.daoFruit || 0) < cost){ log(`🌟 道果不足，需 ${cost}。`); return; }
  state.meta.daoFruit -= cost;
  state.meta.talents[id] = talentLevel(id) + 1;
  log(`🌟 轮回天赋「${t.name}」升至 ${talentLevel(id)} 级！`);
  renderSamsakaTree(); refreshStats(); save();
}
// 离线收益上限（轮回天赋「宿慧通明」每级 +1h）
function offlineCapSec(){ return OFFLINE_CAP_SEC + (samsaraBonus().offlineCapHours || 0) * 3600; }
// 气运上限：基础 100 + 悟道树「天命」
function luckMaxCap(){ return 100 + (insightBonus().luckMax || 0); }

/* ---------- 气运/因果微调函数（模块 G·T8） ---------- */
// 气运 0~100 映射 [-0.10,+0.10]，封顶防溢出（50 为基准）
function luckFactor(){
  const luck = (typeof state.luck === 'number') ? state.luck : 50;
  return Math.max(-0.10, Math.min(0.10, (luck - 50) / 500));
}
// 因果(杀业/功德) 影响天劫强度与掉落
function karmaMod(){
  const k = state.karma || { kill:0, merit:0 };
  const kill = k.kill || 0, merit = k.merit || 0;
  return {
    kill, merit,
    tribScale: 1 + Math.max(0, kill - merit) / 200,   // 杀业重则天劫更强
    dropScale: 1 + merit / 500,                        // 功德高则掉落更好
  };
}
// 卜卦：消耗 10 气运，三选一效果（重置悬赏/下次突破必成/探明奇遇）
function divine(effect){
  if (state.luck < 10){ log('🍀 气运不足 10，无法卜卦。'); return; }
  state.luck -= 10;
  if (effect === 'bounty'){
    if (!state.sect){ log('🍀 卜卦：尚未加入宗门，悬赏无法重置，气运已消耗。'); }
    else { state.bounties = generateBounties(); state.bountyRefreshAt = Date.now() + BOUNTY_REFRESH_MS; log('🍀 卜卦灵验！悬赏榜已刷新。'); }
  } else if (effect === 'break'){
    state.tupoBuff = true; log('🍀 卜卦灵验！下次突破必成（突破丹生效）。');
  } else if (effect === 'event'){
    state.eventCooldownAt = Date.now(); log('🍀 卜卦灵验！奇遇即将降临。');
  }
  refreshStats(); renderTab(); save();
}
/* ---------- 三道分支 · Three Dao Paths（模块 H·T9） ---------- */
// 道途：仙(均衡)/魔(杀伐)/佛(守成)；每途 5 节点，大境界突破 +1 点
const DAO_PATHS = [
  { id:'dao_immortal', name:'仙道', icon:'🌤', color:'jade',    desc:'正统均衡 · 修炼/突破兼优', ending:'正果飞升，得道成仙' },
  { id:'dao_demon',    name:'魔道', icon:'🩸', color:'crimson', desc:'激进杀伐 · 攻击/吸血强化', ending:'魔尊降世，威压三界（需煞气达标）' },
  { id:'dao_buddha',   name:'佛道', icon:'🪷', color:'gold',    desc:'金身守成 · 气血/防御/炼丹', ending:'金身成佛，普度众生' },
];
// 道途技能节点（每途 5）；effect 叠加到对应属性
const DAO_NODES = {
  dao_immortal: [
    { id:'dn_i1', name:'紫气', cost:1, effect:{ cult:0.10 } },
    { id:'dn_i2', name:'朝元', cost:1, effect:{ break:0.03 } },
    { id:'dn_i3', name:'化神', cost:2, effect:{ cult:0.15 } },
    { id:'dn_i4', name:'混元', cost:2, effect:{ atk:0.08, def:0.08 } },
    { id:'dn_i5', name:'造化', cost:3, effect:{ maxhp:0.15, break:0.05 } },
  ],
  dao_demon: [
    { id:'dn_d1', name:'噬血', cost:1, effect:{ atk:0.10 } },
    { id:'dn_d2', name:'魔化', cost:1, effect:{ lifesteal:0.05 } },
    { id:'dn_d3', name:'煞气', cost:2, effect:{ atk:0.15 } },
    { id:'dn_d4', name:'天魔', cost:2, effect:{ maxhp:0.10, atk:0.10 } },
    { id:'dn_d5', name:'大自在', cost:3, effect:{ atk:0.20, lifesteal:0.05 } },
  ],
  dao_buddha: [
    { id:'dn_b1', name:'慈悲', cost:1, effect:{ maxhp:0.12 } },
    { id:'dn_b2', name:'金刚', cost:1, effect:{ def:0.08 } },
    { id:'dn_b3', name:'般若', cost:2, effect:{ alch:0.05 } },
    { id:'dn_b4', name:'菩提', cost:2, effect:{ maxhp:0.15, def:0.10 } },
    { id:'dn_b5', name:'大乘', cost:3, effect:{ maxhp:0.20, def:0.12 } },
  ],
};
const DAO_UNLOCK_SUB = 12;   // 元婴期选择道途
function daoPathDef(id){ return DAO_PATHS.find(p => p.id === id) || null; }
// 选择道途（sub>=12 时强制）
function chooseDaoPath(id){
  if (state.daoPathChosen) return;
  if (state.sub < DAO_UNLOCK_SUB){ log('需达元婴期方可选择道途。'); return; }
  if (!daoPathDef(id)) return;
  state.daoPath = { id, points:1, nodes:[] };
  state.daoPathChosen = true;
  const dp = daoPathDef(id);
  log(`${dp.icon} 选定${dp.name}，${dp.desc}！`);
  document.getElementById('daoChoose').classList.add('hidden');
  refreshStats(); renderTab(); save();
}
// 点亮道途节点
function learnDaoNode(nodeId){
  if (!state.daoPath) return;
  const nodes = DAO_NODES[state.daoPath.id] || [];
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;
  if ((state.daoPath.nodes||[]).includes(nodeId)){ log('已点亮此节点。'); return; }
  if ((state.daoPath.points||0) < node.cost){ log(`道途点不足，需 ${node.cost}。`); return; }
  // 前置：须按顺序点亮
  const idx = nodes.indexOf(node);
  if (idx > 0 && !(state.daoPath.nodes||[]).includes(nodes[idx-1].id)){ log('需先点亮前置节点。'); return; }
  state.daoPath.points -= node.cost;
  state.daoPath.nodes.push(nodeId);
  log(`${daoPathDef(state.daoPath.id).icon} 领悟${node.name}！`);
  refreshStats(); renderTab(); save();
}
// 汇总道途加成 -> 渗透到属性函数
function pathBonus(){
  const b = {};
  if (!state.daoPath) return b;
  const nodes = DAO_NODES[state.daoPath.id] || [];
  for (const nid of (state.daoPath.nodes||[])){
    const n = nodes.find(x => x.id === nid);
    if (!n) continue;
    for (const k in n.effect) b[k] = (b[k] || 0) + n.effect[k];
  }
  return b;
}
// 突破至元婴期且未选道途 -> 弹出选择遮罩
function maybePromptDaoPath(){
  if (state.sub >= DAO_UNLOCK_SUB && !state.daoPathChosen){
    const ov = document.getElementById('daoChoose');
    if (ov){ ov.classList.remove('hidden'); renderDaoChoose(); }
  }
}
function renderDaoChoose(){
  const body = document.getElementById('daoChooseBody');
  if (!body) return;
  let h = '<div class="dao-choose-grid">';
  for (const dp of DAO_PATHS){
    h += `<div class="zone-card dao-card dao-${dp.color}">
      <div class="zone-title">${dp.icon} ${dp.name}</div>
      <div class="alch-mats" style="margin-bottom:8px">${dp.desc}</div>
      <div class="alch-note">结局：${dp.ending}</div>
      <button class="tab-btn" data-action="choose-dao" data-id="${dp.id}">选择${dp.name}</button>
    </div>`;
  }
  h += '</div>';
  body.innerHTML = h;
}
function renderDaoPath(){
  if (!state.daoPath){
    return '<div class="lock-note">尚未选择道途（元婴期可选择）。</div>';
  }
  const dp = daoPathDef(state.daoPath.id);
  const nodes = DAO_NODES[state.daoPath.id] || [];
  let h = `<div class="dao-current ${'dao-'+dp.color}"><span class="dao-icon-lg">${dp.icon}</span><div><b>${dp.name}</b><span class="alch-note">道途点 ${state.daoPath.points||0}</span></div></div>`;
  h += '<div class="dao-nodes">';
  nodes.forEach((n, i) => {
    const learned = (state.daoPath.nodes||[]).includes(n.id);
    const prevLearned = i === 0 || (state.daoPath.nodes||[]).includes(nodes[i-1].id);
    const canLearn = !learned && prevLearned && (state.daoPath.points||0) >= n.cost;
    h += `<div class="dao-node ${learned?'learned':''} ${'dao-'+dp.color}">
      <b>${n.name}</b><span class="alch-note">${formatEffect(n.effect)}</span>
      <button class="tab-btn" data-action="learn-dao" data-id="${n.id}" ${learned||!canLearn?'disabled':''}>${learned?'已悟':('消耗 '+n.cost+' 点')}</button>
    </div>`;
  });
  h += '</div>';
  return h;
}
function formatEffect(eff){
  const parts = [];
  const labels = { cult:'修炼', atk:'攻击', def:'防御', maxhp:'气血', break:'突破', alch:'炼丹', lifesteal:'吸血' };
  for (const k in eff){
    if (k === 'break' || k === 'alch') parts.push(`${labels[k]}+${Math.round(eff[k]*100)}%`);
    else parts.push(`${labels[k]||k}+${Math.round(eff[k]*100)}%`);
  }
  return parts.join(' · ');
}

/* ---------- 洞府建设 · Cave Dwelling（模块 C·T4） ---------- */
const CAVE_MAX_LEVEL = 5;
// 8 类建筑：prices[5] 为各级升级价（0->1 取 prices[0]）；prereq=[buildingId, minLevel] 或 null
const CAVE_BUILDINGS = [
  { id:'cave_field',   name:'灵田',   icon:'🌾', prices:[500,1200,3000,8000,20000],    prereq:null,              effect:'每分钟产出灵草（随境界递增）' },
  { id:'cave_spring',  name:'灵泉',   icon:'💧', prices:[800,2000,5000,12000,30000],   prereq:null,              effect:'灵石获取 +10%/级，气血 +4%/级' },
  { id:'cave_array',   name:'聚灵阵', icon:'🔯', prices:[1000,3000,8000,20000,50000],  prereq:null,              effect:'修炼速度 +12%/级' },
  { id:'cave_alchemy', name:'丹房',   icon:'⚗️', prices:[1500,4000,10000,25000,60000], prereq:['cave_field',2],  effect:'炼丹成功率 +4%/级，解锁抗劫丹配方' },
  { id:'cave_library', name:'藏书阁', icon:'📚', prices:[2000,6000,15000,40000,100000],prereq:['cave_array',2],  effect:'功法效果 +5%/级，每半小时有几率顿悟功法' },
  { id:'cave_beast',   name:'兽栏',   icon:'🐾', prices:[3000,8000,20000,50000,120000],prereq:['cave_field',2],  effect:'解锁灵宠系统，灵宠成长 +10%/级' },
  { id:'cave_forge',   name:'炼器炉', icon:'🔨', prices:[3000,8000,20000,50000,120000],prereq:['cave_alchemy',2],effect:'解锁炼器，法宝升阶成功率 +5%/级' },
  { id:'cave_ward',    name:'避劫阵', icon:'🛡', prices:[4000,10000,25000,60000,150000],prereq:['cave_array',3],  effect:'天劫每重伤害减免 6%/级' },
];
function caveBuildingLv(id){ return ((state.cave && state.cave.buildings && state.cave.buildings[id]) || 0); }
// 汇总洞府建筑等级 -> 渗透到各属性函数（单一入口，便于平衡）
function caveBonus(){
  return {
    field:   caveBuildingLv('cave_field'),
    lingshi: caveBuildingLv('cave_spring') * 0.10,    // 灵泉 -> lingshiPerSec
    maxhp:   caveBuildingLv('cave_spring') * 0.04,    // 灵泉 -> playerMaxHp（温和）
    cult:    caveBuildingLv('cave_array') * 0.12,     // 聚灵阵 -> effectiveCultMult
    alch:    caveBuildingLv('cave_alchemy') * 0.04,   // 丹房 -> alchemyChance
    techAmp: caveBuildingLv('cave_library') * 0.05,   // 藏书阁 -> 功法 cultBonus 放大
    beast:   caveBuildingLv('cave_beast'),            // 兽栏 -> 灵宠成长系数（每级 +10%）
    forge:   caveBuildingLv('cave_forge') * 0.05,     // 炼器炉 -> 法宝升阶成功率
    ward:    caveBuildingLv('cave_ward') * 0.06,      // 避劫阵 -> 天劫减免
  };
}
// 灵田每秒灵草产出（含境界递增）
function caveFieldHerbPerSec(){
  const lv = caveBuildingLv('cave_field');
  if (lv <= 0) return 0;
  return (lv * (1 + realmOf(state.sub) * 0.3)) / 60;
}
// 建筑前置是否达标
function cavePrereqMet(b){
  if (!b.prereq) return true;
  return caveBuildingLv(b.prereq[0]) >= b.prereq[1];
}
// 升级/建造洞府建筑（0->1 建造，1~5 升级）
function upgradeCave(id){
  const b = CAVE_BUILDINGS.find(x => x.id === id);
  if (!b) return;
  const lv = caveBuildingLv(id);
  if (lv >= CAVE_MAX_LEVEL){ log(`${b.icon} ${b.name} 已满级。`); return; }
  if (!cavePrereqMet(b)){ log(`${b.icon} 前置未达：需 ${CAVE_BUILDINGS.find(x=>x.id===b.prereq[0]).name} ${b.prereq[1]} 级。`); return; }
  const cost = b.prices[lv];
  if (state.lingshi < cost){ log(`💎 灵石不足，需 ${fmt(cost)}。`); return; }
  state.lingshi -= cost;
  state.cave.buildings[id] = lv + 1;
  log(`${b.icon} ${b.name} ${lv === 0 ? '建成' : '升至 ' + (lv+1) + ' 级'}！${b.effect}`);
  if (id === 'cave_beast' && lv === 0) log(`🐾 灵宠系统已解锁，可在「灵宠」标签查看。`);
  if (id === 'cave_forge' && lv === 0) log(`🔨 炼器系统已解锁，可在行囊对法宝升阶。`);
  refreshStats(); renderTab(); save();
}
// 离线/挂机期间灵田灵草结算（沿用离线上限与半效率）
function caveOfflineProduce(sec){
  const herbs = Math.floor(caveFieldHerbPerSec() * sec * OFFLINE_EFF);
  if (herbs > 0){
    state.inv.herb += herbs;
    log(`🌾 洞府灵田产出灵草 ×${herbs}`);
  }
}

/* ---------- 灵宠相伴 · Spirit Pet（模块 D·T5） ---------- */
const PET_MAX_STAR = 5;
// 6 种灵宠：stat 为加成轴，per 为每级系数，skill/skillDesc 技能描述，zones 为可掉落秘境
const PET_SPECIES = [
  { id:'pet_finch',  name:'火眼云雀', icon:'🐦', stat:'atk',   per:0.08, skill:'烈焰啄', skillDesc:'玩家攻击后追加伤害段', zones:[0,1] },
  { id:'pet_turtle', name:'玄冰龟',   icon:'🐢', stat:'def',   per:0.10, skill:'玄冰甲', skillDesc:'每回合减伤 8%', zones:[2,3] },
  { id:'pet_marten', name:'紫电貂',   icon:'🦊', stat:'crit',  per:0.05, skill:'紫电',  skillDesc:'助战偶发 2 倍伤害', zones:[4,5] },
  { id:'pet_ape',    name:'灵猿',     icon:'🐵', stat:'maxhp', per:0.12, skill:'撼地',  skillDesc:'每回合 8% 概率震慑妖兽', zones:[6,7] },
  { id:'pet_fox',    name:'九尾狐',   icon:'🦊', stat:'luck',  per:5,    drop:0.03, skill:'魅惑', skillDesc:'降敌攻 6%、掉落 +3%/级', zones:[8] },
  { id:'pet_peng',   name:'金翅大鹏', icon:'🦅', stat:'all',   per:0.05, skill:'穿云',  skillDesc:'无视 50% 防御', zones:[], ascension:true },
];
const PET_DROP_CHANCE = 0.05;   // 强怪掉落灵宠基础概率（兽栏每级 +0.01）
// 出战槽位：兽栏未建则锁定(0)，每 2 级 +1 槽，最多 3
function petMaxSlots(){
  const lv = caveBuildingLv('cave_beast');
  if (lv <= 0) return 0;
  return Math.min(3, 1 + Math.floor(lv / 2));
}
function equippedPets(){ return state.pets.filter(p => p.equipped); }
function petSpecies(id){ return PET_SPECIES.find(x => x.id === id); }
// 灵宠是否已解锁（大鹏需飞升或轮回过）
function petSpeciesUnlocked(sp){
  if (sp.ascension) return state.won || (state.meta && state.meta.reincarnations) > 0;
  return true;
}
// 汇总已装备灵宠 -> 渗透到属性函数（atk/def/maxhp/luck/drop/crit）
function petBonus(){
  const b = { atk:0, def:0, maxhp:0, luck:0, drop:0, crit:0 };
  for (const p of equippedPets()){
    const sp = petSpecies(p.speciesId);
    if (!sp) continue;
    const power = p.level * (1 + (p.star - 1) * 0.15);   // 星级温和放大
    if (sp.id === 'pet_fox'){ b.luck += sp.per * power; b.drop += (sp.drop || 0) * power; }
    else if (sp.id === 'pet_peng'){ b.atk += sp.per * power; b.def += sp.per * power; b.maxhp += sp.per * power; }
    else if (sp.id === 'pet_marten'){ b.crit += sp.per * power; }
    else { b[sp.stat] = (b[sp.stat] || 0) + sp.per * power; }
  }
  return b;
}
// 助战伤害系数：1★0.2 ~ 5★0.5
function petDmgRatio(star){ return 0.2 + (star - 1) * 0.075; }
// 灵宠助战伤害段（玩家攻击后追加）
function petAttackDamage(b){
  const pet = equippedPets()[0];
  if (!pet) return 0;
  const sp = petSpecies(pet.speciesId);
  if (!sp) return 0;
  const ratio = petDmgRatio(pet.star);
  const def = sp.id === 'pet_peng' ? b.mon.def * 0.5 : b.mon.def;  // 穿云无视 50% 防
  let dmg = dmgCalc(playerAtk() * ratio, def);
  if (sp.id === 'pet_marten' && Math.random() < 0.2) dmg *= 2;     // 紫电偶发 2 倍
  return Math.round(dmg);
}
// 灵宠防御修正：玄冰甲减伤、魅惑降敌攻、撼地震慑（返回该回合怪物伤害倍率）
function petDefenseFactor(){
  let mul = 1;
  for (const p of equippedPets()){
    const sp = petSpecies(p.speciesId);
    if (!sp) continue;
    if (sp.id === 'pet_turtle') mul *= 0.92;     // 玄冰甲
    else if (sp.id === 'pet_fox') mul *= 0.94;   // 魅惑降敌攻
    else if (sp.id === 'pet_ape' && Math.random() < 0.08) return 0;  // 撼地震慑，该回合免伤
  }
  return mul;
}
function petUid(){ return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000); }
// 升星所需材料：灵宠丹 + 妖核 + 灵石（按目标星级递增）
function petEvolveCost(star){ return { petPill: star, core: star * 2, lingshi: Math.round(5000 * star * Math.pow(1.8, star)) }; }
// 亲和升级阈值
function petAffinityNeed(level){ return 10 + level * 5; }
// 孵化灵兽卵 -> 随机种族（已解锁池）
function hatchPet(){
  if ((state.inv.petEgg || 0) <= 0){ log('🥚 没有灵兽卵可孵化。'); return; }
  const pool = PET_SPECIES.filter(sp => petSpeciesUnlocked(sp));
  if (!pool.length){ log('🥚 暂无可孵化灵宠。'); return; }
  state.inv.petEgg--;
  const sp = pool[Math.floor(Math.random() * pool.length)];
  const pet = { uid: petUid(), speciesId: sp.id, level: 1, star: 1, exp: 0, affinity: 0, equipped: false };
  state.pets.push(pet);
  log(`🥚 灵兽卵孵化！获得 ${sp.icon}${sp.name}（1★）。`);
  refreshStats(); renderTab(); save();
}
// 升星（消耗灵宠丹+妖核+灵石，满星不可升）
function evolvePet(uid){
  const pet = state.pets.find(p => p.uid === uid);
  if (!pet) return;
  if (pet.star >= PET_MAX_STAR){ log('🌟 该灵宠已达最高星阶。'); return; }
  const cost = petEvolveCost(pet.star);
  if ((state.inv.petPill || 0) < cost.petPill){ log(`🌟 灵宠丹不足，需 ${cost.petPill}。`); return; }
  if ((state.inv.core || 0) < cost.core){ log(`🌟 妖核不足，需 ${cost.core}。`); return; }
  if (state.lingshi < cost.lingshi){ log(`💎 灵石不足，需 ${fmt(cost.lingshi)}。`); return; }
  state.inv.petPill -= cost.petPill;
  state.inv.core -= cost.core;
  state.lingshi -= cost.lingshi;
  pet.star += 1;
  const sp = petSpecies(pet.speciesId);
  log(`🌟 ${sp.icon}${sp.name} 升至 ${pet.star}★！`);
  refreshStats(); renderTab(); save();
}
// 装备/卸下出战灵宠（受槽位上限约束）
function equipPet(uid){
  const pet = state.pets.find(p => p.uid === uid);
  if (!pet) return;
  if (pet.equipped){ pet.equipped = false; log(`🐾 卸下灵宠出战。`); }
  else {
    if (equippedPets().length >= petMaxSlots()){ log(`🐾 出战槽位已满（${petMaxSlots()}）。`); return; }
    pet.equipped = true;
    const sp = petSpecies(pet.speciesId);
    log(`🐾 ${sp.icon}${sp.name} 出战助阵！`);
  }
  refreshStats(); renderTab(); save();
}
// 战斗胜利后灵宠亲和成长 + 掉落
function petOnBattleWin(b){
  // 亲和成长（仅在线战斗，防离线白嫖）
  for (const pet of equippedPets()){
    pet.affinity = (pet.affinity || 0) + 1;
    while (pet.affinity >= petAffinityNeed(pet.level)){
      pet.affinity -= petAffinityNeed(pet.level);
      pet.level += 1;
    }
  }
  // 强怪掉落灵宠：兽栏每级 +0.01
  if (b.var === 2 && petMaxSlots() > 0){
    const chance = PET_DROP_CHANCE + caveBuildingLv('cave_beast') * 0.01;
    if (Math.random() < chance){
      // 按 zone 决定可掉种族
      const pool = PET_SPECIES.filter(sp => sp.zones.includes(b.zone) && petSpeciesUnlocked(sp));
      if (pool.length){
        const sp = pool[Math.floor(Math.random() * pool.length)];
        const owned = state.pets.some(p => p.speciesId === sp.id);
        if (!owned){
          state.pets.push({ uid: petUid(), speciesId: sp.id, level: 1, star: 1, exp: 0, affinity: 0, equipped: false });
          return `🐾 灵宠 ${sp.icon}${sp.name}（1★）`;
        } else {
          state.inv.petPill = (state.inv.petPill || 0) + 1;
          return `🐾 灵宠丹×1（${sp.icon}${sp.name} 已拥有）`;
        }
      }
    }
  }
  return null;
}

/* ---------- 奇遇事件 · Serenpidity（模块 E·T6） ---------- */
// 事件触发概率/冷却
const EVENT_TRIGGER_P = 0.003;    // 每 tick(~200ms) 触发概率，冷却结束后约 1 分钟内触发
const EVENT_CD_BASE_MIN = 5;      // 基础冷却 5 分钟
const EVENT_CD_RAND_MIN = 10;     // 随机额外 0~10 分钟 -> 5~15 分钟
// 赠送一本境界合适的未习功法，返回功法名（无则 null）
function giveRandomTechnique(){
  const unowned = TECHNIQUES.filter((t, i) => !state.techniques.includes(t.id) && i <= realmOf(state.sub) + 1);
  if (!unowned.length) return null;
  const got = unowned[Math.floor(Math.random() * unowned.length)];
  state.techniques.push(got.id);
  return got.name;
}
// 奇遇触发的强怪战斗（当前最高秘境强档）
function eventStartBattle(){
  const z = Math.max(0, Math.min(ZONE_NAMES.length - 1, Math.floor(state.sub / 4)));
  startBattle(z, 2);
}
// 事件池：minSub 最低境界；weight 权重；rare 稀有(每世仅 1 次)；choices[].apply 返回日志
const EVENTS = [
  { id:'ev_elder', name:'山中遇老者', icon:'🧓', minSub:0, weight:5, rare:false,
    desc:'一位鹤发老者盘坐松下，似在等有缘人。',
    choices:[
      { id:'teach', label:'请求传功', desc:'修为大增，或有功法相赠',
        apply(){ const g = Math.round(autoCultPerSec(state.sub) * 600 * (1 + Math.random())); state.xiuwei += g; let s = `修为 +${fmt(g)}`; if (Math.random() < 0.3){ const tn = giveRandomTechnique(); if (tn) s += `，传授功法「${tn}」`; } return s; } },
      { id:'master', label:'拜师学艺', desc:'得无名残卷(下次突破+30%)，耗灵石',
        apply(){ const cost = Math.floor(state.lingshi * 0.05); state.lingshi -= cost; state.tupoBuff = true; return `耗灵石 ${fmt(cost)}，得无名残卷，下次突破成功率提升`; } },
      { id:'leave', label:'礼貌告退', desc:'+5 功德',
        apply(){ state.karma.merit = (state.karma.merit||0) + 5; return '礼貌告退，功德 +5'; } },
    ] },
  { id:'ev_pickup', name:'路拾遗宝', icon:'💎', minSub:0, weight:5, rare:false,
    desc:'路边闪烁异光，似有宝物遗落。',
    choices:[
      { id:'take', label:'拾取', desc:'得法宝碎片/灵石，但生贪念(+杀业)',
        apply(){ state.inv.fragments = (state.inv.fragments||0) + 2; const li = 5000 * (realmOf(state.sub)+1); state.lingshi += li; state.karma.kill = (state.karma.kill||0) + 10; return `得法宝碎片×2、灵石 ${fmt(li)}，杀业 +10`; } },
      { id:'submit', label:'上交宗门', desc:'+30 功德、+贡献',
        apply(){ state.karma.merit = (state.karma.merit||0) + 30; if (state.sect) state.sect.contribution = (state.sect.contribution||0) + 30; return '上交宗门，功德 +30' + (state.sect ? '、贡献 +30' : ''); } },
      { id:'ignore', label:'置之不理', desc:'无事',
        apply(){ return '置之不理，飘然离去'; } },
    ] },
  { id:'ev_ambush', name:'魔修截杀', icon:'🗡', minSub:4, weight:4, rare:false,
    desc:'一道黑影掠出，竟是魔修来犯！',
    choices:[
      { id:'fight', label:'应战', desc:'触发强怪战斗，胜得魔修掉落',
        apply(){ eventStartBattle(); return '拔剑迎战魔修！'; } },
      { id:'bribe', label:'贿赂', desc:'损 30% 灵石脱身',
        apply(){ const loss = Math.floor(state.lingshi * 0.3); state.lingshi -= loss; return `破财消灾，损失灵石 ${fmt(loss)}`; } },
      { id:'flee', label:'遁逃', desc:'气运判定，失败损 10% 气血',
        apply(){ if (Math.random() < 0.3 + luckFactor()){ return '遁术通玄，安然脱身'; } const loss = Math.floor(playerMaxHp() * 0.1); state.hp = Math.max(1, state.hp - loss); return `遁逃失败，损失气血 ${fmt(loss)}`; } },
    ] },
  { id:'ev_anomaly', name:'秘境异变', icon:'🌀', minSub:12, weight:3, rare:true,
    desc:'秘境深处灵气暴动，异象丛生。',
    choices:[
      { id:'deep', label:'深入探索', desc:'得稀有材料/灵宠卵，30% 损大量气血',
        apply(){ state.inv.core = (state.inv.core||0) + 3; state.inv.petEgg = (state.inv.petEgg||0) + 1; if (Math.random() < 0.3){ const loss = Math.floor(playerMaxHp() * 0.4); state.hp = Math.max(1, state.hp - loss); return `得妖核×3、灵兽卵×1，但触发反噬损气血 ${fmt(loss)}`; } return '得妖核×3、灵兽卵×1，满载而归'; } },
      { id:'retreat', label:'撤离', desc:'无事',
        apply(){ return '见势不妙，及时撤离'; } },
    ] },
  { id:'ev_fairy', name:'仙子论道', icon:'🧚', minSub:16, weight:3, rare:false,
    desc:'凌空仙子含笑而立，邀你论道。',
    choices:[
      { id:'discuss', label:'论道', desc:'感悟 +5，50% 气运提升',
        apply(){ state.insight = (state.insight||0) + 5; let s = '感悟 +5'; if (Math.random() < 0.5){ state.luck = Math.min(100, state.luck + 5); s += '，气运 +5'; } return s; } },
      { id:'part', label:'辞别', desc:'无事',
        apply(){ return '拱手辞别，仙子化虹而去'; } },
    ] },
  { id:'ev_relic', name:'上古遗迹', icon:'🏛', minSub:24, weight:2, rare:true,
    desc:'一座上古遗迹浮现，门楣刻满道纹。',
    choices:[
      { id:'explore', label:'探索', desc:'70% 得高阶材料，30% 触发天劫',
        apply(){ if (Math.random() < 0.7){ state.inv.fragments = (state.inv.fragments||0) + 5; state.inv.petPill = (state.inv.petPill||0) + 1; return '得法宝碎片×5、灵宠丹×1'; } startTribulation(false, true); return '触动禁制，天劫降临！'; } },
      { id:'go', label:'离开', desc:'无事',
        apply(){ return '不敢造次，转身离开'; } },
    ] },
  { id:'ev_hearthest', name:'灵脉涌动', icon:'🌋', minSub:0, weight:4, rare:false,
    desc:'脚下灵脉忽然活跃，灵气如潮涌来。',
    choices:[
      { id:'absorb', label:'盘膝吸纳', desc:'修为/灵石大增',
        apply(){ const g = Math.round(autoCultPerSec(state.sub) * 900); state.xiuwei += g; const li = 8000 * (realmOf(state.sub)+1); state.lingshi += li; return `修为 +${fmt(g)}、灵石 +${fmt(li)}`; } },
      { id:'share', label:'引灵入地', desc:'+10 功德',
        apply(){ state.karma.merit = (state.karma.merit||0) + 10; return '引灵脉反哺天地，功德 +10'; } },
    ] },
  { id:'ev_demonheart', name:'心魔试炼', icon:'👿', minSub:8, weight:3, rare:false,
    desc:'内景陡变，心魔化形相逼。',
    choices:[
      { id:'overcome', label:'以力破之', desc:'50% 修为大增，50% 走火入魔',
        apply(){ if (Math.random() < 0.5 + luckFactor()){ const g = Math.round(autoCultPerSec(state.sub) * 800); state.xiuwei += g; return `斩灭心魔，修为 +${fmt(g)}`; } state.debuff = { until: Date.now() + 60000, cultMult: 0.5 }; return '心魔反噬，走火入魔 60 秒'; } },
      { id:'meditate', label:'静心化解', desc:'安全但收益小',
        apply(){ const g = Math.round(autoCultPerSec(state.sub) * 200); state.xiuwei += g; return `静心化解，修为 +${fmt(g)}`; } },
    ] },
  { id:'ev_charity', name:'济世救人', icon:'🙏', minSub:4, weight:3, rare:false,
    desc:'路遇村民遭妖患，恳求道长施救。',
    choices:[
      { id:'help', label:'施救', desc:'耗灵石，+功德、+贡献',
        apply(){ const cost = 3000 * (realmOf(state.sub)+1); if (state.lingshi < cost){ return '灵石不足，无力施救，怅然离去'; } state.lingshi -= cost; state.karma.merit = (state.karma.merit||0) + 20; if (state.sect) state.sect.contribution = (state.sect.contribution||0) + 20; return `耗灵石 ${fmt(cost)}，功德 +20`; } },
      { id:'pass', label:'袖手', desc:'无事，但略有杀业',
        apply(){ state.karma.kill = (state.karma.kill||0) + 3; return '袖手旁观，心生愧念，杀业 +3'; } },
    ] },
  { id:'ev_gamble', name:'卜卦摊', icon:'🔮', minSub:0, weight:4, rare:false,
    desc:'街角卜卦老叟笑问：可要算上一卦？',
    choices:[
      { id:'divine', label:'卜卦', desc:'消耗 10 气运，随机福祸',
        apply(){ if (state.luck < 10){ return '气运不足，老叟摇头不卜'; } state.luck -= 10; const r = Math.random(); if (r < 0.4){ const li = 10000 * (realmOf(state.sub)+1); state.lingshi += li; return `上上签！得灵石 ${fmt(li)}`; } else if (r < 0.7){ const tn = giveRandomTechnique(); return tn ? `中吉签！得功法「${tn}」` : '中吉签！万事顺遂'; } else { const loss = Math.floor(state.lingshi * 0.05); state.lingshi -= loss; return `下下签…损失灵石 ${fmt(loss)}`; } } },
      { id:'skip', label:'不卜', desc:'无事',
        apply(){ return '一笑置之，转身离去'; } },
    ] },
  { id:'ev_beast_tide', name:'兽潮来袭', icon:'🐺', minSub:12, weight:3, rare:false,
    desc:'远方兽潮滚滚而来，遮天蔽日。',
    choices:[
      { id:'defend', label:'迎击兽潮', desc:'触发强怪战斗，胜得大量妖核',
        apply(){ eventStartBattle(); return '挺身而出，迎击兽潮！'; } },
      { id:'hide', label:'隐蔽', desc:'气运判定，失败损灵石',
        apply(){ if (Math.random() < 0.4 + luckFactor()){ return '隐匿气息，躲过兽潮'; } const loss = Math.floor(state.lingshi * 0.1); state.lingshi -= loss; return `被发现，损失灵石 ${fmt(loss)}`; } },
    ] },
  { id:'ev_meteor', name:'流星陨铁', icon:'☄️', minSub:16, weight:1, rare:true,
    desc:'天外流星坠地，竟是稀世陨铁！',
    choices:[
      { id:'mine', label:'采集陨铁', desc:'得法宝碎片、灵宠丹，损气血',
        apply(){ state.inv.fragments = (state.inv.fragments||0) + 4; state.inv.petPill = (state.inv.petPill||0) + 1; const loss = Math.floor(playerMaxHp() * 0.15); state.hp = Math.max(1, state.hp - loss); return `得法宝碎片×4、灵宠丹×1，余热灼伤损气血 ${fmt(loss)}`; } },
      { id:'sell', label:'出售消息', desc:'得大量灵石',
        apply(){ const li = 30000 * (realmOf(state.sub)+1); state.lingshi += li; return `出售陨铁消息，得灵石 ${fmt(li)}`; } },
    ] },
];
// 稀有事件每世限 1 次
function eventAvailable(e){
  if (state.sub < e.minSub) return false;
  if (e.rare && (state.eventHistory[e.id] || 0) > 0) return false;
  return true;
}
function triggerEvent(){
  const pool = EVENTS.filter(eventAvailable);
  if (!pool.length) return;
  const totalW = pool.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * totalW;
  let chosen = pool[0];
  for (const e of pool){ r -= e.weight; if (r <= 0){ chosen = e; break; } }
  state.activeEvent = { id: chosen.id };
  state.eventHistory[chosen.id] = (state.eventHistory[chosen.id] || 0) + 1;
  log(`✨ 奇遇降临：${chosen.icon}${chosen.name}`);
  renderEvent();
}
function chooseEvent(choiceId){
  const ae = state.activeEvent;
  if (!ae) return;
  const ev = EVENTS.find(e => e.id === ae.id);
  state.activeEvent = null;
  const overlay = document.getElementById('eventOverlay');
  if (overlay) overlay.classList.add('hidden');
  // 设冷却 5~15 分钟，气运可缩短
  let cdMin = EVENT_CD_BASE_MIN + Math.floor(Math.random() * EVENT_CD_RAND_MIN) - Math.floor(state.luck / 30);
  cdMin = Math.max(3, cdMin);
  state.eventCooldownAt = Date.now() + cdMin * 60 * 1000;
  if (ev){
    const choice = ev.choices.find(c => c.id === choiceId);
    if (choice && choice.apply){
      const msg = choice.apply();
      if (msg) log(`✨ ${ev.name}：${msg}`);
    }
  }
  refreshStats(); renderTab(); save();
}
function renderEvent(){
  const ae = state.activeEvent;
  const overlay = document.getElementById('eventOverlay');
  if (!ae || !overlay){ if (overlay) overlay.classList.add('hidden'); return; }
  const ev = EVENTS.find(e => e.id === ae.id);
  if (!ev){ overlay.classList.add('hidden'); return; }
  overlay.classList.remove('hidden');
  const body = document.getElementById('eventBody');
  if (!body) return;
  let h = `<div class="event-card">
    <div class="event-title">${ev.icon} ${ev.name}</div>
    <div class="event-desc">${ev.desc}</div>
    <div class="event-choices">`;
  for (const c of ev.choices){
    h += `<button class="tab-btn event-choice" data-action="choose-event" data-id="${c.id}"><b>${c.label}</b><small>${c.desc}</small></button>`;
  }
  h += `</div></div>`;
  body.innerHTML = h;
}
// 卜卦台/因果面板（模块 G）
function renderDivine(){
  const km = karmaMod();
  const body = document.getElementById('divineBody');
  if (!body) return;
  const canDivine = state.luck >= 10;
  let h = `<div class="divine-luck">当前气运：<b>${Math.round(state.luck||0)}</b>/100</div>`;
  h += `<div class="divine-karma">
    <div class="karma-row"><span class="karma-kill">🩸 杀业 ${km.kill}</span><div class="karma-bar"><div class="bar kill" style="width:${Math.min(100, km.kill)}%"></div></div></div>
    <div class="karma-row"><span class="karma-merit">✨ 功德 ${km.merit}</span><div class="karma-bar"><div class="bar merit" style="width:${Math.min(100, km.merit)}%"></div></div></div>
  </div>`;
  h += `<div class="alch-note">天劫强度 ×${km.tribScale.toFixed(2)} · 掉落 ×${km.dropScale.toFixed(2)}</div>`;
  h += '<div class="event-choices">';
  h += `<button class="tab-btn event-choice" data-action="divine" data-effect="bounty" ${!canDivine||!state.sect?'disabled':''}><b>重置悬赏</b><small>消耗 10 气运，立即刷新悬赏榜</small></button>`;
  h += `<button class="tab-btn event-choice" data-action="divine" data-effect="break" ${!canDivine?'disabled':''}><b>突破必成</b><small>消耗 10 气运，下次突破成功率大增</small></button>`;
  h += `<button class="tab-btn event-choice" data-action="divine" data-effect="event" ${!canDivine?'disabled':''}><b>探明奇遇</b><small>消耗 10 气运，奇遇即刻降临</small></button>`;
  h += '</div>';
  body.innerHTML = h;
}
function openDivine(){
  const overlay = document.getElementById('divineOverlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  renderDivine();
}
function closeDivine(){
  const overlay = document.getElementById('divineOverlay');
  if (overlay) overlay.classList.add('hidden');
}

/* ---------- 秘境深探 · Roguelike Deep Realm（模块 I·T10） ---------- */
// 房间类型：每层 2~3 个选项，玩家选一进入
const DEEP_ROOMS = [
  { id:'battle',   name:'战斗房', icon:'⚔️', desc:'强档妖兽，胜得灵石/材料/碎片' },
  { id:'elite',    name:'精英房', icon:'💀', desc:'×1.5 强怪，胜得灵宠卵/铭纹' },
  { id:'treasure', name:'宝箱房', icon:'📦', desc:'直接得资源，无损' },
  { id:'event',    name:'事件房', icon:'❓', desc:'触发小型奇遇(2选1)' },
  { id:'rest',     name:'休整房', icon:'🏕️', desc:'回血 50% + 气运 +10' },
  { id:'boss',     name:'Boss房', icon:'🐉', desc:'区境 Boss(×2 强怪)，胜深入下层' },
];
// 探索力初始 = 10 + realmOf×2 + 兽栏等级
function expeditionMaxStamina(){
  return 10 + realmOf(state.sub) * 2 + caveBuildingLv('cave_beast');
}
// 生成一层 2~3 个房间选项
function genExpeditionRooms(floor){
  const pool = ['battle','treasure','event','rest'];
  const count = 2 + (Math.random() < 0.5 ? 0 : 1);
  const rooms = [];
  for (let i = 0; i < count; i++){
    rooms.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  // 每 3 层一个 Boss（替换最后一个）
  if (floor % 3 === 0){
    rooms[rooms.length - 1] = 'boss';
  } else if (Math.random() < 0.2){
    rooms[Math.floor(Math.random() * rooms.length)] = 'elite';
  }
  return rooms;
}
function startExpedition(zone){
  if (state.expedition){ log('已在秘境深处探索中。'); return; }
  if (!zoneUnlocked(zone)){ log('该秘境尚未解锁。'); return; }
  state.expedition = { zone, floor:1, stamina: expeditionMaxStamina(), rewards:{ lingshi:0, herb:0, core:0, fragments:0, petEgg:0, petPill:0 }, rooms: genExpeditionRooms(1), alive:true };
  log(`🗺️ 进入${ZONE_NAMES[zone]}深处探索！探索力 ${state.expedition.stamina}。`);
  refreshStats(); renderTab(); save();
}
// 进入某房间（结算非战斗房；战斗房标记 roomPending 等待 endBattle 回写）
function enterRoom(roomType){
  const ex = state.expedition;
  if (!ex) return;
  if (roomType === 'battle' || roomType === 'elite' || roomType === 'boss'){
    // 触发战斗：标记 expeditionMode，endBattle 回写
    const v = 2;
    const z = ex.zone;
    const mon = genMonster(z, v);
    if (roomType === 'elite'){ mon.maxHp = Math.round(mon.maxHp * 1.5); mon.atk = Math.round(mon.atk * 1.5); mon.name = '精英·' + mon.name; }
    if (roomType === 'boss'){ mon.maxHp = Math.round(mon.maxHp * 2); mon.atk = Math.round(mon.atk * 2); mon.name = 'Boss·' + mon.name; }
    mon._expRoom = roomType;
    battleState = { mon, monHp: mon.maxHp, zone:z, var:v, expeditionMode:true, timer:null };
    log(`⚔️ 深探遭遇 ${mon.name}！`);
    renderTab();
    battleState.timer = setInterval(battleRound, BATTLE_ROUND_MS);
    return;
  }
  // 非战斗房直接结算
  resolveExpeditionRoom(roomType, true);
}
// 结算非战斗/战斗胜利房间
function resolveExpeditionRoom(roomType, won){
  const ex = state.expedition;
  if (!ex) return;
  if (roomType === 'treasure'){
    const li = 5000 * (realmOf(state.sub) + 1) * (1 + ex.floor * 0.2);
    ex.rewards.lingshi += Math.round(li);
    if (Math.random() < 0.5) ex.rewards.fragments += 1;
    if (ex.floor >= 5 && Math.random() < 0.3) ex.rewards.petEgg += 1;
    if (Math.random() < 0.4){ ex.rewards.core += 2; ex.rewards.herb += 2; }
    log(`📦 宝箱房：得灵石 ${fmt(li)}${ex.rewards.fragments?'、碎片':''}。`);
  } else if (roomType === 'rest'){
    state.hp = Math.min(playerMaxHp(), state.hp + Math.floor(playerMaxHp() * 0.5));
    state.luck = Math.min(100, (state.luck||0) + 10);
    log('🏕️ 休整房：回血 50%、气运 +10。');
  } else if (roomType === 'event'){
    // 小型奇遇：直接给个随机小奖
    const r = Math.random();
    if (r < 0.4){ const g = Math.round(autoCultPerSec(state.sub) * 300); state.xiuwei += g; log(`❓ 事件房：奇遇得修为 ${fmt(g)}。`); }
    else if (r < 0.7){ ex.rewards.petPill += 1; log('❓ 事件房：得灵宠丹×1。'); }
    else { state.karma.merit = (state.karma.merit||0) + 5; log('❓ 事件房：得功德 +5。'); }
  } else if (won && (roomType === 'battle' || roomType === 'elite' || roomType === 'boss')){
    // 战斗胜利奖励（不触发普通掉落，按房间发放）
    const li = 8000 * (realmOf(state.sub) + 1) * (1 + ex.floor * 0.15);
    ex.rewards.lingshi += Math.round(li);
    ex.rewards.core += 2; ex.rewards.herb += 1;
    if (roomType === 'elite'){ ex.rewards.fragments += 2; if (Math.random() < 0.5) ex.rewards.petEgg += 1; log(`💀 精英房胜：得灵石 ${fmt(li)}、碎片×2${ex.rewards.petEgg?'、灵兽卵':''}。`); }
    else if (roomType === 'boss'){ ex.rewards.fragments += 5; ex.rewards.petPill += 2; log(`🐉 Boss 房胜：大胜！得灵石 ${fmt(li)}、碎片×5、灵宠丹×2。深入下层。`); }
    else { if (ex.floor >= 5 && Math.random() < 0.3) ex.rewards.fragments += 1; log(`⚔️ 战斗房胜：得灵石 ${fmt(li)}、妖核×2。`); }
  }
  // 探索力消耗
  const cost = { battle:1, elite:2, treasure:0, event:0, rest:0, boss:3 }[roomType] || 0;
  ex.stamina -= cost;
  // 推进层数（Boss 房深入下层，普通房完成亦推进）
  ex.floor += 1;
  ex.rooms = genExpeditionRooms(ex.floor);
  if (ex.stamina <= 0){ log('💤 探索力耗尽，被迫撤出秘境。'); return exitExpedition(false); }
  refreshStats(); renderTab(); save();
}
// 撤出秘境：结算已得奖励的 100%（主动撤出全得，失败 50%）
function exitExpedition(failed){
  const ex = state.expedition;
  if (!ex) return;
  const factor = failed ? 0.5 : 1;
  const r = ex.rewards;
  const li = Math.floor(r.lingshi * factor);
  state.lingshi += li;
  state.inv.herb += Math.floor(r.herb * factor);
  state.inv.core += Math.floor(r.core * factor);
  state.inv.fragments = (state.inv.fragments||0) + Math.floor(r.fragments * factor);
  state.inv.petEgg = (state.inv.petEgg||0) + Math.floor(r.petEgg * factor);
  state.inv.petPill = (state.inv.petPill||0) + Math.floor(r.petPill * factor);
  log(`🗺️ 撤出秘境深处${failed?'（失败，仅得 50%）':''}：得灵石 ${fmt(li)}、妖核×${Math.floor(r.core*factor)}、碎片×${Math.floor(r.fragments*factor)}。`);
  state.expedition = null;
  refreshStats(); renderTab(); save();
}
function renderExpedition(){
  const ex = state.expedition;
  if (!ex) return '';
  let h = `<div class="exp-head">
    <span>🗺️ ${ZONE_NAMES[ex.zone]}深处 · 第 ${ex.floor} 层</span>
    <span>💤 探索力：<b>${ex.stamina}</b></span>
    <button class="tab-btn danger-btn" data-action="exit-expedition">🚪 主动撤出</button>
  </div>`;
  h += '<div class="exp-rooms">';
  for (const rt of ex.rooms){
    const def = DEEP_ROOMS.find(x => x.id === rt);
    h += `<button class="tab-btn exp-room" data-action="enter-room" data-room="${rt}"><b>${def.icon} ${def.name}</b><small>${def.desc}</small></button>`;
  }
  h += '</div>';
  // 已得奖励
  const r = ex.rewards;
  h += `<div class="alch-note">已得（撤出结算）：💎${fmt(r.lingshi)}　🌿${r.herb}　💀${r.core}　💎碎片${r.fragments}　🥚${r.petEgg}　💊${r.petPill}</div>`;
  return h;
}

/* ---------- 斗法论道 · Dueling & Dao Discussion（模块 J·T11） ---------- */
const DUEL_UNLOCK_SUB = 8;   // 筑基后期解锁论道
// 对手三档：切磋(0.9x)/同阶(1.1x)/越阶(1.3x)
const DUEL_TIERS = [
  { id:0, name:'切磋', mult:0.9, desc:'战力 0.9×，安全练手' },
  { id:1, name:'同阶', mult:1.1, desc:'战力 1.1×，势均力敌' },
  { id:2, name:'越阶', mult:1.3, desc:'战力 1.3×，高风险高回报' },
];
// 道号生成
const DUEL_NAMES = ['清风子','玄明真人','紫霄道人','青莲剑仙','万妖老祖','枯荣禅师','天机散人','血衣修士','灵宝道君','幽冥鬼帝'];
// 悟道树：8 节点，本世永久，轮回不保留
const INSIGHT_NODES = [
  { id:'in_cult1',  name:'悟道·修炼', cost:20, effect:{ cult:0.10 } },
  { id:'in_atk1',   name:'悟道·锋锐', cost:30, effect:{ atk:0.08 } },
  { id:'in_def1',   name:'悟道·厚土', cost:30, effect:{ def:0.08 } },
  { id:'in_hp1',    name:'悟道·长生', cost:40, effect:{ maxhp:0.10 } },
  { id:'in_luck',   name:'悟道·天命', cost:50, effect:{ luckMax:20 } },
  { id:'in_alch',   name:'悟道·丹成', cost:40, effect:{ alch:0.08 } },
  { id:'in_crit',   name:'悟道·暴击', cost:60, effect:{ crit:0.10 } },
  { id:'in_offline',name:'悟道·闭关', cost:50, effect:{ offline:0.10 } },
];
const RANK_NAMES = ['凡夫','练气','筑基','金丹','元婴','化神','炼虚','合体','大乘','仙王'];
function duelUnlocked(){ return state.sub >= DUEL_UNLOCK_SUB; }
// 玩家战力分（用于生成对手）
function playerPower(){ return playerAtk() * 2 + playerDef() * 2 + playerMaxHp(); }
// 道行分（论道比拼）
function daoScore(){
  let s = state.sub * 100 + (state.techniques.length) * 50;
  for (const o of state.treasures) s += (o.tier || 0) * 30;
  if (state.daoPath) s += (state.daoPath.nodes || []).length * 40;
  return s;
}
// 生成对手（复用 genMonster 思路反推 atk/def/hp）
function genDuelOpponent(tier){
  const def = DUEL_TIERS[tier];
  const power = playerPower() * def.mult;
  // 简化反推：hp 占 power 一半，atk/def 各占 1/4
  const hp = Math.round(power * 0.5);
  const atk = Math.round(power * 0.25);
  const d = Math.round(power * 0.25);
  const name = DUEL_NAMES[Math.floor(Math.random() * DUEL_NAMES.length)];
  return { name, maxHp: hp, atk, def: d, tier };
}
// 斗法：进入特殊战斗（duelMode），胜得感悟，败无损
function duelOpponent(tier){
  if (!duelUnlocked()){ log(`⚔️ 需达 ${realmName(DUEL_UNLOCK_SUB)} 方可论道。`); return; }
  if (battleState || state.trib){ log('⚔️ 正忙，无法论道。'); return; }
  if (state.hp <= 0) state.hp = playerMaxHp();
  const op = genDuelOpponent(tier);
  battleState = { mon: op, monHp: op.maxHp, zone: Math.floor(state.sub/4), var:2, duelMode:true, duelTier:tier, timer:null };
  log(`⚔️ 与 ${op.name}（${DUEL_TIERS[tier].name}）斗法！`);
  renderTab();
  battleState.timer = setInterval(battleRound, BATTLE_ROUND_MS);
}
// 论道：比拼道行分
function discussDao(){
  if (!duelUnlocked()){ log(`⚔️ 需达 ${realmName(DUEL_UNLOCK_SUB)} 方可论道。`); return; }
  const myScore = daoScore();
  // 对手分 = myScore × [0.85, 1.15]
  const opScore = Math.round(myScore * (0.85 + Math.random() * 0.3));
  const opName = DUEL_NAMES[Math.floor(Math.random() * DUEL_NAMES.length)];
  if (myScore > opScore){
    const gain = 5 + Math.floor(Math.random() * 11);   // 5~15
    state.insight = (state.insight||0) + gain;
    log(`📜 与 ${opName} 论道，道行 ${myScore} > ${opScore}，胜！感悟 +${gain}。`);
  } else if (myScore === opScore){
    const gain = 3;
    state.insight = (state.insight||0) + gain;
    log(`📜 与 ${opName} 论道，道行相当 ${myScore}=${opScore}，平局，感悟 +${gain}。`);
  } else {
    log(`📜 与 ${opName} 论道，道行 ${myScore} < ${opScore}，略逊一筹，无所得。`);
  }
  refreshStats(); renderTab(); save();
}
// 点亮悟道树节点
function learnInsightNode(id){
  const node = INSIGHT_NODES.find(n => n.id === id);
  if (!node) return;
  if (state.insightTree[id]){ log('已领悟此道。'); return; }
  if ((state.insight||0) < node.cost){ log(`感悟不足，需 ${node.cost}。`); return; }
  state.insight -= node.cost;
  state.insightTree[id] = true;
  log(`🌟 领悟${node.name}！`);
  refreshStats(); renderTab(); save();
}
// 汇总悟道树加成 -> 渗透到属性函数
function insightBonus(){
  const b = { atk:0, def:0, maxhp:0, cult:0, alch:0, crit:0, luckMax:0, offline:0 };
  for (const n of INSIGHT_NODES){
    if (!state.insightTree[n.id]) continue;
    for (const k in n.effect) b[k] = (b[k]||0) + n.effect[k];
  }
  return b;
}
// 段位：由击败数累加，0~9
function duelRankName(){ return RANK_NAMES[Math.min(RANK_NAMES.length-1, state.duelRank||0)]; }
function renderDuel(){
  if (!duelUnlocked()){
    return `<div class="lock-note">需达到 ${realmName(DUEL_UNLOCK_SUB)} 方可论道斗法。</div>`;
  }
  let h = `<div class="duel-head">
    <span>📜 感悟：<b>${state.insight||0}</b></span>
    <span>🏅 段位：${duelRankName()}（${state.duelRank||0}）</span>
    <span>⚔️ 累计击败：${state.duelDefeated||0}</span>
  </div>`;
  // 斗法挑战
  h += '<div class="inv-sec"><h3>⚔️ 斗法挑战</h3><div class="zone-grid">';
  for (const d of DUEL_TIERS){
    h += `<div class="zone-card"><div class="zone-title">${d.name}（×${d.mult}）</div>
      <div class="alch-mats" style="margin-bottom:8px">${d.desc}</div>
      <button class="tab-btn" data-action="duel" data-tier="${d.id}">挑战</button></div>`;
  }
  h += '</div></div>';
  // 论道
  h += '<div class="inv-sec"><h3>📜 论道</h3>';
  h += `<p>当前道行：<b style="color:var(--gold-bright)">${daoScore()}</b></p>`;
  h += '<button class="tab-btn" data-action="discuss-dao">📜 与道友论道</button></div>';
  // 悟道树
  h += '<div class="inv-sec"><h3>🌟 悟道树</h3><div class="dao-nodes">';
  for (const n of INSIGHT_NODES){
    const learned = !!state.insightTree[n.id];
    const canLearn = !learned && (state.insight||0) >= n.cost;
    h += `<div class="dao-node ${learned?'learned dao-gold':''}">
      <b>${n.name}</b><span class="alch-note">${formatEffect(n.effect)}</span>
      <button class="tab-btn" data-action="learn-insight" data-id="${n.id}" ${learned||!canLearn?'disabled':''}>${learned?'已悟':('📜 '+n.cost)}</button>
    </div>`;
  }
  h += '</div></div>';
  return h;
}

/* ---------- 九重天劫 · Ninefold Tribulation（模块 B） ---------- */
// 劫难类型：5 种 + 飞升第 9 重混沌雷劫
const TRIB_TYPES = [
  { id:'trib_thunder', name:'雷劫',     icon:'⚡', color:'purple',  desc:'当前气血 25%~40% 真伤（无视防御）' },
  { id:'trib_fire',    name:'火劫',     icon:'🔥', color:'crimson', desc:'3 回合灼烧，共约 24% 气血真伤' },
  { id:'trib_demon',   name:'心魔劫',   icon:'👹', color:'dark',    desc:'损 20% 修为，修炼减半 90 秒' },
  { id:'trib_wind',    name:'风劫',     icon:'🌪', color:'jade',    desc:'掠走 15%~30% 灵石' },
  { id:'trib_karma',   name:'业火劫',   icon:'🔱', color:'gold',    desc:'按杀业缩放的真伤，功德可减免' },
  { id:'trib_chaos',   name:'混沌雷劫', icon:'🌩', color:'crimson', desc:'雷劫 ×2（飞升第 9 重专属）' },
];
const TRIB_TOTAL_WAVES = 9;
// 计算某重劫难的基础效果（已含境界/因果/避劫阵/天赋强度修正）
function tribBaseEffect(type, intensity){
  const maxhp = playerMaxHp();
  const wardF = Math.max(0, 1 - (caveBonus().ward || 0));        // 避劫阵每级减免 6%
  const f = intensity * wardF;
  const e = { hpLoss:0, xiuweiLoss:0, lingshiLoss:0, debuff:null, label:'无' };
  switch(type){
    case 'trib_thunder':
    case 'trib_chaos': {
      const pct = (0.25 + Math.random() * 0.15) * (type === 'trib_chaos' ? 2 : 1) * f;
      e.hpLoss = Math.round(maxhp * pct);                 // 真伤无视防御
      e.label = `真伤 ${fmt(e.hpLoss)} 气血`;
      break;
    }
    case 'trib_fire': {
      const pct = 0.24 * f;                                // 3 回合 × 8% 一次性结算
      e.hpLoss = Math.round(maxhp * pct);
      e.label = `灼烧真伤 ${fmt(e.hpLoss)} 气血`;
      break;
    }
    case 'trib_demon': {
      e.xiuweiLoss = Math.floor(state.xiuwei * 0.20 * f);
      e.debuff = { until: Date.now() + 90000, cultMult: 0.5 };
      e.label = `损修为 ${fmt(e.xiuweiLoss)}，修炼减半 90s`;
      break;
    }
    case 'trib_wind': {
      const pct = (0.15 + Math.random() * 0.15) * f;
      e.lingshiLoss = Math.floor(state.lingshi * pct);
      e.label = `掠走 ${fmt(e.lingshiLoss)} 灵石`;
      break;
    }
    case 'trib_karma': {
      const km = karmaMod();
      const kscale = 1 + Math.max(0, (km.kill || 0) - (km.merit || 0)) / 200;  // 杀业越重越痛
      const pct = (0.20 + Math.random() * 0.10) * f * kscale;
      e.hpLoss = Math.round(maxhp * pct);
      e.label = `业火真伤 ${fmt(e.hpLoss)}（杀业 ${km.kill||0}）`;
      break;
    }
  }
  return e;
}
// 劫难强度：境界/因果/飞升/轮回天赋
function tribIntensity(isFinal){
  let base = 1 + realmOf(state.sub) * 0.08;
  base *= (karmaMod().tribScale || 1);
  if (isFinal) base *= 1.5;
  base *= (1 - Math.min(0.15, talentLevel('tal_epiphany') * 0.03));  // 顿悟前尘降劫难强度
  return base;
}
function prepareTribWave(){
  const trib = state.trib;
  trib.currentType = trib.waves[trib.wave];
  trib.currentEffect = tribBaseEffect(trib.currentType, trib.intensity);
}
function startTribulation(isFinal, isEvent){
  const pool = ['trib_thunder','trib_fire','trib_demon','trib_wind','trib_karma'];
  const waves = [];
  for (let i = 0; i < 7; i++) waves.push(pool[Math.floor(Math.random() * pool.length)]);
  waves[7] = 'trib_demon';                                  // 第 8 重固定心魔劫
  waves[8] = isFinal ? 'trib_chaos' : 'trib_karma';         // 第 9 重：飞升混沌雷劫 / 业火劫
  state.trib = { waves, wave:0, totalWaves:TRIB_TOTAL_WAVES, isFinal, isEvent:!!isEvent, responses:[], intensity:tribIntensity(isFinal), fledThisTrib:false };
  prepareTribWave();
  log(`⚡ 九重天劫降临！${isFinal ? '飞升天劫' : isEvent ? '奇遇天劫' : '大境界劫'}，共 9 重，气运因果影响强度。`);
  renderTribulation();
  refreshStats();
  save();
}
// 应用应对策略：mult = 1 硬抗 / 0.4 法宝挡 / 0 服丹 / 1.5 遁避失败
function applyTribResponse(base, mult){
  return {
    hpLoss: Math.round(base.hpLoss * mult),
    xiuweiLoss: Math.round(base.xiuweiLoss * mult),
    lingshiLoss: Math.round(base.lingshiLoss * mult),
    debuff: mult > 0 ? base.debuff : null,   // 服丹(0)化解一切，包括心魔
  };
}
function respondTribulation(choice){
  const trib = state.trib;
  if (!trib) return;
  const base = trib.currentEffect;
  const tdef = TRIB_TYPES.find(x => x.id === trib.currentType);
  let eff, logMsg, resolved = true;
  if (choice === 'endure'){
    eff = applyTribResponse(base, 1);
    logMsg = `第 ${trib.wave+1}/9 重 ${tdef.icon}${tdef.name}：硬抗 - ${base.label}`;
  } else if (choice === 'treasure'){
    if (!equippedTreasure()){ log('法宝挡需先装备法宝！'); return; }
    eff = applyTribResponse(base, 0.4);
    logMsg = `第 ${trib.wave+1}/9 重 ${tdef.icon}${tdef.name}：法宝挡(×0.4) - ${eff.hpLoss||eff.xiuweiLoss||eff.lingshiLoss ? base.label : '无伤'}`;
  } else if (choice === 'pill'){
    const need = trib.isFinal ? 2 : 1;
    if ((state.inv.kangjie || 0) < need){ log(`抗劫丹不足（飞升劫需 ${need} 颗）！`); return; }
    state.inv.kangjie -= need;
    eff = applyTribResponse(base, 0);
    logMsg = `第 ${trib.wave+1}/9 重 ${tdef.icon}${tdef.name}：服抗劫丹×${need} 化解！`;
  } else if (choice === 'flee'){
    if (trib.fledThisTrib){ log('本劫已遁避失败，不可再遁！'); return; }
    const chance = 0.3 + luckFactor();
    if (Math.random() < chance){
      eff = applyTribResponse(base, 0);
      logMsg = `第 ${trib.wave+1}/9 重 ${tdef.icon}${tdef.name}：遁避成功，无损跳过！`;
    } else {
      eff = applyTribResponse(base, 1.5);
      trib.fledThisTrib = true;
      logMsg = `第 ${trib.wave+1}/9 重 ${tdef.icon}${tdef.name}：遁避失败(×1.5) - ${base.label}`;
    }
  } else { return; }
  // 应用效果
  if (eff.hpLoss) state.hp = Math.max(0, state.hp - eff.hpLoss);
  if (eff.xiuweiLoss) state.xiuwei = Math.max(0, state.xiuwei - eff.xiuweiLoss);
  if (eff.lingshiLoss) state.lingshi = Math.max(0, state.lingshi - eff.lingshiLoss);
  if (eff.debuff) state.debuff = eff.debuff;
  log(logMsg);
  if (state.hp <= 0){ state.hp = 0; return endTribulation(false); }
  trib.responses.push({ wave: trib.wave, choice });
  trib.wave += 1;
  if (trib.wave >= trib.totalWaves) return endTribulation(true);
  prepareTribWave();
  renderTribulation();
  refreshStats();
  save();
}
function endTribulation(success){
  const trib = state.trib;
  const isFinal = trib && trib.isFinal;
  const isEvent = trib && trib.isEvent;
  state.trib = null;
  document.getElementById('tribulation').classList.add('hidden');
  if (success){
    if (isEvent){
      // 奇遇天劫：熬过即得奖励，不突破
      state.inv.fragments = (state.inv.fragments || 0) + 3;
      const li = 50000 * (realmOf(state.sub) + 1);
      state.lingshi += li;
      state.hp = playerMaxHp();
      log(`🌟 熬过奇遇天劫！获法宝碎片×3、灵石 ${fmt(li)}。`);
    } else {
      log('🌟 九重天劫熬过！霞光护体，突破成功！');
      const need = xiuweiNeed(state.sub);
      state.xiuwei -= need;
      state.sub += 1;
      state.hp = playerMaxHp();
      state.stats.breakthroughs++;
      bountyProgress('break', 1);
      if (state.daoPath && state.sub > 12) state.daoPath.points = (state.daoPath.points || 0) + 1;  // 大境界突破 +1 道途点（T9）
      if (state.sub >= TOTAL_SUB){
        state.won = true;
        log('🌅 突破渡劫圆满，霞光万丈，你飞升成仙！');
        showVictory();
      } else {
        log(`✨ 突破成功！迈入 ${realmName(state.sub)}`);
        maybePromptDaoPath();   // 元婴期触发道途选择（T9）
      }
    }
  } else {
    const need = xiuweiNeed(state.sub);
    const loss = Math.floor(need * 0.5);
    state.xiuwei = Math.max(0, state.xiuwei - loss);
    state.hp = Math.max(1, Math.floor(playerMaxHp() * 0.1));
    state.debuff = { until: Date.now() + 60000, cultMult: 0.5 };
    log(`💢 天劫未能熬过！损失修为 ${fmt(loss)}，气血重创，走火入魔 60 秒。`);
    void isFinal;
  }
  refreshStats(); renderTab(); save();
}
function renderTribulation(){
  const trib = state.trib;
  const overlay = document.getElementById('tribulation');
  if (!trib){ if (overlay) overlay.classList.add('hidden'); return; }
  if (overlay) overlay.classList.remove('hidden');
  const body = document.getElementById('tribBody');
  if (!body) return;
  let dots = '';
  for (let i = 0; i < trib.totalWaves; i++){
    const cls = i < trib.wave ? 'passed' : (i === trib.wave ? 'current' : 'pending');
    dots += `<span class="trib-dot ${cls}"></span>`;
  }
  const tdef = TRIB_TYPES.find(x => x.id === trib.currentType);
  const base = trib.currentEffect || { label:'无' };
  const hasTreasure = !!equippedTreasure();
  const needPill = trib.isFinal ? 2 : 1;
  const hasPill = (state.inv.kangjie || 0) >= needPill;
  const canFlee = !trib.fledThisTrib;
  body.innerHTML = `
    <div class="trib-dots">${dots}</div>
    <div class="trib-type trib-${tdef.color}">${tdef.icon} ${tdef.name}${trib.isFinal ? ' · 飞升劫' : ''}</div>
    <div class="trib-wave">第 ${trib.wave + 1} / ${trib.totalWaves} 重</div>
    <div class="trib-preview">${tdef.desc}<br><b>预估：${base.label}</b></div>
    <div class="trib-responses">
      <button class="tab-btn" data-action="trib-endure">🛡 硬抗</button>
      <button class="tab-btn" data-action="trib-treasure" ${!hasTreasure?'disabled':''}>📿 法宝挡 ×0.4</button>
      <button class="tab-btn" data-action="trib-pill" ${!hasPill?'disabled':''}>🛡 服丹 ×${needPill} (持${state.inv.kangjie||0})</button>
      <button class="tab-btn" data-action="trib-flee" ${!canFlee?'disabled':''}>🏃 遁避 ${Math.round((0.3+luckFactor())*100)}%</button>
    </div>
    <button class="tab-btn danger-btn trib-giveup" data-action="trib-giveup">放弃渡劫</button>`;
}

/* ---------- 宗门贡献商店 ---------- */
// 分组定义，每项 { type, id, label(name), icon, desc, cost:{contribution:N} }
function sectShopItems(){
  const items = [];
  // 法宝（仅 sect 来源的三件）
  for (const t of TREASURES.filter(x => x.source === 'sect')){
    items.push({ type:'treasure', id:t.id, name:t.name, icon:t.icon, desc:t.desc, cost:t.cost || {contribution:0} });
  }
  // 宗门专属功法（仅显示当前宗门那一本）
  if (state.sect){
    const st = SECT_TECHS.find(x => x.sect === state.sect.id);
    if (st && !(state.sect.techs||[]).includes(st.id)){
      items.push({ type:'sectTech', id:st.id, name:st.name, icon:st.icon, desc:st.desc, cost:{contribution:st.cost} });
    }
  }
  // 丹药
  items.push({ type:'pill', id:'huiqi',  name:'回血丹', icon:'🩸', desc:'回满气血', cost:{contribution:30} });
  items.push({ type:'pill', id:'xiuwei', name:'修为丹', icon:'✨', desc:'立即获得修为', cost:{contribution:80} });
  items.push({ type:'pill', id:'tupo',   name:'突破丹', icon:'⚡', desc:'突破成功率 +30%', cost:{contribution:200} });
  items.push({ type:'pill', id:'kangjie',name:'抗劫丹', icon:'🛡', desc:'天劫中化解一重劫难', cost:{contribution:150} });
  return items;
}

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

/* ---------- 秘境 / 妖兽 ---------- */
const ZONE_NAMES = ['后山密林','落云谷','幽冥沼泽','万妖林','焚天火山','冰魄雪原','九幽深渊','天魔域','混沌海'];
const MON_NAMES = [
  ['野狼','毒蛇','猛虎'],
  ['石魔','风狼王','赤炎蟒'],
  ['沼泽蜥','毒沼鳄','幽魂'],
  ['嗜血蛛','妖猿','毒蛟'],
  ['火蜥蜴','熔岩巨人','炎魔'],
  ['冰狼','雪女','玄冰龟'],
  ['幽冥鬼将','血蝠王','深渊魔'],
  ['天魔','魔修','心魔'],
  ['混沌兽','混沌龙','混沌魔神'],
];
// 三档：弱 / 中 / 强 —— 以"该境满装道友预期战力"为基准
const VARIANTS = [
  { hpMul:0.9, atkMul:0.5, defMul:0.3,  lingshiMul:0.7, herb:0.35, core:0.08 },
  { hpMul:1.1, atkMul:0.7, defMul:0.45, lingshiMul:1.0, herb:0.40, core:0.18 },
  { hpMul:1.6, atkMul:0.95,defMul:0.6,  lingshiMul:1.8, herb:0.50, core:0.32 },
];
const VARIANT_NAMES = ['弱','中','强'];
function genMonster(zoneIdx, vIdx){
  const v = VARIANTS[vIdx];
  const g = Math.pow(GROW, zoneIdx);          // 该境战力基数
  const eAtk = 16 * g, eDef = 10 * g, eHp = 100 * g; // 该境满装道友预期战力
  const li = 8 * Math.pow(2.5, zoneIdx) * v.lingshiMul;
  return {
    name: MON_NAMES[zoneIdx][vIdx],
    maxHp: Math.round(eHp * v.hpMul),
    atk:   Math.round(eAtk * v.atkMul),
    def:   Math.round(eDef * v.defMul),
    lingshi: [ Math.round(li), Math.round(li * 2) ],
    herbChance: v.herb,
    coreChance: v.core,
  };
}
const zoneUnlocked = z => state.sub >= z * 4;

/* ---------- 状态 ---------- */
// 轮回元进度（跨周目保留）：T1 骨架，T2 起挂载逻辑
function defaultMeta(){
  return {
    daoFruit: 0,           // 可用道果
    reincarnations: 0,     // 累计轮回次数
    talents: {},           // { talId: level }
    lifetime: { kills:0, breakthroughs:0, meditations:0, ascensions:0 }, // 跨世累计
    bestSub: 0,            // 历史最高小阶
    unlockedPaths: [],     // 已体验过的道途（解锁图鉴）
  };
}
// v3 新增周目字段的默认值（T1 骨架，后续模块填充逻辑）
function defaultV3Fields(){
  return {
    meta: defaultMeta(),
    cave: { buildings: {} },          // 模块 C 洞府
    caveProd: { lastFieldTick: 0 },   // 灵田产出累积基准
    pets: [],                         // 模块 D 灵宠
    petSlots: 1,
    luck: 50,                         // 模块 G 气运 0~100
    karma: { kill:0, merit:0 },       // 模块 G 因果 杀业/功德
    daoPath: null,                    // 模块 H 三道 { id, points, nodes }
    daoPathChosen: false,
    insight: 0,                       // 模块 J 感悟
    insightTree: {},
    duelRank: 0,
    duelDefeated: 0,
    trib: null,                       // 模块 B 天劫进行中
    activeEvent: null,                // 模块 E 奇遇进行中
    eventCooldownAt: Date.now() + 5 * 60 * 1000,  // 下次可触发奇遇时间（初始 5 分钟）
    eventHistory: {},                 // { evId: count } 稀有事件限频
    expedition: null,                 // 模块 I 秘境深探
    inscribeFor: null,                // 模块 F 铭纹选择中的法宝 id（会话级 UI 状态）
    luckAcc: 0,                       // 气运恢复累积（秒）
  };
}
function newState(){
  return Object.assign({
    version: SAVE_VERSION,
    sub: 0,
    xiuwei: 0,
    lingshi: 0,
    hp: baseMaxHp(0),
    techniques: [],
    equip: { weapon:null, armor:null, treasure:null },
    inv: { herb:0, core:0, huiqi:1, xiuwei:0, tupo:0, kangjie:0, petEgg:0, petPill:0, fragments:0 },
    treasures: [],
    sect: null,
    bounties: [],
    bountyRefreshAt: 0,
    bountyRound: 0,
    tupoBuff: false,
    debuff: null, // 走火入魔：{ until: ms, cultMult: 0.5 }
    lastMeditate: 0,
    lastSave: Date.now(),
    stats: { kills:0, deaths:0, breakthroughs:0, meditations:0, bounties:0 },
    won: false,
    activeTab: 'zone',
    shopSubtab: 'tech',
  }, defaultV3Fields());
}
let state = newState();
let battleState = null;
// 调试/测试标志（会话级，不写入存档，正常游玩不受影响）
let debugEnabled  = false;  // 调试面板可见性
let debugGodMode  = false;  // 战斗无敌

/* ---------- 派生属性 ---------- */
// 法宝结构：[{ id, tier:0~4, inscriptions:[insId] }]（v3 迁移自 v2 的 id[]）
function normalizeTreasures(arr){
  if (!Array.isArray(arr)) return [];
  return arr.map(t => typeof t === 'string'
    ? { id:t, tier:0, inscriptions:[] }
    : Object.assign({ id:t.id, tier:0, inscriptions:[] }, t, { inscriptions: Array.isArray(t.inscriptions) ? t.inscriptions.slice() : [] }));
}
function findOwnedTreasure(id){ return state.treasures.find(t => (t.id || t) === id) || null; }
function ownsTreasure(id){ return !!findOwnedTreasure(id); }
function addTreasure(id){ if (!ownsTreasure(id)) state.treasures.push({ id, tier:0, inscriptions:[] }); }
// 合并法宝配置 + 已拥有对象的品阶/铭纹
function treasureById(id){
  const cfg = TREASURES.find(t => t.id === id);
  if (!cfg) return null;
  const o = findOwnedTreasure(id);
  return Object.assign({}, cfg, { tier: o ? (o.tier || 0) : 0, inscriptions: o ? (o.inscriptions || []).slice() : [] });
}
function equippedTreasure(){
  if (!state.equip.treasure) return null;
  return ownsTreasure(state.equip.treasure) ? treasureById(state.equip.treasure) : null;
}
// 汇总已装备法宝加成：基础效果 ×品阶系数 + 累加铭纹效果
function treasureBonus(){
  const t = equippedTreasure();
  if (!t) return {};
  const tierMult = (TREASURE_TIERS[t.tier] || TREASURE_TIERS[0]).mult;
  const b = {};
  for (const k in t.bonus) b[k] = t.bonus[k] * tierMult;
  for (const insId of t.inscriptions){
    const ins = INSCRIPTIONS.find(x => x.id === insId);
    if (!ins) continue;
    for (const k in ins.bonus) b[k] = (b[k] || 0) + ins.bonus[k];
  }
  return b;
}
function ownedTechniques(){
  return state.techniques.map(id => TECHNIQUES.find(x => x.id === id)).filter(Boolean);
}
function effectiveCultMult(){
  let m = 1;
  const techAmp = 1 + (caveBonus().techAmp || 0);   // 藏书阁放大功法效果
  for (const t of ownedTechniques()) m += t.cultBonus * techAmp;
  m += (treasureBonus().cult || 0);
  m += (sectBonus().cult || 0);
  m += (sectTechBonus().cult || 0);
  m += (samsaraBonus().cult || 0);   // 轮回天赋「灵脉觉醒」
  m += (caveBonus().cult || 0);      // 洞府「聚灵阵」
  m += (pathBonus().cult || 0);      // 道途（仙道紫气/化神）
  m += (insightBonus().cult || 0);   // 悟道树（T11）
  return m;
}
const cultRate    = () => {
  const base = autoCultPerSec(state.sub) * effectiveCultMult();
  if (state.debuff){
    if (Date.now() < state.debuff.until) return base * state.debuff.cultMult; // 走火入魔：修炼减半
    state.debuff = null; // 过期清除
  }
  return base;
};
const playerAtk   = () => Math.round((baseAtk(state.sub) + ((WEAPONS.find(x=>x.id===state.equip.weapon)||{}).atk || 0) + (sectTechBonus().atkFlat || 0)) * (1 + (treasureBonus().atk || 0)) * (1 + (samsaraBonus().atk || 0)) * (1 + (petBonus().atk || 0)) * (1 + (pathBonus().atk || 0)) * (1 + (insightBonus().atk || 0)));
const playerDef   = () => Math.round((baseDef(state.sub) + ((ARMORS.find(x=>x.id===state.equip.armor)||{}).def || 0)) * (1 + (treasureBonus().def || 0) + (sectBonus().def || 0)) * (1 + (samsaraBonus().def || 0)) * (1 + (petBonus().def || 0)) * (1 + (pathBonus().def || 0)) * (1 + (insightBonus().def || 0)));
const playerMaxHp = () => Math.round(baseMaxHp(state.sub) * (1 + (treasureBonus().maxhp || 0) + (sectBonus().maxhp || 0) + (sectTechBonus().maxhp || 0)) * (1 + (samsaraBonus().maxhp || 0)) * (1 + (caveBonus().maxhp || 0)) * (1 + (petBonus().maxhp || 0)) * (1 + (pathBonus().maxhp || 0)) * (1 + (insightBonus().maxhp || 0)));

/* ---------- 数字格式 ---------- */
function fmt(n){
  n = Math.floor(n);
  if (n < 10000)   return n.toString();
  if (n < 1e8)     return (n / 1e4).toFixed(2) + '万';
  if (n < 1e12)    return (n / 1e8).toFixed(2) + '亿';
  return (n / 1e12).toFixed(2) + '万亿';
}
function fmtDur(sec){
  sec = Math.floor(sec);
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  if (h > 0) return h + '时' + m + '分';
  if (m > 0) return m + '分' + s + '秒';
  return s + '秒';
}

/* ---------- 存档 ---------- */
// v1 -> v2 迁移：补充 v2 新字段（宗门/法宝/悬赏），版本号置 2
function migrateV1toV2(s){
  s.version = 2;
  s.equip = s.equip || {};
  s.equip.treasure = s.equip.treasure || null;
  s.treasures = Array.isArray(s.treasures) ? s.treasures : [];
  s.sect = null;
  s.sectTechs = [];
  s.bounties = [];
  s.bountyRefreshAt = 0;
  s.bountyRound = 0;
  s.stats = s.stats || {};
  s.stats.bounties = 0;
  return s;
}
// v2 -> v3 迁移：补 v3 新字段（meta 空起步、洞府/灵宠/气运/道途/论道/天劫/奇遇/深探骨架）
// treasures 结构迁移：id[] -> [{id, tier:0, inscriptions:[]}]，保留已拥有法宝、品阶归零
function migrateV2toV3(s){
  s.version = SAVE_VERSION;
  s.meta = defaultMeta();
  s.meta.bestSub = Math.max(0, s.sub || 0);
  Object.assign(s, defaultV3Fields());
  s.meta = defaultMeta();
  s.meta.bestSub = Math.max(0, s.sub || 0);
  s.inv = Object.assign({ herb:0, core:0, huiqi:0, xiuwei:0, tupo:0, kangjie:0, petEgg:0, petPill:0, fragments:0 }, s.inv || {});
  s.treasures = normalizeTreasures(s.treasures);   // id[] -> [{id,tier:0,inscriptions:[]}]
  // 已达元婴期(sub>=12)的老档视为已选道途，避免强制弹窗
  s.daoPathChosen = (s.sub && s.sub >= 12) ? true : false;
  s.eventCooldownAt = Date.now() + 5 * 60 * 1000; // 初始奇遇冷却 5 分钟
  return s;
}
function save(){
  state.lastSave = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch(e){}
}
function load(){
  try {
    let raw = localStorage.getItem(SAVE_KEY);
    // 迁移链：v3 缺失则尝试 v2 -> v1，逐级迁移后写入 v3
    if (!raw){
      const v2raw = localStorage.getItem(SAVE_KEY_V2);
      if (v2raw){
        const v2 = JSON.parse(v2raw);
        if (v2 && v2.version === 2){
          migrateV2toV3(v2);
          raw = JSON.stringify(v2);
          localStorage.setItem(SAVE_KEY, raw);
          try { localStorage.setItem(SAVE_KEY_V2 + '_bak', v2raw); } catch(e){}
          localStorage.removeItem(SAVE_KEY_V2);
          log('📦 存档已迁移至 v3，旧档已备份。');
        }
      }
    }
    if (!raw){
      const v1raw = localStorage.getItem(SAVE_KEY_V1);
      if (v1raw){
        const v1 = JSON.parse(v1raw);
        if (v1 && v1.version === 1){
          migrateV1toV2(v1);   // v1 -> v2
          migrateV2toV3(v1);   // v2 -> v3
          raw = JSON.stringify(v1);
          localStorage.setItem(SAVE_KEY, raw);
          try { localStorage.setItem(SAVE_KEY_V1 + '_bak', v1raw); } catch(e){}
          localStorage.removeItem(SAVE_KEY_V1);
          log('📦 存档已迁移至 v3，旧档已备份。');
        }
      }
    }
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s) return false;
    if (s.version !== SAVE_VERSION){
      // 版本不兼容：备份旧档并提示，避免静默清档
      try { localStorage.setItem(SAVE_KEY + '_bak', raw); } catch(e){}
      localStorage.removeItem(SAVE_KEY);
      log(`⚠️ 存档版本(v${s.version})与当前(v${SAVE_VERSION})不兼容，已备份旧档并重新开始。`);
      return false;
    }
    state = Object.assign(newState(), s);
    state.techniques = Array.isArray(s.techniques) ? s.techniques.slice() : [];
    state.inv   = Object.assign({herb:0,core:0,huiqi:0,xiuwei:0,tupo:0,kangjie:0,petEgg:0,petPill:0,fragments:0}, s.inv || {});
    state.equip = Object.assign({weapon:null,armor:null,treasure:null}, s.equip || {});
    state.treasures = normalizeTreasures(s.treasures);
    state.sect = (s.sect && s.sect.id) ? { id:s.sect.id, contribution:s.sect.contribution||0, switches:s.sect.switches||0, techs:Array.isArray(s.sect.techs)?s.sect.techs.slice():[] } : null;
    state.bounties = Array.isArray(s.bounties) ? s.bounties : [];
    state.bountyRefreshAt = s.bountyRefreshAt || 0;
    state.bountyRound = s.bountyRound || 0;
    state.stats = Object.assign({kills:0,deaths:0,breakthroughs:0,meditations:0,bounties:0}, s.stats || {});
    state.debuff = (s.debuff && typeof s.debuff.until === 'number') ? s.debuff : null;
    state.shopSubtab = s.shopSubtab || 'tech';
    state.activeTab = ['zone','shop','alchemy','inventory','sect','cave','pet','duel'].includes(s.activeTab) ? s.activeTab : 'zone';
    // v3 字段规范化（防旧档/损坏存档缺字段）
    state.meta = Object.assign(defaultMeta(), s.meta || {});
    state.meta.lifetime = Object.assign({kills:0,breakthroughs:0,meditations:0,ascensions:0}, (s.meta && s.meta.lifetime) || {});
    state.meta.talents = (s.meta && s.meta.talents) ? Object.assign({}, s.meta.talents) : {};
    state.meta.unlockedPaths = (s.meta && Array.isArray(s.meta.unlockedPaths)) ? s.meta.unlockedPaths.slice() : [];
    state.cave = s.cave ? Object.assign({buildings:{}}, s.cave) : {buildings:{}};
    state.caveProd = s.caveProd ? Object.assign({lastFieldTick:0}, s.caveProd) : {lastFieldTick:0};
    state.pets = Array.isArray(s.pets) ? s.pets.slice() : [];
    state.petSlots = s.petSlots || 1;
    state.luck = (typeof s.luck === 'number') ? s.luck : 50;
    state.karma = Object.assign({kill:0,merit:0}, s.karma || {});
    state.daoPath = s.daoPath || null;
    state.daoPathChosen = !!s.daoPathChosen;
    state.insight = s.insight || 0;
    state.insightTree = (s.insightTree && typeof s.insightTree === 'object') ? Object.assign({}, s.insightTree) : {};
    state.duelRank = s.duelRank || 0;
    state.duelDefeated = s.duelDefeated || 0;
    state.trib = null;                       // 天劫进行中状态不跨会话保留，重置
    state.activeEvent = null;                // 奇遇进行中不跨会话保留
    state.eventCooldownAt = s.eventCooldownAt || 0;
    state.eventHistory = (s.eventHistory && typeof s.eventHistory === 'object') ? Object.assign({}, s.eventHistory) : {};
    state.expedition = null;                 // 深探进行中不跨会话保留
    state.inscribeFor = null;                // 铭纹选择 UI 状态不跨会话保留
    state.luckAcc = (typeof s.luckAcc === 'number') ? s.luckAcc : 0;
    // 离线收益
    const dt = Math.min(offlineCapSec(), (Date.now() - (s.lastSave || Date.now())) / 1000);
    if (dt > 60 && !state.won){
      const gain = autoCultPerSec(state.sub) * effectiveCultMult() * dt * OFFLINE_EFF * (1 + (insightBonus().offline || 0));
      state.xiuwei += gain;
      log(`🌙 闭关 ${fmtDur(dt)}，修炼得修为 ${fmt(gain)}`);
      caveOfflineProduce(dt);   // 洞府灵田离线产出
    }
    if (state.hp <= 0 || state.hp > playerMaxHp()) state.hp = playerMaxHp();
    return true;
  } catch(e){ return false; }
}
function resetGame(){
  if (!confirm('确定要散去修为、重新开始吗？存档将被清除。')) return;
  localStorage.removeItem(SAVE_KEY);
  state = newState();
  clearBattle();
  document.getElementById('victory').classList.add('hidden');
  log('轮回重启，再踏仙途。');
  render(); save();
}

/* ---------- 日志 ---------- */
const MAX_LOG = 40;
function log(msg){
  const box = document.getElementById('log');
  if (!box) return;
  const line = document.createElement('div');
  line.className = 'logline';
  line.textContent = msg;
  box.appendChild(line);
  while (box.children.length > MAX_LOG) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
}

/* ---------- 主循环 ---------- */
let lastTick = Date.now();
let hiddenSince = null;
const TICK_DT_CAP = 300; // 单次结算上限(秒)，防后台节流/睡眠造成爆发性收益
function tick(){
  const now = Date.now();
  const dt = Math.min(TICK_DT_CAP, (now - lastTick) / 1000);
  lastTick = now;
  if (state.won || document.hidden) return;
  if (state.debuff && Date.now() >= state.debuff.until) state.debuff = null; // 走火入魔到期
  if (state.sect && state.bounties.length && state.bountyRefreshAt && Date.now() >= state.bountyRefreshAt){
    if (!state.bounties.every(b => b.claimed)){
      state.bountyRound = (state.bountyRound||0) + 1;
      state.bounties = generateBounties();
      log(`📜 悬赏榜定时更新（第 ${state.bountyRound} 批）。`);
    }
    state.bountyRefreshAt = Date.now() + BOUNTY_REFRESH_MS;
  }
  // 奇遇事件：非战斗/非天劫/非事件中，且冷却结束时按概率触发（模块 E）
  if (!battleState && !state.trib && !state.activeEvent && state.eventCooldownAt && now >= state.eventCooldownAt){
    if (Math.random() < EVENT_TRIGGER_P) triggerEvent();
  }
  // 气运恢复：每分钟 +1（悟道树「天命」提升上限）
  const lmax = luckMaxCap();
  if (state.luck < lmax){
    state.luckAcc = (state.luckAcc || 0) + dt;
    while (state.luckAcc >= 60){ state.luckAcc -= 60; state.luck = Math.min(lmax, state.luck + 1); }
  }
  state.xiuwei  += cultRate() * dt;
  state.lingshi += lingshiPerSec() * dt;
  // 洞府灵田：按等级产出灵草（含境界递增），小数累积
  const herbPerSec = caveFieldHerbPerSec();
  if (herbPerSec > 0){
    state.caveProd.herbAcc = (state.caveProd.herbAcc || 0) + herbPerSec * dt;
    while (state.caveProd.herbAcc >= 1){ state.inv.herb++; state.caveProd.herbAcc -= 1; }
  }
  // 藏书阁：每半小时有几率顿悟一本未习功法（低概率防白嫖）
  const libLv = caveBuildingLv('cave_library');
  if (libLv > 0 && now - (state.caveProd.lastLibTick || 0) >= 30 * 60 * 1000){
    state.caveProd.lastLibTick = now;
    const unowned = TECHNIQUES.filter((t, i) => !state.techniques.includes(t.id) && i <= realmOf(state.sub) + 1);
    if (unowned.length && Math.random() < 0.05 * libLv){
      const got = unowned[Math.floor(Math.random() * unowned.length)];
      state.techniques.push(got.id);
      log(`📚 藏书阁顿悟！于残卷中领悟功法「${got.name}」！`);
    }
  }
  if (!battleState && state.hp < playerMaxHp()){
    state.hp = Math.min(playerMaxHp(), state.hp + regenPerSec(state.sub) * dt);
  }
  refreshStats();
  if (battleState) refreshBattle();
}
// 页面隐藏期间按"离线"结算(有上限、半效率)，避免挂机不关页绕过离线上限
function onVisibility(){
  if (document.hidden){
    hiddenSince = Date.now();
    pauseBattle();
  } else {
    if (hiddenSince !== null){
      const dur = (Date.now() - hiddenSince) / 1000;
      hiddenSince = null;
      if (dur > 60 && !state.won){
        const capped = Math.min(offlineCapSec(), dur);
        const gain = autoCultPerSec(state.sub) * effectiveCultMult() * capped * OFFLINE_EFF * (1 + (insightBonus().offline || 0));
        state.xiuwei += gain;
        log(`🌙 闭关 ${fmtDur(capped)}，修炼得修为 ${fmt(gain)}`);
        caveOfflineProduce(capped);   // 洞府灵田离线产出
        // 已结算离线收益，重置 tick 基准，避免恢复后 tick 再按满效率补算这一段（重复结算）。
        // 短时离开(<=60s)不计离线收益，不重置 lastTick，由 tick 按正常 dt 顺延，不丢失进度。
        lastTick = Date.now();
      }
    }
    if (state.activeTab === 'zone') resumeBattle();
  }
}

/* ---------- 打坐 ---------- */
function meditate(){
  if (state.won) return;
  const now = Date.now();
  if (now - state.lastMeditate < MEDITATE_CD) return;
  state.lastMeditate = now;
  const gain = cultRate() * MEDITATE_MULT * (samsaraBonus().meditateMul || 1);  // 轮回天赋「宿慧通明」加成打坐
  state.xiuwei += gain;
  state.stats.meditations++;
  bountyProgress('med', 1);
  floatText('+' + fmt(gain));
  log(`🧘 打坐吐纳，修为 +${fmt(gain)}`);
  refreshStats(); save();
}

/* ---------- 突破 ---------- */
function doBreakthrough(){
  if (state.won || battleState || state.trib) return;
  const need = xiuweiNeed(state.sub);
  if (state.xiuwei < need) return;
  const isFinal = state.sub === TOTAL_SUB - 1;
  const isMajor = subOf(state.sub) === 3; // 圆满 -> 下一大境（最终渡劫亦属大境界）
  if (isFinal && state.lingshi < TRIB_COST){
    log(`⚡ 渡劫需灵石 ${fmt(TRIB_COST)}，不足！`);
    return;
  }
  if (isMajor){
    // 大境界突破（含飞升）-> 九重天劫，不再单次概率判定（模块 B）
    if (isFinal){ state.lingshi -= TRIB_COST; log('⚡⚡ 天劫降临，九霄雷劫轰下！'); }
    else log('🌀 大境界突破！九重天劫降临…');
    return startTribulation(isFinal);
  }
  // 小境界突破：沿用高成功率判定（含轮回天赋/luckFactor 微调）
  let chance = breakthroughChance(state.sub);
  if (state.tupoBuff){ chance = Math.min(0.99, chance + 0.3); state.tupoBuff = false; }
  if (Math.random() < chance){
    state.xiuwei -= need;
    state.sub += 1;
    state.hp = playerMaxHp();
    state.stats.breakthroughs++;
    bountyProgress('break', 1);
    if (state.daoPath && state.sub > 12) state.daoPath.points = (state.daoPath.points || 0) + 1;  // 大境界突破 +1 道途点（T9）
    log(`✨ 突破成功！迈入 ${realmName(state.sub)}`);
    maybePromptDaoPath();   // 元婴期触发道途选择（T9）
  } else {
    const loss = Math.floor(need * 0.3);
    state.xiuwei = Math.max(0, state.xiuwei - loss);
    log(`💢 突破失败，修为反噬，损失修为 ${fmt(loss)}，需再行积累。`);
  }
  refreshStats(); renderTab(); save();
}

/* ---------- 战斗 ---------- */
function dmgCalc(atk, def){ return Math.max(1, Math.round((atk - def) * (0.85 + Math.random() * 0.3))); }
// 战斗定时器生命周期：切走秘境标签或页面隐藏时暂停，回来再续；重置时彻底清除
function pauseBattle(){ if (battleState && battleState.timer){ clearInterval(battleState.timer); battleState.timer = null; } }
function resumeBattle(){ if (battleState && !battleState.timer && !state.won && state.activeTab === 'zone'){ battleState.timer = setInterval(battleRound, BATTLE_ROUND_MS); } }
function clearBattle(){ if (battleState && battleState.timer) clearInterval(battleState.timer); battleState = null; }
function startBattle(z, v){
  if (battleState || state.won || state.trib) return;
  if (state.hp <= 0) state.hp = playerMaxHp();
  const mon = genMonster(z, v);
  battleState = { mon, monHp: mon.maxHp, zone:z, var:v, timer:null };
  log(`⚔️ 你闯入${ZONE_NAMES[z]}，遭遇 ${mon.name}！`);
  renderTab();
  battleState.timer = setInterval(battleRound, BATTLE_ROUND_MS);
}
function battleRound(){
  const b = battleState; if (!b) return;
  // 玩家攻击（含灵宠暴击：偶发 1.8 倍）
  let pdRaw = dmgCalc(playerAtk(), b.mon.def);
  const crit = (petBonus().crit || 0) + (insightBonus().crit || 0);
  let critMul = 1;
  if (crit > 0 && Math.random() < crit) critMul = 1.8;
  const pd = Math.round(pdRaw * (1 + (sectBonus().dmg || 0)) * critMul);
  b.monHp -= pd;
  const ls = (treasureBonus().lifesteal || 0) + (pathBonus().lifesteal || 0);
  if (ls > 0 && state.hp < playerMaxHp()){
    state.hp = Math.min(playerMaxHp(), state.hp + Math.max(1, Math.round(pd * ls)));
  }
  // 灵宠助战伤害段（玩家攻击后追加）
  const petDmg = petAttackDamage(b);
  if (petDmg > 0) b.monHp -= petDmg;
  if (b.monHp <= 0){ b.monHp = 0; return endBattle(true); }
  if (debugGodMode){ refreshBattle(); return; } // 无敌：玩家不受伤，妖兽仍受伤
  // 妖兽攻击（受灵宠防御修正：玄冰甲/魅惑/撼地）
  let md = dmgCalc(b.mon.atk, playerDef()) * petDefenseFactor();
  state.hp -= Math.round(md);
  if (state.hp <= 0){ state.hp = 0; return endBattle(false); }
  refreshBattle();
}
function endBattle(win){
  const b = battleState;
  clearInterval(b.timer);
  // 斗法论道战斗：胜得感悟+段位，败无损（不扣灵石/修为）（模块 J）
  if (b.duelMode){
    battleState = null;
    if (win){
      const gain = 10 + (b.duelTier||0) * 5 + (state.duelRank||0) * 2;
      state.insight = (state.insight||0) + gain;
      state.duelDefeated = (state.duelDefeated||0) + 1;
      state.duelRank = Math.min(RANK_NAMES.length - 1, Math.floor(state.duelDefeated / 3));
      log(`⚔️ 斗法胜 ${b.mon.name}！感悟 +${gain}，段位 ${duelRankName()}。`);
    } else {
      state.hp = Math.max(1, Math.floor(playerMaxHp() * 0.3));
      log(`⚔️ 斗法败于 ${b.mon.name}，切磋无伤大雅，仅余喘息。`);
    }
    refreshStats(); renderTab(); save();
    return;
  }
  // 秘境深探战斗：回写到 expedition，不触发普通结算/掉落（模块 I）
  if (b.expeditionMode){
    battleState = null;
    if (win){
      state.stats.kills++;
      resolveExpeditionRoom(b.mon._expRoom || 'battle', true);
    } else {
      // 深探战败：撤出，仅得 50% 奖励
      log(`💀 深探战败，被迫撤出秘境。`);
      exitExpedition(true);
    }
    return;
  }
  if (win){
    const li = Math.round(b.mon.lingshi[0] + Math.random() * (b.mon.lingshi[1] - b.mon.lingshi[0]));
    const liGain = Math.round(li * (1 + (treasureBonus().lingshi || 0)));
    state.lingshi += liGain;
    state.stats.kills++;
    state.karma.kill = (state.karma.kill || 0) + 1;   // 因果：每杀 +1 杀业
    bountyProgress('kill', 1, b.zone);
    const drops = [];
    const dropBonus = (petBonus().drop || 0) + (karmaMod().dropScale - 1);   // 九尾狐 + 功德掉落加成
    if (Math.random() < b.mon.herbChance * (1 + dropBonus)){ state.inv.herb++; drops.push('灵草×1'); }
    if (Math.random() < b.mon.coreChance * (1 + dropBonus)){ state.inv.core++; drops.push('妖核×1'); }
    if (b.var === 2 && Math.random() < TREASURE_DROP_CHANCE * (1 + dropBonus)){
      const dropId = TREASURE_DROP_ORDER[Math.min(TREASURE_DROP_ORDER.length-1, Math.floor(b.zone/3))];
      const tr = TREASURES.find(x=>x.id===dropId);
      if (tr && !ownsTreasure(dropId)){
        addTreasure(dropId);
        drops.push(`法宝 ${tr.icon}${tr.name}`);
      } else if (tr){
        // 已拥有此法宝，折灵石以作补偿
        state.lingshi += TREASURE_DUP_REFUND;
        drops.push(`法宝 ${tr.icon}${tr.name}(已有) 折灵石 ${fmt(TREASURE_DUP_REFUND)}`);
      }
    }
    // 灵宠亲和成长 + 强怪灵宠掉落
    const petDrop = petOnBattleWin(b);
    if (petDrop) drops.push(petDrop);
    log(`🏆 击杀 ${b.mon.name}，得灵石 ${fmt(liGain)}${drops.length ? '，掉落 ' + drops.join('、') : ''}`);
  } else {
    const lossLi = Math.floor(state.lingshi * 0.2);
    const lossXw = Math.floor(state.xiuwei * 0.1);
    state.lingshi -= lossLi; state.xiuwei -= lossXw;
    state.hp = 1;
    state.stats.deaths++;
    log(`💀 你被 ${b.mon.name} 击败，重伤遁逃，损失灵石 ${fmt(lossLi)}、修为 ${fmt(lossXw)}`);
  }
  battleState = null;
  refreshStats(); renderTab(); save();
}
function fleeBattle(){
  if (!battleState) return;
  clearInterval(battleState.timer);
  // 斗法中认输：无损结束
  if (battleState.duelMode){
    battleState = null;
    log('⚔️ 斗法认输，无伤收场。');
    refreshStats(); renderTab(); save();
    return;
  }
  // 秘境深探中逃走 = 撤出（得 50%）
  if (battleState.expeditionMode){
    battleState = null;
    log('🏃 深探中遁走，撤出秘境。');
    exitExpedition(true);
    return;
  }
  const lossLi = Math.floor(state.lingshi * 0.05);
  state.lingshi -= lossLi;
  log(`🏃 你狼狈逃走，遗落灵石 ${fmt(lossLi)}。`);
  battleState = null;
  refreshStats(); renderTab(); save();
}

/* ---------- 商店 / 炼丹 / 物品 ---------- */
function buyTechnique(id){
  const t = TECHNIQUES.find(x => x.id === id);
  if (!t || state.techniques.includes(id) || state.lingshi < t.cost) return;
  state.lingshi -= t.cost;
  state.techniques.push(id);
  log(`📕 习得功法 ${t.name}，修炼速度提升！`);
  save();
}
function buyWeapon(id){
  const w = WEAPONS.find(x => x.id === id);
  if (!w || state.equip.weapon === id || state.lingshi < w.cost) return;
  const curIdx = WEAPONS.findIndex(x => x.id === state.equip.weapon);
  const newIdx = WEAPONS.findIndex(x => x.id === id);
  if (curIdx >= 0 && newIdx < curIdx){ log('⚔️ 已有更高阶兵器，无需购入低阶。'); return; }
  const oldW = state.equip.weapon ? WEAPONS.find(x => x.id === state.equip.weapon) : null;
  if (oldW){ const refund = Math.floor(oldW.cost * 0.5); state.lingshi += refund; log(`♻️ 旧兵器 ${oldW.name} 折价回收，返还灵石 ${fmt(refund)}。`); }
  state.lingshi -= w.cost;
  state.equip.weapon = id;
  log(`⚔️ 购得 ${w.name} 并装备。`);
  save();
}
function buyArmor(id){
  const a = ARMORS.find(x => x.id === id);
  if (!a || state.equip.armor === id || state.lingshi < a.cost) return;
  const curIdx = ARMORS.findIndex(x => x.id === state.equip.armor);
  const newIdx = ARMORS.findIndex(x => x.id === id);
  if (curIdx >= 0 && newIdx < curIdx){ log('🛡️ 已有更高阶护甲，无需购入低阶。'); return; }
  const oldA = state.equip.armor ? ARMORS.find(x => x.id === state.equip.armor) : null;
  if (oldA){ const refund = Math.floor(oldA.cost * 0.5); state.lingshi += refund; log(`♻️ 旧护甲 ${oldA.name} 折价回收，返还灵石 ${fmt(refund)}。`); }
  state.lingshi -= a.cost;
  state.equip.armor = id;
  log(`🛡️ 购得 ${a.name} 并装备。`);
  save();
}
function buyPill(id){
  const price = SHOP_PILL_PRICE[id];
  if (state.lingshi < price) return;
  state.lingshi -= price;
  state.inv[id]++;
  log(`💊 购得 ${PILL_DEFS[id].name}。`);
  save();
}
function craft(id){
  const r = RECIPES.find(x => x.id === id);
  if (!r || state.lingshi < r.cost) return;
  for (const k in r.mats) if ((state.inv[k] || 0) < r.mats[k]) return;
  state.lingshi -= r.cost;
  for (const k in r.mats) state.inv[k] -= r.mats[k];
  if (Math.random() < alchemyChance()){
    state.inv[r.out]++;
    bountyProgress('craft', 1);
    log(`⚗️ 炼丹成功，得 ${PILL_DEFS[r.out].name}！`);
  } else {
    log(`⚗️ 炼丹失败，材料化为灰烬，损耗灵石 ${fmt(r.cost)}。`);
  }
  save();
}
function usePill(id){
  if ((state.inv[id] || 0) <= 0) return;
  state.inv[id]--;
  if (id === 'huiqi'){ state.hp = playerMaxHp(); log('🩸 服下回血丹，气血充盈。'); }
  else if (id === 'xiuwei'){ const g = Math.round(pillXiuwei(state.sub) * (1 + (sectBonus().pillXiuwei || 0) + (sectTechBonus().pillXiuweiMul || 0))); state.xiuwei += g; log(`✨ 服下修为丹，修为 +${fmt(g)}。`); }
  else if (id === 'tupo'){ state.tupoBuff = true; log('⚡ 服下突破丹，下次突破成功率提升。'); }
  save();
}
function equipTreasure(id){
  if (!ownsTreasure(id)) return;
  const t = TREASURES.find(x=>x.id===id);
  if (state.equip.treasure === id){ state.equip.treasure = null; log(`📿 卸下法宝 ${t.name}`); }
  else { state.equip.treasure = id; log(`📿 装备法宝 ${t.name}`); }
  refreshStats(); renderTab(); save();
}
// 炼器炉建成后解锁
function forgeUnlocked(){ return caveBuildingLv('cave_forge') > 0; }
// 法宝升阶：消耗灵石+妖核+碎片+灵宠丹，成功率 = 0.6 + 炼器炉×0.05 + luckFactor
function refineTreasure(id){
  if (!forgeUnlocked()){ log('🔨 需先在「仙府」建造炼器炉。'); return; }
  const o = findOwnedTreasure(id);
  if (!o){ log('无此法宝。'); return; }
  if (o.tier >= TREASURE_TIERS.length - 1){ log('🔨 此法宝已达神器品阶，无法再升。'); return; }
  const tier = o.tier + 1;
  const cost = { lingshi: Math.round(20000 * Math.pow(3, tier)), core: tier * 3, fragments: tier * 2, petPill: tier >= 3 ? tier - 2 : 0 };
  if (state.lingshi < cost.lingshi){ log(`💎 灵石不足，需 ${fmt(cost.lingshi)}。`); return; }
  if ((state.inv.core||0) < cost.core){ log(`💀 妖核不足，需 ${cost.core}。`); return; }
  if ((state.inv.fragments||0) < cost.fragments){ log(`💎 法宝碎片不足，需 ${cost.fragments}。`); return; }
  if ((state.inv.petPill||0) < cost.petPill){ log(`💊 灵宠丹不足，需 ${cost.petPill}。`); return; }
  const chance = 0.6 + caveBonus().forge + luckFactor();
  state.lingshi -= cost.lingshi;
  state.inv.core -= cost.core;
  state.inv.fragments -= cost.fragments;
  if (cost.petPill) state.inv.petPill -= cost.petPill;
  if (Math.random() < chance){
    o.tier += 1;
    const t = TREASURES.find(x=>x.id===id);
    log(`🔨 ${t.icon}${t.name} 升阶为${TREASURE_TIERS[o.tier].name}！`);
  } else {
    state.inv.fragments = (state.inv.fragments||0) + Math.floor(cost.fragments * 0.5);  // 失败返还 50% 碎片
    log(`🔨 升阶失败，材料损耗，返还 50% 法宝碎片。`);
  }
  refreshStats(); renderTab(); save();
}
// 铭纹槽 = 品阶数（凡器0/灵器1/.../神器4）
function treasureSlotCount(tier){ return tier; }
// 镶嵌铭纹到空槽
function inscribeTreasure(id, insId){
  const o = findOwnedTreasure(id);
  if (!o){ log('无此法宝。'); return; }
  const slots = treasureSlotCount(o.tier);
  if (o.inscriptions.length >= slots){ log('🔗 铭纹槽已满。'); return; }
  const ins = INSCRIPTIONS.find(x=>x.id===insId);
  if (!ins) return;
  if ((state.inv[insId]||0) <= 0){ log(`🔗 需先分解获得 ${ins.name}。`); return; }
  state.inv[insId] -= 1;
  o.inscriptions.push(insId);
  const t = TREASURES.find(x=>x.id===id);
  log(`🔗 ${t.icon}${t.name} 镶嵌${ins.name}！`);
  refreshStats(); renderTab(); save();
}
// 拆卸铭纹（损耗 1，不返还）
function removeInscription(id, slotIdx){
  const o = findOwnedTreasure(id);
  if (!o) return;
  if (slotIdx < 0 || slotIdx >= o.inscriptions.length) return;
  o.inscriptions.splice(slotIdx, 1);
  const t = TREASURES.find(x=>x.id===id);
  log(`🔗 ${t.icon}${t.name} 拆卸一枚铭纹（损耗）。`);
  refreshStats(); renderTab(); save();
}
// 分解材料 -> 铭纹：妖核/灵草/功法残卷/法宝碎片
function disassembleItem(type, id){
  const map = { core:{ins:'ins_atk',  mat:'core',      need:5}, herb:{ins:'ins_hp', mat:'herb', need:10},
                tech:{ins:'ins_cult', mat:'fragments', need:3},  frag:{ins:'ins_luck',mat:'fragments', need:8} };
  const m = map[type];
  if (!m) return;
  if (type === 'tech'){
    // 分解功法残卷：仅在拥有法宝碎片时转化为悟道纹（避免随意删功法）
    if ((state.inv.fragments||0) < m.need){ log(`🔗 分解悟道纹需法宝碎片×${m.need}。`); return; }
    state.inv.fragments -= m.need;
  } else {
    if ((state.inv[m.mat]||0) < m.need){ log(`🔗 ${MAT_DEFS[m.mat] ? MAT_DEFS[m.mat].name : '材料'}不足，需 ${m.need}。`); return; }
    state.inv[m.mat] -= m.need;
  }
  state.inv[m.ins] = (state.inv[m.ins]||0) + 1;
  const ins = INSCRIPTIONS.find(x=>x.id===m.ins);
  log(`🔗 分解得 ${ins.icon}${ins.name}×1`);
  refreshStats(); renderTab(); save();
}
function joinSect(id){
  if (state.sect) return;
  if (state.sub < SECT_UNLOCK_SUB){ log(`🏯 需达到 ${realmName(SECT_UNLOCK_SUB)} 方可拜入宗门。`); return; }
  const s = SECTS.find(x=>x.id===id);
  if (!s) return;
  state.sect = { id, contribution:0, switches:0, techs:[] };
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
  state.sect.techs = [];
  state.sect.switches = times + 1;
  const s = SECTS.find(x=>x.id===id);
  log(`🏯 转投 ${s.name}，花费灵石 ${fmt(cost)}。${s.desc}`);
  refreshStats(); renderTab(); save();
}
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
  if (!b || b.claimed) return;
  // hoard(积攒)类无进度埋点，持有灵石达标即可领取；其余类型须 done
  if (b.type === 'hoard'){
    if (state.lingshi < b.target){ log(`📜 需持有 ${fmt(b.target)} 灵石方可领取。`); return; }
  } else if (!b.done){
    return;
  }
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

/* ---------- 浮动数字 ---------- */
function floatText(txt){
  const btn = document.getElementById('meditateBtn');
  if (!btn) return;
  const f = document.createElement('div');
  f.className = 'float-text';
  f.textContent = txt;
  const r = btn.getBoundingClientRect();
  f.style.left = (r.left + r.width / 2) + 'px';
  f.style.top  = r.top + 'px';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 800);
}

/* ---------- 渲染：数值与按钮状态 ---------- */
function refreshStats(){
  document.getElementById('realmLabel').textContent = state.won ? '飞升大仙' : realmName(state.sub);
  // 道印头像显示当前大境首字（练/筑/金/元/化/炼/合/大/渡），飞升显示「仙」
  const avatarEl = document.getElementById('avatar');
  if (avatarEl) avatarEl.textContent = state.won ? '仙' : REALMS[Math.min(realmOf(state.sub), REALMS.length - 1)][0];
  const need = xiuweiNeed(state.sub);
  document.getElementById('xiuweiBar').style.width = Math.min(100, state.xiuwei / need * 100) + '%';
  document.getElementById('xiuweiText').textContent = fmt(state.xiuwei) + ' / ' + fmt(need);
  document.getElementById('lingshiText').textContent = fmt(state.lingshi);
  const daoEl = document.getElementById('daoFruitText');
  if (daoEl) daoEl.textContent = fmt((state.meta && state.meta.daoFruit) || 0);
  const luckEl = document.getElementById('luckText');
  if (luckEl) luckEl.textContent = Math.round(state.luck || 0);
  const luckChip = document.getElementById('luckChip');
  if (luckChip) luckChip.classList.toggle('low', (state.luck || 0) < 20);
  document.getElementById('hpBar').style.width = Math.max(0, state.hp / playerMaxHp() * 100) + '%';
  document.getElementById('hpText').textContent = fmt(Math.max(0, state.hp)) + '/' + fmt(playerMaxHp());

  document.getElementById('cultRateText').textContent = fmt(cultRate()) + '/秒';
  document.getElementById('xiuweiText2').textContent = fmt(state.xiuwei);
  // 洞府灵田产出提示（有灵田时显示）
  const herbLine = document.getElementById('herbProdLine');
  if (herbLine){
    const herbMin = caveFieldHerbPerSec() * 60;
    if (herbMin > 0){ herbLine.classList.remove('hidden'); document.getElementById('herbProdText').textContent = herbMin.toFixed(1); }
    else herbLine.classList.add('hidden');
  }
  document.getElementById('atkText').textContent = fmt(playerAtk());
  document.getElementById('defText').textContent = fmt(playerDef());
  document.getElementById('techText').textContent =
    ownedTechniques().map(t => t.name).join('、') || '无';
  document.getElementById('treasureText').textContent = equippedTreasure() ? equippedTreasure().name : '无';

  const now = Date.now();
  const med = document.getElementById('meditateBtn');
  med.disabled = state.won || (now - state.lastMeditate < MEDITATE_CD);

  const br = document.getElementById('breakBtn');
  const isFinal = state.sub === TOTAL_SUB - 1;
  const isMajor = subOf(state.sub) === 3;
  if (state.won){ br.disabled = true; br.textContent = '已成仙'; }
  else if (state.trib){ br.disabled = true; br.textContent = '⚡ 天劫进行中…'; }
  else if (battleState){ br.disabled = true; br.textContent = '✨ 突破境界'; }
  else if (state.xiuwei >= need){
    br.disabled = false;
    if (isFinal) br.textContent = `⚡ 渡劫飞升 (需${fmt(TRIB_COST)}灵石)`;
    else if (isMajor) br.textContent = `🌀 大境界突破 · 九重天劫`;
    else {
      // 小境界突破显示成功率（与 doBreakthrough 一致，含突破丹/轮回天赋）
      let dispChance = breakthroughChance(state.sub);
      if (state.tupoBuff) dispChance = Math.min(0.99, dispChance + 0.3);
      br.textContent = `✨ 突破 ${Math.round(dispChance * 100)}%`;
    }
  } else {
    br.disabled = true;
    br.textContent = '✨ 突破境界';
  }
  // 走火入魔状态显示
  const dl = document.getElementById('debuffLine');
  if (dl){
    if (state.debuff && Date.now() < state.debuff.until){
      const remain = Math.ceil((state.debuff.until - Date.now()) / 1000);
      dl.textContent = `⚠️ 走火入魔：修炼减半 剩余 ${remain}s`;
      dl.classList.remove('hidden');
    } else {
      dl.classList.add('hidden');
    }
  }
  // 兵解轮回：渡劫期(sub>=32)且未飞升可主动轮回（道果 -30% 折扣）
  const armyBtn = document.getElementById('reincarnArmyBtn');
  if (armyBtn){
    const canArmy = !state.won && !battleState && state.sub >= 32;
    armyBtn.classList.toggle('hidden', !canArmy);
    armyBtn.disabled = !!battleState;
  }
  updateDebugBadge();
  refreshTabButtons();
}

function refreshTabButtons(){
  const t = state.activeTab;
  if (t === 'zone')      refreshZoneBtns();
  else if (t === 'shop') refreshShopBtns();
  else if (t === 'alchemy')  refreshAlchemyBtns();
  else if (t === 'inventory')refreshInventoryBtns();
  else if (t === 'sect') refreshSectBtns();
  else if (t === 'cave') refreshCaveBtns();
  else if (t === 'pet')  refreshPetBtns();
  else if (t === 'duel') refreshDuelBtns();
}
function refreshDuelBtns(){
  document.querySelectorAll('#tabContent [data-action="learn-insight"]').forEach(b => {
    const node = INSIGHT_NODES.find(n => n.id === b.dataset.id);
    if (!node){ b.disabled = true; return; }
    b.disabled = !!state.insightTree[node.id] || (state.insight||0) < node.cost;
  });
}
function refreshPetBtns(){
  const slots = petMaxSlots();
  document.querySelectorAll('#tabContent [data-action="equip-pet"]').forEach(b => {
    const pet = state.pets.find(p => p.uid === b.dataset.id);
    if (!pet){ b.disabled = true; return; }
    b.disabled = !pet.equipped && equippedPets().length >= slots;
  });
  document.querySelectorAll('#tabContent [data-action="evolve-pet"]').forEach(b => {
    const pet = state.pets.find(p => p.uid === b.dataset.id);
    if (!pet || pet.star >= PET_MAX_STAR){ b.disabled = true; return; }
    const c = petEvolveCost(pet.star);
    b.disabled = (state.inv.petPill||0) < c.petPill || (state.inv.core||0) < c.core || state.lingshi < c.lingshi;
  });
}
function refreshCaveBtns(){
  document.querySelectorAll('#tabContent [data-action="upgrade-cave"]').forEach(b => {
    const def = CAVE_BUILDINGS.find(x => x.id === b.dataset.id);
    const lv = caveBuildingLv(def.id);
    if (lv >= CAVE_MAX_LEVEL){ b.disabled = true; return; }
    if (!cavePrereqMet(def)){ b.disabled = true; return; }
    b.disabled = state.lingshi < def.prices[lv];
  });
}
function refreshZoneBtns(){
  document.querySelectorAll('#tabContent [data-action="fight"]').forEach(b => {
    b.disabled = !!battleState || state.won || state.hp <= 0;
  });
  const flee = document.querySelector('#tabContent [data-action="flee"]');
  if (flee) flee.disabled = !battleState;
}
function refreshShopBtns(){
  document.querySelectorAll('#tabContent [data-action="buy-tech"]').forEach(b => {
    const t = TECHNIQUES.find(x => x.id === b.dataset.id);
    b.disabled = state.techniques.includes(b.dataset.id) || state.lingshi < t.cost;
  });
  const curW = WEAPONS.findIndex(x => x.id === state.equip.weapon);
  document.querySelectorAll('#tabContent [data-action="buy-weapon"]').forEach(b => {
    const w = WEAPONS.find(x => x.id === b.dataset.id);
    const idx = WEAPONS.findIndex(x => x.id === b.dataset.id);
    b.disabled = state.equip.weapon === b.dataset.id || state.lingshi < w.cost || (curW >= 0 && idx < curW);
  });
  const curA = ARMORS.findIndex(x => x.id === state.equip.armor);
  document.querySelectorAll('#tabContent [data-action="buy-armor"]').forEach(b => {
    const a = ARMORS.find(x => x.id === b.dataset.id);
    const idx = ARMORS.findIndex(x => x.id === b.dataset.id);
    b.disabled = state.equip.armor === b.dataset.id || state.lingshi < a.cost || (curA >= 0 && idx < curA);
  });
  document.querySelectorAll('#tabContent [data-action="buy-pill"]').forEach(b => {
    b.disabled = state.lingshi < SHOP_PILL_PRICE[b.dataset.id];
  });
}
function refreshAlchemyBtns(){
  document.querySelectorAll('#tabContent [data-action="craft"]').forEach(b => {
    const r = RECIPES.find(x => x.id === b.dataset.id);
    let ok = state.lingshi >= r.cost;
    for (const k in r.mats) if ((state.inv[k] || 0) < r.mats[k]) ok = false;
    b.disabled = !ok;
  });
}
function refreshInventoryBtns(){
  document.querySelectorAll('#tabContent [data-action="use-pill"]').forEach(b => {
    b.disabled = (state.inv[b.dataset.id] || 0) <= 0;
  });
}
function refreshSectBtns(){
  document.querySelectorAll('#tabContent [data-action="join-sect"]').forEach(b => {
    b.disabled = !!state.sect || state.sub < SECT_UNLOCK_SUB;
  });
  document.querySelectorAll('#tabContent [data-action="switch-sect"]').forEach(b => {
    const times = (state.sect && state.sect.switches) || 0;
    const cost = Math.round(SECT_SWITCH_BASE * Math.pow(2, times));
    b.disabled = !state.sect || state.lingshi < cost;
  });
  const rb = document.querySelector('#tabContent [data-action="refresh-bounty"]');
  if (rb) rb.disabled = state.lingshi < BOUNTY_MANUAL_COST;
  document.querySelectorAll('#tabContent [data-action="buy-sect-item"]').forEach(b => {
    const items = sectShopItems();
    const item = items.find(x => x.type === b.dataset.type && x.id === b.dataset.id);
    const owned = item && ((item.type === 'treasure' && ownsTreasure(item.id)) ||
                           (item.type === 'sectTech' && (state.sect && (state.sect.techs||[]).includes(item.id))));
    b.disabled = !state.sect || !item || (state.sect.contribution < (item.cost.contribution||0)) || owned;
  });
}

/* ---------- 渲染：各面板 ---------- */
function renderCave(){
  const cb = caveBonus();
  const herbMin = (caveFieldHerbPerSec() * 60).toFixed(1);
  let h = `<div class="cave-head">
    <span>🌿 灵草产出：<b>${herbMin}</b>/分</span>
    <span>💎 灵石：<b>${fmt(state.lingshi)}</b></span>
  </div>`;
  h += '<div class="zone-grid cave-grid">';
  for (const b of CAVE_BUILDINGS){
    const lv = caveBuildingLv(b.id);
    const maxed = lv >= CAVE_MAX_LEVEL;
    const prereqMet = cavePrereqMet(b);
    const cost = maxed ? 0 : b.prices[lv];
    const stars = '★'.repeat(lv) + '☆'.repeat(CAVE_MAX_LEVEL - lv);
    let lockNote = '';
    if (!prereqMet){
      const dep = CAVE_BUILDINGS.find(x => x.id === b.prereq[0]);
      lockNote = `🔒 需${dep.name} ${b.prereq[1]} 级`;
    }
    h += `<div class="zone-card cave-card ${lv>0?'built':''} ${!prereqMet?'locked':''}">`;
    h += `<div class="cave-card-head"><span class="cave-icon">${b.icon}</span><span class="zone-title">${b.name}</span><span class="cave-stars">${stars}</span></div>`;
    h += `<div class="cave-effect">${b.effect}</div>`;
    if (lv > 0) h += `<div class="cave-cur">当前 ${lv} 级</div>`;
    if (maxed) h += `<div class="cave-maxed">已满级</div>`;
    else if (prereqMet) h += `<button class="tab-btn" data-action="upgrade-cave" data-id="${b.id}">${lv===0?'建造':'升级'} 💎${fmt(cost)}</button>`;
    else h += `<div class="lock-note">${lockNote}</div>`;
    h += `</div>`;
  }
  h += '</div>';
  h += `<div class="alch-note">洞府加成：修炼×${(1+cb.cult).toFixed(2)} · 灵石×${(1+cb.lingshi).toFixed(2)} · 气血×${(1+cb.maxhp).toFixed(2)} · 炼丹+${Math.round(cb.alch*100)}%${cb.ward>0?' · 天劫减免'+Math.round(cb.ward*100)+'%':''}</div>`;
  return h;
}
function renderPet(){
  const slots = petMaxSlots();
  if (slots <= 0){
    return `<div class="lock-note">🔒 需先在「仙府」建造兽栏，方可开启灵宠系统。</div>`;
  }
  const eq = equippedPets();
  let h = `<div class="pet-head">
    <span>🐾 出战槽位：<b>${eq.length}/${slots}</b></span>
    <span>🥚 灵兽卵×${state.inv.petEgg||0}</span>
    <span>💊 灵宠丹×${state.inv.petPill||0}</span>
    <button class="tab-btn" data-action="hatch-pet" ${(state.inv.petEgg||0)<=0?'disabled':''}>🥚 孵化</button>
  </div>`;
  const pb = petBonus();
  h += `<div class="alch-note">出战加成：攻+${Math.round((pb.atk||0)*100)}% · 防+${Math.round((pb.def||0)*100)}% · 血+${Math.round((pb.maxhp||0)*100)}%${pb.crit>0?' · 暴击'+Math.round(pb.crit*100)+'%':''}${pb.luck>0?' · 气运+'+Math.round(pb.luck):''}${pb.drop>0?' · 掉落+'+Math.round(pb.drop*100)+'%':''}</div>`;
  if (!state.pets.length){
    h += '<div class="lock-note">尚无灵宠。击杀"强"档妖兽有几率掉落，或孵化灵兽卵可得。</div>';
    return h;
  }
  h += '<div class="pet-grid">';
  for (const pet of state.pets){
    const sp = petSpecies(pet.speciesId);
    if (!sp) continue;
    const stars = '★'.repeat(pet.star) + '☆'.repeat(PET_MAX_STAR - pet.star);
    const affNeed = petAffinityNeed(pet.level);
    const affPct = Math.min(100, pet.affinity / affNeed * 100);
    const canEvolve = pet.star < PET_MAX_STAR;
    const cost = canEvolve ? petEvolveCost(pet.star) : null;
    h += `<div class="pet-card ${pet.equipped?'equipped':''}">
      <div class="pet-card-head"><span class="pet-icon">${sp.icon}</span><span class="pet-name">${sp.name}</span><span class="cave-stars">${stars}</span></div>
      <div class="pet-info">Lv.${pet.level} · ${sp.skill}（${sp.skillDesc}）</div>
      <div class="pet-aff">亲和 ${pet.affinity}/${affNeed}<div class="hpbar"><div class="bar self" style="width:${affPct}%"></div></div></div>
      <div class="pet-actions">
        <button class="tab-btn" data-action="equip-pet" data-id="${pet.uid}">${pet.equipped?'卸下':'出战'}</button>
        ${canEvolve ? `<button class="tab-btn" data-action="evolve-pet" data-id="${pet.uid}">升星 (💊${cost.petPill} 💀${cost.core} 💎${fmt(cost.lingshi)})</button>` : '<span class="cave-maxed">已满星</span>'}
      </div>
    </div>`;
  }
  h += '</div>';
  return h;
}
function renderTab(){
  const c = document.getElementById('tabContent');
  if (state.activeTab === 'zone')        c.innerHTML = renderZone();
  else if (state.activeTab === 'shop')   c.innerHTML = renderShop();
  else if (state.activeTab === 'alchemy')c.innerHTML = renderAlchemy();
  else if (state.activeTab === 'inventory') c.innerHTML = renderInventory();
  else if (state.activeTab === 'sect')   c.innerHTML = renderSect();
  else if (state.activeTab === 'cave')   c.innerHTML = renderCave();
  else if (state.activeTab === 'pet')    c.innerHTML = renderPet();
  else if (state.activeTab === 'duel')   c.innerHTML = renderDuel();
  refreshTabButtons();
}
function renderBattleUI(){
  const b = battleState;
  return `<div class="battle">
    <div class="battle-foe">
      <div class="fname">${b.mon.name}</div>
      <div class="hpbar"><div class="bar foe" id="monHpBar" style="width:${b.monHp/b.mon.maxHp*100}%"></div></div>
      <div class="hptext" id="monHpText">${fmt(b.monHp)}/${fmt(b.mon.maxHp)}</div>
    </div>
    <div class="vs">⚔️</div>
    <div class="battle-self">
      <div class="fname">道友</div>
      <div class="hpbar"><div class="bar self" id="battleHpBar" style="width:${state.hp/playerMaxHp()*100}%"></div></div>
      <div class="hptext" id="battleHpText">${fmt(Math.max(0,state.hp))}/${fmt(playerMaxHp())}</div>
    </div>
    <button class="tab-btn flee-btn" data-action="flee">🏃 逃走</button>
  </div>`;
}
function refreshBattle(){
  const b = battleState; if (!b) return;
  const mb = document.getElementById('monHpBar');
  if (mb){
    mb.style.width = Math.max(0, b.monHp / b.mon.maxHp * 100) + '%';
    document.getElementById('monHpText').textContent = fmt(Math.max(0, b.monHp)) + '/' + fmt(b.mon.maxHp);
  }
  const hb = document.getElementById('battleHpBar');
  if (hb){
    hb.style.width = Math.max(0, state.hp / playerMaxHp() * 100) + '%';
    document.getElementById('battleHpText').textContent = fmt(Math.max(0, state.hp)) + '/' + fmt(playerMaxHp());
  }
}
function renderZone(){
  let h = '';
  // 秘境深探进行中：切换为探索地图视图（模块 I）
  if (state.expedition && !battleState){
    h += renderExpedition();
    return h;
  }
  if (battleState) h += renderBattleUI();
  h += '<div class="zone-grid">';
  for (let z = 0; z < ZONE_NAMES.length; z++){
    const unl = zoneUnlocked(z);
    h += `<div class="zone-card ${unl ? '' : 'locked'}">`;
    h += `<div class="zone-title">${unl ? ZONE_NAMES[z] : '🔒 未知秘境'}</div>`;
    if (unl){
      h += '<div class="mon-list">';
      for (let v = 0; v < 3; v++){
        const m = genMonster(z, v);
        h += `<button class="tab-btn mon-btn" data-action="fight" data-zone="${z}" data-var="${v}">
          <span class="mon-name"><span class="mon-tier">${VARIANT_NAMES[v]}</span>${m.name}</span>
          <span class="mon-stat">❤${fmt(m.maxHp)} ⚔${m.atk} 🛡${m.def}</span>
          <span class="mon-reward">💎${fmt(m.lingshi[0])}~${fmt(m.lingshi[1])}</span>
        </button>`;
      }
      h += '</div>';
      h += `<button class="tab-btn deep-btn" data-action="start-expedition" data-zone="${z}">🗺️ 深入秘境</button>`;
    } else {
      h += `<div class="lock-note">需达到 ${realmName(z * 4)}</div>`;
    }
    h += '</div>';
  }
  h += '</div>';
  return h;
}
function renderShop(){
  // 集市子分类导航：功法/兵器/护甲/丹药
  const sub = state.shopSubtab || 'tech';
  const SUBS = [
    { key:'tech',   icon:'📕', label:'功法' },
    { key:'weapon', icon:'⚔️', label:'兵器' },
    { key:'armor',  icon:'🛡️', label:'护甲' },
    { key:'pill',   icon:'💊', label:'丹药' },
  ];
  let h = '<div class="subtabs">';
  for (const s of SUBS){
    h += `<button class="subtab ${sub===s.key?'active':''}" data-action="shop-subtab" data-sub="${s.key}">${s.icon} ${s.label}</button>`;
  }
  h += '</div>';

  if (sub === 'tech'){
    h += '<div class="shop-sec"><h3>📕 功法</h3><div class="item-list">';
    for (const t of TECHNIQUES){
      const owned = state.techniques.includes(t.id);
      h += `<div class="item"><div class="item-info"><b>${t.name}</b><span>修炼速度 +${Math.round(t.cultBonus*100)}%</span></div>
        <button class="tab-btn" data-action="buy-tech" data-id="${t.id}" ${owned?'disabled':''}>${owned?'已习得':'💎 '+fmt(t.cost)}</button></div>`;
    }
    h += '</div></div>';
  } else if (sub === 'weapon'){
    h += '<div class="shop-sec"><h3>⚔️ 武器</h3><div class="item-list">';
    const curW = WEAPONS.findIndex(x => x.id === state.equip.weapon);
    for (let i = 0; i < WEAPONS.length; i++){
      const w = WEAPONS[i];
      const eq = state.equip.weapon === w.id;
      const lower = curW >= 0 && i < curW;
      const label = eq ? '已装备' : (lower ? '低阶' : '💎 ' + fmt(w.cost));
      h += `<div class="item"><div class="item-info"><b>${w.name}</b><span>攻击 +${w.atk}</span></div>
        <button class="tab-btn" data-action="buy-weapon" data-id="${w.id}" ${eq||lower?'disabled':''}>${label}</button></div>`;
    }
    h += '</div></div>';
  } else if (sub === 'armor'){
    h += '<div class="shop-sec"><h3>🛡️ 护甲</h3><div class="item-list">';
    const curA = ARMORS.findIndex(x => x.id === state.equip.armor);
    for (let i = 0; i < ARMORS.length; i++){
      const a = ARMORS[i];
      const eq = state.equip.armor === a.id;
      const lower = curA >= 0 && i < curA;
      const label = eq ? '已装备' : (lower ? '低阶' : '💎 ' + fmt(a.cost));
      h += `<div class="item"><div class="item-info"><b>${a.name}</b><span>防御 +${a.def}</span></div>
        <button class="tab-btn" data-action="buy-armor" data-id="${a.id}" ${eq||lower?'disabled':''}>${label}</button></div>`;
    }
    h += '</div></div>';
  } else if (sub === 'pill'){
    h += '<div class="shop-sec"><h3>💊 丹药</h3><div class="item-list">';
    for (const id of ['huiqi','xiuwei','tupo']){
      const p = PILL_DEFS[id];
      h += `<div class="item"><div class="item-info"><b>${p.icon} ${p.name}</b><span>${p.desc}</span></div>
        <button class="tab-btn" data-action="buy-pill" data-id="${id}">💎 ${fmt(SHOP_PILL_PRICE[id])}</button></div>`;
    }
    h += '</div></div>';
  }
  return h;
}
function renderAlchemy(){
  let h = `<div class="alch-mats"><b>🎒 材料：</b> 🌿灵草×${state.inv.herb}　💀妖核×${state.inv.core}　🛡抗劫丹×${state.inv.kangjie||0}</div>`;
  h += '<div class="item-list">';
  for (const r of RECIPES){
    if (r.requires && !(((state.cave && state.cave.buildings && state.cave.buildings[r.requires]) || 0) > 0)) continue;  // 未解锁配方跳过
    const p = PILL_DEFS[r.out];
    const mats = Object.entries(r.mats).map(([k,n]) => `${MAT_DEFS[k].icon}${MAT_DEFS[k].name}×${n}`).join(' ');
    h += `<div class="item"><div class="item-info"><b>${p.icon} ${p.name}</b><span>${r.desc}</span></div>
      <button class="tab-btn" data-action="craft" data-id="${r.id}">⚗️ 炼制 (💎${fmt(r.cost)} ${mats})</button></div>`;
  }
  h += '</div>';
  h += `<div class="alch-note">当前炼丹成功率：${Math.round(alchemyChance()*100)}%（随境界提升）</div>`;
  return h;
}
function renderInventory(){
  const w = WEAPONS.find(x => x.id === state.equip.weapon);
  const a = ARMORS.find(x => x.id === state.equip.armor);
  let h = '<div class="inv-sec"><h3>📜 道行</h3>';
  h += `<p>境界：${state.won?'飞升':realmName(state.sub)}　|　击杀 ${state.stats.kills}　战败 ${state.stats.deaths}　突破 ${state.stats.breakthroughs}　打坐 ${state.stats.meditations}</p></div>`;
  h += '<div class="inv-sec"><h3>📕 已习功法</h3><p>' + (ownedTechniques().map(t => t.name).join('、') || '尚无') + '</p></div>';
  h += `<div class="inv-sec"><h3>⚔️ 装备</h3><p>武器：${w?w.name+' (攻+'+w.atk+')':'空手'}　护甲：${a?a.name+' (防+'+a.def+')':'无'}</p></div>`;
  h += '<div class="inv-sec"><h3>📿 法宝</h3>';
  const eqT = equippedTreasure();
  h += `<p>已装备：${eqT ? eqT.icon+eqT.name+' ('+eqT.desc+')' : '无'}</p>`;
  if (state.treasures.length){
    h += '<div class="item-list">';
    for (const o of state.treasures){
      const t = treasureById(o.id);
      if (!t) continue;
      const eq = state.equip.treasure === o.id;
      const tier = TREASURE_TIERS[o.tier||0];
      const slots = treasureSlotCount(o.tier||0);
      let insHtml = '';
      for (let s = 0; s < slots; s++){
        const insId = (o.inscriptions||[])[s];
        const ins = insId ? INSCRIPTIONS.find(x=>x.id===insId) : null;
        insHtml += `<span class="ins-slot ${ins?'filled':''}">${ins ? ins.icon : '○'}</span>`;
      }
      const canRefine = forgeUnlocked() && (o.tier||0) < TREASURE_TIERS.length - 1;
      const canInscribe = slots > (o.inscriptions||[]).length;
      h += `<div class="item trs-item trs-${tier.color}">
        <div class="item-info"><b>${t.icon} ${t.name} <small class="trs-tier">${tier.name}</small></b>
        <span>${t.desc}${slots>0?' · 铭纹 '+insHtml:''}</span></div>
        <div class="trs-actions">
          <button class="tab-btn" data-action="equip-treasure" data-id="${o.id}">${eq?'卸下':'装备'}</button>
          ${canRefine ? `<button class="tab-btn" data-action="refine-treasure" data-id="${o.id}">🔨升阶</button>` : ''}
          ${canInscribe ? `<button class="tab-btn" data-action="inscribe-treasure" data-id="${o.id}">🔗铭纹</button>` : ''}
        </div></div>`;
      // 铭纹选择子面板
      if (state.inscribeFor === o.id && canInscribe){
        h += '<div class="inscribe-panel">选择铭纹镶嵌：';
        let hasAny = false;
        for (const ins of INSCRIPTIONS){
          const cnt = state.inv[ins.id] || 0;
          if (cnt > 0){
            hasAny = true;
            h += `<button class="tab-btn" data-action="inscribe-with" data-trid="${o.id}" data-id="${ins.id}">${ins.icon}${ins.name}×${cnt}</button> `;
          }
        }
        if (!hasAny) h += '<span class="lock-note">无可用铭纹，先分解材料获得。</span>';
        h += ` <button class="tab-btn" data-action="inscribe-cancel">取消</button></div>`;
      }
    }
    h += '</div>';
    // 铭纹库存 + 分解
    h += '<div class="alch-note">铭纹库存：';
    let anyIns = false;
    for (const ins of INSCRIPTIONS){
      const cnt = state.inv[ins.id] || 0;
      if (cnt > 0){ anyIns = true; h += `${ins.icon}${ins.name}×${cnt}　`; }
    }
    if (!anyIns) h += '尚无（分解妖核/灵草/法宝碎片可得）';
    h += '</div>';
  } else {
    h += '<p style="font-size:12px;color:var(--muted-dim)">尚无法宝（击杀"强"档妖兽或宗门兑换可得）</p>';
  }
  h += '</div>';
  h += `<div class="inv-sec"><h3>🎒 储物袋</h3><p>🌿灵草×${state.inv.herb}　💀妖核×${state.inv.core}　🛡抗劫丹×${state.inv.kangjie||0}　💎碎片×${state.inv.fragments||0}　🥚灵兽卵×${state.inv.petEgg||0}　💊灵宠丹×${state.inv.petPill||0}</p><div class="item-list">`;
  for (const id of ['huiqi','xiuwei','tupo']){
    const p = PILL_DEFS[id];
    h += `<div class="item"><div class="item-info"><b>${p.icon} ${p.name}</b><span>${p.desc}　×${state.inv[id]}</span></div>
      <button class="tab-btn" data-action="use-pill" data-id="${id}">使用</button></div>`;
  }
  h += '</div>';
  // 分解（炼器炉解锁后）
  if (forgeUnlocked()){
    h += '<div class="alch-note">分解得铭纹：';
    h += `<button class="tab-btn" data-action="disassemble" data-type="core">💀妖核×5->锋锐纹</button> `;
    h += `<button class="tab-btn" data-action="disassemble" data-type="herb">🌿灵草×10->长生纹</button> `;
    h += `<button class="tab-btn" data-action="disassemble" data-type="frag">💎碎片×8->天命纹</button>`;
    h += '</div>';
  }
  h += '</div>';
  h += '<div class="inv-sec danger"><h3>⚙️ 存档</h3>';
  h += '<button class="tab-btn" data-action="save">💾 保存</button> ';
  h += '<button class="tab-btn danger-btn" data-action="reset">🔄 散功重修</button></div>';
  return h;
}
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
  // 道途分支区（元婴期后显示，模块 H）
  if (state.sub >= DAO_UNLOCK_SUB || state.daoPath){
    h += `<div class="inv-sec"><h3>🌟 道途</h3>`;
    h += renderDaoPath();
    h += `</div>`;
  }
  return h;
}
// 宗门贡献商店
function buySectItem(type, id){
  if (!state.sect) return;
  const items = sectShopItems();
  const item = items.find(x => x.type === type && x.id === id);
  if (!item) return;
  const cnt = item.cost.contribution || 0;
  if (state.sect.contribution < cnt){ log(`🏯 贡献不足，需 ${cnt} 贡献。`); return; }
  state.sect.contribution -= cnt;
  if (type === 'treasure'){
    if (ownsTreasure(id)){ log(`🏯 已有此法宝。`); state.sect.contribution += cnt; return; }
    addTreasure(id);
    const tr = TREASURES.find(x=>x.id===id);
    log(`🏯 兑换法宝 ${tr.icon}${tr.name}！`);
  } else if (type === 'sectTech'){
    if (!state.sect.techs) state.sect.techs = [];
    if (state.sect.techs.includes(id)){ log(`🏯 已习得此秘传。`); state.sect.contribution += cnt; return; }
    state.sect.techs.push(id);
    const st = SECT_TECHS.find(x=>x.id===id);
    log(`🏯 习得宗门秘传 ${st.icon}${st.name}！`);
  } else if (type === 'pill'){
    state.inv[id]++;
    log(`🏯 兑换 ${PILL_DEFS[id].name}。`);
  }
  refreshStats(); renderTab(); save();
}
function renderSectShop(){
  if (!state.sect) return '';
  const items = sectShopItems();
  if (!items.length) return '';
  let h = '<div class="inv-sec"><h3>🛒 贡献商店</h3>';
  h += `<p style="font-size:12px;color:var(--muted);margin-bottom:8px">可用贡献：<b style="color:var(--gold-bright)">${fmt(state.sect.contribution)}</b></p>`;
  h += '<div class="item-list">';
  for (const item of items){
    const cnt = item.cost.contribution || 0;
    const aff = state.sect.contribution >= cnt;
    const tag = item.type === 'treasure' ? '[法宝]' : (item.type === 'sectTech' ? '[秘传]' : '[丹药]');
    const owned = (item.type === 'treasure' && ownsTreasure(item.id)) ||
                  (item.type === 'sectTech' && (state.sect.techs||[]).includes(item.id));
    h += `<div class="item"><div class="item-info"><b>${item.icon} ${item.name} <small style="color:var(--jade-dim)">${tag}</small></b><span>${item.desc}</span></div>
      <button class="tab-btn" data-action="buy-sect-item" data-type="${item.type}" data-id="${item.id}" ${(!aff||owned)?'disabled':''}>${owned?'已拥有':'🏯 '+cnt}</button></div>`;
  }
  h += '</div></div>';
  return h;
}
function renderBountyBoard(){
  if (!state.sect) return '';
  const remain = Math.max(0, Math.ceil((state.bountyRefreshAt - Date.now()) / 1000));
  let h = '<div class="inv-sec"><h3>📜 悬赏榜</h3>';
  h += `<div class="alch-mats" style="margin-bottom:8px">第 ${state.bountyRound||0} 批 · 定时刷新 ${fmtDur(remain)}
    <button class="tab-btn" data-action="refresh-bounty" style="margin-left:8px">💎 ${fmt(BOUNTY_MANUAL_COST)} 立即刷新</button></div>`;
  h += '<div class="item-list">';
  for (const b of state.bounties){
    // hoard 类按当前持有灵石动态判定可领取；其余按 done
    const ready = !b.claimed && (b.type === 'hoard' ? state.lingshi >= b.target : b.done);
    let status;
    if (b.claimed) status = '✓已领取';
    else if (b.type === 'hoard') status = state.lingshi >= b.target ? '★可领取' : `持有 ${fmt(state.lingshi)}/${fmt(b.target)}`;
    else status = b.done ? '★可领取' : `${b.progress}/${b.target}`;
    const rewardStr = `💎${fmt(b.reward.lingshi)} +🏯${b.reward.contribution}${b.reward.herb?' +🌿1':''}${b.reward.core?' +💀1':''}`;
    h += `<div class="item"><div class="item-info"><b>${b.label}：${b.desc}</b>
      <span>奖励 ${rewardStr}　|　${status}</span></div>
      <button class="tab-btn" data-action="claim-bounty" data-id="${b.id}" ${!ready?'disabled':''}>${b.claimed?'已领':'领取'}</button></div>`;
  }
  h += '</div></div>';
  return h;
}

/* ---------- 轮回天赋树面板 ---------- */
function renderSamsakaTree(){
  const root = document.getElementById('samsakaTreeBody');
  if (!root) return;
  const daoFruit = (state.meta && state.meta.daoFruit) || 0;
  const reinc = (state.meta && state.meta.reincarnations) || 0;
  const bestSub = (state.meta && state.meta.bestSub) || 0;
  let h = `<div class="samsaka-head">
    <div>💎 可用道果：<b>${daoFruit}</b></div>
    <div class="samsaka-meta">🔄 已轮回 <b>${reinc}</b> 世　·　历史最高 ${bestSub>=TOTAL_SUB?'飞升':realmName(Math.min(bestSub, TOTAL_SUB-1))}</div>
  </div>`;
  h += '<div class="samsaka-grid">';
  for (const t of SAMSAKA_TALENTS){
    const lv = talentLevel(t.id);
    const maxed = lv >= SAMSAKA_MAX_LEVEL;
    const cost = talentNextCost(t.id);
    const aff = !maxed && daoFruit >= cost;
    let stars = '';
    for (let i = 0; i < SAMSAKA_MAX_LEVEL; i++) stars += i < lv ? '★' : '☆';
    h += `<div class="samsaka-node ${lv>0?'learned':''} ${maxed?'maxed':''}">
      <div class="sn-head"><span class="sn-icon">${t.icon}</span><b>${t.name}</b><span class="sn-branch">${t.branch}</span></div>
      <div class="sn-stars">${stars} <small>Lv ${lv}/${SAMSAKA_MAX_LEVEL}</small></div>
      <div class="sn-effect">${t.effect.replace('{L-1}', 'L-1')}</div>
      <button class="tab-btn" data-action="buy-talent" data-id="${t.id}" ${(!aff||maxed)?'disabled':''}>${maxed?'已圆满':('💎 '+cost+' 升级')}</button>
    </div>`;
  }
  h += '</div>';
  const L = (state.meta.lifetime) || {kills:0,breakthroughs:0,meditations:0,ascensions:0};
  h += `<div class="samsaka-life">累计跨世：击杀 ${L.kills} · 突破 ${L.breakthroughs} · 打坐 ${L.meditations} · 飞升 ${L.ascensions}</div>`;
  root.innerHTML = h;
}
function openSamsakaTree(){
  renderSamsakaTree();
  const m = document.getElementById('samsakaTree');
  if (m) m.classList.remove('hidden');
}
function closeSamsakaTree(){
  const m = document.getElementById('samsakaTree');
  if (m) m.classList.add('hidden');
}

/* ---------- 胜利 ---------- */
function showVictory(){
  const previewFruit = settleDaoFruit(state.sub, true);  // 预结算（点击轮回转世才正式入账）
  const dp = state.daoPath ? daoPathDef(state.daoPath.id) : null;
  const pathName = dp ? dp.name : '未择道途';
  const ending = dp ? dp.ending : '得道飞升';
  // 魔道需煞气（杀业）达标，否则 Bad End 提示
  let endingNote = '';
  if (dp && dp.id === 'dao_demon' && (state.karma.kill||0) < 50){
    endingNote = '<br><span style="color:var(--crimson-bright);font-size:12px">⚠️ 煞气不足，魔道根基不稳，此世飞升未能圆满。</span>';
  }
  document.getElementById('victoryText').innerHTML =
    `你历经 <b>${state.stats.breakthroughs}</b> 次突破、击杀 <b>${state.stats.kills}</b> 妖兽、` +
    `打坐 <b>${state.stats.meditations}</b> 次，道途「${pathName}」，${ending}！${endingNote}<br>` +
    `<span class="dao-fruit-line">💎 本世结算道果 <b>+${previewFruit}</b>　（轮回转世后入账，可点亮轮回天赋树）</span>`;
  document.getElementById('victory').classList.remove('hidden');
}

/* ---------- 调试/测试面板（会话级，不存档） ---------- */
function toggleDebug(){
  debugEnabled = !debugEnabled;
  const panel = document.getElementById('debugPanel');
  if (panel) panel.classList.toggle('hidden', !debugEnabled);
  // 同步面板内控件状态
  const godBtn = document.getElementById('dbgGodBtn');
  if (godBtn) godBtn.textContent = '无敌：' + (debugGodMode ? '开' : '关');
  const inp = document.getElementById('dbgSubInput');
  if (inp) inp.value = state.sub;
  updateDebugBadge();
}

function updateDebugBadge(){
  const badge = document.getElementById('debugBadge');
  if (!badge) return;
  if (!debugEnabled && !debugGodMode){ badge.classList.add('hidden'); return; }
  badge.classList.remove('hidden');
  const parts = [];
  if (debugEnabled) parts.push('测试模式');
  if (debugGodMode) parts.push('无敌');
  badge.textContent = parts.join(' · ');
}

function dbgAddXiuwei(mode){
  const need = xiuweiNeed(state.sub);
  if (mode === 'fill')     state.xiuwei = need;          // 填满至当前需求
  else if (mode === '10x') state.xiuwei += need * 10;    // +10 倍当前需求
  log(`⚙️ [调试] 修为调整至 ${fmt(state.xiuwei)}`);
  refreshStats(); save();
}

function dbgAddLingshi(mode){
  if (mode === '1m')      state.lingshi += 1000000;      // +100 万
  else if (mode === '10x') state.lingshi *= 10;          // ×10
  log(`⚙️ [调试] 灵石调整至 ${fmt(state.lingshi)}`);
  refreshStats(); save();
}

function dbgSetSub(sub){
  const clamped = Math.max(0, Math.min(TOTAL_SUB - 1, Math.floor(sub)));
  state.sub = clamped;
  state.xiuwei = 0;
  state.hp = playerMaxHp();
  state.debuff = null;
  clearBattle();
  const inp = document.getElementById('dbgSubInput');
  if (inp) inp.value = clamped;
  log(`⚙️ [调试] 境界设为 ${realmName(state.sub)} (sub=${state.sub})`);
  refreshStats(); renderTab(); save();
}

function dbgMaxHp(){
  state.hp = playerMaxHp();
  log(`⚙️ [调试] 气血回满`);
  refreshStats(); save();
}

function dbgGiveItems(){
  // 材料/丹药各 +10：herb, core, huiqi, xiuwei, tupo
  state.inv.herb   += 10;
  state.inv.core   += 10;
  state.inv.huiqi  += 10;
  state.inv.xiuwei += 10;
  state.inv.tupo   += 10;
  log(`⚙️ [调试] 材料/丹药各 +10`);
  refreshStats(); renderTab(); save();
}

function dbgUnlockZones(){
  // sub=32（渡劫期初期）时 9 个秘境全部可见；若已更高则保持
  state.sub = Math.max(state.sub, 32);
  state.hp = playerMaxHp();
  clearBattle();
  const inp = document.getElementById('dbgSubInput');
  if (inp) inp.value = state.sub;
  log(`⚙️ [调试] 已解锁全部秘境 (sub=${state.sub})`);
  refreshStats(); renderTab(); save();
}

function dbgInstaBreak(){
  if (state.sub >= TOTAL_SUB - 1){
    log('⚙️ [调试] 已达巅峰，无可突破。');
    return;
  }
  // 一键突破：跳过成功率/惩罚，直接推进一阶
  state.sub += 1;
  state.xiuwei = 0;
  state.hp = playerMaxHp();
  state.debuff = null;
  state.stats.breakthroughs++;
  if (state.sub >= TOTAL_SUB){
    state.won = true;
    log('🌅 [调试] 一键飞升，霞光万丈！');
    showVictory();
  } else {
    log(`✨ [调试] 突破成功！迈入 ${realmName(state.sub)}`);
  }
  const inp = document.getElementById('dbgSubInput');
  if (inp) inp.value = state.sub;
  refreshStats(); renderTab(); save();
}

function dbgToggleGodMode(){
  debugGodMode = !debugGodMode;
  const btn = document.getElementById('dbgGodBtn');
  if (btn) btn.textContent = '无敌：' + (debugGodMode ? '开' : '关');
  updateDebugBadge();
  log(`⚙️ [调试] 无敌模式 ${debugGodMode ? '开启' : '关闭'}`);
}

/* ---------- 总渲染 ---------- */
function render(){ refreshStats(); renderTab(); }

/* ---------- 初始化 ---------- */
function init(){
  // 标签切换
  document.querySelectorAll('.tab').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.activeTab = b.dataset.tab;
      if (state.activeTab === 'zone') resumeBattle(); else pauseBattle();
      renderTab();
    });
  });
  // 主操作按钮
  document.getElementById('meditateBtn').addEventListener('click', meditate);
  document.getElementById('breakBtn').addEventListener('click', doBreakthrough);
  // 事件委托：标签内所有按钮
  document.getElementById('tabContent').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    if      (a === 'fight')      startBattle(+btn.dataset.zone, +btn.dataset.var);
    else if (a === 'flee')       { fleeBattle(); return; }
    else if (a === 'buy-tech')   buyTechnique(btn.dataset.id);
    else if (a === 'buy-weapon') buyWeapon(btn.dataset.id);
    else if (a === 'buy-armor')  buyArmor(btn.dataset.id);
    else if (a === 'buy-pill')   buyPill(btn.dataset.id);
    else if (a === 'craft')      craft(btn.dataset.id);
    else if (a === 'use-pill')   usePill(btn.dataset.id);
    else if (a === 'equip-treasure') equipTreasure(btn.dataset.id);
    else if (a === 'refine-treasure') refineTreasure(btn.dataset.id);
    else if (a === 'inscribe-treasure'){ state.inscribeFor = btn.dataset.id; renderTab(); return; }
    else if (a === 'inscribe-cancel'){ state.inscribeFor = null; renderTab(); return; }
    else if (a === 'inscribe-with') { inscribeTreasure(btn.dataset.trid, btn.dataset.id); state.inscribeFor = null; return; }
    else if (a === 'disassemble')   { disassembleItem(btn.dataset.type, null); return; }
    else if (a === 'learn-dao')     { learnDaoNode(btn.dataset.id); return; }
    else if (a === 'choose-dao')    { chooseDaoPath(btn.dataset.id); return; }
    else if (a === 'start-expedition'){ startExpedition(+btn.dataset.zone); return; }
    else if (a === 'enter-room')    { enterRoom(btn.dataset.room); return; }
    else if (a === 'exit-expedition'){ exitExpedition(false); return; }
    else if (a === 'duel')           { duelOpponent(+btn.dataset.tier); return; }
    else if (a === 'discuss-dao')    { discussDao(); return; }
    else if (a === 'learn-insight')  { learnInsightNode(btn.dataset.id); return; }
    else if (a === 'join-sect')   { joinSect(btn.dataset.id); renderTab(); refreshStats(); return; }
    else if (a === 'switch-sect') { switchSect(btn.dataset.id); renderTab(); refreshStats(); return; }
    else if (a === 'refresh-bounty'){ refreshBounties(true); return; }
    else if (a === 'claim-bounty')  { claimBounty(btn.dataset.id); return; }
    else if (a === 'buy-sect-item') { buySectItem(btn.dataset.type, btn.dataset.id); return; }
    else if (a === 'upgrade-cave')  { upgradeCave(btn.dataset.id); return; }
    else if (a === 'hatch-pet')     { hatchPet(); return; }
    else if (a === 'evolve-pet')    { evolvePet(btn.dataset.id); return; }
    else if (a === 'equip-pet')     { equipPet(btn.dataset.id); return; }
    else if (a === 'shop-subtab'){ state.shopSubtab = btn.dataset.sub; renderTab(); refreshStats(); return; }
    else if (a === 'save')       { save(); log('💾 已保存'); refreshStats(); return; }
    else if (a === 'reset')      { resetGame(); return; }
    renderTab(); refreshStats();
  });
  // 飞升：轮回转世（保留 meta）/ 散功重修（清空）
  document.getElementById('reincarnBtn').addEventListener('click', () => {
    if (!confirm('轮回转世：结算道果、保留轮回天赋，从练气期重开。确定？')) return;
    reincarnSamsara(true);
  });
  document.getElementById('restartBtn').addEventListener('click', () => {
    if (!confirm('散功重修：散去一切修为与轮回记忆（含道果/天赋），彻底重来。确定？')) return;
    localStorage.removeItem(SAVE_KEY);
    state = newState(); clearBattle();
    document.getElementById('victory').classList.add('hidden');
    log('散功重修，再踏仙途。');
    render(); save();
  });
  // 兵解轮回（渡劫期主动轮回，道果 -30% 折扣）
  const armyBtn = document.getElementById('reincarnArmyBtn');
  if (armyBtn) armyBtn.addEventListener('click', () => {
    if (!confirm('兵解轮回：提前舍弃本世肉身，按当前境界结算道果（-30% 折扣）后重开。确定？')) return;
    reincarnSamsara(false);
  });
  // 道果徽章点击 -> 轮回天赋树
  const daoChip = document.querySelector('.dao-chip');
  if (daoChip) daoChip.addEventListener('click', openSamsakaTree);
  const samsakaClose = document.getElementById('samsakaClose');
  if (samsakaClose) samsakaClose.addEventListener('click', closeSamsakaTree);
  // 轮回天赋树内按钮委托
  const samsakaBody = document.getElementById('samsakaTree');
  if (samsakaBody) samsakaBody.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'buy-talent') buyTalent(btn.dataset.id);
  });
  // 奇遇事件遮罩内按钮委托
  const eventOverlay = document.getElementById('eventOverlay');
  if (eventOverlay) eventOverlay.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'choose-event') chooseEvent(btn.dataset.id);
  });
  // 卜卦/因果：顶栏气运徽章打开，遮罩内按钮委托
  const luckChip = document.getElementById('luckChip');
  if (luckChip) luckChip.addEventListener('click', openDivine);
  const divineClose = document.getElementById('divineClose');
  if (divineClose) divineClose.addEventListener('click', closeDivine);
  const divineOverlay = document.getElementById('divineOverlay');
  if (divineOverlay) divineOverlay.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'divine'){ divine(btn.dataset.effect); renderDivine(); }
  });
  // 九重天劫遮罩内按钮委托（模块 B）
  const tribOverlay = document.getElementById('tribulation');
  if (tribOverlay) tribOverlay.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === 'trib-endure')       respondTribulation('endure');
    else if (a === 'trib-treasure')respondTribulation('treasure');
    else if (a === 'trib-pill')    respondTribulation('pill');
    else if (a === 'trib-flee')    respondTribulation('flee');
    else if (a === 'trib-giveup')  endTribulation(false);
  });
  // 道途选择遮罩内按钮委托（模块 H）
  const daoChoose = document.getElementById('daoChoose');
  if (daoChoose) daoChoose.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'choose-dao') chooseDaoPath(btn.dataset.id);
  });
  // 调试/测试面板（位于 #tabContent 之外，独立委托）
  document.getElementById('debugToggle').addEventListener('click', toggleDebug);
  document.getElementById('dbgClose').addEventListener('click', toggleDebug);
  document.getElementById('dbgSubInput').addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); dbgSetSub(parseInt(e.target.value, 10)); }
  });
  document.getElementById('debugPanel').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const a = btn.dataset.action;
    if (!a.startsWith('dbg-')) return;
    if      (a === 'dbg-xiuwei-fill')      dbgAddXiuwei('fill');
    else if (a === 'dbg-xiuwei-10x')       dbgAddXiuwei('10x');
    else if (a === 'dbg-lingshi-1m')       dbgAddLingshi('1m');
    else if (a === 'dbg-lingshi-10x')      dbgAddLingshi('10x');
    else if (a === 'dbg-sub-minus')        dbgSetSub(state.sub - 1);
    else if (a === 'dbg-sub-plus')         dbgSetSub(state.sub + 1);
    else if (a === 'dbg-sub-set'){
      const v = parseInt(document.getElementById('dbgSubInput').value, 10);
      if (!isNaN(v)) dbgSetSub(v);
    }
    else if (a === 'dbg-maxhp')            dbgMaxHp();
    else if (a === 'dbg-give-items')       dbgGiveItems();
    else if (a === 'dbg-unlock-zones')     dbgUnlockZones();
    else if (a === 'dbg-insta-break')      dbgInstaBreak();
    else if (a === 'dbg-godmode')          dbgToggleGodMode();
    else if (a === 'dbg-reset'){
      resetGame();
      const inp = document.getElementById('dbgSubInput');
      if (inp) inp.value = state.sub;
    }
  });
  // 空格 = 打坐（但按钮聚焦时让按钮自行响应，避免劫持）
  document.addEventListener('keydown', e => {
    // Ctrl+Shift+D 切换调试面板
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')){
      e.preventDefault(); toggleDebug(); return;
    }
    if (e.code !== 'Space') return;
    if (e.target.closest('button, input, textarea')) return;
    e.preventDefault(); meditate();
  });
  // 读档
  const loaded = load();
  // 同步激活标签
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.activeTab));
  if (state.won) showVictory();
  maybePromptDaoPath();   // 载入时若已达元婴未选道途，弹出选择（模块 H）
  lastTick = Date.now();
  if (document.hidden) hiddenSince = Date.now();
  setInterval(tick, TICK_MS);
  setInterval(save, AUTOSAVE_MS);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', save);
  render();
  if (!loaded) log('👋 欢迎踏入修仙之路。点击「打坐吐纳」或静待自动修炼，修为攒满后「突破境界」。空格键可快速打坐。');
}
init();
