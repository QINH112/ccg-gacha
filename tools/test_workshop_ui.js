#!/usr/bin/env node
"use strict";

/**
 * 工坊 / 卡牌详情的客户端行为断言（不依赖真机）。
 *
 * 对应验收项：
 * - 打开非闪版本详情，左下「分解」、右下「合成此卡」
 * - 非闪版本 0 张时合成按钮按星尘条件正确可用/置灰
 * - 分解点击后直接执行，不出现确认弹窗
 * - 合成/闪耀点击后直接执行，成功即时刷新星尘
 *
 * 跑法：node tools/test_workshop_ui.js
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

function tap(x, y) {
  handlers.touchStart({ touches: [{ clientX: x, clientY: y }] });
  handlers.touchEnd({ changedTouches: [{ clientX: x, clientY: y }] });
}

async function settle() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
}

function hits(kind) {
  return state.hit.filter(item => item.id === kind);
}

function centerOf(entry) {
  return [entry.x + entry.w / 2, entry.y + entry.h / 2];
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function openDetail(cardId, shiny) {
  renderedText.length = 0;
  state.screen = "collection";
  state.showCollectionFilters = false;
  state.showCardDetail = true;
  state.detailCard = cards.find(card => card.id === cardId);
  state.detailShiny = shiny;
  state.detailCard = { ...state.detailCard, shiny: Boolean(shiny) };
  runtime.render();
}

(async () => {
  await settle();
  assert(state.configReady, "配置未加载完成");
  assert(state.cards.length === cards.length, "卡牌列表未就绪");

  // 1. 非闪版本详情：左下「分解」、右下「合成此卡」
  openDetail("c001", false);
  assert(renderedText.includes("分解"), "详情页缺少「分解」按钮文案");
  assert(renderedText.includes("合成此卡"), "非闪版本详情应显示「合成此卡」");
  assert(renderedText.some(value => /^普通 1 · 闪卡 0$/.test(value)), "详情页未显示普通/闪卡数量");

  // 2. 分解直接执行，不弹确认框
  const before = modalCalls.length;
  const disassemble = hits("cardAction").find(entry => entry.data && entry.data.action === "disassemble");
  assert(disassemble, "分解按钮没有命中区域（应可点击）");
  tap(...centerOf(disassemble));
  await settle();
  assert(cloudCalls.includes("workshop:disassemble"), "分解没有下发 workshop:disassemble");
  assert(modalCalls.length === before, `分解不应弹确认框，实际弹了 ${modalCalls.slice(before).join("/")}`);
  assert(toastCalls.some(title => title.includes("分解")), "分解成功后缺少 toast 提示");

  // 3. 合成直接执行，成功即时刷新星尘
  openDetail("c001", false);
  const dustBefore = Number(state.player.dust);
  const craft = hits("cardAction").find(entry => entry.data && entry.data.action === "craft");
  assert(craft, "星尘足够时合成按钮应可点击");
  tap(...centerOf(craft));
  await settle();
  assert(cloudCalls.includes("workshop:craft"), "合成没有下发 workshop:craft");
  assert(toastCalls.some(title => title === "合成成功"), "合成成功后缺少 toast");
  assert(Number(state.player.dust) === dustBefore - 40, `星尘未即时刷新：${dustBefore} -> ${state.player.dust}`);

  // 4. 星尘不足时合成按钮置灰（没有命中区域），分解仍然可点
  state.player.dust = 0;
  openDetail("c001", false);
  assert(!hits("cardAction").some(entry => entry.data && entry.data.action === "craft"), "星尘不足时合成按钮应置灰");
  assert(hits("cardAction").some(entry => entry.data && entry.data.action === "disassemble"), "星尘不足不应影响分解按钮");

  // 5. 闪卡版本：右下为「闪耀」，且 3 张普通卡时可点
  state.player.dust = 500;
  openDetail("r001", true);
  assert(renderedText.includes("闪耀"), "闪卡详情应显示「闪耀」按钮");
  const shiny = hits("cardAction").find(entry => entry.data && entry.data.action === "shiny");
  assert(shiny, "拥有 3 张普通卡时「闪耀」应可点击");
  tap(...centerOf(shiny));
  await settle();
  assert(cloudCalls.includes("workshop:shiny"), "闪耀没有下发 workshop:shiny");
  assert(toastCalls.some(title => title === "闪耀合成成功"), "闪耀成功后缺少 toast");

  // 6. 普通卡不足 3 张时「闪耀」置灰
  state.player.inventory = [{ cardId: "r001", normalCount: 2, shinyCount: 1 }];
  openDetail("r001", true);
  assert(!hits("cardAction").some(entry => entry.data && entry.data.action === "shiny"), "普通卡不足 3 张时「闪耀」应置灰");

  // 详情页「分解」按钮显示的数值必须与云端实际返还一致（调整期内按合成价）
  state.balanceNotices = { items: [] };
  assert(runtime.disassembleValue({ id: "c001", rarity: "common" }, false) === 5, "无公告时显示基础分解价 5");
  state.balanceNotices = { items: [{ id: "n1", enabled: true, publishedAt: Date.now() - 3600000, changes: [{ cardId: "c001" }] }] };
  assert(runtime.disassembleValue({ id: "c001", rarity: "common" }, false) === 40, "公告生效期内显示合成价 40");
  assert(runtime.disassembleValue({ id: "c001", rarity: "common" }, true) === 120, "闪卡是 40 的三倍");
  openDetail("c001", false);
  await settle();
  assert(renderedText.some(text => text.includes("40星尘")), "详情页分解按钮应显示 40 星尘");
  assert(!renderedText.some(text => text.includes("5星尘")), "不应再显示旧的 5 星尘");
  state.balanceNotices = { items: [] };

  // 连点分解只下发一次请求（400ms 冷却 + 飞行中拦截）
  {
    openDetail("c001", false);
    await settle();
    const before = cloudCalls.filter(name => name.startsWith("workshop:")).length;
    const hit = state.hit.find(item => item.id === "cardAction");
    assert(hit, "详情页应有分解/合成按钮");
    tap(hit.x + 4, hit.y + 4);
    tap(hit.x + 4, hit.y + 4);
    tap(hit.x + 4, hit.y + 4);
    await settle(4);
    const after = cloudCalls.filter(name => name.startsWith("workshop:")).length;
    assert(after - before === 1, `连点三次只应下发一次工坊请求，实际 ${after - before}`);
  }

  console.log("workshop-ui-test-ok", cloudCalls.join(","));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
