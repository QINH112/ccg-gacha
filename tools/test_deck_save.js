#!/usr/bin/env node
"use strict";

/**
 * 牌组存档行为断言（内存云数据库，跑真实 deckService）。
 *
 * 对应验收项（docs/CARD_COLLECTION_WORKSHOP_MERGE_PLAN.md §7.4）：
 * - 库存不足的旧牌组未修改退出时保持不变
 * - 再次保存时若仍不合法：允许保存但标记不可开战，不自动删卡、不自动替换版本
 * - 非闪版本与闪卡版本均能继续用于现有牌组
 *
 * 跑法：node tools/test_deck_save.js
 */

const assert = require("assert");
const Module = require("module");

const store = new Map();
const OPENID = "deck-save-user";

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
    async update({ data }) {
      if (!store.has(name)) store.set(name, new Map());
      const current = store.get(name).get(id) || {};
      store.get(name).set(id, { ...current, ...clone(data) });
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

function seed(name, records) {
  store.set(name, new Map(records.map(record => [record.id || record.cardId || record.userId, clone(record)])));
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

function freshPlayer() {
  return {
    userId: OPENID,
    inventory: codes.map(id => ({ cardId: id, normalCount: 3, shinyCount: 1 })),
    dust: 100,
    coin: 100,
    ticket: 10,
    metrics: { lifetime: { coinEarned: 0, ticketEarned: 0, battleCompleted: 0, cardsPlayed: 0 } },
    createdAt: 1,
    updatedAt: 1,
  };
}

function deckOf(entries, name = "测试牌组") {
  return { name, generalSkill: "draw-two", cards: entries };
}

// 20 张：6 张卡各 3 张 + 1 张卡 2 张
const validEntries = [
  ...codes.slice(0, 6).map(id => ({ cardId: id, normalCount: 3, shinyCount: 0 })),
  { cardId: codes[6], normalCount: 2, shinyCount: 0 },
];

const deckService = require("../cloudfunctions/deckService/index.js");

(async () => {
  seed("gameSaves", [{ id: OPENID, ...freshPlayer() }]);
  seed("cards", cards);
  store.delete("playerDecks");

  // 1. 新玩家列表：5 个空槽位，都不可开战
  let listed = await deckService.main({ action: "list" });
  assert.strictEqual(listed.slots.length, 5, "应有 5 个牌组槽位");
  assert.ok(listed.slots.every(slot => slot.valid === false), "空槽位不应可开战");

  // 2. 保存合法 20 张牌组
  const saved = await deckService.main({ action: "save", slot: 1, deck: deckOf(validEntries) });
  assert.strictEqual(saved.deck.valid, true, `合法牌组应可保存：${saved.deck.errors.join("/")}`);
  assert.strictEqual(saved.deck.count, 20, "牌组张数应为 20");

  // 3. 保存超量牌组：允许保存，但标记不可开战，且不删卡、不换版本
  const inventoryBefore = clone(store.get("gameSaves").get(OPENID).inventory);
  const overEntries = [
    { cardId: codes[0], normalCount: 4, shinyCount: 0 }, // 同名上限 3，超出 1 张
    ...codes.slice(1, 8).map(id => ({ cardId: id, normalCount: 3, shinyCount: 0 })),
  ]; // 8 张卡共 25 张
  const over = await deckService.main({ action: "save", slot: 2, deck: deckOf(overEntries, "超量牌组") });
  assert.strictEqual(over.deck.valid, false, "超量牌组应标记不可开战");
  assert.ok(over.deck.errors.some(text => text.includes("最多可放 3 张")), `应报同名上限，实际：${over.deck.errors.join("/")}`);
  assert.strictEqual(over.deck.cards.length, 8, "保存不应删掉任何卡牌条目");
  assert.deepStrictEqual(store.get("gameSaves").get(OPENID).inventory, inventoryBefore, "保存牌组不应改动玩家库存");

  // 4. 逐版本校验：拥有普通 2 / 闪卡 0 时，牌组写「普通 2 + 闪卡 1」必须被拒
  const hybrid = clone(store.get("gameSaves").get(OPENID));
  hybrid.inventory = codes.map(id => ({ cardId: id, normalCount: 2, shinyCount: 0 }));
  store.get("gameSaves").set(OPENID, hybrid);
  const hybridEntries = [
    ...codes.slice(0, 6).map(id => ({ cardId: id, normalCount: 2, shinyCount: 0 })),
    { cardId: codes[6], normalCount: 2, shinyCount: 1 },
  ];
  const hybridResult = await deckService.main({ action: "save", slot: 3, deck: deckOf(hybridEntries, "混编牌组") });
  assert.strictEqual(hybridResult.deck.valid, false, "版本不能互相抵扣");
  assert.ok(hybridResult.deck.errors.some(text => text.includes("超出拥有数量")), `应报超出拥有数量，实际：${hybridResult.deck.errors.join("/")}`);

  // 5. 不足 20 张：标记不可开战，但仍然保存下来（不自动补齐）
  const shortEntries = codes.slice(0, 3).map(id => ({ cardId: id, normalCount: 2, shinyCount: 0 }));
  const short = await deckService.main({ action: "save", slot: 4, deck: deckOf(shortEntries, "未完成牌组") });
  assert.strictEqual(short.deck.valid, false, "6 张牌组应不可开战");
  assert.strictEqual(short.deck.complete, false, "6 张牌组应为未完成");
  assert.strictEqual(short.deck.count, 6, "保存时不应自动补卡");

  // 6. 两个版本都能存进牌组（合法时）
  store.get("gameSaves").set(OPENID, { id: OPENID, ...freshPlayer() });
  const shinyEntries = [
    ...codes.slice(0, 3).map(id => ({ cardId: id, normalCount: 2, shinyCount: 1 })),
    ...codes.slice(3, 8).map(id => ({ cardId: id, normalCount: 2, shinyCount: 0 })),
    { cardId: codes[8], normalCount: 0, shinyCount: 1 },
  ];
  const shinySaved = await deckService.main({ action: "save", slot: 5, deck: deckOf(shinyEntries, "闪卡牌组") });
  assert.strictEqual(shinySaved.deck.count, 20, `混编版本应能凑满 20 张，实际 ${shinySaved.deck.count}`);
  assert.strictEqual(shinySaved.deck.valid, true, `混编版本合法时应可保存：${shinySaved.deck.errors.join("/")}`);
  assert.ok(shinySaved.deck.cards.some(item => item.shinyCount > 0), "闪卡版本应原样保留在牌组里");

  // 7. 清空槽位
  const cleared = await deckService.main({ action: "clear", slot: 1 });
  assert.strictEqual(cleared.deck.cards.length, 0, "清空后牌组应为空");
  assert.strictEqual(cleared.deck.valid, false, "清空后不应可开战");

  // 8. 槽位越界
  await assert.rejects(() => deckService.main({ action: "save", slot: 9, deck: deckOf(validEntries) }), /牌组槽位无效/);

  console.log("deck-save-test-ok slots=5 errorKinds=同名上限/超出拥有数量/未完成");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
