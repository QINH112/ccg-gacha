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

function query(name, skip = 0, limit = 100) {
  return {
    skip(value) { return query(name, value, limit); },
    limit(value) { return query(name, skip, value); },
    async get() {
      return { data: [...records(name)].slice(skip, skip + limit).map(([id, value]) => ({ ...value, _id: id })) };
    },
  };
}

const collection = name => ({
  doc: id => reference(name, id),
  skip: value => query(name, value),
  limit: value => query(name, 0, value),
});

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    const database = { collection, runTransaction: async callback => callback({ collection }) };
    return { init() {}, DYNAMIC_CURRENT_ENV: "test", database: () => database, getWXContext: () => ({ OPENID: "services-user" }) };
  }
  return originalLoad(request, parent, isMain);
};

const gameServices = require("../cloudfunctions/gameServices/index.js");

const player = {
  inventory: [],
  totalDraws: 0,
  dust: 0,
  ticket: 100,
  coin: 1000,
  pity: { base: 0, mixed: 0, "star-remnant": 0 },
  signIn: { firstCycleDay: 0, lastClaimDate: "", completedFirstCycle: false },
  collectionHistory: { normalIds: [], shinyIds: [] },
  metrics: { lifetime: {}, daily: { key: "", values: {} }, weekly: { key: "", values: {} } },
  taskState: {
    daily: { key: "", snapshots: [], claimed: {}, bonusClaimed: false },
    weekly: { key: "", snapshots: [], claimed: {}, bonusClaimed: false },
    achievements: { completed: {}, claimed: {}, versions: {}, baselines: {} },
  },
  uiState: { lastReadBalanceNoticeId:"balance-read" },
  migrationVersion: 3,
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now(),
};

records("gameSaves").set("services-user", player);
records("globalMails").set("mail-service-test", {
  id: "mail-service-test",
  title: "服务测试邮件",
  body: "验证幂等领取",
  recipientScope: "all-during-validity",
  rewards: [{ type: "coin", amount: 200 }, { type: "ticket", amount: 2 }],
  publishedAt: Date.now() - 1000,
  expiresAt: Date.now() + 86400000,
  enabled: true,
  deleted: false,
});

const tasks = [
  { id: "daily-coin", type: "daily", name: "每日金币", metric: "coin", target: 1, rewards: [{ type: "coin", amount: 10 }], enabled: true, deleted: false, activationVersion: 1, order: 1 },
  { id: "daily-bonus", type: "daily-bonus", name: "每日全勤", metric: "coin", target: 1, rewards: [{ type: "ticket", amount: 1 }], enabled: true, deleted: false, activationVersion: 1, order: 99 },
  { id: "weekly-ticket", type: "weekly", name: "每周抽卡券", metric: "ticket", target: 1, rewards: [{ type: "ticket", amount: 3 }], enabled: true, deleted: false, activationVersion: 1, order: 1 },
  { id: "achievement-1", type: "achievement", name: "金币积累 1", metric: "coin", target: 1, rewards: [{ type: "dust", amount: 5 }], enabled: true, deleted: false, activationVersion: 1, order: 1 },
  { id: "achievement-2", type: "achievement", name: "金币积累 2", metric: "coin", target: 1, previousId: "achievement-1", rewards: [{ type: "dust", amount: 7 }], enabled: true, deleted: false, activationVersion: 1, order: 2 },
];
tasks.forEach(task => records("taskConfigs").set(task.id, task));

async function rejectsWith(task, message) {
  let error;
  try { await task(); } catch (caught) { error = caught; }
  assert(error, `Expected rejection: ${message}`);
  assert(String(error.message).includes(message), `Expected ${message}, received ${error.message}`);
}

(async () => {
  const bought = await gameServices.main({ action: "buyTicket", quantity: 3 });
  assert.equal(bought.player.coin, 700);
  assert.equal(bought.player.ticket, 103);
  assert.equal(bought.cost, 300);
  assert.equal(bought.player.uiState.lastReadBalanceNoticeId, "balance-read");
  await rejectsWith(() => gameServices.main({ action: "buyTicket", quantity: 99 }), "金币不足");
  assert.equal(records("gameSaves").get("services-user").coin, 700);

  const mail = await gameServices.main({ action: "claimAllMail", mailIds: ["mail-service-test", "mail-service-test"] });
  assert.equal(mail.granted.length, 1);
  assert.equal(mail.player.coin, 900);
  assert.equal(mail.player.ticket, 105);
  assert.equal(mail.player.uiState.lastReadBalanceNoticeId, "balance-read");
  assert.equal(records("mailClaims").size, 1);
  await rejectsWith(() => gameServices.main({ action: "claimMail", mailId: "mail-service-test" }), "邮件已领取或已过期");
  assert.equal(records("mailClaims").size, 1);

  const dashboard = await gameServices.main({ action: "dashboard" });
  assert.equal(dashboard.mail.length, 0);
  assert(dashboard.tasks.daily.tasks.some(item => item.completed && !item.claimed));
  assert(dashboard.tasks.weekly.tasks.some(item => item.completed && !item.claimed));
  assert.equal(dashboard.tasks.achievements.length, 1, "Only the first achievement stage is visible before claiming it");

  const daily = await gameServices.main({ action: "claimAllTasks", scope: "daily" });
  assert.deepEqual(daily.claimed, ["每日金币", "每日全勤"]);
  assert.equal(daily.player.coin, 910);
  assert.equal(daily.player.ticket, 106);
  await rejectsWith(() => gameServices.main({ action: "claimAllTasks", scope: "daily" }), "没有可领取奖励");

  const weekly = await gameServices.main({ action: "claimAllTasks", scope: "weekly" });
  assert.deepEqual(weekly.claimed, ["每周抽卡券"]);
  assert.equal(weekly.player.ticket, 109);

  const achievements = await gameServices.main({ action: "claimAllTasks", scope: "achievement" });
  assert.deepEqual(achievements.claimed, ["金币积累 1", "金币积累 2"]);
  assert.equal(achievements.player.dust, 12);
  await rejectsWith(() => gameServices.main({ action: "claimAllTasks", scope: "achievement" }), "没有可领取奖励");

  const finalDashboard = await gameServices.main({ action: "dashboard" });
  assert.equal(finalDashboard.redDots.mail, false);
  assert.equal(finalDashboard.redDots.tasks, false);
  assert.equal(finalDashboard.redDots.achievements, false);
  assert.equal(finalDashboard.player.uiState.lastReadBalanceNoticeId, "balance-read");
  console.log("game services tests passed: purchase, insufficient funds, mail idempotency, daily, weekly, staged achievements, balance notice read preservation");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
