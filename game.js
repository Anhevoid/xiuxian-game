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
const AUTO_CULT_BASE   = 2;       // 练气初期 修为/秒
const CULT_GROWTH      = 1.33;    // 每小阶修炼速度增长
const LINGSHI_AUTO_BASE   = 0.4;  // 自动灵石基础
const LINGSHI_AUTO_GROWTH = 1.35; // 每大境灵石增长
const MEDITATE_CD   = 500;        // 打坐冷却 ms
const MEDITATE_MULT = 4;          // 打坐一次 = 多少秒自动修炼
const BATTLE_ROUND_MS = 450;      // 战斗回合间隔
const REGEN_PER_SEC = 0.02;       // 非战斗回血(最大HP比例/秒)
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
const GROW = 2.3;                       // 每大境战力指数增长
const baseAtk   = s => Math.round(8  * Math.pow(GROW, s / 4));
const baseDef   = s => Math.round(4  * Math.pow(GROW, s / 4));
const baseMaxHp = s => Math.round(100 * Math.pow(GROW, s / 4));
const lingshiPerSec = s => LINGSHI_AUTO_BASE * Math.pow(LINGSHI_AUTO_GROWTH, realmOf(s));
function breakthroughChance(s){ return Math.max(0.3, Math.min(0.95, 0.92 - s * 0.012)); }
function alchemyChance(){ return Math.min(0.95, 0.6 + realmOf(state.sub) * 0.04); }

/* ---------- 功法 ---------- */
const TECHNIQUES = [
  { id:'t0', name:'吐纳术',     cultMult:0.5, cost:100     },
  { id:'t1', name:'紫气东来',   cultMult:1.0, cost:1500    },
  { id:'t2', name:'太上忘情录', cultMult:1.5, cost:12000   },
  { id:'t3', name:'混元功',     cultMult:2.5, cost:60000   },
  { id:'t4', name:'九转玄功',   cultMult:4.0, cost:300000  },
  { id:'t5', name:'鸿蒙造化功', cultMult:7.0, cost:1500000 },
];

/* ---------- 装备（9 级，每级战力 ×2.3） ---------- */
const WEAPON_NAMES = ['凡铁剑','寒铁剑','紫电','青莲剑','诛仙剑','盘古剑','天罡剑','混元剑','造化之剑'];
const ARMOR_NAMES  = ['布衣','玄铁甲','天蚕宝衣','金丝软甲','混沌战甲','太极道袍','玄武甲','太清道袍','鸿蒙仙衣'];
const WEAPONS = WEAPON_NAMES.map((name, z) => ({ id:'w'+z, name, atk: Math.round(8 * Math.pow(GROW, z)), cost: Math.round(80 * Math.pow(3.0, z)) }));
const ARMORS  = ARMOR_NAMES.map((name, z) => ({ id:'a'+z, name, def: Math.round(6 * Math.pow(GROW, z)), cost: Math.round(80 * Math.pow(3.0, z)) }));

/* ---------- 丹药 / 材料 ---------- */
const PILL_DEFS = {
  huiqi:  { name:'回血丹', icon:'🩸', desc:'回满气血' },
  xiuwei: { name:'修为丹', icon:'✨', desc:'立即获得修为(当前需求15%)' },
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
    lastMeditate: 0,
    lastSave: Date.now(),
    stats: { kills:0, deaths:0, breakthroughs:0, meditations:0 },
    won: false,
    activeTab: 'zone',
  };
}
let state = newState();
let battleState = null;

/* ---------- 派生属性 ---------- */
function effectiveCultMult(){
  let m = 1;
  for (const id of state.techniques){
    const t = TECHNIQUES.find(x => x.id === id);
    if (t) m += t.cultMult;
  }
  return m;
}
const cultRate    = () => autoCultPerSec(state.sub) * effectiveCultMult();
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
    if (!s || s.version !== SAVE_VERSION) return false;
    state = Object.assign(newState(), s);
    state.inv   = Object.assign({herb:0,core:0,huiqi:0,xiuwei:0,tupo:0}, s.inv || {});
    state.equip = Object.assign({weapon:null,armor:null}, s.equip || {});
    state.stats = Object.assign({kills:0,deaths:0,breakthroughs:0,meditations:0}, s.stats || {});
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
  battleState = null;
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
function tick(){
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  if (state.won) return;
  state.xiuwei  += cultRate() * dt;
  state.lingshi += lingshiPerSec(state.sub) * dt;
  if (!battleState && state.hp < playerMaxHp()){
    state.hp = Math.min(playerMaxHp(), state.hp + playerMaxHp() * REGEN_PER_SEC * dt);
  }
  refreshStats();
  if (battleState) refreshBattle();
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
  refreshStats();
}

/* ---------- 突破 ---------- */
function doBreakthrough(){
  if (state.won || battleState) return;
  const need = xiuweiNeed(state.sub);
  if (state.xiuwei < need) return;
  const isFinal = state.sub === TOTAL_SUB - 1;
  if (isFinal && state.lingshi < TRIB_COST){
    log(`⚡ 渡劫需灵石 ${fmt(TRIB_COST)}，不足！`);
    return;
  }
  state.xiuwei -= need;
  let chance = breakthroughChance(state.sub);
  if (state.tupoBuff){ chance = Math.min(0.99, chance + 0.3); state.tupoBuff = false; }
  if (isFinal){
    state.lingshi -= TRIB_COST;
    chance = Math.min(0.9, chance);
    log('⚡⚡ 天劫降临，九霄雷劫轰下！');
  }
  if (Math.random() < chance){
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
    if (isFinal){ state.hp = 1; log('💢 渡劫失败，天雷重创，气血仅存一线！'); }
    else log('💢 突破失败，修为反噬，需再行积累。');
  }
  refreshStats(); renderTab(); save();
}

/* ---------- 战斗 ---------- */
function dmgCalc(atk, def){ return Math.max(1, Math.round((atk - def) * (0.85 + Math.random() * 0.3))); }
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
  log('🏃 你狼狈逃走，保住一命。');
  battleState = null;
  refreshStats(); renderTab();
}

/* ---------- 商店 / 炼丹 / 物品 ---------- */
function buyTechnique(id){
  const t = TECHNIQUES.find(x => x.id === id);
  if (!t || state.techniques.includes(id) || state.lingshi < t.cost) return;
  state.lingshi -= t.cost;
  state.techniques.push(id);
  log(`📕 习得功法 ${t.name}，修炼速度提升！`);
}
function buyWeapon(id){
  const w = WEAPONS.find(x => x.id === id);
  if (!w || state.equip.weapon === id || state.lingshi < w.cost) return;
  state.lingshi -= w.cost;
  state.equip.weapon = id;
  log(`⚔️ 购得 ${w.name} 并装备。`);
}
function buyArmor(id){
  const a = ARMORS.find(x => x.id === id);
  if (!a || state.equip.armor === id || state.lingshi < a.cost) return;
  state.lingshi -= a.cost;
  state.equip.armor = id;
  log(`🛡️ 购得 ${a.name} 并装备。`);
}
function buyPill(id){
  const price = SHOP_PILL_PRICE[id];
  if (state.lingshi < price) return;
  state.lingshi -= price;
  state.inv[id]++;
  log(`💊 购得 ${PILL_DEFS[id].name}。`);
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
    log('⚗️ 炼丹失败，材料化为灰烬。');
  }
}
function usePill(id){
  if ((state.inv[id] || 0) <= 0) return;
  state.inv[id]--;
  if (id === 'huiqi'){ state.hp = playerMaxHp(); log('🩸 服下回血丹，气血充盈。'); }
  else if (id === 'xiuwei'){ const g = Math.floor(xiuweiNeed(state.sub) * 0.15); state.xiuwei += g; log(`✨ 服下修为丹，修为 +${fmt(g)}。`); }
  else if (id === 'tupo'){ state.tupoBuff = true; log('⚡ 服下突破丹，下次突破成功率提升。'); }
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
    state.techniques.map(id => TECHNIQUES.find(x => x.id === id).name).join('、') || '无';

  const now = Date.now();
  const med = document.getElementById('meditateBtn');
  med.disabled = state.won || (now - state.lastMeditate < MEDITATE_CD);

  const br = document.getElementById('breakBtn');
  const isFinal = state.sub === TOTAL_SUB - 1;
  if (state.won){ br.disabled = true; br.textContent = '已成仙'; }
  else if (battleState){ br.disabled = true; br.textContent = '✨ 突破境界'; }
  else if (state.xiuwei >= need){
    br.disabled = false;
    br.textContent = isFinal ? `⚡ 渡劫飞升 (需${fmt(TRIB_COST)}灵石)` : '✨ 突破！';
  } else {
    br.disabled = true;
    br.textContent = '✨ 突破境界';
  }
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
  document.querySelectorAll('#tabContent [data-action="buy-weapon"]').forEach(b => {
    const w = WEAPONS.find(x => x.id === b.dataset.id);
    b.disabled = state.equip.weapon === b.dataset.id || state.lingshi < w.cost;
  });
  document.querySelectorAll('#tabContent [data-action="buy-armor"]').forEach(b => {
    const a = ARMORS.find(x => x.id === b.dataset.id);
    b.disabled = state.equip.armor === b.dataset.id || state.lingshi < a.cost;
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
          <span class="mon-name">${m.name}</span>
          <span class="mon-stat">❤${fmt(m.maxHp)} ⚔${m.atk} 🛡${m.def}</span>
          <span class="mon-reward">🪙${fmt(m.lingshi[0])}~${fmt(m.lingshi[1])}</span>
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
  let h = '<div class="shop-sec"><h3>📕 功法</h3><div class="item-list">';
  for (const t of TECHNIQUES){
    const owned = state.techniques.includes(t.id);
    h += `<div class="item"><div class="item-info"><b>${t.name}</b><span>修炼速度 +${Math.round(t.cultMult*100)}%</span></div>
      <button class="tab-btn" data-action="buy-tech" data-id="${t.id}" ${owned?'disabled':''}>${owned?'已习得':'🪙 '+fmt(t.cost)}</button></div>`;
  }
  h += '</div></div><div class="shop-sec"><h3>⚔️ 武器</h3><div class="item-list">';
  for (const w of WEAPONS){
    const eq = state.equip.weapon === w.id;
    h += `<div class="item"><div class="item-info"><b>${w.name}</b><span>攻击 +${w.atk}</span></div>
      <button class="tab-btn" data-action="buy-weapon" data-id="${w.id}" ${eq?'disabled':''}>${eq?'已装备':'🪙 '+fmt(w.cost)}</button></div>`;
  }
  h += '</div></div><div class="shop-sec"><h3>🛡️ 护甲</h3><div class="item-list">';
  for (const a of ARMORS){
    const eq = state.equip.armor === a.id;
    h += `<div class="item"><div class="item-info"><b>${a.name}</b><span>防御 +${a.def}</span></div>
      <button class="tab-btn" data-action="buy-armor" data-id="${a.id}" ${eq?'disabled':''}>${eq?'已装备':'🪙 '+fmt(a.cost)}</button></div>`;
  }
  h += '</div></div><div class="shop-sec"><h3>💊 丹药</h3><div class="item-list">';
  for (const id of ['huiqi','xiuwei','tupo']){
    const p = PILL_DEFS[id];
    h += `<div class="item"><div class="item-info"><b>${p.icon} ${p.name}</b><span>${p.desc}</span></div>
      <button class="tab-btn" data-action="buy-pill" data-id="${id}">🪙 ${fmt(SHOP_PILL_PRICE[id])}</button></div>`;
  }
  h += '</div></div>';
  return h;
}
function renderAlchemy(){
  let h = `<div class="alch-mats"><b>🎒 材料：</b> 🌿灵草×${state.inv.herb}　💀妖核×${state.inv.core}</div>`;
  h += '<div class="item-list">';
  for (const r of RECIPES){
    const p = PILL_DEFS[r.out];
    const mats = Object.entries(r.mats).map(([k,n]) => `${MAT_DEFS[k].icon}${MAT_DEFS[k].name}×${n}`).join(' ');
    h += `<div class="item"><div class="item-info"><b>${p.icon} ${p.name}</b><span>${r.desc}</span></div>
      <button class="tab-btn" data-action="craft" data-id="${r.id}">⚗️ 炼制 (🪙${fmt(r.cost)} ${mats})</button></div>`;
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
  h += '<div class="inv-sec"><h3>📕 已习功法</h3><p>' + (state.techniques.map(id => TECHNIQUES.find(x=>x.id===id).name).join('、') || '尚无') + '</p></div>';
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
    else if (a === 'save')       { save(); log('💾 已保存'); refreshStats(); return; }
    else if (a === 'reset')      { resetGame(); return; }
    renderTab(); refreshStats();
  });
  // 胜利重开
  document.getElementById('restartBtn').addEventListener('click', () => {
    localStorage.removeItem(SAVE_KEY);
    state = newState(); battleState = null;
    document.getElementById('victory').classList.add('hidden');
    log('轮回重启，再踏仙途。');
    render(); save();
  });
  // 空格 = 打坐
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !e.target.matches('input,textarea')){
      e.preventDefault(); meditate();
    }
  });
  // 读档
  load();
  // 同步激活标签
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.activeTab));
  if (state.won) showVictory();
  lastTick = Date.now();
  setInterval(tick, TICK_MS);
  setInterval(save, AUTOSAVE_MS);
  window.addEventListener('beforeunload', save);
  render();
  log('👋 欢迎踏入修仙之路。点击「打坐吐纳」或静待自动修炼，修为攒满后「突破境界」。空格键可快速打坐。');
}
init();
