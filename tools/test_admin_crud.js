"use strict";

// 管理端写入契约审计：adminGame 是唯一能直接改「邮件/任务/调整公告/卡牌/玩家资源」的入口，
// 一旦它写出客户端读不懂的形状，线上玩家就会看到空邮件、坏任务或错乱公告。
// 这里用内存库跑真实 exports.main，覆盖清洗规则与状态机。

const assert = require("assert");
const Module = require("module");

const CARDS = [
  { id: "c001", name: "见习卫兵", rarity: "common", cost: 1, type: "minion", attack: 1, health: 2, keywords: [], effects: [], set: "base", element: "✦", artPath: "subpackages/card-art-base/images/c001.jpg" },
  { id: "l004", name: "万籁归寂", rarity: "legendary", cost: 8, type: "spell", attack: null, health: null, keywords: [], effects: [{ trigger: "cast", action: "silence", target: "all-minions" }], set: "base", element: "✦" }
];

const CONFIG = { craft: { common: 40, rare: 100, epic: 400, legendary: 1600 }, shinyCost: 3 };

let store = null;
function emptyStore() {
  return {
    globalMails: new Map(),
    taskConfigs: new Map(),
    balanceNotices: new Map(),
    cards: new Map(CARDS.map(card => [card.id, { ...card }])),
    gameSaves: new Map(),
    config: CONFIG
  };
}

const db = {
  collection: name => ({
    doc: id => ({
      get: async () => {
        const table = store[name];
        if (name === "gameConfig") return { data: store.config };
        if (name === "cards") return { data: table.get(id) || null };
        if (table instanceof Map) return { data: table.get(id) || null };
        return { data: null };
      },
      set: async ({ data }) => {
        const table = store[name];
        if (table instanceof Map) table.set(id, data);
        return {};
      },
      remove: async () => ({})
    }),
    skip: skip => ({
      limit: limit => ({
        get: async () => {
          if (name !== "cards") return { data: [] };
          const all = [...store.cards.values()];
          return { data: all.slice(skip, skip + limit) };
        }
      })
    }),
    where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }), count: async () => ({ total: 0 }), orderBy: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }) })
  }),
  runTransaction: async callback => callback({ collection: name => db.collection(name) })
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return { init() {}, DYNAMIC_CURRENT_ENV: "test", getWXContext: () => ({ OPENID: "admin" }), database: () => db };
  }
  return originalLoad(request, parent, isMain);
};

process.env.INIT_SECRET = "s3cret";
const admin = require("../cloudfunctions/adminGame/index.js");
const call = event => admin.main({ secret: "s3cret", ...event });

(async () => {
  // 1) 新邮件默认值
  {
    store = emptyStore();
    const { mail } = await call({ action: "upsertMail", data: { title: "补偿" } });
    assert.equal(mail.title, "补偿");
    assert.equal(mail.recipientScope, "all-during-validity");
    assert.equal(mail.enabled, true);
    assert.equal(mail.deleted, false);
    assert.ok(mail.expiresAt - mail.publishedAt >= 29 * 86400000, "默认有效期应为 30 天");
    assert.deepEqual(mail.rewards, []);
  }

  // 2) 奖励数值必须被清洗：amount 至少 1，类型保留
  {
    const { mail } = await call({ action: "upsertMail", data: { id: "m1", rewards: [{ type: "ticket", amount: 0 }, { type: "card", amount: 2, cardId: "c001", shiny: true }] } });
    assert.equal(mail.rewards[0].amount, 1, "amount=0 应被抬到 1");
    assert.equal(mail.rewards[1].shiny, true);
    assert.equal(mail.rewards[1].cardId, "c001");
  }

  // 3) 状态机：禁用 → 启用 → 删除
  {
    await call({ action: "upsertMail", data: { id: "m2" } });
    assert.equal((await call({ action: "disableMail", id: "m2" })).mail.enabled, false);
    assert.equal((await call({ action: "enableMail", id: "m2" })).mail.enabled, true);
    assert.equal((await call({ action: "deleteMail", id: "m2" })).mail.deleted, true);
    await assert.rejects(() => call({ action: "disableMail", id: "nope" }), /邮件不存在/);
  }

  // 4) 任务类型白名单
  {
    await assert.rejects(() => call({ action: "upsertTask", data: { type: "hourly" } }), /任务类型无效/);
    const { task } = await call({ action: "upsertTask", data: { type: "daily", name: "抽 1 次", metric: "draw", target: 1 } });
    assert.equal(task.type, "daily");
    assert.equal(task.enabled, true);
    assert.equal(task.activationVersion, 1);
  }

  // 5) 任务重新启用才递增 activationVersion（用于「重开一轮」判定）
  {
    await call({ action: "upsertTask", data: { id: "t1", type: "daily", target: 3 } });
    const disabled = await call({ action: "disableTask", id: "t1" });
    assert.equal(disabled.task.enabled, false);
    const reenabled = await call({ action: "enableTask", id: "t1" });
    assert.equal(reenabled.task.enabled, true);
    assert.equal(reenabled.task.activationVersion, 2, "禁用→启用应 +1");
    const again = await call({ action: "enableTask", id: "t1" });
    assert.equal(again.task.activationVersion, 2, "本来就启用时不应重复递增");
  }

  // 6) 调整公告：必须有 ID、不可覆盖已发布公告、至少一张卡、成本按稀有度回填
  {
    await assert.rejects(() => call({ action: "upsertBalanceNotice", data: {} }), /缺少调整公告 ID/);
    await assert.rejects(() => call({ action: "upsertBalanceNotice", data: { id: "b1", changes: [] } }), /至少需要一张卡牌/);
    const { notice } = await call({ action: "upsertBalanceNotice", data: { id: "b1", version: 2, changes: [{ cardId: "c001", name: "见习卫兵", before: { cost: 1, attack: 1, health: 2 }, after: { cost: 2, attack: 1, health: 2 } }] } });
    assert.equal(notice.changes[0].originalCraftCost, 40, "普通卡回填 40 星尘");
    assert.equal(notice.changes[0].originalShinyCraftCost, 120, "闪卡成本 = 3 倍");
    assert.equal(notice.version, 2);
    await assert.rejects(() => call({ action: "upsertBalanceNotice", data: { id: "b1", changes: [{ cardId: "c001", name: "x", before: { cost: 1 }, after: { cost: 2 } }] } }), /不可覆盖/);
  }

  // 7) 公告状态开关
  {
    assert.equal((await call({ action: "disableBalanceNotice", id: "b1" })).notice.enabled, false);
    assert.equal((await call({ action: "enableBalanceNotice", id: "b1" })).notice.enabled, true);
  }

  // 8) 发奖：货币 + 卡牌 + 未知类型
  {
    await call({ action: "grant", openid: "p1", rewards: [{ type: "ticket", amount: 5 }, { type: "coin", amount: 100 }, { type: "card", amount: 2, cardId: "c001" }, { type: "card", amount: 1, cardId: "c001", shiny: true }] });
    const player = store.gameSaves.get("p1");
    assert.equal(player.ticket, 5);
    assert.equal(player.coin, 100);
    const entry = player.inventory.find(item => item.cardId === "c001");
    assert.equal(entry.normalCount, 2);
    assert.equal(entry.shinyCount, 1);
    assert.ok(player.collectionHistory.shinyIds.includes("c001"));
    assert.equal(player.metrics.lifetime.ticketEarned, 5);
    await assert.rejects(() => call({ action: "grant", openid: "p1", rewards: [{ type: "gem", amount: 1 }] }), /不支持的管理员奖励类型/);
    await assert.rejects(() => call({ action: "grant", openid: "", rewards: [{ type: "ticket", amount: 1 }] }), /缺少玩家 OPENID/);
  }

  // 9) 改卡：费用夹紧 1..10，法术清空攻血
  {
    const clamped = await call({ action: "updateCard", id: "c001", data: { cost: 99 } });
    assert.equal(clamped.card.cost, 10, "费用上限 10");
    const spell = await call({ action: "updateCard", id: "l004", data: { attack: 5, health: 5 } });
    assert.equal(spell.card.attack, null);
    assert.equal(spell.card.health, null);
    await assert.rejects(() => call({ action: "updateCard", id: "missing", data: { cost: 3 } }), /卡牌不存在/);
  }

  // 10) 未授权一律拦下
  {
    await assert.rejects(() => admin.main({ action: "grant", openid: "p1", rewards: [{ type: "ticket", amount: 1 }] }), /INIT_SECRET 校验失败/);
  }

  console.log("admin crud tests passed: mail defaults/state, task whitelist+activationVersion, balance notice immutability+cost backfill, grant math, card clamping, auth");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
