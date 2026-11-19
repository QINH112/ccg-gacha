"use strict";

// 主界面入口与微信胶囊按钮的避让校验。
// 胶囊高度在不同机型/系统版本上差异很大，这里把胶囊底边设成极端值（200），
// 断言主界面所有可点击入口矩形都落在胶囊底边之下——否则真机上会被胶囊挡住或点错。

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

const CAPSULE_BOTTOM = 200;

function cloudResult(name) {
  if (name === "gameData") return {
    player: { inventory: [], totalDraws: 0, dust: 0, ticket: 0, coin: 0, pity: {}, signIn: { firstCycleDay: 0 }, uiState: { lastReadBalanceNoticeId: "" } },
    cards: [],
    sets: [{ id: "base", name: "基础卡牌包" }],
    pools: [{ id: "base", name: "基础召唤池", setIds: ["base"], enabled: true }],
    config: { signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
    signStatus: { claimedToday: false, firstCycle: true, day: 1 },
    userKey: "capsule-smoke-user",
    balanceNotices: { status: "ready", latest: null, items: [] },
    hasUnreadBalanceNotice: false,
  };
  if (name === "gameServices") return { player: { inventory: [], totalDraws: 0, dust: 0, ticket: 0, coin: 0, pity: {}, signIn: { firstCycleDay: 0 } }, shop: { ticketPrice: 100, maxQuantity: 99 }, mail: [], tasks: { daily: { tasks: [], bonus: null }, weekly: { tasks: [], bonus: null }, achievements: [] }, redDots: { mail: false, tasks: false, achievements: false } };
  if (name === "drawHistory") return { history: [] };
  if (name === "deckService") return { slots: [] };
  if (name === "battleGame") return { game: null, history: [] };
  return {};
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 393, windowHeight: 852, pixelRatio: 2, safeArea: { top: 0, bottom: 852 } }),
  getMenuButtonBoundingClientRect: () => ({ top: CAPSULE_BOTTOM - 32, bottom: CAPSULE_BOTTOM, height: 32, width: 87, left: 296, right: 383 }),
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

const runtime = require("../game.js").__test;

async function settle() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
}

(async () => {
  await settle();
  await settle();

  runtime.render();
  const hits = runtime.state.hit || [];
  if (runtime.state.screen !== "home") throw new Error(`主界面未就绪，当前 screen=${runtime.state.screen}`);
  if (hits.length < 8) throw new Error(`主界面可点击入口过少（${hits.length}），可能布局未渲染`);

  const ENTRY_IDS = new Set(["sign", "history", "collection", "shop", "adjustAnnouncement", "mail", "tasks", "achievements", "decks", "battleSetup", "battleHistory", "draw"]);
  const entries = hits.filter(item => ENTRY_IDS.has(String(item.id)));
  if (entries.length < 8) throw new Error(`主界面入口命中区过少（${entries.length}），布局可能未渲染`);
  const intruders = entries.filter(item => Number(item.y) < CAPSULE_BOTTOM);
  if (intruders.length) {
    const detail = intruders.slice(0, 3).map(item => `${item.id}@y=${item.y}`).join(", ");
    throw new Error(`胶囊底边 ${CAPSULE_BOTTOM} 以下仍有入口：${detail}`);
  }

  const topmost = Math.min(...entries.map(item => Number(item.y)));
  console.log(`home-capsule-smoke-ok capsuleBottom=${CAPSULE_BOTTOM} entries=${entries.length} topmost=${topmost}`);
})();
