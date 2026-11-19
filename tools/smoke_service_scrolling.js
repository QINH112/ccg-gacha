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

const cards = Array.from({ length: 36 }, (_, index) => ({
  id: `scroll-card-${index + 1}`,
  name: `测试卡 ${index + 1}`,
  rarity: index % 9 === 0 ? "epic" : index % 4 === 0 ? "rare" : "common",
  set: index % 2 ? "base" : "star-remnant",
  cost: index % 8 + 1,
  attack: index % 7 + 1,
  health: index % 9 + 1,
  description: "用于验证长列表滚动到底。",
  playable: true,
}));
const player = {
  inventory: cards.map(card => ({ cardId: card.id, normalCount: 3, shinyCount: 1 })),
  totalDraws: 120,
  dust: 5000,
  ticket: 100,
  coin: 1000,
  pity: {},
  signIn: { firstCycleDay: 0 },
};
const mail = Array.from({ length: 12 }, (_, index) => ({
  id: `scroll-mail-${index + 1}`,
  title: `滚动邮件 ${index + 1}`,
  body: "验证邮箱长列表滚动到底。",
  publishedAt: Date.now() - index * 1000,
  expiresAt: Date.now() + 86400000,
  rewards: [{ type: "ticket", amount: 1 }],
}));
const tasks = Array.from({ length: 12 }, (_, index) => ({
  id: `scroll-task-${index + 1}`,
  name: `滚动任务 ${index + 1}`,
  description: "验证任务长列表滚动到底。",
  progress: index,
  target: 20,
  completed: false,
  claimed: false,
  rewards: [{ type: "coin", amount: 10 }],
}));
const achievements = Array.from({ length: 12 }, (_, index) => ({
  ...tasks[index],
  id: `scroll-achievement-${index + 1}`,
  name: `滚动成就 ${index + 1}`,
}));
const history = Array.from({ length: 20 }, (_, index) => ({
  _id: `scroll-history-${index + 1}`,
  poolName: `滚动记录 ${index + 1}`,
  drawType: "单抽",
  highestRarity: "common",
  createdAt: Date.now() - index * 1000,
  results: [{ id: cards[index % cards.length].id, name: cards[index % cards.length].name, rarity: "common" }],
}));

function dashboard() {
  return {
    player,
    shop: { ticketPrice: 100, maxQuantity: 99 },
    mail,
    tasks: { daily: { tasks, bonus: null }, weekly: { tasks, bonus: null }, achievements },
    redDots: { mail: true, tasks: false, achievements: false },
  };
}

function cloudResult(name, data) {
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
    userKey: "scroll-smoke-user",
  };
  if (name === "gameServices" && data.action === "dashboard") return dashboard();
  if (name === "drawHistory") return { history };
  if (name === "deckService" && data.action === "list") return {
    slots: [
      { slot: 1, name: "滚动测试牌组", generalSkill: "draw-two", cards: [{ cardId: cards[0].id, normalCount: 1, shinyCount: 0 }], count: 1, valid: false, complete: false },
      ...Array.from({ length: 4 }, (_, index) => ({ slot: index + 2, name: `牌组 ${index + 2}`, generalSkill: "draw-two", cards: [], count: 0, valid: false, complete: false })),
    ],
  };
  throw new Error(`Unexpected cloud call: ${name}:${JSON.stringify(data)}`);
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

function swipeUp() {
  handlers.touchStart({ touches: [{ clientX: 196, clientY: 720 }] });
  handlers.touchMove({ touches: [{ clientX: 196, clientY: 160 }] });
  handlers.touchEnd({ changedTouches: [{ clientX: 196, clientY: 160 }] });
}

async function settle() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

function assertRenderedSince(start, label) {
  if (!renderedText.slice(start).some(value => value.includes(label))) throw new Error(`Did not reach final list item: ${label}`);
}

async function openRoute(x, y, title) {
  const start = renderedText.length;
  tap(x, y);
  await settle();
  assertRenderedSince(start, title);
}

async function scrollTo(label, swipes = 12) {
  const start = renderedText.length;
  for (let index = 0; index < swipes; index += 1) swipeUp();
  await settle();
  assertRenderedSince(start, label);
}

async function backHome() {
  tap(20, 115);
  await settle();
}

(async () => {
  await settle();

  await openRoute(165, 610, "星界卡牌图鉴");
  await scrollTo("测试卡 36");
  await backHome();

  await openRoute(102, 610, "召唤记录");
  await scrollTo("滚动记录 20");
  await backHome();

  await openRoute(42, 706, "邮箱");
  await scrollTo("滚动邮件 12");
  await backHome();

  await openRoute(106, 706, "每日与每周任务");
  await scrollTo("滚动任务 12");
  await backHome();

  await openRoute(171, 706, "星界成就");
  await scrollTo("滚动成就 12");
  await backHome();

  await openRoute(237, 706, "我的牌组");
  tap(340, 210);
  await settle();
  await scrollTo("测试卡 36");

  console.log("service-scrolling-smoke-ok collection, history, mail, tasks, achievements, deck editor");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
