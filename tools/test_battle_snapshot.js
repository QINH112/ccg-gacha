#!/usr/bin/env node
"use strict";

/**
 * 对局快照断言：已开始的对局不依赖玩家的当前库存与牌组。
 *
 * 对应验收项（docs/CARD_COLLECTION_WORKSHOP_MERGE_PLAN.md §7.5）：
 * - 操作发生前已开始的对局继续使用原快照正常完成
 *
 * 做法：先造一个进行中的对局（手牌 + 牌库），记下手牌与牌库快照；
 * 然后把玩家库存和牌组全部删掉/改掉，再继续打一回合，断言对局照常进行、
 * 手牌与牌库没有从被改动后的牌组里补进新卡。
 *
 * 跑法：node tools/test_battle_snapshot.js
 */

const assert = require("assert");
const Module = require("module");

const stores = new Map();
const OPENID = "snapshot-user";

function records(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
}

function reference(name, id) {
  return {
    async get() {
      const value = records(name).get(id);
      if (!value) throw new Error("document not found");
      return { data: { ...value, _id: id } };
    },
    async set({ data }) {
      records(name).set(id, { ...data });
      return {};
    },
    async remove() {
      records(name).delete(id);
      return {};
    },
  };
}

function query(name, filter = {}, sort = null, skip = 0, limit = 100) {
  return {
    orderBy(field, direction) { return query(name, filter, { field, direction }, skip, limit); },
    skip(value) { return query(name, filter, sort, value, limit); },
    limit(value) { return query(name, filter, sort, skip, value); },
    async get() {
      let data = [...records(name)].map(([id, value]) => ({ ...value, _id: id }));
      data = data.filter(item => Object.entries(filter).every(([key, value]) => item[key] === value));
      if (sort) data.sort((left, right) => (left[sort.field] - right[sort.field]) * (sort.direction === "desc" ? -1 : 1));
      return { data: data.slice(skip, skip + limit) };
    },
  };
}

const collection = name => ({
  doc: id => reference(name, id),
  where: filter => query(name, filter),
});

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    const database = { collection, runTransaction: async callback => callback({ collection }) };
    return { init() {}, DYNAMIC_CURRENT_ENV: "test", database: () => database, getWXContext: () => ({ OPENID }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const battleGame = require("../cloudfunctions/battleGame/index.js");
const now = Date.now();

function minionCard(id, cost = 1) {
  return {
    id,
    name: `快照随从 ${id}`,
    rarity: "common",
    set: "base",
    type: "minion",
    cost,
    attack: 2,
    health: 3,
    keywords: [],
    effects: [],
    description: "快照测试用。",
    playable: true,
  };
}

const snapshotDeck = Array.from({ length: 17 }, (_, index) => minionCard(`deck-${String(index + 1).padStart(2, "0")}`));
const snapshotHand = [minionCard("hand-01"), minionCard("hand-02"), minionCard("hand-03")];

const side = name => ({
  name,
  health: 30,
  maxHealth: 30,
  mana: 10,
  maxMana: 10,
  tempMana: 0,
  deck: snapshotDeck.map((card, index) => ({ ...card, instanceId: `${card.id}-i${index + 1}` })),
  hand: snapshotHand.map((card, index) => ({ ...card, instanceId: `${card.id}-i${index + 1}` })),
  board: [],
  fatigue: 0,
  heroPowerUsed: false,
  generalSkill: "draw-two",
  generalSkillUsed: false,
  turnsTaken: 1,
});

records("battleGames").set(OPENID, {
  id: "battle-snapshot-test",
  mode: "pve",
  difficulty: "normal",
  deckSlot: 1,
  deckName: "快照牌组",
  status: "active",
  phase: "battle",
  firstPlayer: "player",
  turn: "player",
  halfTurns: 3,
  sequence: 0,
  player: side("你"),
  ai: side("星界守卫"),
  metrics: { cardsPlayed: 0, minionsKilled: 0, minionsLost: 0, heroDamage: 0, heroPowerUsed: 0, generalSkillUsed: 0 },
  log: [],
  createdAt: now - 40000,
  updatedAt: now,
  deadlineAt: now + 900000,
  result: "",
  logged: false,
});

// 玩家当前存档与牌组：故意与对局快照完全不同，而且库存是空的
records("gameSaves").set(OPENID, {
  userId: OPENID,
  inventory: [],
  dust: 0,
  ticket: 0,
  coin: 0,
  metrics: { lifetime: {}, daily: { key: "", values: {} }, weekly: { key: "", values: {} } },
});
records("playerDecks").set(OPENID, {
  userId: OPENID,
  slots: { 1: { slot: 1, name: "空牌组", generalSkill: "draw-two", cards: [], updatedAt: now } },
});

const snapshotIds = new Set([...snapshotDeck, ...snapshotHand].map(card => card.id));

(async () => {
  // 1. 改库存前后，status 返回的对局完全一致
  const before = await battleGame.main({ action: "status" });
  assert.ok(before.game, "应能读取进行中的对局");
  const handBefore = before.game.player.hand.map(card => card.id);
  const storedBefore = records("battleGames").get(OPENID);
  const deckBefore = storedBefore.player.deck.map(card => card.id);
  assert.strictEqual(handBefore.length, 3, `手牌应为 3 张，实际 ${handBefore.length}`);
  assert.strictEqual(deckBefore.length, 17, `牌库应为 17 张，实际 ${deckBefore.length}`);

  // 模拟玩家在图鉴里分解掉卡牌、把牌组清空（存档已经和快照无关）
  records("gameSaves").set(OPENID, { ...records("gameSaves").get(OPENID), inventory: [] });
  records("playerDecks").set(OPENID, { userId: OPENID, slots: { 1: { slot: 1, name: "空牌组", generalSkill: "draw-two", cards: [], updatedAt: Date.now() } } });

  const after = await battleGame.main({ action: "status" });
  assert.strictEqual(after.game.id, before.game.id, "对局 ID 不应变化");
  assert.strictEqual(after.game.createdAt, before.game.createdAt, "对局创建时间不应变化");
  assert.deepStrictEqual(after.game.player.hand.map(card => card.id), handBefore, "库存改动不应影响手牌");
  assert.deepStrictEqual(records("battleGames").get(OPENID).player.deck.map(card => card.id), deckBefore, "牌组改动不应影响牌库");

  // 2. 用快照继续出牌
  const played = await battleGame.main({ action: "play", handId: "hand-01-i1" });
  assert.strictEqual(played.game.player.hand.length, 2, `出牌后手牌应为 2 张，实际 ${played.game.player.hand.length}`);
  assert.strictEqual(played.game.player.board.length, 1, "出牌后场上应有 1 个随从");
  assert.strictEqual(played.game.player.board[0].name, "快照随从 hand-01", "召唤的应是快照里的那张卡");

  // 3. 结束回合，AI 正常行动
  const ended = await battleGame.main({ action: "endTurn" });
  assert.ok(ended.game, "结束回合应返回对局");
  assert.strictEqual(ended.game.status, "active", "对局应仍在进行");

  // 4. 全程没有从被改动后的牌组里补进新卡
  const live = await battleGame.main({ action: "status" });
  const store = records("battleGames").get(OPENID);
  const idOf = card => String(card.id || card.cardId || card.instanceId || "");
  const allIds = [
    ...live.game.player.hand.map(idOf),
    ...store.player.deck.map(idOf),
    ...live.game.player.board.map(idOf),
  ].filter(Boolean);
  for (const id of allIds) {
    if (id.startsWith("hand-") || id.startsWith("deck-")) {
      assert.ok(snapshotIds.has(id), `出现快照之外的手牌/牌库卡：${id}`);
    }
  }
  assert.strictEqual(store.player.deck.length + live.game.player.hand.length, 19, `应只剩快照里的 19 张（20 - 已出 1 张），实际 ${store.player.deck.length + live.game.player.hand.length}`);

  console.log("battle-snapshot-test-ok hand=3 deck=17 played=1 survivors=19");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
