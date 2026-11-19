"use strict";

const noop = () => {};
const handlers = {};
const gradient = { addColorStop: noop };
let imageCount = 0;
const context = new Proxy({
  createLinearGradient: () => gradient,
  measureText: value => ({ width: String(value).length * 8 }),
  roundRect: noop,
  fillText: noop,
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

const cards = Array.from({ length: 24 }, (_, index) => ({
  id: `navigation-card-${index + 1}`,
  name: `切页卡 ${index + 1}`,
  rarity: index % 8 === 0 ? "epic" : index % 3 === 0 ? "rare" : "common",
  set: index % 2 ? "base" : "star-remnant",
  cost: index % 8 + 1,
  attack: index % 6 + 1,
  health: index % 7 + 1,
  description: "页面切换稳定性测试。",
}));
const player = {
  inventory: cards.map(card => ({ cardId: card.id, normalCount: 3, shinyCount: 0 })),
  totalDraws: 80,
  dust: 1000,
  ticket: 100,
  coin: 1000,
  pity: {},
  signIn: { firstCycleDay: 0 },
};

function dashboard() {
  return {
    player,
    shop: { ticketPrice: 100, maxQuantity: 99 },
    mail: [],
    tasks: { daily: { tasks: [], bonus: null }, weekly: { tasks: [], bonus: null }, achievements: [] },
    redDots: { mail: false, tasks: false, achievements: false },
  };
}

function cloudResult(name) {
  if (name === "gameData") return {
    player,
    cards,
    sets: [{ id: "base", name: "基础卡牌包" }, { id: "star-remnant", name: "星骸遗响" }],
    pools: [{ id: "base", name: "基础召唤池", setIds: ["base"], enabled: true }],
    config: {
      disassemble: { common: 5, rare: 20, epic: 100, legendary: 400 },
      craft: { common: 40, rare: 100, epic: 400, legendary: 1600 },
      signIn: { firstCycle: [{ type: "ticket", amount: 50 }] },
    },
    signStatus: { claimedToday: true, firstCycle: true, day: 1 },
    userKey: "navigation-stability-user",
  };
  if (name === "gameServices") return dashboard();
  return {};
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 393, windowHeight: 852, pixelRatio: 2, safeArea: { top: 0, bottom: 852 } }),
  getMenuButtonBoundingClientRect: () => ({ bottom: 82 }),
  createCanvas: () => ({ getContext: () => context, width: 0, height: 0 }),
  createImage: () => {
    imageCount += 1;
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

const routes = [
  [195, 618],
  [268, 618],
  [344, 618],
  [42, 706],
  [106, 706],
  [171, 706],
];

(async () => {
  await settle();
  if (typeof global.gc !== "function") throw new Error("Run with node --expose-gc");
  const initialImages = imageCount;
  global.gc();
  const before = process.memoryUsage().heapUsed;
  for (let round = 0; round < 100; round += 1) {
    for (const [x, y] of routes) {
      tap(x, y);
      tap(20, 115);
    }
  }
  await settle();
  global.gc();
  const after = process.memoryUsage().heapUsed;
  const delta = after - before;
  if (imageCount !== initialImages) throw new Error(`Images were recreated during navigation: ${initialImages} -> ${imageCount}`);
  if (delta > 2_000_000) throw new Error(`Heap grew too much during 600 route switches: ${delta}`);
  console.log("navigation-stability-smoke-ok", `switches=600 images=${imageCount} heapDelta=${delta}`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
