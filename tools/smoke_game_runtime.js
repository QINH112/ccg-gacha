"use strict";

const noop = () => {};
const handlers = {};
const cloudCalls = [];
const gradient = { addColorStop: noop };
const context = new Proxy({
  createLinearGradient: () => gradient,
  measureText: value => ({ width: String(value).length * 8 }),
  roundRect: noop,
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
function cloudResult(name, data) {
  cloudCalls.push(`${name}:${data && data.action || ""}`);
  if (name === "gameData") return {
    player: { inventory: [], totalDraws: 12, dust: 30, ticket: 100, coin: 1000, pity: {} },
    cards: [],
    sets: [{ id: "base", name: "基础卡牌包" }, { id: "star-remnant", name: "星骸遗响" }],
    pools: [
      { id: "base", name: "基础召唤池", setIds: ["base"], enabled: true },
      { id: "mixed", name: "混合召唤池", setIds: ["base", "star-remnant"], enabled: true },
      { id: "star-remnant", name: "星骸遗响限定池", setIds: ["star-remnant"], enabled: true },
    ],
    config: { signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
    signStatus: { claimedToday: true, firstCycle: true, day: 1 },
    userKey: "smoke-user",
  };
  if (name === "gameServices") return {
    player: { inventory: [], totalDraws: 12, dust: 30, ticket: 100, coin: 1000, pity: {} },
    shop: { ticketPrice: 100, maxQuantity: 99 },
    mail: [],
    tasks: { daily: { tasks: [], bonus: null }, weekly: { tasks: [], bonus: null }, achievements: [] },
    redDots: { mail: false, tasks: false, achievements: false },
  };
  if (name === "deckService") return { slots: [{ slot: 1, name: "测试牌组", count: 20, valid: true, generalSkill: "draw-two" }] };
  if (name === "battleGame" && data.action === "history") return { history: [] };
  if (name === "battleGame") return { game: null };
  return {};
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 393, windowHeight: 852, pixelRatio: 2, safeArea: { top: 0, bottom: 852 } }),
  getMenuButtonBoundingClientRect: () => ({ bottom: 82 }),
  createCanvas: () => ({ getContext: () => context, width: 0, height: 0 }),
  createImage: () => {
    const image = {};
    Object.defineProperty(image, "src", {
      set() {
        if (typeof image.onload === "function") image.onload();
      },
    });
    return image;
  },
  cloud: {
    init: noop,
    callFunction: ({ name, data }) => Promise.resolve({ result: cloudResult(name, data || {}) }),
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
  tap(300, 700);
  await settle();
  tap(23, 115);
  await settle();
  tap(365, 700);
  await settle();
  if (!cloudCalls.includes("deckService:list")) throw new Error("Battle setup route was not reached");
  if (!cloudCalls.includes("battleGame:history")) throw new Error("Battle history route was not reached");
  console.log("game-runtime-smoke-ok", cloudCalls.join(","));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
