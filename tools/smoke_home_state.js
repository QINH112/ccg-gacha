"use strict";

const noop = () => {};
const handlers = {};
const cloudCalls = [];
const renderedText = [];
const gradient = { addColorStop: noop };
const context = new Proxy({
  createLinearGradient: () => gradient,
  measureText: value => ({ width: String(value).length * 8 }),
  roundRect: noop,
  fillText: value => renderedText.push(String(value)),
}, {
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

const card = { id: "c001", name: "晨星旅者", rarity: "common", set: "base", cost: 1, attack: 1, health: 2, element: "✦", description: "测试卡" };
function cloudResult(name, data) {
  cloudCalls.push(`${name}:${data && data.action || ""}`);
  if (name === "gameData") return {
    player: { inventory: [], totalDraws: 0, dust: 0, ticket: 10, coin: 1000, pity: {} },
    cards: [card],
    sets: [{ id: "base", name: "基础卡牌包" }, { id: "star-remnant", name: "星骸遗响" }],
    pools: [
      { id: "base", name: "基础召唤池", setIds: ["base"], enabled: true },
      { id: "mixed", name: "混合召唤池", setIds: ["base", "star-remnant"], enabled: true },
      { id: "star-remnant", name: "星骸遗响限定池", setIds: ["star-remnant"], enabled: true },
    ],
    config: { signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
    signStatus: { claimedToday: true, firstCycle: true, day: 1 },
    userKey: "home-state",
  };
  if (name === "gameServices") return {
    player: { inventory: [], totalDraws: 0, dust: 0, ticket: 10, coin: 1000, pity: {} },
    shop: { ticketPrice: 100, maxQuantity: 99 }, mail: [],
    tasks: { daily: { tasks: [], bonus: null }, weekly: { tasks: [], bonus: null }, achievements: [] },
    redDots: { mail: false, tasks: false, achievements: false },
  };
  if (name === "drawCards") return { player: { inventory: [{ cardId: "c001", normalCount: 1, shinyCount: 0 }], totalDraws: 1, dust: 0, ticket: 9, coin: 1000, pity: { base: 1 } }, results: [{ card }], batch: { drawType: "单抽" } };
  throw new Error(`Unexpected cloud call ${name}`);
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 393, windowHeight: 852, pixelRatio: 2, safeArea: { top: 0, bottom: 852 } }),
  getMenuButtonBoundingClientRect: () => ({ bottom: 82 }),
  createCanvas: () => ({ getContext: () => context, width: 0, height: 0 }),
  createImage: () => { const image = {}; Object.defineProperty(image, "src", { set() { if (typeof image.onload === "function") image.onload(); } }); return image; },
  cloud: { init: noop, callFunction: ({ name, data }) => Promise.resolve({ result: cloudResult(name, data || {}) }) },
  onTouchStart: callback => { handlers.touchStart = callback; },
  onTouchMove: callback => { handlers.touchMove = callback; },
  onTouchEnd: callback => { handlers.touchEnd = callback; },
  onTouchCancel: callback => { handlers.touchCancel = callback; },
  onShow: callback => { handlers.show = callback; },
  showShareMenu: noop, onShareAppMessage: noop, showModal: noop, showActionSheet: noop,
  showToast: noop,
};

require("../game.js");

function tap(x, y) {
  handlers.touchStart({ touches: [{ clientX: x, clientY: y }] });
  handlers.touchEnd({ changedTouches: [{ clientX: x, clientY: y }] });
}

async function settle() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

(async () => {
  await settle();
  tap(70, 520);
  await settle();
  if (!renderedText.includes("点击卡池卡片进行选择")) throw new Error("Home did not explain that a pool must be selected");
  if (cloudCalls.some(call => call.startsWith("drawCards:"))) throw new Error("Drawing without a selected pool reached cloud service");
  tap(70, 400);
  await settle();
  tap(70, 520);
  await settle();
  if (!cloudCalls.includes("drawCards:")) throw new Error("Selected-pool single draw did not reach cloud service");
  if (!renderedText.includes("收下卡牌")) throw new Error("Draw result overlay was not rendered");
  tap(370, 40);
  await settle();
  if (renderedText.slice(-10).includes("收下卡牌")) throw new Error("Draw result overlay did not close");
  console.log("home-state-smoke-ok", cloudCalls.join(","));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
