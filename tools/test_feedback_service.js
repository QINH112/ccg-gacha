"use strict";

// 意见反馈服务端回归（docs/PLAYER_FEEDBACK.md）：
// 类型白名单、正文字数、每日 1 条额度、上下文清洗、我的列表、软删除与权限。

const assert = require("assert");
const Module = require("module");

const stores = new Map();
const records = name => {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
};
const rowsOf = name => [...records(name)].map(([id, value]) => ({ ...value, _id: id }));

let sequence = 0;
const collection = name => {
  const query = (filter = null, order = null, size = 0) => ({
    where: next => query({ ...(filter || {}), ...next }, order, size),
    orderBy: (field, direction) => query(filter, { field, direction }, size),
    limit: count => query(filter, order, count),
    async count() {
      return { total: rowsOf(name).filter(row => matches(row, filter)).length };
    },
    async get() {
      let rows = rowsOf(name).filter(row => matches(row, filter));
      if (order) rows.sort((a, b) => (order.direction === "desc" ? Number(b[order.field]) - Number(a[order.field]) : Number(a[order.field]) - Number(b[order.field])));
      if (size) rows = rows.slice(0, size);
      return { data: rows };
    },
    async add({ data }) {
      const id = `feedback-${++sequence}`;
      records(name).set(id, { ...data });
      return { _id: id };
    },
  });
  return {
    ...query(),
    doc: id => ({
      async get() {
        const value = records(name).get(id);
        if (!value) throw new Error("document not found");
        return { data: { ...value, _id: id } };
      },
      async update({ data }) {
        const value = records(name).get(id);
        if (!value) throw new Error("document not found");
        records(name).set(id, { ...value, ...data });
        return {};
      },
      async remove() {
        records(name).delete(id);
        return {};
      },
    }),
  };
};

const command = {
  gte: value => ({ __op: "gte", value }),
  lt: value => ({ __op: "lt", value })
};

function matches(row, filter) {
  return Object.entries(filter || {}).every(([key, value]) => {
    if (value && typeof value === "object" && value.__op) {
      if (value.__op === "gte") return Number(row[key]) >= Number(value.value);
      if (value.__op === "lt") return Number(row[key]) < Number(value.value);
      return false;
    }
    return row[key] === value;
  });
}

let currentUser = "player-a";
const originalLoad = Module._load;
let sdk = null;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return (sdk = {
      init() {},
      DYNAMIC_CURRENT_ENV: "test",
      database: () => ({ collection, command }),
      getWXContext: () => ({ OPENID: currentUser }),
      deletedFiles: [],
      async deleteFile({ fileList }) {
        this.deletedFiles.push(...fileList);
        return { fileList };
      }
    });
  }
  return originalLoad(request, parent, isMain);
};

const feedback = require("../cloudfunctions/feedbackService/index.js");

async function expectError(promise, fragment) {
  let message = "";
  try {
    await promise;
  } catch (error) {
    message = error && error.message;
  }
  assert.ok(message.includes(fragment), `期望报错包含「${fragment}」，实际「${message}」`);
}

const cases = [];
const test = (name, run) => cases.push({ name, run });

test("submits a valid feedback and marks today as used", async () => {
  currentUser = "player-a";
  const result = await feedback.main({ action: "submit", type: "bug", content: "战斗里点结束回合没反应", contact: "qq 123456" });
  assert.equal(result.feedback.type, "bug");
  assert.equal(result.feedback.typeLabel, "BUG/故障");
  assert.equal(result.feedback.contact, "qq 123456");
  const mine = await feedback.main({ action: "mine" });
  assert.equal(mine.items.length, 1);
  assert.equal(mine.submittedToday, true);
});

test("rejects a second feedback on the same day", async () => {
  currentUser = "player-a";
  await expectError(feedback.main({ action: "submit", type: "bug", content: "再提一条试试" }), "今天已经提交过反馈了");
});

test("rejects unknown type and short or long content", async () => {
  currentUser = "player-b";
  await expectError(feedback.main({ action: "submit", type: "hack", content: "这是一条足够长的反馈" }), "反馈类型无效");
  await expectError(feedback.main({ action: "submit", type: "suggestion", content: "太短" }), "至少 5 个字");
  await expectError(feedback.main({ action: "submit", type: "suggestion", content: "字".repeat(201) }), "最多 200 个字");
});

test("cleans context and drops unknown fields", async () => {
  currentUser = "player-c";
  const result = await feedback.main({
    action: "submit",
    type: "experience",
    content: "  换行\n 与空格 都要压缩  ",
    context: { version: "1.0.0", model: "iPhone 13", system: "iOS 17", screen: "deckEditor", battleId: "b-1", token: "secret", extra: "x".repeat(200) }
  });
  const doc = records("feedbacks").get(result.feedback.id);
  assert.deepEqual(Object.keys(doc.context).sort(), ["battleId", "model", "screen", "system", "version"]);
  assert.equal(doc.context.battleId, "b-1");
  assert.equal(doc.content, "换行\n 与空格 都要压缩"); // 保留换行（玩家可能分段），只去首尾空白
  assert.equal(doc.status, "pending");
  assert.equal(doc.deleted, false);
});

test("accepts cloud file id only", async () => {
  currentUser = "player-d";
  await expectError(feedback.main({ action: "submit", type: "other", content: "带一张截图", imageFileID: "https://evil/x.png" }), "截图地址无效");
  const result = await feedback.main({ action: "submit", type: "other", content: "带一张截图", imageFileID: "cloud://env/feedback/a.jpg" });
  assert.equal(result.feedback.hasImage, true);
});

test("mine returns only the caller records, counting today separately", async () => {
  currentUser = "player-e";
  records("feedbacks").set("old-one", { userId: "player-e", type: "suggestion", content: "昨天的建议", dateKey: "2000-01-01", deleted: false, createdAt: Date.now() - 3600000 });
  records("feedbacks").set("other-user", { userId: "player-z", type: "bug", content: "别人的反馈", dateKey: "2000-01-01", deleted: false, createdAt: 2 });
  const mine = await feedback.main({ action: "mine" });
  assert.deepEqual(mine.items.map(item => item.content), ["昨天的建议"]);
  assert.equal(mine.submittedToday, false);
});

test("removes own feedback without refunding the daily quota", async () => {
  currentUser = "player-f";
  const created = await feedback.main({ action: "submit", type: "balance", content: "费用曲线有点陡" });
  const removed = await feedback.main({ action: "remove", id: created.feedback.id });
  assert.equal(removed.ok, true);
  assert.equal(records("feedbacks").get(created.feedback.id).deleted, true);
  const mine = await feedback.main({ action: "mine" });
  assert.equal(mine.items.length, 0);
  await expectError(feedback.main({ action: "submit", type: "balance", content: "删了也不能再提" }), "今天已经提交过反馈了");
});

test("cannot remove other people feedback", async () => {
  currentUser = "player-g";
  records("feedbacks").set("foreign", { userId: "player-z", type: "bug", content: "别人的", dateKey: "2000-01-01", deleted: false, createdAt: 3 });
  await expectError(feedback.main({ action: "remove", id: "foreign" }), "只能删除自己的反馈");
  currentUser = "player-z";
  await expectError(feedback.main({ action: "submit", type: "nope", content: "内容够长了吧" }), "反馈类型无效");
  await expectError(feedback.main({ action: "unknown" }), "反馈操作无效");
});

test("date key follows beijing natural day", async () => {
  const { dateKey } = feedback.__test;
  const morning = Date.UTC(2026, 10, 20, 0, 30); // 北京 08:30
  const night = Date.UTC(2026, 10, 20, 17, 30); // 北京次日 01:30
  assert.equal(dateKey(morning), "2026-11-20");
  assert.equal(dateKey(night), "2026-11-21");
});


cases.push({
  name: "keeps only seven days and deletes expired with files",
  async run() {
    currentUser = "player-retention";
    const { RETENTION_MS } = feedback.__test;
    const oldId = "feedback-old-1";
    records("feedbacks").set(oldId, {
      userId: "player-retention",
      type: "bug",
      typeLabel: "BUG/故障",
      content: "这是八天前的老反馈",
      contact: "",
      imageFileID: "cloud://old/shot.jpg",
      context: {},
      dateKey: "2026-11-12",
      status: "pending",
      deleted: false,
      createdAt: Date.now() - RETENTION_MS - 3600000,
      updatedAt: Date.now() - RETENTION_MS - 3600000
    });
    const mineAfterOld = await feedback.main({ action: "mine" });
    assert.strictEqual(mineAfterOld.items.some(item => item.id === oldId), false, "超过 7 天的反馈不应出现在我的列表里");

    const fresh = await feedback.main({ action: "submit", type: "bug", content: "今天的新反馈", context: {} });
    const cleanupResult = await feedback.main({ action: "cleanup" });
    assert.ok(cleanupResult.removed >= 1, `应至少清掉 1 条过期反馈，实际 ${cleanupResult.removed}`);
    assert.strictEqual(records("feedbacks").has(oldId), false, "过期记录应被物理删除");
    assert.strictEqual(records("feedbacks").has(fresh.feedback.id), true, "7 天内的新反馈不能删");
    assert.strictEqual(sdk.deletedFiles.includes("cloud://old/shot.jpg"), true, "应同时删除云存储里的截图");

    const timerResult = await feedback.main({ Type: "Timer" });
    assert.strictEqual(timerResult.removed, 0, "没有过期数据时定时清理应删 0 条");
  }
});

(async () => {
  let failed = 0;
  for (const item of cases) {
    try {
      await item.run();
      console.log(`  ok ${item.name}`);
    } catch (error) {
      failed += 1;
      console.log(`  FAIL ${item.name}\n    ${error && error.message}`);
    }
  }
  if (failed) {
    console.log(`feedback-service-test-failed cases=${cases.length} fail=${failed}`);
    process.exit(1);
  }
  console.log(`feedback-service-test-ok cases=${cases.length}`);
})();
