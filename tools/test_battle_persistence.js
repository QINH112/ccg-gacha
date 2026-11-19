"use strict";

const assert = require("assert");
const Module = require("module");

const stores = new Map();

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
    return { init() {}, DYNAMIC_CURRENT_ENV: "test", database: () => database, getWXContext: () => ({ OPENID: "persistence-user" }) };
  }
  return originalLoad(request, parent, isMain);
};

const battleGame = require("../cloudfunctions/battleGame/index.js");
const now = Date.now();
const side = name => ({ name, health: 30, maxHealth: 30, mana: 1, maxMana: 1, tempMana: 0, deck: [], hand: [], board: [], fatigue: 0, heroPowerUsed: false, generalSkill: "draw-two", generalSkillUsed: false, turnsTaken: 1 });

records("battleGames").set("persistence-user", {
  id: "battle-persistence-test",
  mode: "pve",
  difficulty: "normal",
  deckSlot: 1,
  deckName: "测试牌组",
  status: "active",
  phase: "battle",
  firstPlayer: "player",
  turn: "player",
  halfTurns: 3,
  sequence: 0,
  player: side("你"),
  ai: side("星界守卫"),
  metrics: { cardsPlayed: 2, minionsKilled: 1, minionsLost: 0, heroDamage: 4, heroPowerUsed: 1, generalSkillUsed: 0 },
  log: [],
  createdAt: now - 30000,
  updatedAt: now,
  deadlineAt: now + 75000,
  result: "",
  logged: false,
});
records("gameSaves").set("persistence-user", { metrics: { lifetime: {}, daily: { key: "", values: {} }, weekly: { key: "", values: {} } } });

(async () => {
  const result = await battleGame.main({ action: "concede" });
  assert.equal(result.game.status, "finished");
  assert.equal(result.game.result, "loss");
  assert.equal(records("battleLogs").size, 1);
  const history = await battleGame.main({ action: "history" });
  assert.equal(history.history.length, 1);
  assert.equal(history.history[0].battleId, "battle-persistence-test");
  const metrics = records("gameSaves").get("persistence-user").metrics;
  assert.equal(metrics.lifetime.battleCompleted, 1);
  assert.equal(metrics.lifetime.cardsPlayed, 2);
  await battleGame.main({ action: "concede" });
  assert.equal(records("battleLogs").size, 1);
  assert.equal(records("gameSaves").get("persistence-user").metrics.lifetime.battleCompleted, 1);
  console.log("battle persistence tests passed: concede, log, history, metrics, idempotency");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
