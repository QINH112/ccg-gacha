"use strict";

const noop = () => {};
const handlers = {};
const createdSources = [];
const loadedSubpackages = [];
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
global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 393, windowHeight: 852, pixelRatio: 4, safeArea: { top: 0, bottom: 852 } }),
  getMenuButtonBoundingClientRect: () => ({ bottom: 82 }),
  requestAnimationFrame: callback => setImmediate(callback),
  createCanvas: () => ({ getContext: () => context, width: 0, height: 0 }),
  createImage: () => {
    const image = { width: 300, height: 400 };
    Object.defineProperty(image, "src", {
      set(value) {
        createdSources.push(String(value));
        if (String(value) === "assets/cards/missing.png") {
          if (typeof image.onerror === "function") image.onerror(new Error("missing"));
        } else if (typeof image.onload === "function") image.onload();
      },
    });
    return image;
  },
  loadSubpackage: ({ name, success }) => {
    loadedSubpackages.push(String(name));
    if (typeof success === "function") success();
  },
  cloud: {
    init: noop,
    callFunction: ({ name }) => Promise.resolve({ result: name === "gameData" ? {
      player: { inventory: [], totalDraws: 0, dust: 0, ticket: 100, coin: 1000, pity: {} },
      cards: [
        { id: "art-a", name: "插画卡 A", rarity: "rare", set: "base", element: "A", cost: 2, attack: 2, health: 3, artPath: "subpackages/card-art-base/images/shared.png" },
        { id: "art-b", name: "插画卡 B", rarity: "epic", set: "base", element: "B", cost: 3, attack: 3, health: 4, imagePath: "subpackages/card-art-base/images/shared.png" },
        { id: "art-failed", name: "失败插画卡", rarity: "rare", set: "base", element: "F", cost: 2, attack: 2, health: 2, artPath: "assets/cards/missing.png" },
        { id: "fallback", name: "占位卡", rarity: "common", set: "base", element: "✦", cost: 1, attack: 1, health: 2 },
      ],
      sets: [{ id: "base", name: "基础卡牌包", order: 1 }],
      pools: [{ id: "base", name: "基础召唤池", setIds: ["base"], enabled: true }],
      config: { signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
      signStatus: { claimedToday: true, firstCycle: true, day: 1 },
      userKey: "art-smoke",
    } : {
      player: { inventory: [], totalDraws: 0, dust: 0, ticket: 100, coin: 1000, pity: {} },
      shop: { ticketPrice: 100, maxQuantity: 99 },
      mail: [],
      tasks: { daily: { tasks: [], bonus: null }, weekly: { tasks: [], bonus: null }, achievements: [] },
      redDots: { mail: false, tasks: false, achievements: false },
    } }),
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

async function settle() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
}

(async () => {
  await settle();
  for (let index = 0; index < 5; index += 1) {
    handlers.show();
    await settle();
  }
  const shared = createdSources.filter(source => source === "subpackages/card-art-base/images/shared.png");
  const failed = createdSources.filter(source => source === "assets/cards/missing.png");
  if (shared.length !== 1) throw new Error(`Expected one shared card art load, got ${shared.length}`);
  if (failed.length !== 1) throw new Error(`Expected one failed card art attempt, got ${failed.length}`);
  if (loadedSubpackages.filter(name => name === "card-art-base").length !== 1) throw new Error(`Expected one base art subpackage load, got ${loadedSubpackages.join(",")}`);
  if (!createdSources.some(source => source.includes("home-clean-imagegen-v1.jpg"))) throw new Error("Home art preload did not run");
  console.log("card-art-loading-smoke-ok", `shared=${shared.length}`, `failed=${failed.length}`, `subpackage=${loadedSubpackages.length}`, `images=${createdSources.length}`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
