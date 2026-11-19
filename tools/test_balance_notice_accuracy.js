"use strict";

// 平衡公告「前后对比」准确性校验：
// 公告里声称的 after 必须等于当前权威卡牌数据，before 必须与 after 至少差一项，
// 关键词与规则文本必须自洽。防止「改了卡却忘了改公告」或「公告写错数值」。

const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return { init(){}, DYNAMIC_CURRENT_ENV:"test", database:()=>({ serverDate:()=>0 }) };
  }
  return originalLoad(request, parent, isMain);
};

const data = require("../cloudfunctions/initGameData/index.js").__test;
const cards = data.cards;
const byId = new Map(cards.map(card => [card.id, card]));
const notices = data.balanceNotices || [];

assert.ok(notices.length >= 1, "至少应有一条平衡公告");
assert.equal(new Set(notices.map(notice => notice.id)).size, notices.length, "公告 ID 必须唯一");

const KEYWORD_TEXT = { guard: "城墙", deathrattle: "亡语", charge: "冲锋", rush: "突袭", shield: "圣盾", lifesteal: "吸血", taunt: "嘲讽" };

function keywordText(keywords) {
  return (keywords || []).map(keyword => KEYWORD_TEXT[keyword] || keyword).join("；");
}

for (const notice of notices) {
  assert.ok(Array.isArray(notice.changes) && notice.changes.length > 0, `公告 ${notice.id} 缺少 changes`);
  assert.ok(notice.title, `公告 ${notice.id} 缺少标题`);
  assert.ok(Number(notice.publishedAt) > 0, `公告 ${notice.id} 缺少 publishedAt`);

  for (const change of notice.changes) {
    const card = byId.get(change.cardId);
    assert.ok(card, `公告 ${notice.id} 引用了不存在的卡牌 ${change.cardId}`);
    assert.ok(change.before && change.after, `${change.cardId} 缺少 before/after 快照`);

    // after 必须与权威卡牌数据一致
    assert.equal(change.after.cost, card.cost, `${change.cardId} 公告费用 ${change.after.cost} 与卡牌 ${card.cost} 不一致`);
    assert.equal(change.after.attack, card.attack, `${change.cardId} 公告攻击 ${change.after.attack} 与卡牌 ${card.attack} 不一致`);
    assert.equal(change.after.health, card.health, `${change.cardId} 公告生命 ${change.after.health} 与卡牌 ${card.health} 不一致`);
    assert.deepEqual(change.after.keywords || [], card.keywords || [], `${change.cardId} 公告关键词与卡牌不一致`);

    // before 与 after 必须真的不同，且 before 字段齐全
    for (const field of ["cost", "attack", "health"]) {
      assert.equal(typeof change.before[field], "number", `${change.cardId} before.${field} 必须是数字`);
    }
    assert.ok(Array.isArray(change.before.keywords), `${change.cardId} before.keywords 必须是数组`);
    const changedFields = ["cost", "attack", "health"].filter(field => change.before[field] !== change.after[field]);
    const keywordChanged = JSON.stringify(change.before.keywords || []) !== JSON.stringify(change.after.keywords || []);
    assert.ok(changedFields.length > 0 || keywordChanged, `${change.cardId} 的 before 与 after 完全相同，公告没有实际改动`);

    // 规则文本必须覆盖卡牌身上的关键词
    const expectedKeywords = keywordText(card.keywords);
    if (expectedKeywords) {
      for (const word of expectedKeywords.split("；")) {
        assert.ok(String(change.after.rulesText || "").includes(word), `${change.cardId} 公告规则文本缺少关键词「${word}」`);
      }
    }
    assert.ok(change.note, `${change.cardId} 缺少一句话说明`);
  }
}

console.log(`balance notice accuracy passed: notices=${notices.length}, changes=${notices.reduce((sum, notice) => sum + notice.changes.length, 0)}`);
