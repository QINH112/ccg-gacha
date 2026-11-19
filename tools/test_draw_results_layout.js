#!/usr/bin/env node
"use strict";

/**
 * 抽卡结果页布局回归。
 *
 * 需求（2026-11-19 用户确认）：
 * - 单抽结果卡外围不再有矩形底板（transparentOuter），只显示卡面本身
 * - 五连 / 十连不再退化成符号缩略图，改为 3 列网格显示完整卡面
 * - 闪卡在结果页带「闪」角标，保底卡显示「40保底 / 十连保底」
 *
 * 为什么需要它：`drawCardTemplate` 在 `w<82 || h<112` 时走 compact 分支只画符号，
 * 原来五连/十连五列并排每张只有 ~60px，所以显示成符号。这条测试把「卡宽必须 ≥82」
 * 钉死，防止以后有人为了塞下更多卡又改回 5 列。
 *
 * 跑法：node tools/test_draw_results_layout.js
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
const { resultsLayout } = runtime;
const assert = require("assert");

const layoutCases = [
  { count: 1, cols: 1, rows: 1, label: "单抽" },
  { count: 5, cols: 3, rows: 2, label: "五连" },
  { count: 10, cols: 3, rows: 4, label: "十连" }
];

for (const item of layoutCases) {
  const layout = resultsLayout(item.count);
  assert.strictEqual(layout.cols, item.cols, `${item.label}应有 ${item.cols} 列，实际 ${layout.cols}`);
  assert.strictEqual(layout.rows, item.rows, `${item.label}应有 ${item.rows} 行，实际 ${layout.rows}`);
  assert.ok(layout.cw >= 82, `${item.label}卡宽 ${layout.cw.toFixed(1)} 应 ≥ 82，否则会退化成符号缩略图`);
  assert.ok(layout.bottom <= layout.py + layout.ph - 40, `${item.label}最后一行底边 ${layout.bottom.toFixed(1)} 不应压到「收下卡牌」按钮`);
  assert.ok(layout.gx >= 0 && layout.gx + layout.cols * layout.cw + (layout.cols - 1) * layout.gap <= 375, `${item.label}网格不应超出屏幕宽度`);
}

// 对照：五列并排时卡宽只有 ~60，正是原来退化成缩略图的原因
const fiveColWidth = (375 - 28 - 24 - 6 * 4) / 5;
assert.ok(fiveColWidth < 82, "五个并排时卡宽应小于 82，这条用来证明 3 列是必需的");

// 单抽也要用完整卡面（不能因为是 1 张就缩小）
assert.ok(resultsLayout(1).cw >= 82, "单抽卡片宽度应 ≥82");

console.log(`draw-results-layout-ok cases=${layoutCases.length} tenCw=${resultsLayout(10).cw.toFixed(1)} tenCh=${resultsLayout(10).ch.toFixed(1)}`);
