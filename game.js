'use strict';
/* =========================================================
   修仙小游戏 · 一念成仙  —— game.js
   纯前端 / 无依赖 / 全局脚本（保证 file:// 可直接运行）
   ========================================================= */

/* ---------- 配置常量（可调平衡） ---------- */
const SAVE_KEY        = 'xiuxian_save_v1';
const SAVE_VERSION    = 1;
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
const lingshiPerSec = s => LINGSHI_AUTO_BASE * Math.pow(LINGSHI_AUTO_GROWTH, realmOf(s));
function breakthroughChance(s){ return 0.9; }  // 小境界突破：高成功率
function majorBreakChance(s){ return Math.max(0.3, Math.min(0.65, 0.65 - realmOf(s) * 0.03)); } // 大境界突破：较低成功率
function alchemyChance(){ return Math.min(0.95, 0.6 + realmOf(state.sub) * 0.04); }

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
];

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
function newState(){
  return {
    version: SAVE_VERSION,
    sub: 0,
    xiuwei: 0,
    lingshi: 0,
    hp: baseMaxHp(0),
    techniques: [],
    equip: { weapon:null, armor:null },
    inv: { herb:0, core:0, huiqi:1, xiuwei:0, tupo:0 },
    tupoBuff: false,
    debuff: null, // 走火入魔：{ until: ms, cultMult: 0.5 }
    lastMeditate: 0,
    lastSave: Date.now(),
    stats: { kills:0, deaths:0, breakthroughs:0, meditations:0 },
    won: false,
    activeTab: 'zone',
    shopSubtab: 'tech',
  };
}
let state = newState();
let battleState = null;
// 调试/测试标志（会话级，不写入存档，正常游玩不受影响）
let debugEnabled  = false;  // 调试面板可见性
let debugGodMode  = false;  // 战斗无敌

/* ---------- 派生属性 ---------- */
function ownedTechniques(){
  return state.techniques.map(id => TECHNIQUES.find(x => x.id === id)).filter(Boolean);
}
function effectiveCultMult(){
  let m = 1;
  for (const t of ownedTechniques()) m += t.cultBonus;
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
const playerAtk   = () => baseAtk(state.sub) + ((WEAPONS.find(x=>x.id===state.equip.weapon)||{}).atk || 0);
const playerDef   = () => baseDef(state.sub) + ((ARMORS.find(x=>x.id===state.equip.armor)||{}).def || 0);
const playerMaxHp = () => baseMaxHp(state.sub);

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
function save(){
  state.lastSave = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch(e){}
}
function load(){
  try {
    const raw = localStorage.getItem(SAVE_KEY);
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
    state.inv   = Object.assign({herb:0,core:0,huiqi:0,xiuwei:0,tupo:0}, s.inv || {});
    state.equip = Object.assign({weapon:null,armor:null}, s.equip || {});
    state.stats = Object.assign({kills:0,deaths:0,breakthroughs:0,meditations:0}, s.stats || {});
    state.debuff = (s.debuff && typeof s.debuff.until === 'number') ? s.debuff : null;
    state.shopSubtab = s.shopSubtab || 'tech';
    // 离线收益
    const dt = Math.min(OFFLINE_CAP_SEC, (Date.now() - (s.lastSave || Date.now())) / 1000);
    if (dt > 60 && !state.won){
      const gain = autoCultPerSec(state.sub) * effectiveCultMult() * dt * OFFLINE_EFF;
      state.xiuwei += gain;
      log(`🌙 闭关 ${fmtDur(dt)}，修炼得修为 ${fmt(gain)}`);
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
  state.xiuwei  += cultRate() * dt;
  state.lingshi += lingshiPerSec(state.sub) * dt;
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
        const capped = Math.min(OFFLINE_CAP_SEC, dur);
        const gain = autoCultPerSec(state.sub) * effectiveCultMult() * capped * OFFLINE_EFF;
        state.xiuwei += gain;
        log(`🌙 闭关 ${fmtDur(capped)}，修炼得修为 ${fmt(gain)}`);
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
  const gain = cultRate() * MEDITATE_MULT;
  state.xiuwei += gain;
  state.stats.meditations++;
  floatText('+' + fmt(gain));
  log(`🧘 打坐吐纳，修为 +${fmt(gain)}`);
  refreshStats(); save();
}

/* ---------- 突破 ---------- */
function doBreakthrough(){
  if (state.won || battleState) return;
  const need = xiuweiNeed(state.sub);
  if (state.xiuwei < need) return;
  const isFinal = state.sub === TOTAL_SUB - 1;
  const isMajor = subOf(state.sub) === 3; // 圆满 -> 下一大境（最终渡劫亦属大境界）
  if (isFinal && state.lingshi < TRIB_COST){
    log(`⚡ 渡劫需灵石 ${fmt(TRIB_COST)}，不足！`);
    return;
  }
  // 成功率：小境界 0.9 / 大境界 majorBreakChance / 最终渡劫沿用大境界公式并限 ≤0.9
  let chance = isMajor ? majorBreakChance(state.sub) : breakthroughChance(state.sub);
  if (state.tupoBuff){ chance = Math.min(0.99, chance + 0.3); state.tupoBuff = false; }
  if (isMajor) log(`🌀 大境界突破！成功率 ${Math.round(chance*100)}%…`);
  if (isFinal){
    state.lingshi -= TRIB_COST;
    chance = Math.min(0.9, chance);
    log('⚡⚡ 天劫降临，九霄雷劫轰下！');
  }
  if (Math.random() < chance){
    state.xiuwei -= need;
    state.sub += 1;
    state.hp = playerMaxHp();
    state.stats.breakthroughs++;
    if (state.sub >= TOTAL_SUB){
      state.won = true;
      log('🌅 突破渡劫圆满，霞光万丈，你飞升成仙！');
      showVictory();
    } else {
      log(`✨ 突破成功！迈入 ${realmName(state.sub)}`);
    }
  } else {
    // 失败惩罚：小境界损30% / 大境界(非最终)损50%+走火入魔 / 最终渡劫 HP=1 损30%
    if (isFinal){
      const loss = Math.floor(need * 0.3);
      state.xiuwei -= loss;
      state.hp = 1;
      log(`💢 渡劫失败，天雷重创，气血仅存一线！损失修为 ${fmt(loss)}。`);
    } else if (isMajor){
      const loss = Math.floor(need * 0.5);
      state.xiuwei -= loss;
      state.hp = Math.floor(playerMaxHp() * 0.1);
      state.debuff = { until: Date.now() + 60000, cultMult: 0.5 };
      log(`💢 大境界突破失败，走火入魔！损失修为 ${fmt(loss)}，气血重创，修炼减半 60 秒！`);
    } else {
      const loss = Math.floor(need * 0.3);
      state.xiuwei -= loss;
      log(`💢 突破失败，修为反噬，损失修为 ${fmt(loss)}，需再行积累。`);
    }
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
  if (battleState || state.won) return;
  if (state.hp <= 0) state.hp = playerMaxHp();
  const mon = genMonster(z, v);
  battleState = { mon, monHp: mon.maxHp, zone:z, var:v, timer:null };
  log(`⚔️ 你闯入${ZONE_NAMES[z]}，遭遇 ${mon.name}！`);
  renderTab();
  battleState.timer = setInterval(battleRound, BATTLE_ROUND_MS);
}
function battleRound(){
  const b = battleState; if (!b) return;
  const pd = dmgCalc(playerAtk(), b.mon.def);
  b.monHp -= pd;
  if (b.monHp <= 0){ b.monHp = 0; return endBattle(true); }
  if (debugGodMode){ refreshBattle(); return; } // 无敌：玩家不受伤，妖兽仍受伤
  const md = dmgCalc(b.mon.atk, playerDef());
  state.hp -= md;
  if (state.hp <= 0){ state.hp = 0; return endBattle(false); }
  refreshBattle();
}
function endBattle(win){
  const b = battleState;
  clearInterval(b.timer);
  if (win){
    const li = Math.round(b.mon.lingshi[0] + Math.random() * (b.mon.lingshi[1] - b.mon.lingshi[0]));
    state.lingshi += li;
    state.stats.kills++;
    const drops = [];
    if (Math.random() < b.mon.herbChance){ state.inv.herb++; drops.push('灵草×1'); }
    if (Math.random() < b.mon.coreChance){ state.inv.core++; drops.push('妖核×1'); }
    log(`🏆 击杀 ${b.mon.name}，得灵石 ${fmt(li)}${drops.length ? '，掉落 ' + drops.join('、') : ''}`);
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
  else if (id === 'xiuwei'){ const g = pillXiuwei(state.sub); state.xiuwei += g; log(`✨ 服下修为丹，修为 +${fmt(g)}。`); }
  else if (id === 'tupo'){ state.tupoBuff = true; log('⚡ 服下突破丹，下次突破成功率提升。'); }
  save();
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
  document.getElementById('hpBar').style.width = Math.max(0, state.hp / playerMaxHp() * 100) + '%';
  document.getElementById('hpText').textContent = fmt(Math.max(0, state.hp)) + '/' + fmt(playerMaxHp());

  document.getElementById('cultRateText').textContent = fmt(cultRate()) + '/秒';
  document.getElementById('xiuweiText2').textContent = fmt(state.xiuwei);
  document.getElementById('atkText').textContent = fmt(playerAtk());
  document.getElementById('defText').textContent = fmt(playerDef());
  document.getElementById('techText').textContent =
    ownedTechniques().map(t => t.name).join('、') || '无';

  const now = Date.now();
  const med = document.getElementById('meditateBtn');
  med.disabled = state.won || (now - state.lastMeditate < MEDITATE_CD);

  const br = document.getElementById('breakBtn');
  const isFinal = state.sub === TOTAL_SUB - 1;
  const isMajor = subOf(state.sub) === 3;
  if (state.won){ br.disabled = true; br.textContent = '已成仙'; }
  else if (battleState){ br.disabled = true; br.textContent = '✨ 突破境界'; }
  else if (state.xiuwei >= need){
    br.disabled = false;
    // 显示成功率（与 doBreakthrough 计算一致，含突破丹加成）
    let dispChance = isMajor ? majorBreakChance(state.sub) : breakthroughChance(state.sub);
    if (state.tupoBuff) dispChance = Math.min(0.99, dispChance + 0.3);
    if (isFinal) dispChance = Math.min(0.9, dispChance);
    const pct = Math.round(dispChance * 100);
    if (isFinal) br.textContent = `⚡ 渡劫飞升 (需${fmt(TRIB_COST)}灵石)`;
    else if (isMajor) br.textContent = `✨ 大境界突破 ${pct}%`;
    else br.textContent = `✨ 突破 ${pct}%`;
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
  updateDebugBadge();
  refreshTabButtons();
}

function refreshTabButtons(){
  const t = state.activeTab;
  if (t === 'zone')      refreshZoneBtns();
  else if (t === 'shop') refreshShopBtns();
  else if (t === 'alchemy')  refreshAlchemyBtns();
  else if (t === 'inventory')refreshInventoryBtns();
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

/* ---------- 渲染：各面板 ---------- */
function renderTab(){
  const c = document.getElementById('tabContent');
  if (state.activeTab === 'zone')        c.innerHTML = renderZone();
  else if (state.activeTab === 'shop')   c.innerHTML = renderShop();
  else if (state.activeTab === 'alchemy')c.innerHTML = renderAlchemy();
  else if (state.activeTab === 'inventory') c.innerHTML = renderInventory();
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
  let h = `<div class="alch-mats"><b>🎒 材料：</b> 🌿灵草×${state.inv.herb}　💀妖核×${state.inv.core}</div>`;
  h += '<div class="item-list">';
  for (const r of RECIPES){
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
  h += `<div class="inv-sec"><h3>🎒 储物袋</h3><p>🌿灵草×${state.inv.herb}　💀妖核×${state.inv.core}</p><div class="item-list">`;
  for (const id of ['huiqi','xiuwei','tupo']){
    const p = PILL_DEFS[id];
    h += `<div class="item"><div class="item-info"><b>${p.icon} ${p.name}</b><span>${p.desc}　×${state.inv[id]}</span></div>
      <button class="tab-btn" data-action="use-pill" data-id="${id}">使用</button></div>`;
  }
  h += '</div></div>';
  h += '<div class="inv-sec danger"><h3>⚙️ 存档</h3>';
  h += '<button class="tab-btn" data-action="save">💾 保存</button> ';
  h += '<button class="tab-btn danger-btn" data-action="reset">🔄 散功重修</button></div>';
  return h;
}

/* ---------- 胜利 ---------- */
function showVictory(){
  document.getElementById('victoryText').innerHTML =
    `你历经 ${state.stats.breakthroughs} 次突破、击杀 ${state.stats.kills} 妖兽、` +
    `打坐 ${state.stats.meditations} 次，终得大道，飞升成仙！`;
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
    else if (a === 'shop-subtab'){ state.shopSubtab = btn.dataset.sub; renderTab(); refreshStats(); return; }
    else if (a === 'save')       { save(); log('💾 已保存'); refreshStats(); return; }
    else if (a === 'reset')      { resetGame(); return; }
    renderTab(); refreshStats();
  });
  // 胜利重开
  document.getElementById('restartBtn').addEventListener('click', () => {
    localStorage.removeItem(SAVE_KEY);
    state = newState(); clearBattle();
    document.getElementById('victory').classList.add('hidden');
    log('轮回重启，再踏仙途。');
    render(); save();
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
