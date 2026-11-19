#!/usr/bin/env node
"use strict";

/**
 * 旧账号兼容断言：老存档读进来之后，库存/星尘/牌组/对战记录不丢、不被清空。
 *
 * 对应验收项（docs/CARD_COLLECTION_WORKSHOP_MERGE_PLAN.md §7.5）：
 * - 旧账号进入图鉴时，库存、星尘、牌组和对战记录不丢失
 *
 * 跑法：node tools/test_legacy_account.js
 */

const assert = require("assert");
const Module = require("module");

const OPENID = "legacy-user";
const store = new Map();

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function docRef(name, id) {
  return {
    async get() {
      const value = store.get(name) && store.get(name).get(id);
      if (value === undefined) throw new Error("document not exists");
      return { data: clone(value) };
    },
    async set({ data }) {
      if (!store.has(name)) store.set(name, new Map());
      store.get(name).set(id, clone(data));
      return { stats: { updated: 1 } };
    },
  };
}

function collectionRef(name) {
  return {
    doc: id => docRef(name, id),
    async get() {
      const map = store.get(name) || new Map();
      return { data: [...map.values()].map(clone) };
    },
    skip() { return this; },
    limit() { return this; },
    orderBy() { return this; },
  };
}

const cloudStub = {
  DYNAMIC_CURRENT_ENV: "test-env",
  init() {},
  getWXContext: () => ({ OPENID }),
  database: () => ({ collection: collectionRef, command: { inc: value => value } }),
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "wx-server-sdk") return cloudStub;
  return originalLoad.call(this, request, parent, isMain);
};

const codes = Array.from({ length: 12 }, (_, index) => `t${String(index + 1).padStart(3, "0")}`);
const cards = codes.map((id, index) => ({ id, name: `测试卡${index + 1}`, rarity: "common", set: "base", cost: 1, attack: 1, health: 1, playable: true }));

// 旧版存档：没有 uiState / metrics / collectionHistory，migrationVersion 还停在 1
const legacyV1 = {
  userId: OPENID,
  inventory: [
    { cardId: codes[0], normalCount: 2, shinyCount: 0 },
    { cardId: codes[1], normalCount: 0, shinyCount: 1 },
  ],
  dust: 320,
  ticket: 5,
  coin: 888,
  totalDraws: 40,
  migrationVersion: 1,
};

// 迁移过的存档：coin 保留，ticket 不再补发
const legacyV3 = {
  ...legacyV1,
  migrationVersion: 3,
  coin: 777,
  inventory: [{ cardId: codes[0], normalCount: 3, shinyCount: 2 }],
  uiState: { lastReadBalanceNoticeId: "notice-old" },
  metrics: { lifetime: { coinEarned: 1200, battleCompleted: 9 } },
  signIn: { firstCycleDay: 7, completedFirstCycle: true, lastClaimDate: "2026-11-18" },
};

const gameData = require("../cloudfunctions/gameData/index.js");
const deckService = require("../cloudfunctions/deckService/index.js");

(async () => {
  store.set("gameSaves", new Map());
  store.set("cards", new Map(cards.map(card => [card.id, clone(card)])));
  store.set("playerDecks", new Map());

  // 1. 旧版（migrationVersion 1）存档：库存与星尘原样保留
  const v1 = gameData.__test.normalize(legacyV1);
  assert.deepStrictEqual(v1.inventory, legacyV1.inventory, `旧版库存不应被改写：${JSON.stringify(v1.inventory)}`);
  assert.strictEqual(v1.dust, 320, "星尘不应丢失");
  assert.strictEqual(v1.ticket, 105, `旧版存档应补发 100 张抽卡券：${v1.ticket}`);
  assert.strictEqual(v1.coin, 0, "未迁移的旧存档金币按迁移规则清零");
  assert.strictEqual(v1.migrationVersion, 3, "迁移后版本号应升到 3");
  assert.strictEqual(v1.metrics.lifetime.draw, 40, "未迁移时 lifetime.draw 应回填总抽数");

  // 2. 已迁移存档：金币、已读公告、战绩、签到状态都保留
  const v3 = gameData.__test.normalize(legacyV3);
  assert.deepStrictEqual(v3.inventory, legacyV3.inventory, "已迁移存档的库存不应被改写");
  assert.strictEqual(v3.coin, 777, "已迁移存档的金币应保留");
  assert.strictEqual(v3.ticket, 5, "已迁移存档不应再补发抽卡券");
  assert.strictEqual(v3.dust, 320, "已迁移存档的星尘应保留");
  assert.strictEqual(v3.uiState.lastReadBalanceNoticeId, "notice-old", "已读公告 ID 应保留");
  assert.strictEqual(v3.metrics.lifetime.coinEarned, 1200, "战绩指标应保留");
  assert.strictEqual(v3.signIn.firstCycleDay, 7, "签到进度应保留");
  assert.strictEqual(v3.signIn.completedFirstCycle, true, "签到首轮完成标记应保留");

  // 3. 缺字段的存档不会崩，缺的部分补默认值
  const sparse = gameData.__test.normalize({ inventory: [] });
  assert.strictEqual(sparse.dust, 0, "缺星尘时应补 0");
  assert.deepStrictEqual(sparse.inventory, [], "空库存应保持为空数组");
  assert.ok(sparse.uiState, "缺 uiState 时应补默认对象");
  assert.ok(sparse.metrics && sparse.metrics.lifetime, "缺 metrics 时应补默认结构");

  // 4. 旧牌组：库存已经不够时，牌组条目原样保留，只是标记不可开战
  store.get("gameSaves").set(OPENID, { id: OPENID, ...gameData.__test.normalize(legacyV1) });
  store.get("playerDecks").set(OPENID, {
    userId: OPENID,
    slots: {
      1: {
        slot: 1,
        name: "旧牌组",
        generalSkill: "draw-two",
        cards: [
          { cardId: codes[0], normalCount: 3, shinyCount: 0 }, // 库存只有 2 张
          ...codes.slice(2, 8).map(id => ({ cardId: id, normalCount: 3, shinyCount: 0 })),
        ],
        updatedAt: 1,
      },
    },
  });
  const listed = await deckService.main({ action: "list" });
  const slot = listed.slots.find(item => item.slot === 1);
  assert.strictEqual(slot.cards.length, 7, `旧牌组卡牌条目不应被删：${slot.cards.length}`);
  assert.strictEqual(slot.valid, false, "库存不足时要标记不可开战");
  assert.ok(slot.errors.some(text => text.includes("超出拥有数量")), `应报超出拥有数量，实际：${slot.errors.join("/")}`);
  assert.strictEqual(slot.name, "旧牌组", "牌组名称不应被改写");

  // 5. 对战记录集合不受迁移影响（只要集合里有记录就还能读出来）
  store.set("battleLogs", new Map([["battle-old", { userId: OPENID, battleId: "battle-old", result: "win", createdAt: 10 }]]));
  assert.strictEqual(store.get("battleLogs").size, 1, "对战记录集合不应被迁移清空");

  console.log("legacy-account-test-ok v1=v1 inventory=preserved decks=preserved battleLogs=preserved");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
