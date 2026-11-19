"use strict";

// 工坊（分解 / 合成 / 闪耀）服务端规则回归：
// 对应 docs/CARD_COLLECTION_WORKSHOP_MERGE_PLAN.md 验收清单里可自动化的条目
// （分解返还、3 张闪耀、9 张普通上限、星尘不足、无库存报错、超上限库存保留）。

const assert = require("assert");
const Module = require("module");

const stores = new Map();
const records = name => {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
};
const reference = (name, id) => ({
  async get() {
    const value = records(name).get(id);
    if (!value) throw new Error("document not found");
    return { data: { ...value, _id: id } };
  },
  async set({ data }) { records(name).set(id, { ...data }); return {}; },
});
const collection = name => ({
  doc: id => reference(name, id),
  skip: offset => ({
    limit: count => ({
      async get() {
        const rows = [...records(name)].map(([id, value]) => ({ ...value, _id: id }));
        return { data: rows.slice(offset, offset + count) };
      },
    }),
  }),
});

const USER = "workshop-user";
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    const database = { collection, runTransaction: async callback => callback({ collection }) };
    return { init() {}, DYNAMIC_CURRENT_ENV: "test", database: () => database, getWXContext: () => ({ OPENID: USER }) };
  }
  return originalLoad(request, parent, isMain);
};

const workshop = require("../cloudfunctions/workshop/index.js");

// 与 cloudfunctions/initGameData/index.js 保持一致
records("gameConfig").set("main", {
  disassemble: { common: 5, rare: 20, epic: 100, legendary: 400 },
  craft: { common: 40, rare: 100, epic: 400, legendary: 1600 },
  shinyCost: 3,
});
records("cards").set("c001", { id: "c001", name: "测试普通卡", rarity: "common", set: "base", type: "minion", cost: 1, attack: 1, health: 2, keywords: [] });
records("cards").set("r001", { id: "r001", name: "测试稀有卡", rarity: "rare", set: "base", type: "minion", cost: 2, attack: 2, health: 3, keywords: [] });

function player(overrides = {}) {
  return {
    inventory: [], dust: 0, totalDraws: 0, ticket: 100, coin: 1000,
    pity: { base: 0, mixed: 0, "star-remnant": 0 },
    signIn: { firstCycleDay: 0, lastClaimDate: "", completedFirstCycle: false },
    collectionHistory: { normalIds: [], shinyIds: [] },
    metrics: { lifetime: {}, daily: { key: "", values: {} }, weekly: { key: "", values: {} } },
    taskState: {}, migrationVersion: 3, createdAt: Date.now(), updatedAt: Date.now(),
    ...overrides,
  };
}
function seed(save) { records("gameSaves").set(USER, save); }
function entryOf(result, cardId) {
  return result.player.inventory.find(item => item.cardId === cardId) || { normalCount: 0, shinyCount: 0 };
}
async function rejects(promise, pattern, label) {
  try {
    await promise;
  } catch (error) {
    assert.ok(pattern.test(error.message), `${label}：错误文案不符，实际「${error.message}」`);
    return;
  }
  throw new Error(`${label}：本应失败却成功了`);
}

(async () => {
  // 8 张 + 刚好够星尘 → 合成成功，变 9 张，星尘清零
  seed(player({ dust: 40, inventory: [{ cardId: "c001", normalCount: 8, shinyCount: 0 }] }));
  const ninth = await workshop.main({ action: "craft", cardId: "c001" });
  assert.equal(entryOf(ninth, "c001").normalCount, 9, "8 张合成后应为 9 张");
  assert.equal(ninth.player.dust, 0, "合成后应扣 40 星尘");
  assert.ok(ninth.player.collectionHistory.normalIds.includes("c001"), "图鉴应记录已获得普通卡");

  // 9 张上限
  seed(player({ dust: 4000, inventory: [{ cardId: "c001", normalCount: 9, shinyCount: 0 }] }));
  await rejects(workshop.main({ action: "craft", cardId: "c001" }), /普通卡已达到 9 张上限/, "9 张上限");

  // 星尘不足
  seed(player({ dust: 39, inventory: [{ cardId: "c001", normalCount: 0, shinyCount: 0 }] }));
  await rejects(workshop.main({ action: "craft", cardId: "c001" }), /星尘不足/, "星尘不足");

  // 普通卡分解返还 5
  seed(player({ dust: 0, inventory: [{ cardId: "c001", normalCount: 2, shinyCount: 0 }] }));
  const disNormal = await workshop.main({ action: "disassemble", cardId: "c001" });
  assert.equal(entryOf(disNormal, "c001").normalCount, 1, "分解后普通卡应为 1 张");
  assert.equal(disNormal.player.dust, 5, "普通卡分解应返还 5 星尘");

  // 闪卡分解返还 3 倍 = 15
  seed(player({ dust: 0, inventory: [{ cardId: "c001", normalCount: 0, shinyCount: 1 }] }));
  const disShiny = await workshop.main({ action: "disassemble", cardId: "c001", shiny: true });
  assert.equal(entryOf(disShiny, "c001").shinyCount, 0, "分解后闪卡应为 0 张");
  assert.equal(disShiny.player.dust, 15, "闪卡分解应返还 15 星尘（3 倍）");

  // 没有库存时分解报错
  seed(player({ dust: 0, inventory: [] }));
  await rejects(workshop.main({ action: "disassemble", cardId: "c001" }), /没有可分解的普通卡/, "空库存分解");

  // 闪耀需要 3 张
  seed(player({ dust: 0, inventory: [{ cardId: "c001", normalCount: 2, shinyCount: 0 }] }));
  await rejects(workshop.main({ action: "shiny", cardId: "c001" }), /需要 3 张同名普通卡/, "闪耀不足 3 张");

  // 3 张闪耀成功
  seed(player({ dust: 0, inventory: [{ cardId: "c001", normalCount: 3, shinyCount: 0 }] }));
  const shined = await workshop.main({ action: "shiny", cardId: "c001" });
  assert.equal(entryOf(shined, "c001").normalCount, 0, "闪耀后普通卡应扣 3 张");
  assert.equal(entryOf(shined, "c001").shinyCount, 1, "闪耀后闪卡应加 1 张");
  assert.ok(shined.player.collectionHistory.shinyIds.includes("c001"), "图鉴应记录已获得闪卡");

  // 超过 9 张的库存仍可分解，数量完整保留
  seed(player({ dust: 0, inventory: [{ cardId: "c001", normalCount: 12, shinyCount: 2 }] }));
  const over = await workshop.main({ action: "disassemble", cardId: "c001" });
  assert.equal(entryOf(over, "c001").normalCount, 11, "超上限库存分解后应为 11 张");
  assert.equal(entryOf(over, "c001").shinyCount, 2, "分解普通卡不应影响闪卡数量");

  // 平衡公告提供 originalCraftCost 时，分解价值按公告原价算（未打折前的价值）
  seed(player({ dust: 0, inventory: [{ cardId: "c001", normalCount: 1, shinyCount: 0 }] }));
  records("balanceNotices").set("notice-c001", {
    id: "notice-c001", enabled: true, publishedAt: Date.now() - 1000,
    changes: [{ cardId: "c001", originalCraftCost: 7 }],
  });
  const adjusted = await workshop.main({ action: "disassemble", cardId: "c001" });
  assert.equal(adjusted.player.dust, 7, "公告调整期分解应按 originalCraftCost 返还 7 星尘");
  // 公告没写 originalCraftCost（initGameData 种子就是这种）时，应按当前合成价全额返还
  records("balanceNotices").set("notice-plain", {
    id: "notice-plain",
    enabled: true,
    publishedAt: Date.now() - 3600000,
    changes: [{ cardId: "r001", name: "月影侍从" }],
  });
  {
    seed(player({ inventory: [{ cardId: "r001", normalCount: 1, shinyCount: 0 }], dust: 0 }));
    const result = await workshop.main({ action: "disassemble", cardId: "r001", shiny: false });
    assert.equal(result.player.dust, 100, `公告缺少 originalCraftCost 时应按合成价全额返还（稀有 100），实际 ${result.player.dust}`);
  }
  records("balanceNotices").delete("notice-plain");
  records("balanceNotices").delete("notice-c001");

  // 调整窗口内分解闪卡 → 3 倍原价
  seed(player({ dust: 0, inventory: [{ cardId: "c001", normalCount: 0, shinyCount: 1 }] }));
  records("balanceNotices").set("notice-c001", {
    id: "notice-c001", enabled: true, publishedAt: Date.now() - 1000,
    changes: [{ cardId: "c001", originalCraftCost: 7 }],
  });
  const adjustedShiny = await workshop.main({ action: "disassemble", cardId: "c001", shiny: true });
  assert.equal(adjustedShiny.player.dust, 21, "窗口内分解闪卡应返还 3 倍原价 21 星尘");

  // 窗口过期（31 天前发布）→ 恢复常规价值 5
  records("balanceNotices").set("notice-c001", {
    id: "notice-c001", enabled: true, publishedAt: Date.now() - 31 * 86400000,
    changes: [{ cardId: "c001", originalCraftCost: 7 }],
  });
  seed(player({ dust: 0, inventory: [{ cardId: "c001", normalCount: 1, shinyCount: 0 }] }));
  const expired = await workshop.main({ action: "disassemble", cardId: "c001" });
  assert.equal(expired.player.dust, 5, "窗口过期后应恢复常规分解价值 5 星尘");

  // 新调整重新开启窗口：更晚发布的公告生效
  records("balanceNotices").set("notice-c001", {
    id: "notice-c001", enabled: true, publishedAt: Date.now() - 40 * 86400000,
    changes: [{ cardId: "c001", originalCraftCost: 7 }],
  });
  records("balanceNotices").set("notice-c001-new", {
    id: "notice-c001-new", enabled: true, publishedAt: Date.now() - 1000,
    changes: [{ cardId: "c001", originalCraftCost: 9 }],
  });
  seed(player({ dust: 0, inventory: [{ cardId: "c001", normalCount: 1, shinyCount: 0 }] }));
  const reAdjusted = await workshop.main({ action: "disassemble", cardId: "c001" });
  assert.equal(reAdjusted.player.dust, 9, "再次调整后应按最新公告原价 9 返还");
  records("balanceNotices").delete("notice-c001");
  records("balanceNotices").delete("notice-c001-new");

  console.log("workshop rules passed: craft-cap, dust, disassemble(1x/3x/adjusted/expired/renewed), shiny-3, over-cap-inventory");
})().catch(error => {
  console.error("workshop-rules-failed:", error.message);
  process.exit(1);
});
