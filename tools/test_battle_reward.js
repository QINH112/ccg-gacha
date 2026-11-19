#!/usr/bin/env node
"use strict";

/**
 * 对局金币奖励回归。
 *
 * 需求（2026-11-19 用户确认）：
 * - 胜利随机 80–120 金币；失败随机 20–40；平局按失败档
 * - 认输/超时/退出也按失败档，但对局时长必须 > 30 秒
 * - 每日战斗金币上限 2000（`metrics.daily.values.battleCoin`）
 * - 结算页显示「+N 金币」
 *
 * 跑法：node tools/test_battle_reward.js
 */

const assert = require("assert");
const Module = require("module");
const path = require("path");

const store = { player: null };
const clone = value => (value == null ? value : JSON.parse(JSON.stringify(value)));

function reference(name, id) {
  return {
    async get() {
      if (name === "gameSaves") return { data: clone(store.player) };
      throw new Error("document not found");
    },
    async set({ data }) {
      if (name === "gameSaves") store.player = clone(data);
      return {};
    },
    async remove() { return {}; }
  };
}

const database = {
  collection: name => ({
    doc: id => reference(name, id),
    skip: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
    where: () => ({ count: async () => ({ total: 0 }), orderBy: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }) })
  }),
  runTransaction: async callback => callback({ collection: database.collection })
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return { init() {}, DYNAMIC_CURRENT_ENV: "test", database: () => database, getWXContext: () => ({ OPENID: "reward-user" }) };
  }
  return originalLoad.apply(this, arguments);
};

const battlePath = path.join(__dirname, "..", "cloudfunctions", "battleGame", "index.js");
const battle = require(battlePath);
const { grantBattleReward } = battle.__test;

function playerState(overrides = {}) {
  const base = {
    coin: 0,
    ticket: 10,
    dust: 0,
    inventory: [],
    pity: {},
    signIn: { firstCycleDay: 0 },
    metrics: { lifetime: {}, daily: { key: "", values: {} }, weekly: { key: "", values: {} } },
    collectionHistory: { normalIds: [], shinyIds: [] },
    taskState: {},
    uiState: {}
  };
  return { ...base, ...overrides, metrics: { ...base.metrics, ...(overrides.metrics || {}) } };
}

const originalRandom = Math.random;
const todayKey = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

async function grant(game, overrides, random) {
  store.player = playerState(overrides);
  Math.random = () => random;
  const now = Date.now();
  const reward = await grantBattleReward("reward-user", { createdAt: now - (game.durationMs || 60000), finishedAt: now, ...game });
  return reward;
}

(async () => {
  // 1) 胜利：80–120（随机数 0 → 取下界 80）
  {
    const reward = await grant({ result: "win" }, {}, 0);
    assert.strictEqual(reward.coin, 80, "随机 0 时胜利应给区间下界 80");
    assert.strictEqual(reward.tier, "win");
    assert.strictEqual(store.player.coin, 80, "金币应加到玩家余额");
    assert.strictEqual(store.player.metrics.daily.values.battleCoin, 80, "应记录当日战斗金币");
    assert.strictEqual(store.player.metrics.lifetime.coinEarned, 80, "应累加累计金币收入");
  }

  // 2) 胜利：随机接近 1 → 上界 120
  {
    const reward = await grant({ result: "win" }, {}, 0.999);
    assert.strictEqual(reward.coin, 120, "随机接近 1 时胜利应给 120");
  }

  // 3) 失败：20–40
  {
    const reward = await grant({ result: "loss" }, {}, 0);
    assert.strictEqual(reward.coin, 20);
    assert.strictEqual(reward.tier, "loss");
  }
  {
    const reward = await grant({ result: "loss" }, {}, 0.999);
    assert.strictEqual(reward.coin, 40);
  }

  // 4) 平局按失败档
  {
    const reward = await grant({ result: "draw" }, {}, 0);
    assert.strictEqual(reward.tier, "draw");
    assert.strictEqual(reward.coin, 20, "平局应按失败档发放");
  }

  // 5) 对局不足 30 秒：不发
  {
    const reward = await grant({ result: "win", durationMs: 12000 }, {}, 0);
    assert.strictEqual(reward.coin, 0, "不足 30 秒不应发金币");
    assert.strictEqual(reward.reason, "duration");
    assert.strictEqual(store.player.coin, 0);
  }
  {
    // 边界：正好 30 秒也按「未超过」处理
    const reward = await grant({ result: "win", durationMs: 30000 }, {}, 0);
    assert.strictEqual(reward.coin, 0, "30 秒整不算超过 30 秒");
  }
  {
    const reward = await grant({ result: "win", durationMs: 30001 }, {}, 0);
    assert.strictEqual(reward.coin, 80, "超过 30 秒才有奖励");
  }

  // 6) 每日上限：已拿 1980，本次只能补 20
  {
    const reward = await grant({ result: "win" }, { metrics: { lifetime: {}, daily: { key: todayKey(), values: { battleCoin: 1980 } }, weekly: { key: "", values: {} } } }, 0.999);
    assert.strictEqual(reward.roll, 120, "先算原始掉落 120");
    assert.strictEqual(reward.coin, 20, "上限内只剩 20，应截断到 20");
    assert.strictEqual(reward.reason, "cap");
    assert.strictEqual(store.player.metrics.daily.values.battleCoin, 2000);
    assert.strictEqual(store.player.coin, 20);
  }

  // 7) 上限已满：不再发
  {
    const reward = await grant({ result: "win" }, { metrics: { lifetime: {}, daily: { key: todayKey(), values: { battleCoin: 2000 } }, weekly: { key: "", values: {} } } }, 0);
    assert.strictEqual(reward.coin, 0);
    assert.strictEqual(reward.reason, "cap");
    assert.strictEqual(store.player.coin, 0);
  }

  Math.random = originalRandom;
  console.log("battle-reward-ok win=80-120 loss=20-40 dailyCap=2000 minDuration=30s");
})().catch(error => {
  Math.random = originalRandom;
  console.error("battle-reward-failed", error);
  process.exit(1);
});
