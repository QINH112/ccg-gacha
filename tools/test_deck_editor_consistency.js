#!/usr/bin/env node
"use strict";

/**
 * 牌组编辑器与服务端校验的一致性：
 * 编辑器里能凑到 20 张的牌组，必须能通过 deckService.validate；
 * 编辑器拦住的（同名超限、超出拥有数量、张数不足），服务端也必须报同样的错。
 *
 * 跑法：node tools/test_deck_editor_consistency.js
 */

const Module = require("module");
const noop = () => {};
const handlers = {};

const contextTarget = {
  createLinearGradient: () => ({ addColorStop: noop }),
  measureText: value => ({ width: String(value).length * 8 }),
  roundRect: noop,
  fillRect: noop,
  fillText: noop
};
const context = new Proxy(contextTarget, {
  get(target, property) { return property in target ? target[property] : noop; },
  set(target, property, value) { target[property] = value; return true; }
});
global.setInterval = () => 0;

const cards = Array.from({ length: 12 }, (_, index) => ({
  id: `t${String(index + 1).padStart(3, "0")}`,
  name: `测试卡${index + 1}`,
  rarity: index === 0 ? "legendary" : index % 3 === 0 ? "epic" : index % 3 === 1 ? "rare" : "common",
  set: "base",
  cost: (index % 6) + 1,
  attack: index + 1,
  health: index + 2,
  element: "✦",
  rulesText: "",
  playable: true
}));
const player = {
  inventory: cards.map(card => ({ cardId: card.id, normalCount: 3, shinyCount: 0 })),
  totalDraws: 0, dust: 500, ticket: 10, coin: 0, pity: {}
};

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 2, safeArea: { top: 20, bottom: 792 } }),
  getMenuButtonBoundingClientRect: () => ({ bottom: 78 }),
  createCanvas: () => ({ getContext: () => context, width: 0, height: 0 }),
  createImage: () => {
    const image = {};
    Object.defineProperty(image, "src", { set() { if (typeof image.onload === "function") image.onload(); } });
    return image;
  },
  cloud: {
    init: noop,
    callFunction: ({ name }) => Promise.resolve({
      result: name === "gameData"
        ? {
          player: JSON.parse(JSON.stringify(player)),
          cards,
          sets: [{ id: "base", name: "基础卡牌包" }],
          pools: [{ id: "base", name: "基础召唤池", setIds: ["base"], enabled: true }],
          config: { craft: { common: 40 }, disassemble: { common: 5 }, signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
          signStatus: { claimedToday: true, firstCycle: true, day: 1 },
          userKey: "deck-consistency-test"
        }
        : {}
    })
  },
  onTouchStart: callback => { handlers.touchStart = callback; },
  onTouchMove: callback => { handlers.touchMove = callback; },
  onTouchEnd: callback => { handlers.touchEnd = callback; },
  onTouchCancel: callback => { handlers.touchCancel = callback; },
  onShow: callback => { handlers.show = callback; },
  showShareMenu: noop,
  onShareAppMessage: noop,
  showModal: noop,
  showToast: noop,
  showActionSheet: noop
};

const originalLoad = Module._load;
Module._load = function (request) {
  if (request === "wx-server-sdk") {
    return { init: noop, DYNAMIC_CURRENT_ENV: "test", database: () => ({ serverDate: () => 0 }) };
  }
  return originalLoad.apply(this, arguments);
};
const deckService = require("../cloudfunctions/deckService/index.js").__test;

const runtime = require("../game.js").__test;
const state = runtime.state;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

const draftOf = count => {
  const draft = { slot: 1, name: "一致性牌组", generalSkill: "draw-two", cards: [] };
  for (const card of runtime.deckSortedCards()) {
    if (runtime.deckQuantity(draft) >= count) break;
    const limit = runtime.deckLimit(card);
    const take = Math.min(limit, count - runtime.deckQuantity(draft));
    if (take > 0) draft.cards.push({ cardId: card.id, normalCount: take, shinyCount: 0 });
  }
  return draft;
};
const validate = deck => deckService.validate(deck, state.player, state.cards);

(async () => {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
  assert(state.configReady, "配置未加载完成");
  assert(state.cards.length === cards.length, "卡牌列表未就绪");

  // 1) 编辑器凑满 20 张 → 服务端校验通过
  const full = draftOf(20);
  assert(runtime.deckQuantity(full) === 20, `草稿应为 20 张，实际 ${runtime.deckQuantity(full)}`);
  const fullResult = validate(full);
  assert(fullResult.valid === true, `满 20 张的牌组应合法，实际错误：${(fullResult.errors || []).join(" / ")}`);

  // 2) 少一张 → 编辑器显示未完成，服务端报张数不足
  const short = draftOf(19);
  assert(short.valid !== true, "少一张不应是合法牌组");
  const shortResult = validate(short);
  assert(shortResult.valid === false, "少一张服务端也应判为不合法");
  assert(shortResult.errors.some(text => text.includes("20 张")), `应报张数不足，实际：${shortResult.errors.join(" / ")}`);

  // 3) 同名超限：编辑器不允许，服务端也应报「最多可放」
  const over = draftOf(20);
  const common = state.cards.find(card => card.rarity === "common");
  const commonLimit = runtime.deckLimit(common);
  over.cards.push({ cardId: common.id, normalCount: commonLimit + 1, shinyCount: 0 });
  const overResult = validate(over);
  assert(overResult.valid === false, "同名超限应被判为不合法");
  assert(overResult.errors.some(text => text.includes("最多可放")), `应报同名上限，实际：${overResult.errors.join(" / ")}`);

  // 4) 超出拥有数量：编辑器里点不到那么多张，服务端也应拦住
  const beyond = draftOf(1);
  const first = beyond.cards[0];
  first.normalCount = 99;
  const beyondResult = validate(beyond);
  assert(beyondResult.valid === false, "超出拥有数量应被判为不合法");
  assert(beyondResult.errors.some(text => text.includes("超出拥有数量")), `应报超出拥有数量，实际：${beyondResult.errors.join(" / ")}`);

  // 5) 一键补满的结果必须能通过服务端校验
  state.screen = "deckEditor";
  state.deckDraft = { slot: 1, name: "补满校验", generalSkill: "draw-two", cards: [] };
  state.deckFilters = { sets: [], rarities: [], costs: [] };
  state.deckSearch = "";
  state.deckSort = "cost";
  runtime.fillDeckDraft();
  const filled = state.deckDraft;
  assert(runtime.deckQuantity(filled) === 20, `一键补满应到 20 张，实际 ${runtime.deckQuantity(filled)}`);
  const filledResult = validate(filled);
  assert(filledResult.valid === true, `一键补满的牌组应合法，实际错误：${(filledResult.errors || []).join(" / ")}`);

  console.log("deck-editor-consistency-ok full=20 short=19 overLimit owned beyondFill");
})().catch(error => {
  console.error("deck-editor-consistency-failed", error);
  process.exit(1);
});
