"use strict";

// 抽卡概率与保底逻辑审计：直接跑 cloudfunctions/drawCards/index.js 的 exports.main，
// 用内存版云数据库 + 可控 Math.random，验证
//  1) 传说保底：第 legendaryPity 次仍未出传说时必须强制传说，并把 pity 归零
//  2) 十连保底：前 9 张没有史诗及以上时，第 10 张必须给史诗或传说（按 config.tenDrawGuarantee）
//  3) 十连保底不会在前 9 张已出史诗/传说时重复触发
//  4) 自然出传说时 pity 归零
//  5) 抽卡券不足、非法次数、卡池关闭都要报错且不改存档

const assert = require("assert");
const Module = require("module");

const CONFIG = {
  legendaryPity: 40,
  tenDrawGuarantee: { epic: 95, legendary: 5 },
  rarityRates: { common: 70, rare: 20, epic: 7.5, legendary: 2.5 },
  initialTicket: 100,
  disassemble: { common: 5, rare: 20, epic: 100, legendary: 400 },
  craft: { common: 40, rare: 100, epic: 400, legendary: 1600 },
  shinyCost: 3,
  shinyRate: 0,
  battle: { deckSize: 20 }
};

const CARDS = [];
for (const rarity of ["common", "rare", "epic", "legendary"]) {
  for (let index = 0; index < 3; index += 1) {
    CARDS.push({ id: `${rarity}-${index}`, name: `${rarity}${index}`, rarity, set: "base", element: "✦", type: "minion", cost: 1, attack: 1, health: 1, keywords: [], effects: [], playable: true });
  }
}

const POOL = { id: "base", name: "基础召唤", setIds: ["base"], enabled: true };

function makeDb(getStore) {
  const collection = name => ({
    doc: id => ({
      get: async () => {
        if (name === "cardPools") return { data: POOL };
        if (name === "gameConfig") return { data: CONFIG };
        if (name === "gameSaves") return { data: getStore().player };
        return { data: {} };
      },
      set: async ({ data }) => {
        if (name === "gameSaves") getStore().player = data;
        if (name === "drawLogs") getStore().logs.push(data);
        return {};
      },
      remove: async () => ({})
    }),
    skip: skip => ({ limit: limit => ({ get: async () => ({ data: name === "cards" ? CARDS.slice(skip, skip + limit) : [] }) }) }),
    where: () => ({ count: async () => ({ total: 0 }), orderBy: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }) })
  });
  return {
    collection,
    runTransaction: async callback => callback({ collection })
  };
}

let store = null;
let randomQueue = [];
const originalRandom = Math.random;
Math.random = () => (randomQueue.length ? randomQueue.shift() : 0.5);

const Module_load = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return {
      init() {},
      DYNAMIC_CURRENT_ENV: "test",
      getWXContext: () => ({ OPENID: "tester" }),
      database: () => db
    };
  }
  return Module_load(request, parent, isMain);
};

const db = makeDb(() => store);
const draw = require("../cloudfunctions/drawCards/index.js");

function player(overrides = {}) {
  return {
    ticket: 100,
    dust: 0,
    totalDraws: 0,
    inventory: [],
    collectionHistory: { normalIds: [], shinyIds: [] },
    pity: { base: 0 },
    signIn: { firstCycleDay: 0 },
    metrics: {
      lifetime: { coinEarned: 0, ticketEarned: 0 },
      daily: { key: "", values: {} },
      weekly: { key: "", values: {} }
    },
    taskState: {},
    uiState: {},
    ...overrides
  };
}

async function run(event, playerState, queue) {
  store = { player: playerState, logs: [] };
  randomQueue = queue.slice();
  return draw.main({ poolId: "base", ...event });
}

(async () => {
  // 1) 传说保底：pity 已到 39（下一次必出），单抽
  {
    const result = await run({ count: 1 }, player({ pity: { base: 39 } }), [0.5]);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].card.rarity, "legendary", "第 40 抽必须强制传说");
    assert.equal(result.results[0].pityTriggered, true, "保底触发时要打 pityTriggered");
    assert.equal(store.player.pity.base, 0, "出传说后 pity 必须归零");
    assert.equal(result.player.ticket, 99, "单抽扣 1 张券");
  }

  // 2) 未到保底：普通 +1 pity
  {
    const result = await run({ count: 1 }, player({ pity: { base: 10 } }), [0.5, 0.5]);
    assert.equal(result.results[0].card.rarity, "common");
    assert.equal(store.player.pity.base, 11, "未出传说时 pity 应 +1");
    assert.equal(result.results[0].pityTriggered, false);
  }

  // 3) 自然出传说：pity 归零
  {
    const result = await run({ count: 1 }, player({ pity: { base: 5 } }), [0.99, 0.5]);
    assert.equal(result.results[0].card.rarity, "legendary", "0.99 应落在传说区间（累计 97.5–100）");
    assert.equal(store.player.pity.base, 0);
    assert.equal(result.results[0].pityTriggered, false, "自然出传说不算保底触发");
  }

  // 4) 十连保底：9 张全普通，第 10 张按 tenDrawGuarantee 给史诗（0.5*100=50 < 95）
  {
    // pick() 也会消耗一次 Math.random：每抽 = [roll, pick]
    const queue = [];
    for (let index = 0; index < 9; index += 1) queue.push(0.5, 0.5);
    queue.push(0.5, 0.5);
    const result = await run({ count: 10 }, player({ ticket: 100 }), queue);
    const last = result.results[9];
    assert.equal(result.results.length, 10);
    assert.equal(last.tenGuarantee, true, "第 10 抽应打 tenGuarantee 标记");
    assert.equal(last.card.rarity, "epic", "tenDrawGuarantee.epic=95 时 0.5 应给史诗");
    assert.ok(result.results.slice(0, 9).every(item => item.card.rarity === "common"));
  }

  // 4.5) 闪卡：每张独立 3% 判定（shinyRate=3）
  {
    CONFIG.shinyRate = 3;
    const result = await run({ count: 1 }, player({ ticket: 100 }), [0.5, 0.5, 0.01]);
    assert.equal(result.results[0].shiny, true, "0.01*100=1 < 3 应判为闪卡");
    const entry = store.player.inventory.find(item => item.cardId === result.results[0].card.id);
    assert.equal(entry.shinyCount, 1, "闪卡应计入 shinyCount");
    assert.equal(entry.normalCount, 0, "闪卡不应计入 normalCount");
    assert.ok(store.player.collectionHistory.shinyIds.includes(result.results[0].card.id), "闪卡应记入 shinyIds");
    CONFIG.shinyRate = 0;
  }

  // 4.6) 闪卡：随机数 0.5（50 ≥ 3）不给闪卡
  {
    CONFIG.shinyRate = 3;
    const result = await run({ count: 1 }, player({ ticket: 100 }), [0.5, 0.5, 0.5]);
    assert.equal(result.results[0].shiny, false, "0.5*100=50 ≥ 3 不应给闪卡");
    const entry = store.player.inventory.find(item => item.cardId === result.results[0].card.id);
    assert.equal(entry.normalCount, 1);
    assert.equal(entry.shinyCount, 0);
    CONFIG.shinyRate = 0;
  }

  // 5) 十连保底命中传说分支（随机数 0.99 → 99 >= 95）
  {
    const queue = [];
    for (let index = 0; index < 9; index += 1) queue.push(0.5, 0.5);
    queue.push(0.96, 0.5);
    const result = await run({ count: 10 }, player({ ticket: 100 }), queue);
    assert.equal(result.results[9].card.rarity, "legendary", "保底命中传说分支");
    assert.equal(result.results[9].tenGuarantee, true);
  }

  // 6) 前 9 张已出史诗时，第 10 张不再触发保底（仍走普通 roll）
  {
    const queue = [0.93, 0.5];
    for (let index = 0; index < 8; index += 1) queue.push(0.5, 0.5);
    queue.push(0.5, 0.5);
    const result = await run({ count: 10 }, player({ ticket: 100 }), queue);
    assert.equal(result.results[0].card.rarity, "epic", "0.93*100=93 落在史诗区间（90–97.5）");
    assert.equal(result.results[9].tenGuarantee, false, "已有史诗及以上时不应触发十连保底");
  }

  // 7) 抽卡券不足
  {
    await assert.rejects(() => run({ count: 10 }, player({ ticket: 5 }), []), /抽卡券不足/);
  }

  // 8) 非法次数
  {
    await assert.rejects(() => run({ count: 3 }, player(), []), /抽卡次数无效/);
  }

  // 9) 卡池关闭
  {
    const original = POOL.enabled;
    POOL.enabled = false;
    await assert.rejects(() => run({ count: 1 }, player(), []), /该卡池暂未开放/);
    POOL.enabled = original;
  }

  // 10) 抽卡结果要写 drawLogs（含 pityTriggered / tenGuarantee 标记）
  {
    await run({ count: 1 }, player({ pity: { base: 39 } }), [0.5, 0.5]);
    assert.equal(store.logs.length, 1, "每次抽卡应写一条 drawLogs");
    const log = store.logs[0];
    assert.equal(log.results[0].pityTriggered, true);
    assert.equal(log.highestRarity, "legendary");
    assert.equal(log.drawType, "单抽");
  }

  Math.random = originalRandom;
  console.log("draw pity tests passed: pity, natural legendary, ten-draw guarantee, ticket/limit/closed-pool errors, logs");
})().catch(error => {
  Math.random = originalRandom;
  console.error(error);
  process.exit(1);
});
