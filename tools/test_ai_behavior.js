#!/usr/bin/env node
"use strict";

/**
 * AI 回合行为断言：AI 得有可执行的策略，而不是随机乱打。
 *
 * 对应验收项（docs/CARD_DESIGN_PLAN.md §5「可实现性与回归保护」）：
 * - AI 对目标选择、入场时机、攻击顺序和英雄伤害有可执行策略
 *
 * 场景：空场打脸、城墙优先、有能量就出牌、能斩杀就斩杀、无牌可出时交还回合。
 *
 * 跑法：node tools/test_ai_behavior.js
 */

const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    const collection = () => ({
      doc: () => ({ get: async () => ({ data: {} }), set: async () => ({}) }),
      where: () => ({ orderBy: () => ({ limit: async () => ({ data: [] }) }) }),
    });
    return { init() {}, DYNAMIC_CURRENT_ENV: "test", database: () => ({ collection, runTransaction: async callback => callback({ collection }) }), getWXContext: () => ({ OPENID: "ai-test" }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const engine = require("../cloudfunctions/battleGame/index.js").__test;

let instanceSeq = 0;

function side(name) {
  return {
    name,
    health: 30,
    maxHealth: 30,
    mana: 0,
    maxMana: 10,
    tempMana: 0,
    deck: [],
    hand: [],
    board: [],
    fatigue: 0,
    heroPowerUsed: false,
    generalSkill: "draw-two",
    generalSkillUsed: false,
    turnsTaken: 2,
    graveyard: [],
  };
}

function game() {
  return {
    status: "active",
    mode: "pve",
    difficulty: "normal",
    turn: "ai",
    sequence: 0,
    halfTurns: 4,
    player: side("玩家"),
    ai: side("对手"),
    metrics: { cardsPlayed: 0, minionsKilled: 0, minionsLost: 0, heroDamage: 0, heroPowerUsed: 0, generalSkillUsed: 0 },
    log: [],
    actionEvents: [],
  };
}

function card(id, attack, health, keywords = [], effects = [], cost = 1) {
  instanceSeq += 1;
  return {
    instanceId: `${id}-i${instanceSeq}`,
    id,
    name: id,
    rarity: "common",
    set: "test",
    element: "✦",
    type: "minion",
    cost,
    attack,
    health,
    keywords,
    effects,
    shiny: false,
    attacksLeft: keywords.includes("charge") || keywords.includes("rush") ? 1 : 1,
    canAttack: true,
  };
}

function minion(state, who, definition) {
  const result = engine.createMinion(definition, state);
  // 直接摆到场上等于「已经过了召唤回合」，可以立即攻击
  result.canAttack = true;
  result.attacksLeft = 1;
  state[who].board.push(result);
  engine.refreshAuras(state);
  return result;
}

// 1. 玩家空场：AI 随从直接打玩家英雄
function testAiAttacksHeroOnEmptyBoard() {
  const state = game();
  minion(state, "ai", card("ai-hit", 4, 4));
  engine.aiTurn(state);
  assert.ok(state.player.health <= 26, `4 攻随从至少应打掉 4 点（英雄技能可能再补 1），实际血量 ${state.player.health}`);
  assert.strictEqual(state.turn, "player", "AI 打完应把回合交还玩家");
}

// 2. 玩家有城墙：AI 必须先打城墙，不能越过打脸
function testAiRespectsGuard() {
  const state = game();
  state.player.health = 30;
  const wall = minion(state, "player", card("wall", 2, 9, ["guard"]));
  minion(state, "ai", card("ai-big", 6, 6));
  engine.aiTurn(state);
  assert.ok(state.player.health >= 28, `城墙在场时 AI 不能越过城墙打脸，实际血量 ${state.player.health}`);
  assert.ok(wall.health < 9 || wall.health <= 0, `城墙应被攻击，实际血量 ${wall.health}`);
}

// 3. 有能量且有牌：AI 会出牌
function testAiPlaysCards() {
  const state = game();
  state.ai.mana = 10;
  state.ai.maxMana = 10;
  state.ai.hand.push(card("ai-drop", 3, 3, [], [], 2));
  const boardBefore = state.ai.board.length;
  engine.aiTurn(state);
  assert.ok(state.ai.board.length > boardBefore, "AI 有能量和手牌时应出牌");
  assert.strictEqual(state.ai.hand.length, 0, "打出的牌应从手牌移除");
}

// 4. 能斩杀就斩杀
function testAiTakesLethal() {
  const state = game();
  state.player.health = 2;
  minion(state, "ai", card("finisher", 5, 5));
  engine.aiTurn(state);
  assert.strictEqual(state.result, "loss", `应直接斩杀，实际 result=${state.result}`);
  assert.strictEqual(state.status, "finished", "斩杀后对局应结束");
}

// 5. 无牌可出、无随从可攻击：回合交还玩家
function testAiEndsTurnQuietly() {
  const state = game();
  state.ai.mana = 0;
  state.ai.tempMana = 0;
  state.ai.hand = [];
  engine.aiTurn(state);
  assert.strictEqual(state.turn, "player", "AI 无事可做时应把回合交还玩家");
  assert.ok(state.player.health >= 29, `无事可做时最多只有英雄技能的 1 点伤害，实际血量 ${state.player.health}`);
  assert.strictEqual(state.status, "active", "对局应继续");
}

// 6. AI 不会把随从挤超过战场上限
function testAiRespectsBoardLimit() {
  const state = game();
  state.ai.mana = 10;
  state.ai.maxMana = 10;
  for (let index = 0; index < 7; index += 1) {
    minion(state, "ai", card(`filled-${index}`, 1, 1));
  }
  state.ai.hand.push(card("overflow", 2, 2, [], [], 1));
  engine.aiTurn(state);
  assert.ok(state.ai.board.length <= 7, `AI 场上随从不应超过 7 个，实际 ${state.ai.board.length}`);
}

const cases = [
  testAiAttacksHeroOnEmptyBoard,
  testAiRespectsGuard,
  testAiPlaysCards,
  testAiTakesLethal,
  testAiEndsTurnQuietly,
  testAiRespectsBoardLimit,
];

for (const test of cases) {
  test();
  console.log(`  ok ${test.name}`);
}
console.log(`ai-behavior-test-ok cases=${cases.length}`);
