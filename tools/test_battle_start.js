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
  orderBy: (field, direction) => query(name, {}, { field, direction }),
  skip: value => query(name, {}, null, value),
  limit: value => query(name, {}, null, 0, value),
  get: async () => ({ data: [...records(name)].map(([id, value]) => ({ ...value, _id: id })) }),
});

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    const database = { collection, runTransaction: async callback => callback({ collection }) };
    return { init() {}, DYNAMIC_CURRENT_ENV: "test", database: () => database, getWXContext: () => ({ OPENID: "start-user" }) };
  }
  return originalLoad(request, parent, isMain);
};

const battleGame = require("../cloudfunctions/battleGame/index.js");
const initData = require("../cloudfunctions/initGameData/index.js").__test;

const cards = initData.cards;
const deckCards = cards.filter(card => card.set === "base").slice(0, 10).map(card => ({ cardId: card.id, normalCount: 2, shinyCount: 0 }));

records("cards").set("placeholder", { id: "placeholder" });
for (const card of cards) records("cards").set(card.id, card);
records("gameSaves").set("start-user", {
  inventory: deckCards.map(item => ({ cardId: item.cardId, normalCount: item.normalCount, shinyCount: 0 })),
  metrics: { lifetime: {}, daily: { key: "", values: {} }, weekly: { key: "", values: {} } }
});
records("playerDecks").set("start-user", {
  slots: { "1": { slot: 1, name: "测试牌组", generalSkill: "draw-two", cards: deckCards } }
});
records("aiDecks").set("pve-starter", {
  id: "pve-starter",
  name: "星界训练牌组",
  enabled: true,
  generalSkill: "draw-two",
  cards: cards.slice(0, 20).map(card => ({ cardId: card.id, normalCount: 1, shinyCount: 0 }))
});

(async () => {
  const started = await battleGame.main({ action: "start", difficulty: "easy", slot: 1 });
  if (!started || !started.game) throw new Error(`start returned ${JSON.stringify(started).slice(0, 200)}`);
  if (started.game.phase !== "mulligan") throw new Error(`unexpected phase ${started.game.phase}`);
  const hand = started.game.player.hand.length, deckCount = started.game.player.deckCount;
  if (hand < 3 || hand > 5) throw new Error(`unexpected opening hand ${hand}`);
  if (deckCount + hand < 20 || deckCount + hand > 21) throw new Error(`opening hand + deck should cover 20 cards, got ${hand}+${deckCount}`);
  if (started.game.ai.handCount < 3 || started.game.ai.handCount > 5) throw new Error(`unexpected ai hand ${started.game.ai.handCount}`);
  const status = await battleGame.main({ action: "status" });
  if (!status.game || status.game.id !== started.game.id) throw new Error("status did not return the started game");
  console.log(`battle-start-ok hand=${started.game.player.hand.length} deck=${started.game.player.deckCount} aiHand=${started.game.ai.handCount}`);

  // 残留一局会在 processTimeout 里被结算；即使结算过程抛错，也必须能开出新对局（线上 -504002 的兜底）
  records("battleGames").set("start-user", {
    id: "stale-battle",
    mode: "pve",
    difficulty: "easy",
    deckSlot: 1,
    deckName: "测试牌组",
    status: "active",
    phase: "battle",
    firstPlayer: "ai",
    turn: "ai",
    halfTurns: 2,
    sequence: 1,
    player: { name: "你", health: 30, maxHealth: 30, mana: 0, maxMana: 0, tempMana: 0, deck: [], hand: [], board: [], fatigue: 0, heroPowerUsed: false, generalSkill: "draw-two", generalSkillUsed: false, turnsTaken: 2, graveyard: [] },
    ai: { name: "星界守卫", health: 30, maxHealth: 30, mana: 0, maxMana: 0, tempMana: 0, deck: [], hand: [], board: null, fatigue: 0, heroPowerUsed: true, generalSkill: "draw-two", generalSkillUsed: true, turnsTaken: 2, graveyard: [] },
    metrics: { cardsPlayed: 0, minionsKilled: 0, minionsLost: 0, heroDamage: 0, heroPowerUsed: 0, generalSkillUsed: 0 },
    log: [],
    createdAt: Date.now() - 600000,
    updatedAt: Date.now() - 600000,
    deadlineAt: Date.now() - 600000,
    result: "",
    logged: false
  });
  const restarted = await battleGame.main({ action: "start", difficulty: "easy", slot: 1 });
  if (!restarted || !restarted.game) throw new Error("stale game blocked starting a new battle");
  if (restarted.game.id === "stale-battle") throw new Error("stale game was reused instead of replaced");
  console.log(`battle-start-recovery-ok newGame=${restarted.game.phase}`);
})().catch(error => {
  console.error("battle-start-failed", error && error.message, error && error.stack && error.stack.split("\n").slice(0,6).join("\n"));
  process.exitCode = 1;
});
