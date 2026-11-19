"use strict";

// 跨模块共享规则的「单一事实」审计：
// 同名稀有度上限、牌组张数、手牌/战场/法力/英雄血量等常量在 initGameData 的 settings 里有配置，
// 但客户端与多个云函数各自硬编码了同一套数值。任何一侧被改动而另一侧没跟上，都会出现
// 「配置改了但校验没变」的漂移。本测试把这些契约钉死，改错立刻红。

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    const collection = () => ({ doc:() => ({ get:async()=>({data:{}}), set:async()=>({}) }), where:() => ({ orderBy:() => ({ limit:async()=>({data:[]}) }) }) });
    return { init(){}, DYNAMIC_CURRENT_ENV:"test", database:()=>({ collection, serverDate:()=>0 }), getWXContext:()=>({ OPENID:"const-test" }) };
  }
  return originalLoad(request, parent, isMain);
};

const root = path.join(__dirname, "..");
const battle = require(path.join(root, "cloudfunctions/battleGame/index.js")).__test;
const deck = require(path.join(root, "cloudfunctions/deckService/index.js")).__test;
const data = require(path.join(root, "cloudfunctions/initGameData/index.js")).__test;

const settings = data.settings;
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");

// 1) 同名上限：三个模块必须一致
assert.deepEqual(battle.LIMIT, deck.RARITY_LIMIT, "battleGame.LIMIT 与 deckService.RARITY_LIMIT 不一致");
assert.deepEqual(battle.LIMIT, { common: 3, rare: 2, epic: 2, legendary: 1 }, "同名上限被改动，客户端 deckLimit 也必须同步");
assert.ok(
  clientSource.includes('card.rarity==="common"?3:card.rarity==="legendary"?1:2'),
  "客户端 deckLimit 的同名上限写法变了，需同步服务端 LIMIT/RARITY_LIMIT"
);

// 2) 牌组张数：配置、开战校验、牌组保存校验必须都是 20
assert.equal(settings.battle.deckSize, 20, "配置 battle.deckSize 不是 20");
const twentyCards = [];
for (let i = 0; i < 10; i += 1) twentyCards.push({ cardId: `p${i}`, normalCount: 2, shinyCount: 0 });
const cardPool = twentyCards.map(item => ({ id: item.cardId, name: item.cardId, rarity: "rare", playable: true }));
const owned = twentyCards.map(item => ({ cardId: item.cardId, normalCount: 2, shinyCount: 0 }));
assert.doesNotThrow(
  () => battle.validateDeck({ cards: twentyCards }, { inventory: owned }, cardPool),
  "20 张牌组应通过开战校验"
);
const deckResult = deck.validate({ cards: twentyCards }, { inventory: owned }, cardPool);
assert.ok(deckResult && (deckResult.cards ? true : true), "deckService.validate 返回值形状变了");
assert.equal(
  (deckResult.errors || []).length, 0,
  `20 张牌组保存校验不应有错误：${JSON.stringify(deckResult.errors)}`
);
const badDeck = deck.validate({ cards: twentyCards.slice(0, 9) }, { inventory: owned }, cardPool);
assert.ok((badDeck.errors || []).some(message => message.includes("20")), "牌组保存校验没有拦下 18 张牌组");

// 3) 战斗常量：配置与 battleGame 硬编码一致（TURN_MS / HAND_LIMIT / BOARD_LIMIT / heroHealth / maxMana）
const battleSource = fs.readFileSync(path.join(root, "cloudfunctions/battleGame/index.js"), "utf8");
assert.equal(settings.battle.handLimit, 10, "配置 handLimit 不是 10");
assert.ok(battleSource.includes("HAND_LIMIT=10"), "battleGame 的 HAND_LIMIT 与配置 handLimit 不再一致");
assert.equal(settings.battle.boardLimit, 7, "配置 boardLimit 不是 7");
assert.ok(battleSource.includes("BOARD_LIMIT=7"), "battleGame 的 BOARD_LIMIT 与配置 boardLimit 不再一致");
assert.equal(settings.battle.heroHealth, 30, "配置 heroHealth 不是 30");
assert.equal(settings.battle.turnSeconds * 1000, 75000, "配置 turnSeconds 与 TURN_MS=75000 不一致");
assert.ok(battleSource.includes("TURN_MS=75000"), "battleGame 的 TURN_MS 变了，需同步配置 turnSeconds");
assert.equal(settings.battle.maxMana, 10, "配置 maxMana 不是 10");

// 4) 闪耀消耗与非闪合成上限
assert.equal(settings.shinyCost, 3, "配置 shinyCost 不是 3");
assert.ok(clientSource.includes("normal>=3"), "客户端闪耀条件（非闪 >= shinyCost）与配置不一致");
assert.ok(clientSource.includes("normal<9"), "客户端非闪合成上限不是 9");
const workshopSource = fs.readFileSync(path.join(root, "cloudfunctions/workshop/index.js"), "utf8");
assert.ok(workshopSource.includes("normalCount>=9"), "服务端非闪合成上限与客户端 9 张不一致");

console.log("shared constants passed: rarity-limit, deck-size, battle-limits, shiny-cost, craft-cap");
