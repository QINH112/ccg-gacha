"use strict";

// 签到奖励审计：直接跑 cloudfunctions/dailySignIn/index.js 的 exports.main，
// 验证首发 7 天循环的发放顺序、每日一次限制、循环结束后转为每日奖励、
// 以及卡牌奖励只从「已发布卡包」里抽。

const assert = require("assert");
const Module = require("module");

const CONFIG = {
  signIn: {
    timezone: "Asia/Shanghai",
    firstCycle: [
      { type: "ticket", amount: 50 },
      { type: "card", rarity: "epic", amount: 1 },
      { type: "ticket", amount: 10 },
      { type: "ticket", amount: 20 },
      { type: "ticket", amount: 20 },
      { type: "card", rarity: "legendary", amount: 1 },
      { type: "ticket", amount: 50 }
    ],
    dailyAfterCycle: { type: "ticket", amount: 5 }
  }
};

const CARDS = [];
for (const rarity of ["common", "rare", "epic", "legendary"]) {
  CARDS.push({ id: `${rarity}-a`, name: `${rarity}A`, rarity, set: "base", element: "✦", type: "minion", cost: 1, attack: 1, health: 1, keywords: [], effects: [], playable: true });
  CARDS.push({ id: `${rarity}-b`, name: `${rarity}B`, rarity, set: "base", element: "✦", type: "minion", cost: 1, attack: 1, health: 1, keywords: [], effects: [], playable: true });
}
const UNPUBLISHED = { id: "epic-hidden", name: "隐藏史诗", rarity: "epic", set: "hidden", element: "✦", type: "minion", cost: 1, attack: 1, health: 1, keywords: [], effects: [], playable: true };

let store = null;
let publishedSets = ["base"];

const db = {
  collection: name => ({
    doc: id => ({
      get: async () => {
        if (name === "gameConfig") return { data: CONFIG };
        if (name === "gameSaves") return { data: store.player };
        return { data: {} };
      },
      set: async ({ data }) => {
        if (name === "gameSaves") store.player = data;
        if (name === "drawLogs") store.logs.push(data);
        return {};
      },
      remove: async () => ({})
    }),
    skip: skip => ({ limit: limit => ({ get: async () => ({ data: name === "cards" ? store.cards.slice(skip, skip + limit) : [] }) }) }),
    where: () => ({
      limit: () => ({ get: async () => ({ data: publishedSets.map(id => ({ id, published: true })) }) }),
      count: async () => ({ total: 0 }),
      orderBy: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) })
    })
  }),
  runTransaction: async callback => callback({ collection: (name) => db.collection(name) })
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return { init() {}, DYNAMIC_CURRENT_ENV: "test", getWXContext: () => ({ OPENID: "signer" }), database: () => db };
  }
  return originalLoad(request, parent, isMain);
};

const signIn = require("../cloudfunctions/dailySignIn/index.js");

function player(overrides = {}) {
  return {
    ticket: 0,
    coin: 0,
    dust: 0,
    totalDraws: 0,
    inventory: [],
    pity: {},
    signIn: { firstCycleDay: 0, lastClaimDate: "", completedFirstCycle: false },
    collectionHistory: { normalIds: [], shinyIds: [] },
    metrics: { lifetime: {}, daily: { key: "", values: {} }, weekly: { key: "", values: {} } },
    taskState: {},
    ...overrides
  };
}

function today() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
}

function prepare(playerState, cards = CARDS, sets = ["base"]) {
  store = { player: playerState, logs: [], cards };
  publishedSets = sets;
}

async function claim() {
  return signIn.main({ action: "claim" });
}

async function status() {
  return signIn.main({ action: "status" });
}

(async () => {
  // 1) 新玩家状态
  prepare(player());
  {
    const result = await status();
    assert.equal(result.status.claimedToday, false);
    assert.equal(result.status.firstCycle, true);
    assert.equal(result.status.day, 1);
    assert.deepEqual(result.status.reward, { type: "ticket", amount: 50 });
  }

  // 2) 第 1 天领取：+50 券，记为已签，pity/其他资源不动
  {
    const result = await claim();
    assert.equal(result.player.ticket, 50);
    assert.equal(result.player.signIn.firstCycleDay, 1);
    assert.equal(result.player.signIn.lastClaimDate, today(), "签到日期要按东八区计算");
    assert.equal(result.status.claimedToday, true);
  }

  // 3) 同日重复领取被拒
  {
    await assert.rejects(() => claim(), /今日已经签到/);
  }

  // 4) 第 2 天领到史诗卡，并写 drawLogs（source=sign-in）
  {
    const state = store.player;
    state.signIn.lastClaimDate = "";
    const result = await claim();
    assert.equal(result.card.rarity, "epic");
    assert.equal(result.player.signIn.firstCycleDay, 2);
    const entry = result.player.inventory.find(item => item.cardId === result.card.id);
    assert.equal(entry.normalCount, 1, "卡牌奖励要进库存");
    assert.equal(store.logs.length, 1, "卡牌奖励要写 drawLogs");
    assert.equal(store.logs[0].source, "sign-in");
    assert.equal(store.logs[0].results[0].rarity, "epic");
  }

  // 5) 第 6 天领到传说卡
  {
    const state = store.player;
    state.signIn.lastClaimDate = "";
    state.signIn.firstCycleDay = 5;
    const result = await claim();
    assert.equal(result.card.rarity, "legendary");
    assert.equal(result.player.signIn.firstCycleDay, 6);
  }

  // 6) 第 7 天领完转入日循环
  {
    const state = store.player;
    state.signIn.lastClaimDate = "";
    state.signIn.firstCycleDay = 6;
    const result = await claim();
    assert.deepEqual(result.reward, { type: "ticket", amount: 50 }, `第 7 天应发 50 券，实际 ${JSON.stringify(result.reward)}`);
    assert.equal(result.player.signIn.firstCycleDay, 7);
    assert.equal(result.player.signIn.completedFirstCycle, true);
    assert.equal(result.status.firstCycle, false);
    assert.equal(result.status.day, null);
    assert.deepEqual(result.status.reward, { type: "ticket", amount: 5 }, "循环结束后转为每日 5 券");
  }

  // 7) 循环结束后再领：只加 5 券，不再推进 firstCycleDay
  {
    const state = store.player;
    state.signIn.lastClaimDate = "";
    const before = state.ticket;
    const result = await claim();
    assert.equal(result.player.ticket, before + 5);
    assert.equal(result.player.signIn.firstCycleDay, 7, "日循环不应继续累加 firstCycleDay");
  }

  // 8) 卡牌奖励只从已发布卡包中抽：卡包未发布时抛错
  {
    const state = player({ signIn: { firstCycleDay: 1, lastClaimDate: "", completedFirstCycle: false } });
    prepare(state, [UNPUBLISHED], ["other-published"]);
    await assert.rejects(() => claim(), /没有可发放的对应稀有度卡牌/);
  }

  // 9) 非法 action
  {
    prepare(player());
    await assert.rejects(() => signIn.main({ action: "unknown" }), /签到操作无效/);
  }

  console.log("sign-in tests passed: 7-day cycle, daily limit, post-cycle daily reward, published-set filter, invalid action");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
