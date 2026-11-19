"use strict";

const assert = require("assert");
const Module = require("module");

const stores = new Map();
let currentOpenid = "cloud-user-a";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function records(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
}

function reference(name, id) {
  return {
    async get() {
      const value = records(name).get(String(id));
      if (!value) throw new Error("document not found");
      return { data: { ...clone(value), _id: String(id) } };
    },
    async set({ data }) {
      records(name).set(String(id), clone(data));
      return {};
    },
    async remove() {
      records(name).delete(String(id));
      return {};
    },
  };
}

function query(name, filter = {}, sort = null, skip = 0, limit = 100) {
  return {
    field() { return query(name, filter, sort, skip, limit); },
    where(next) { return query(name, next, sort, skip, limit); },
    orderBy(field, direction) { return query(name, filter, { field, direction }, skip, limit); },
    skip(value) { return query(name, filter, sort, value, limit); },
    limit(value) { return query(name, filter, sort, skip, value); },
    async count() {
      const result = await this.get();
      return { total: result.data.length };
    },
    async get() {
      let data = [...records(name)].map(([id, value]) => ({ ...clone(value), _id: id }));
      data = data.filter(item => Object.entries(filter).every(([key, value]) => item[key] === value));
      if (sort) data.sort((left, right) => {
        const comparison = Number(left[sort.field] || 0) - Number(right[sort.field] || 0);
        return sort.direction === "desc" ? -comparison : comparison;
      });
      return { data: data.slice(skip, skip + limit) };
    },
  };
}

function collection(name) {
  return {
    doc: id => reference(name, id),
    field: () => query(name),
    where: filter => query(name, filter),
    orderBy: (field, direction) => query(name, {}, { field, direction }),
    skip: value => query(name, {}, null, value),
    limit: value => query(name, {}, null, 0, value),
  };
}

const database = {
  collection,
  serverDate: () => Date.now(),
  runTransaction: async callback => callback({ collection }),
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") return {
    init() {},
    DYNAMIC_CURRENT_ENV: "test",
    database: () => database,
    getWXContext: () => ({ OPENID: currentOpenid }),
  };
  return originalLoad(request, parent, isMain);
};

const cardData = require("../cloudfunctions/initGameData/index.js").__test.cards;
const gameData = require("../cloudfunctions/gameData/index.js");
const drawCards = require("../cloudfunctions/drawCards/index.js");
const deckService = require("../cloudfunctions/deckService/index.js");
const battleGame = require("../cloudfunctions/battleGame/index.js");

for (const card of cardData) records("cards").set(card.id, card);
records("cardSets").set("base", { id: "base", name: "基础卡牌包", order: 1, published: true });
records("cardSets").set("star-remnant", { id: "star-remnant", name: "星骸遗响", order: 2, published: true });
records("cardPools").set("base", { id: "base", name: "基础召唤池", setIds: ["base"], order: 1, enabled: true });
records("cardPools").set("mixed", { id: "mixed", name: "混合召唤池", setIds: ["base", "star-remnant"], order: 2, enabled: true });
records("cardPools").set("star-remnant", { id: "star-remnant", name: "星骸遗响限定池", setIds: ["star-remnant"], order: 3, enabled: true });
records("gameConfig").set("main", {
  rarityRates: { common: 70, rare: 20, epic: 7.5, legendary: 2.5 },
  legendaryPity: 40,
  tenDrawGuarantee: { epic: 95, legendary: 5 },
  signIn: { firstCycle: [{ type: "ticket", amount: 50 }], dailyAfterCycle: { type: "ticket", amount: 5 } },
});
records("balanceNotices").set("balance-old", { id:"balance-old",title:"旧公告",summary:"历史调整",version:1,publishedAt:100,enabled:true,changes:[] });
records("balanceNotices").set("balance-latest", { id:"balance-latest",title:"最新公告",summary:"本期调整",version:2,publishedAt:200,enabled:true,changes:[{cardId:"c001",name:"星尘学徒",before:{cost:1,attack:1,health:2,keywords:[],rulesText:""},after:{cost:1,attack:1,health:3,keywords:[],rulesText:""},note:"生命提高"}] });
records("balanceNotices").set("balance-disabled", { id:"balance-disabled",title:"关闭公告",publishedAt:300,enabled:false,changes:[] });

const oldPlayer = {
  inventory: [
    { cardId: "c001", normalCount: 2, shinyCount: 0 },
    { cardId: "s020", normalCount: 0, shinyCount: 1 },
  ],
  totalDraws: 321,
  dust: 888,
  ticket: 25,
  coin: 4321,
  pity: { base: 39, mixed: 5, "star-remnant": 7 },
  signIn: { firstCycleDay: 4, lastClaimDate: "2026-11-17", completedFirstCycle: false },
  collectionHistory: { normalIds: ["c001"], shinyIds: ["s020"] },
  metrics: { lifetime: { draw: 321 }, daily: { key: "", values: {} }, weekly: { key: "", values: {} } },
  taskState: { achievement: { claimed: { first: true } } },
  migrationVersion: 3,
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now(),
};

records("gameSaves").set("cloud-user-a", oldPlayer);
records("playerDecks").set("cloud-user-a", {
  userId: "cloud-user-a",
  slots: { "1": { slot: 1, name: "旧玩家牌组", generalSkill: "heal-five", cards: [], updatedAt: Date.now() } },
});

function battleDocument(id) {
  const now = Date.now();
  const side = name => ({ name, health: 30, maxHealth: 30, mana: 1, maxMana: 1, tempMana: 0, deck: [], hand: [], board: [], fatigue: 0, heroPowerUsed: false, generalSkill: "draw-two", generalSkillUsed: false, turnsTaken: 1 });
  return {
    id,
    mode: "pve",
    difficulty: "normal",
    deckSlot: 1,
    deckName: "旧玩家牌组",
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
    createdAt: now - 30000,
    updatedAt: now,
    deadlineAt: now + 75000,
    result: "",
    logged: false,
  };
}

records("battleGames").set("cloud-user-a", battleDocument("existing-battle-a"));

function inventoryEntry(player, cardId) {
  return player.inventory.find(item => item.cardId === cardId);
}

(async () => {
  currentOpenid = "cloud-user-a";
  const firstLoad = await gameData.main({ action: "load" });
  assert.equal(firstLoad.cards.length, 74);
  assert.equal(firstLoad.player.coin, 4321);
  assert.equal(firstLoad.player.ticket, 25);
  assert.equal(firstLoad.player.signIn.firstCycleDay, 4);
  assert.deepEqual(firstLoad.player.uiState, { lastReadBalanceNoticeId:"" });
  assert.equal(firstLoad.balanceNotices.latest.id, "balance-latest");
  assert.deepEqual(firstLoad.balanceNotices.items.map(item=>item.id), ["balance-latest","balance-old"]);
  assert.equal(firstLoad.hasUnreadBalanceNotice, true);
  assert.deepEqual(inventoryEntry(firstLoad.player, "c001"), { cardId: "c001", normalCount: 2, shinyCount: 0 });
  assert.deepEqual(inventoryEntry(firstLoad.player, "s020"), { cardId: "s020", normalCount: 0, shinyCount: 1 });

  const secondLoad = await gameData.main({ action: "load" });
  assert.equal(secondLoad.player.coin, firstLoad.player.coin);
  assert.equal(secondLoad.player.totalDraws, firstLoad.player.totalDraws);
  assert.deepEqual(secondLoad.player.inventory, firstLoad.player.inventory, "Repeated load must not duplicate or drop old cards");

  await assert.rejects(()=>gameData.main({ action:"markBalanceNoticeRead",noticeId:"balance-old" }),/只能标记当前最新公告/);
  const readResult = await gameData.main({ action:"markBalanceNoticeRead",noticeId:"balance-latest" });
  assert.equal(readResult.player.uiState.lastReadBalanceNoticeId, "balance-latest");
  assert.equal(readResult.hasUnreadBalanceNotice, false);
  const afterReadLoad = await gameData.main({ action:"load" });
  assert.equal(afterReadLoad.hasUnreadBalanceNotice, false);
  assert.equal(afterReadLoad.player.uiState.lastReadBalanceNoticeId, "balance-latest");

  const decksA = await deckService.main({ action: "list" });
  assert.equal(decksA.slots[0].name, "旧玩家牌组");
  const battleA = await battleGame.main({ action: "status" });
  assert.equal(battleA.game.id, "existing-battle-a");

  currentOpenid = "cloud-user-b";
  const userB = await gameData.main({ action: "load" });
  assert.equal(userB.player.coin, 1000);
  assert.equal(userB.player.ticket, 100);
  assert.equal(userB.player.inventory.length, 0);
  assert.equal(userB.hasUnreadBalanceNotice, true);
  assert.equal(userB.player.uiState.lastReadBalanceNoticeId, "");
  assert.notEqual(userB.userKey, firstLoad.userKey);
  const decksB = await deckService.main({ action: "list" });
  assert.equal(decksB.slots[0].name, "牌组 1");
  const battleB = await battleGame.main({ action: "status" });
  assert.equal(battleB.game, null);
  assert.equal(records("gameSaves").get("cloud-user-a").coin, 4321);

  currentOpenid = "cloud-user-a";
  const originalRandom = Math.random;
  Math.random = () => 0.01;
  const starDraw = await drawCards.main({ poolId: "star-remnant", count: 1 });
  assert.equal(starDraw.player.pity.base, 39);
  assert.equal(starDraw.player.pity.mixed, 5);
  assert.equal(starDraw.player.pity["star-remnant"], 8);
  const baseDraw = await drawCards.main({ poolId: "base", count: 1 });
  Math.random = originalRandom;
  assert.equal(baseDraw.results[0].pityTriggered, true);
  assert.equal(baseDraw.player.pity.base, 0);
  assert.equal(baseDraw.player.pity.mixed, 5);
  assert.equal(baseDraw.player.pity["star-remnant"], 8);

  const finalLoad = await gameData.main({ action: "load" });
  assert.deepEqual(inventoryEntry(finalLoad.player, "c001"), { cardId: "c001", normalCount: 2, shinyCount: 0 });
  assert.deepEqual(inventoryEntry(finalLoad.player, "s020"), { cardId: "s020", normalCount: 0, shinyCount: 1 });
  assert.equal(records("gameSaves").get("cloud-user-b").totalDraws, 0);
  console.log("cloud data compatibility tests passed: OpenID isolation, balance notice read sync, reload persistence, decks, battle state, 74-card migration, independent pity");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
