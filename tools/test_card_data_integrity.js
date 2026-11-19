"use strict";

// 卡牌数据完整性审计（比 test_card_designs 更广的「自洽性」检查）：
// - 关键词必须出现在 rulesText 里（玩家看到的说明与关键词列表一致，中文取自客户端 KEYWORD_LABEL）
// - 亡语/战吼关键词必须与效果 trigger 一一对应
// - 效果里的 action / trigger / target 必须是引擎真正认识的词汇（词汇表在此显式列出，引擎改动时会报警）
// - 法术必须有 cast 效果、随从必须有攻血、法术不能带关键词
// - id/名称唯一、稀有度/费用/元素/美术路径格式合法

const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return { init(){}, DYNAMIC_CURRENT_ENV:"test", database:()=>({ serverDate:()=>0 }) };
  }
  return originalLoad(request, parent, isMain);
};

const data = require("../cloudfunctions/initGameData/index.js").__test;
const cards = data.cards;

// 与 game.js 的 KEYWORD_LABEL 保持一致
const KEYWORD_LABEL = { guard: "城墙", charge: "冲锋", rush: "突袭", shield: "护盾", lifesteal: "吸血", battlecry: "入场", deathrattle: "亡语", aura: "光环" };
// 引擎 cloudfunctions/battleGame/index.js 实际支持的效果词汇
const ACTIONS = ["buff", "damage", "deathrattle-extra", "draw", "heal", "modify-stats", "silence", "summon", "trigger-deathrattles"];
const TRIGGERS = ["aura", "battlecry", "cast", "deathrattle"];
const TARGETS = ["all-enemy-minions", "all-friendly-minions", "all-minions", "enemy-hero", "friendly-hero", "other-friendly-minions", "self"];
const RARITIES = ["common", "rare", "epic", "legendary"];

const problems = [];
const fail = message => problems.push(message);

assert.ok(Array.isArray(cards) && cards.length === 74, `卡牌数量应为 74，实际 ${cards && cards.length}`);

const seenIds = new Set();
const seenNames = new Map();
for (const card of cards) {
  const label = card.id || "?";
  if (!card.id || !card.name) fail(`${label} 缺少 id 或名称`);
  if (seenIds.has(card.id)) fail(`${card.id} id 重复`);
  seenIds.add(card.id);
  if (seenNames.has(card.name)) fail(`${card.name} 名称重复（${seenNames.get(card.name)} 与 ${card.id}）`);
  seenNames.set(card.name, card.id);

  if (!RARITIES.includes(card.rarity)) fail(`${label} 稀有度非法：${card.rarity}`);
  if (!["base", "star-remnant"].includes(card.set)) fail(`${label} 卡包非法：${card.set}`);
  if (!card.element) fail(`${label} 缺少元素`);
  if (!Number.isInteger(card.cost) || card.cost < 1 || card.cost > 10) fail(`${label} 费用非法：${card.cost}`);
  if (card.artPath !== `subpackages/card-art-${card.set}/images/${card.id}.jpg`) fail(`${label} artPath 与卡包不一致：${card.artPath}`);

  assert.ok(Array.isArray(card.keywords), `${label} keywords 必须是数组`);
  assert.ok(Array.isArray(card.effects), `${label} effects 必须是数组`);
  for (const keyword of card.keywords) {
    if (!(keyword in KEYWORD_LABEL)) fail(`${label} 未知关键词：${keyword}`);
    const word = KEYWORD_LABEL[keyword];
    if (word && !String(card.rulesText || "").includes(word)) fail(`${label} 关键词 ${keyword}（${word}）未出现在规则文本里：rulesText="${card.rulesText}"`);
  }

  if (card.type === "minion") {
    if (!Number.isInteger(card.attack) || card.attack < 0) fail(`${label} 随从攻击非法：${card.attack}`);
    if (!Number.isInteger(card.health) || card.health < 1) fail(`${label} 随从生命非法：${card.health}`);
  } else if (card.type === "spell") {
    if (card.attack !== null || card.health !== null) fail(`${label} 法术不应有攻血`);
    if (!card.effects.some(effect => effect.trigger === "cast")) fail(`${label} 法术缺少 cast 效果`);
    if (card.keywords.length) fail(`${label} 法术不应带关键词：${card.keywords.join("/")}`);
  } else {
    fail(`${label} 未知卡牌类型：${card.type}`);
  }

  const hasTrigger = trigger => card.effects.some(effect => effect.trigger === trigger);
  if (card.keywords.includes("deathrattle") && !hasTrigger("deathrattle")) fail(`${label} 带亡语关键词但没有 deathrattle 效果`);
  if (hasTrigger("deathrattle") && !card.keywords.includes("deathrattle")) fail(`${label} 有 deathrattle 效果但关键词里没有亡语`);
  if (card.keywords.includes("battlecry") && !hasTrigger("battlecry")) fail(`${label} 带战吼关键词但没有 battlecry 效果`);
  if (hasTrigger("battlecry") && !card.keywords.includes("battlecry")) fail(`${label} 有 battlecry 效果但关键词里没有战吼`);
  if (hasTrigger("aura") && !card.keywords.includes("aura")) fail(`${label} 有 aura 效果但关键词里没有光环`);

  for (const effect of card.effects) {
    if (!TRIGGERS.includes(effect.trigger)) fail(`${label} 效果 trigger 非法：${effect.trigger}`);
    if (!ACTIONS.includes(effect.action)) fail(`${label} 效果 action 非法：${effect.action}`);
    if (effect.target && !TARGETS.includes(effect.target)) fail(`${label} 效果 target 非法：${effect.target}`);
    if (effect.requiredKeyword && !(effect.requiredKeyword in KEYWORD_LABEL)) fail(`${label} requiredKeyword 非法：${effect.requiredKeyword}`);
    if (effect.action === "modify-stats" && (typeof effect.attack !== "number" && typeof effect.health !== "number")) {
      fail(`${label} modify-stats 效果必须给出 attack 或 health 变化`);
    }
    // 各 action 的必填字段：召唤可以用 token+count，增益用 attack/health，抽牌/伤害/治疗用 value
    if (["draw", "heal", "damage"].includes(effect.action) && typeof effect.value !== "number") {
      fail(`${label} ${effect.action} 效果缺少数值 value`);
    }
    if (effect.action === "buff" && typeof effect.attack !== "number" && typeof effect.health !== "number") {
      fail(`${label} buff 效果缺少 attack/health`);
    }
    if (effect.action === "summon") {
      if (!effect.token && typeof effect.value !== "number") fail(`${label} summon 效果缺少 token 或 value`);
      if (effect.token) {
        const token = effect.token;
        if (!token.id || !token.name) fail(`${label} 召唤物缺少 id/名称`);
        if (!Number.isInteger(token.attack) || !Number.isInteger(token.health)) fail(`${label} 召唤物 ${token.id} 攻血必须是整数`);
        if (token.playable !== false) fail(`${label} 召唤物 ${token.id} 不应可收集（playable 应为 false）`);
        if (token.set !== "token") fail(`${label} 召唤物 ${token.id} 的 set 应为 token`);
      }
      if (effect.count !== undefined && (!Number.isInteger(effect.count) || effect.count < 1)) {
        fail(`${label} summon 的 count 必须是正整数`);
      }
    }
  }
}

const tokens = data.tokens || [];
if (tokens.length !== 3) fail(`tokens 数量应为 3，实际 ${tokens.length}`);
for (const token of tokens) {
  if (!token.id || !token.name) fail(`token 缺少 id/名称：${JSON.stringify(token)}`);
  if (!Number.isInteger(token.attack) || token.attack < 0) fail(`token ${token.id} 攻击非法：${token.attack}`);
  if (!Number.isInteger(token.health) || token.health < 1) fail(`token ${token.id} 生命非法：${token.health}`);
}

if (problems.length) {
  console.error(`card data integrity failed (${problems.length}):`);
  for (const problem of problems.slice(0, 40)) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`card data integrity passed: cards=${cards.length}, tokens=${tokens.length}, keywords=${Object.keys(KEYWORD_LABEL).length}`);
