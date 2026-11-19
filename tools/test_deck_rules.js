"use strict";

// 牌组合法性校验回归（服务端 validateDeck）：
// 对应 docs/CARD_COLLECTION_WORKSHOP_MERGE_PLAN.md §7.3 里与牌组联动的验收项 ——
// 库存不足不可开战、非闪与闪卡分别校验不能互相补足、同名稀有度上限、未知/不可用卡牌。

const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return { init(){}, DYNAMIC_CURRENT_ENV:"test", database:()=>({ collection:()=>({}), serverDate:()=>0 }), getWXContext:()=>({ OPENID:"deck-user" }) };
  }
  return originalLoad(request, parent, isMain);
};

const validateDeck = require("../cloudfunctions/battleGame/index.js").__test.validateDeck;

const CARDS = [];
for (let i = 0; i < 10; i += 1) CARDS.push({ id: `c10${i}`, name: `普通${i}`, rarity: "common", playable: true });
for (let i = 0; i < 5; i += 1) CARDS.push({ id: `r10${i}`, name: `稀有${i}`, rarity: "rare", playable: true });
CARDS.push({ id: "l001", name: "传说", rarity: "legendary", playable: true });
CARDS.push({ id: "x001", name: "未上线", rarity: "common", playable: false });

const DECK_BASE = [
  { cardId: "c100", normalCount: 3, shinyCount: 0 },
  { cardId: "c101", normalCount: 3, shinyCount: 0 },
  { cardId: "c102", normalCount: 3, shinyCount: 0 },
  { cardId: "c103", normalCount: 3, shinyCount: 0 },
  { cardId: "c104", normalCount: 3, shinyCount: 0 },
  { cardId: "c105", normalCount: 3, shinyCount: 0 },
  { cardId: "r100", normalCount: 2, shinyCount: 0 },
];

const totalOf = cards => cards.reduce((sum, item) => sum + item.normalCount + item.shinyCount, 0);
const ownedFrom = cards => cards.map(item => ({ ...item }));
const deck = cards => ({ name: "测试牌组", cards });
const player = cards => ({ inventory: ownedFrom(cards) });

function rejects(fn, pattern, label) {
  try {
    fn();
  } catch (error) {
    assert.ok(pattern.test(error.message), `${label}：错误文案不符，实际「${error.message}」`);
    return;
  }
  throw new Error(`${label}：本应失败却通过了`);
}

assert.equal(totalOf(DECK_BASE), 20, "基准牌组应正好 20 张");
assert.doesNotThrow(() => validateDeck(deck(DECK_BASE), player(DECK_BASE), CARDS), "合法牌组应通过");

// 数量不对
const nineteen = [
  { cardId: "c100", normalCount: 3, shinyCount: 0 },
  { cardId: "c101", normalCount: 3, shinyCount: 0 },
  { cardId: "c102", normalCount: 3, shinyCount: 0 },
  { cardId: "c103", normalCount: 3, shinyCount: 0 },
  { cardId: "c104", normalCount: 3, shinyCount: 0 },
  { cardId: "r100", normalCount: 2, shinyCount: 0 },
];
assert.equal(totalOf(nineteen), 17, "19 张用例基数");
rejects(() => validateDeck(deck(nineteen), player(nineteen), CARDS), /正好包含 20 张/, "17 张");
rejects(
  () => validateDeck(deck(DECK_BASE.concat([{ cardId: "c106", normalCount: 1, shinyCount: 0 }])), player(DECK_BASE.concat([{ cardId: "c106", normalCount: 1, shinyCount: 0 }])), CARDS),
  /正好包含 20 张/, "21 张"
);

// 未知卡牌（正好 20 张，避免先被数量挡掉）
rejects(() => validateDeck(deck([{ cardId: "nope", normalCount: 20, shinyCount: 0 }]), player([]), CARDS), /未知卡牌/, "未知卡牌");

// 不可用卡牌
rejects(
  () => validateDeck(deck([{ cardId: "x001", normalCount: 20, shinyCount: 0 }]), player([{ cardId: "x001", normalCount: 20, shinyCount: 0 }]), CARDS),
  /暂不可用于对战/, "未上线卡牌"
);

// 同名稀有度上限：传说最多 1 张
rejects(
  () => validateDeck(deck([{ cardId: "l001", normalCount: 20, shinyCount: 0 }]), player([{ cardId: "l001", normalCount: 20, shinyCount: 0 }]), CARDS),
  /超过同名上限/, "传说超上限"
);

// 拥有数量不足：牌组写 2 张，实际只有 1 张
const shortOne = DECK_BASE.map(item => (item.cardId === "r100" ? { cardId: "r100", normalCount: 2, shinyCount: 0 } : item));
rejects(
  () => validateDeck(deck(shortOne), player(shortOne.map(item => (item.cardId === "r100" ? { ...item, normalCount: 1 } : item))), CARDS),
  /超出拥有数量/, "拥有数量不足"
);

// 版本不能互相补足：拥有普通 2、闪卡 0，牌组写普通 2 + 闪卡 1
const crossFill = DECK_BASE.map(item => (item.cardId === "c105" ? { cardId: "c105", normalCount: 2, shinyCount: 1 } : item));
rejects(
  () => validateDeck(deck(crossFill), player(crossFill.map(item => (item.cardId === "c105" ? { cardId: "c105", normalCount: 2, shinyCount: 0 } : item))), CARDS),
  /超出拥有数量/, "版本互相补足"
);

// 闪卡库存不足但普通卡充足
const shinyShort = DECK_BASE.map(item => (item.cardId === "c105" ? { cardId: "c105", normalCount: 0, shinyCount: 3 } : item));
rejects(
  () => validateDeck(deck(shinyShort), player(shinyShort.map(item => (item.cardId === "c105" ? { cardId: "c105", normalCount: 5, shinyCount: 1 } : item))), CARDS),
  /超出拥有数量/, "闪卡不足"
);

// 两个版本各自足够时允许混编
assert.doesNotThrow(
  () => validateDeck(deck(crossFill), player(crossFill), CARDS),
  "普通与闪卡各自足够时应允许混编"
);

console.log("deck rules passed: size, unknown, playable, rarity-limit, per-version-inventory, mixed-version");
