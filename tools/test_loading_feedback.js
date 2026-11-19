#!/usr/bin/env node
"use strict";

/**
 * 加载反馈回归（2026-11-19 用户确认的三条需求）。
 *
 * 背景：原来任何云端请求都会立刻盖一层全屏「云端处理中…」并冻结整页，
 * 点「我的牌组 / 召唤记录」都像卡死。现在改为：
 * 1. 请求超过 400ms 才在顶部显示一行小字「加载中…」（`state.slowLoading`）
 * 2. 进页面立刻切屏，数据到了再填（`loadDecks/loadHistory/loadBattleHistory`）
 * 3. 不再整页冻结，只有 220ms 连点去抖（`state.tapLock`）
 *
 * 跑法：node tools/test_loading_feedback.js
 */

const noop = () => {};
const handlers = {};
const cloudCalls = [];
const renderedText = [];
const modalCalls = [];
const toastCalls = [];
const gradient = { addColorStop: noop };
const contextTarget = {
  createLinearGradient: () => gradient,
  measureText: value => ({ width: String(value).length * 8 }),
  roundRect: noop,
  fillRect: noop,
  fillText: value => renderedText.push(String(value)),
};
const context = new Proxy(contextTarget, {
  get(target, property) {
    if (property in target) return target[property];
    return noop;
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  },
});

global.setInterval = () => 0;

const cards = [
  { id: "c001", name: "星尘学徒", rarity: "common", set: "base", cost: 1, attack: 1, health: 2, element: "✦", rulesText: "", flavorText: "测试卡。" },
  { id: "r001", name: "星界哨兵", rarity: "rare", set: "base", cost: 4, attack: 3, health: 5, element: "✧", rulesText: "护盾。", flavorText: "测试卡。" },
];

const player = {
  inventory: [{ cardId: "c001", normalCount: 1, shinyCount: 0 }, { cardId: "r001", normalCount: 3, shinyCount: 1 }],
  totalDraws: 12,
  dust: 500,
  ticket: 100,
  coin: 1000,
  pity: {},
};

// 服务端存档的可变副本：每次工作台动作都基于它计算，才能验证客户端是否即时刷新
const serverPlayer = JSON.parse(JSON.stringify(player));

function inventoryEntry(cardId) {
  let entry = serverPlayer.inventory.find(item => item.cardId === cardId);
  if (!entry) {
    entry = { cardId, normalCount: 0, shinyCount: 0 };
    serverPlayer.inventory.push(entry);
  }
  return entry;
}

function cloudResult(name, data) {
  cloudCalls.push(`${name}:${(data && data.action) || ""}`);
  if (name === "gameData") {
    return {
      player: JSON.parse(JSON.stringify(player)),
      cards,
      sets: [{ id: "base", name: "基础卡牌包" }],
      pools: [{ id: "base", name: "基础召唤池", setIds: ["base"], enabled: true }],
      config: { craft: { common: 40, rare: 60 }, disassemble: { common: 5, rare: 20 }, signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
      signStatus: { claimedToday: true, firstCycle: true, day: 1 },
      userKey: "workshop-ui-test",
    };
  }
  if (name === "workshop" && data && data.action === "craft") {
    const entry = inventoryEntry(data.cardId);
    entry.normalCount += 1;
    serverPlayer.dust -= 40;
    return { player: JSON.parse(JSON.stringify(serverPlayer)), inventory: JSON.parse(JSON.stringify(serverPlayer.inventory)) };
  }
  if (name === "workshop" && data && data.action === "disassemble") {
    const entry = inventoryEntry(data.cardId);
    if (data.shiny) entry.shinyCount = Math.max(0, entry.shinyCount - 1);
    else entry.normalCount = Math.max(0, entry.normalCount - 1);
    serverPlayer.dust += data.shiny ? 15 : 5;
    return { player: JSON.parse(JSON.stringify(serverPlayer)), inventory: JSON.parse(JSON.stringify(serverPlayer.inventory)) };
  }
  if (name === "workshop" && data && data.action === "shiny") {
    const entry = inventoryEntry(data.cardId);
    entry.normalCount = Math.max(0, entry.normalCount - 3);
    entry.shinyCount += 1;
    return { player: JSON.parse(JSON.stringify(serverPlayer)), inventory: JSON.parse(JSON.stringify(serverPlayer.inventory)) };
  }
  return {};
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 393, windowHeight: 852, pixelRatio: 2, safeArea: { top: 0, bottom: 852 } }),
  getMenuButtonBoundingClientRect: () => ({ bottom: 82 }),
  createCanvas: () => ({ getContext: () => context, width: 0, height: 0 }),
  createImage: () => {
    const image = {};
    Object.defineProperty(image, "src", { set() { if (typeof image.onload === "function") image.onload(); } });
    return image;
  },
  cloud: { init: noop, callFunction: ({ name, data }) => Promise.resolve({ result: cloudResult(name, data || {}) }) },
  onTouchStart: callback => { handlers.touchStart = callback; },
  onTouchMove: callback => { handlers.touchMove = callback; },
  onTouchEnd: callback => { handlers.touchEnd = callback; },
  onTouchCancel: callback => { handlers.touchCancel = callback; },
  onShow: callback => { handlers.show = callback; },
  showShareMenu: noop,
  onShareAppMessage: noop,
  showModal: options => { modalCalls.push(options && options.title || ""); if (options && options.success) options.success({ confirm: true, cancel: false }); },
  showToast: options => { toastCalls.push((options && options.title) || ""); },
  showActionSheet: noop,
};

const runtime = require("../game.js").__test;
const state = runtime.state;
const assert = require("assert");
const passthrough = global.wx.cloud.callFunction;
const pendingCalls = [];

global.wx.cloud.callFunction = request => {
  const name = request && request.name;
  if (name === "deckService" || name === "drawHistory" || name === "battleGame") {
    return new Promise(resolve => pendingCalls.push({ name, resolve }));
  }
  return passthrough(request);
};

const settle = async (rounds = 6) => {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
  }
};

function tap() {
  handlers.touchStart({ touches: [{ clientX: 10, clientY: 10 }] });
  handlers.touchEnd({ changedTouches: [{ clientX: 10, clientY: 10 }] });
}

(async () => {
  state.configReady = true;
  state.screen = "home";
  state.pendingRequests = 0;
  state.slowLoading = false;
  state.tapLocks = {};

  // 1) 立刻切屏：点「我的牌组」后不用等云端
  state.hit = [{ id: "decks", x: 0, y: 0, w: 200, h: 200 }];
  tap();
  await settle(2);
  assert.strictEqual(state.screen, "decks", "点我的牌组后应立即切到牌组页，不等云端返回");
  assert.strictEqual(state.pendingRequests, 1, "应记录一个进行中的请求");
  assert.strictEqual(state.slowLoading, false, "刚发出请求时不应立刻显示加载提示");

  // 2) 400ms 之内不打扰
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.strictEqual(state.slowLoading, false, "200ms 时还不该出现加载提示");

  // 3) 超过 400ms 才出现小字提示
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.strictEqual(state.slowLoading, true, "超过 400ms 应出现加载提示");

  // 4) 数据到达后提示消失
  pendingCalls.shift().resolve({ result: { slots: [] } });
  await settle(10);
  assert.strictEqual(state.pendingRequests, 0, "请求结束后计数应归零");
  assert.strictEqual(state.slowLoading, false, "数据到达后加载提示应消失");
  assert.strictEqual(state.screen, "decks", "数据到达后仍停在牌组页");

  // 4.5) 对战准备页也立刻切过去（它原来是等两个请求回来才切）
  state.screen = "home";
  state.configReady = true;
  state.hit = [{ id: "battleSetup", x: 0, y: 0, w: 200, h: 200 }];
  tap();
  await settle(2);
  assert.strictEqual(state.screen, "battleSetup", "点对战入口应立即进入对战准备页，不等云端");
  for (const call of pendingCalls.splice(0)) call.resolve({ result: { slots: [], game: null } });
  await settle(6);

  // 5) 页面没被冻结：导航类入口照常立刻响应
  state.hit = [{ id: "history", x: 0, y: 0, w: 200, h: 200 }];
  tap();
  await settle(2);
  assert.strictEqual(state.screen, "history", "另一入口应能立刻响应，页面不再被冻结");

  // 6) 会写云端的动作在飞行中不会被重复下发（同一动作第二次点击被忽略）
  const before = pendingCalls.length;
  state.screen = "decks";
  state.deckDraft = { slot: 1, name: "测试牌组", cards: [], generalSkill: "heal-five" };
  state.decks = [{ slot: 1, name: "测试牌组", cards: [], generalSkill: "heal-five", valid: true }];
  state.hit = [{ id: "saveDeck", x: 0, y: 0, w: 200, h: 200 }];
  tap();
  tap();
  await settle(2);
  assert.strictEqual(pendingCalls.length, before + 1, "同一动作连点两次只应下发一次请求");

  global.wx.cloud.callFunction = passthrough;
  console.log("loading-feedback-ok slowAfter=400ms immediateNav=1 inflightGuard=1");
})().catch(error => {
  global.wx.cloud.callFunction = passthrough;
  console.error("loading-feedback-failed", error);
  process.exit(1);
});
