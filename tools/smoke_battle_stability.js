"use strict";

const noop = () => {};
const handlers = {};
const intervals = [];
const cloudCalls = [];
const gradient = { addColorStop: noop };
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

global.setInterval = callback => {
  intervals.push(callback);
  return intervals.length;
};

const cards = [
  { id: "s017", instanceId: "hand-1", name: "星骸巨像", rarity: "epic", set: "star-remnant", cost: 6, attack: 6, health: 5, element: "✦", rulesText: "入场：获得护盾。" },
  { id: "s001", instanceId: "hand-2", name: "残星浮游虫", rarity: "common", set: "star-remnant", cost: 1, attack: 1, health: 2, element: "⋆", rulesText: "" },
];

const activeGame = {
  id: "stability-battle",
  status: "active",
  phase: "battle",
  difficulty: "normal",
  deckName: "稳定性测试牌组",
  turn: "player",
  halfTurns: 8,
  deadlineAt: Date.now() + 3600000,
  player: { hand: cards, board: [], health: 30, deckCount: 15, mana: 6, tempMana: 0, maxMana: 6, generalSkill: "draw-two", generalSkillUsed: false, heroPowerUsed: false },
  ai: { handCount: 4, deckCount: 14, board: [], health: 28, mana: 6, maxMana: 6 },
};

function cloudResult(name, data) {
  cloudCalls.push(`${name}:${data && data.action || ""}`);
  if (name === "gameData") return {
    player: { inventory: [], totalDraws: 12, dust: 30, ticket: 100, coin: 1000, pity: {} },
    cards,
    sets: [{ id: "base", name: "基础卡牌包" }, { id: "star-remnant", name: "星骸遗响" }],
    pools: [{ id: "base", name: "基础召唤池", setIds: ["base"], enabled: true }],
    config: { signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
    signStatus: { claimedToday: true, firstCycle: true, day: 1 },
    userKey: "stability-user",
  };
  if (name === "gameServices") return { player: { inventory: [], totalDraws: 12, dust: 30, ticket: 100, coin: 1000, pity: {} }, shop: { ticketPrice: 100, maxQuantity: 99 }, mail: [], tasks: { daily: { tasks: [], bonus: null }, weekly: { tasks: [], bonus: null }, achievements: [] }, redDots: { mail: false, tasks: false, achievements: false } };
  if (name === "deckService") return { slots: [{ slot: 1, name: "稳定性测试牌组", count: 20, valid: true, generalSkill: "draw-two" }] };
  if (name === "battleGame" && data.action === "status") return { game: activeGame };
  if (name === "battleGame" && data.action === "history") return { history: [] };
  return { game: activeGame };
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
  tap(100, 230);
  await settle();
  if (!cloudCalls.includes("battleGame:status")) throw new Error("Active battle was not loaded");
  if (typeof intervals[0] !== "function") throw new Error("Battle refresh interval was not registered");
  if (typeof global.gc !== "function") throw new Error("Run with node --expose-gc");
  global.gc();
  const before = process.memoryUsage().heapUsed;
  for (let second = 0; second < 900; second++) intervals[0]();
  global.gc();
  const after = process.memoryUsage().heapUsed;
  const delta = after - before;
  if (delta > 2_000_000) throw new Error(`Heap grew too much during 900 refreshes: ${delta}`);
  console.log("battle-stability-smoke-ok", `refreshes=900 heapDelta=${delta}`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
