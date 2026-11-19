"use strict";

const noop = () => {};
const handlers = {};
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

function cloudResult(name) {
  if (name === "gameData") return {
    player: { inventory: [], totalDraws: 0, dust: 0, ticket: 100, coin: 1000, pity: { base: 17, mixed: 3, "star-remnant": 0 } },
    cards: [],
    sets: [{ id: "base", name: "基础卡牌包" }, { id: "star-remnant", name: "星骸遗响" }],
    pools: [
      { id: "base", name: "基础召唤池", setIds: ["base"], enabled: true },
      { id: "mixed", name: "混合召唤池", setIds: ["base", "star-remnant"], enabled: true },
      { id: "star-remnant", name: "星骸遗响限定池", setIds: ["star-remnant"], enabled: true },
    ],
    config: { signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
    signStatus: { claimedToday: true, firstCycle: true, day: 1 },
    userKey: "session-test",
  };
  if (name === "gameServices") return {
    player: { inventory: [], totalDraws: 0, dust: 0, ticket: 100, coin: 1000, pity: { base: 17, mixed: 3, "star-remnant": 0 } },
    shop: { ticketPrice: 100, maxQuantity: 99 },
    mail: [],
    tasks: { daily: { tasks: [], bonus: null }, weekly: { tasks: [], bonus: null }, achievements: [] },
    redDots: { mail: false, tasks: false, achievements: false },
  };
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
  cloud: { init: noop, callFunction: ({ name }) => Promise.resolve({ result: cloudResult(name) }) },
  onTouchStart: callback => { handlers.touchStart = callback; },
  onTouchMove: callback => { handlers.touchMove = callback; },
  onTouchEnd: callback => { handlers.touchEnd = callback; },
  onTouchCancel: callback => { handlers.touchCancel = callback; },
  onShow: callback => { handlers.show = callback; },
  showShareMenu: noop,
  onShareAppMessage: noop,
  showModal: noop,
  showToast: noop,
  showActionSheet: noop,
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
}

(async () => {
  await settle();
  let before = renderedText.length;
  tap(70, 360);
  await settle();
  if (!renderedText.slice(before).some(value => value.includes("当前卡池：基础召唤池"))) throw new Error("Pool selection did not activate");
  before = renderedText.length;
  handlers.show();
  await settle();
  if (!renderedText.slice(before).some(value => value.includes("点击卡池卡片进行选择"))) throw new Error("Pool selection persisted after re-entry");
  console.log("pool-session-state-smoke-ok");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
