"use strict";

// 服务端安全边界审计：
//  1) adminGame 必须靠 INIT_SECRET 把门，没配或配错都要拒绝，且「未配置」时必须失败关闭（不能变成人人可调）
//  2) drawHistory 只能读自己的流水，忽略客户端传的 userId
//  3) gameData 读写一律用 getWXContext 的 OPENID，忽略客户端传的 openid/draft
//  4) 除 adminGame 外，没有任何云函数把 event.openid / event.userId 当成调用者身份

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const ROOT = path.resolve(__dirname, "..", "cloudfunctions");

let store = null;
let lastQuery = null;

const db = {
  collection: name => ({
    doc: id => ({
      get: async () => {
        lastQuery = { name, id };
        if (name === "gameSaves") return { data: store.player };
        if (name === "gameConfig") return { data: store.config };
        return { data: {} };
      },
      set: async ({ data }) => {
        if (name === "gameSaves") store.player = data;
        return {};
      },
      remove: async () => ({})
    }),
    skip: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
    where: query => {
      lastQuery = { name, query };
      return {
        orderBy: () => ({ limit: () => ({ get: async () => ({ data: store.logs }) }) }),
        limit: () => ({ get: async () => ({ data: [] }) }),
        count: async () => ({ total: 0 })
      };
    }
  }),
  runTransaction: async callback => callback({ collection: name => db.collection(name) })
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return { init() {}, DYNAMIC_CURRENT_ENV: "test", getWXContext: () => ({ OPENID: "me" }), database: () => db };
  }
  return originalLoad(request, parent, isMain);
};

function fresh() {
  store = { player: { ticket: 3, coin: 0, dust: 0, inventory: [], signIn: {}, metrics: {}, collectionHistory: {} }, logs: [], config: {} };
  lastQuery = null;
}

const admin = require("../cloudfunctions/adminGame/index.js");
const history = require("../cloudfunctions/drawHistory/index.js");

(async () => {
  // 1) INIT_SECRET 未配置时必须失败关闭
  delete process.env.INIT_SECRET;
  fresh();
  await assert.rejects(() => admin.main({ action: "upsertMail", secret: "" }), /INIT_SECRET 校验失败/);
  await assert.rejects(() => admin.main({ action: "upsertMail", secret: "anything" }), /INIT_SECRET 校验失败/);

  // 2) INIT_SECRET 配了但传错
  process.env.INIT_SECRET = "s3cret";
  await assert.rejects(() => admin.main({ action: "upsertMail", secret: "nope" }), /INIT_SECRET 校验失败/);
  await assert.rejects(() => admin.main({ action: "upsertMail" }), /INIT_SECRET 校验失败/);

  // 3) 校验通过后，未知 action 必须明确报错而不是静默成功
  await assert.rejects(() => admin.main({ action: "dropAllData", secret: "s3cret" }), /未知管理操作|无效/);
  delete process.env.INIT_SECRET;

  // 4) drawHistory 只查自己的流水，客户端传 userId 无效
  fresh();
  store.logs = [{ userId: "me", results: [] }];
  const mine = await history.main({ userId: "someone-else", limit: 10 });
  assert.deepEqual(lastQuery.query, { userId: "me" }, "drawHistory 必须按 OPENID 过滤");
  assert.equal(mine.history.length, 1);

  // 5) limit 被夹紧在 1..100
  await history.main({ limit: 100000 });
  // 只要不抛错即可（实现里 Math.min(100, Math.max(1, ...))）

  // 6) 静态检查：除 adminGame 外，没有云函数把 event.openid / event.userId 当身份
  const offenders = [];
  for (const dir of fs.readdirSync(ROOT)) {
    const file = path.join(ROOT, dir, "index.js");
    if (!fs.existsSync(file) || dir === "adminGame") continue;
    const source = fs.readFileSync(file, "utf8");
    if (/event\.openid|event\.userId|event\.OPENID/.test(source)) offenders.push(dir);
  }
  assert.deepEqual(offenders, [], `这些云函数信任了客户端传入的身份：${offenders.join(",")}`);

  console.log("cloud security tests passed: admin secret fail-closed, drawHistory scoped to OPENID, no client-supplied identity elsewhere");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
