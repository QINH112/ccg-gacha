"use strict";

const noop = () => {};
const handlers = {};
const cloudCalls = [];
const renderedText = [];
const modals = [];
const toasts = [];
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

const player = { inventory: [], totalDraws: 12, dust: 30, ticket: 8, coin: 50, pity: {}, signIn: { firstCycleDay: 0 } };
const sets = [
  { id: "base", name: "基础卡牌包" },
  { id: "star-remnant", name: "星骸遗响" },
  ...Array.from({ length: 6 }, (_, index) => ({ id: `future-${index + 1}`, name: `未来拓展包 ${index + 1}` })),
];
let mailClaimed = false;
let dailyClaimed = false;
let weeklyClaimed = false;
let achievementClaimed = false;

function task(id, name, claimed) {
  return { id, name, description: "完成测试目标", progress: 1, target: 1, completed: true, claimed, rewards: [{ type: "ticket", amount: 1 }] };
}

function dashboard() {
  return {
    player,
    shop: { ticketPrice: 100, maxQuantity: 99 },
    mail: mailClaimed ? [] : [{ id: "mail-test", title: "测试邮件", body: "服务交互回归", publishedAt: Date.now(), expiresAt: Date.now() + 86400000, rewards: [{ type: "ticket", amount: 1 }] }],
    tasks: {
      daily: { tasks: [task("daily-test", "每日测试", dailyClaimed)], bonus: null },
      weekly: { tasks: [task("weekly-test", "每周测试", weeklyClaimed)], bonus: null },
      achievements: [task("achievement-test", "成就测试", achievementClaimed)],
    },
    redDots: { mail: !mailClaimed, tasks: !dailyClaimed || !weeklyClaimed, achievements: !achievementClaimed },
  };
}

function cloudResult(name, data) {
  cloudCalls.push(`${name}:${data && data.action || ""}${data && data.scope ? `:${data.scope}` : ""}`);
  if (name === "gameData") return {
    player,
    cards: [{ id:"c001",name:"星尘学徒",rarity:"common",set:"base",cost:1,attack:1,health:2,rulesText:"",flavorText:"汇聚微弱星尘，开启星界旅途。",keywords:[] }],
    sets,
    pools: [
      { id: "base", name: "基础召唤池", setIds: ["base"], enabled: true },
      { id: "mixed", name: "混合召唤池", setIds: sets.map(set => set.id), enabled: true },
    ],
    config: { signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
    signStatus: { claimedToday: true, firstCycle: true, day: 1 },
    userKey: "service-smoke-user",
  };
  if (name === "gameServices" && data.action === "dashboard") return dashboard();
  if (name === "gameServices" && data.action === "claimAllMail") {
    mailClaimed = true;
    return { player, granted: [{ mailId: "mail-test" }] };
  }
  if (name === "gameServices" && data.action === "claimAllTasks") {
    if (data.scope === "daily") dailyClaimed = true;
    if (data.scope === "weekly") weeklyClaimed = true;
    if (data.scope === "achievement") achievementClaimed = true;
    return { player, claimed: [{ scope: data.scope }] };
  }
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
  showModal: options => {
    modals.push({ title: options.title, content: options.content });
    if (typeof options.success === "function") options.success({ confirm: true, content: "不存在的卡牌" });
  },
  showToast: options => { toasts.push(options.title); },
  showActionSheet: options => { options.success({ tapIndex: 2 }); },
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

function assertRenderedAfter(start, value) {
  if (!renderedText.slice(start).some(text => text.includes(value))) throw new Error(`Missing rendered text: ${value}`);
}

async function openHomeRoute(x, y, title) {
  const start = renderedText.length;
  tap(x, y);
  await settle();
  assertRenderedAfter(start, title);
}

async function backHome() {
  tap(20, 115);
  await settle();
}

(async () => {
  await settle();

  await openHomeRoute(165, 618, "星界卡牌图鉴");
  assertRenderedAfter(0, "搜索名称 / ID / 规则 / 关键词");
  let detailStart = renderedText.length;
  tap(60, 260);
  await settle();
  assertRenderedAfter(detailStart, "点击卡牌外关闭");
  tap(5, 5);
  await settle();
  let start = renderedText.length;
  tap(196, 173);
  await settle();
  if (!modals.some(modal => modal.title === "搜索卡牌")) throw new Error("Search modal was not opened");
  assertRenderedAfter(start, "没有匹配的卡牌");
  tap(350, 173);
  await settle();
  assertRenderedAfter(start, "筛选卡牌");
  tap(196, 544);
  await settle();
  const filterStart = renderedText.length;
  tap(160, 420);
  await settle();
  assertRenderedAfter(filterStart, "闪卡 0");
  if (renderedText.slice(filterStart).some(value => value.includes("普通 0"))) throw new Error("Normal version remained after shiny-only filter");
  tap(160, 420);
  await settle();
  tap(86, 420);
  await settle();
  assertRenderedAfter(filterStart, "普通 0");
  tap(5, 500);
  await settle();
  assertRenderedAfter(start, "没有匹配的卡牌");
  await backHome();

  await openHomeRoute(290, 618, "商店");
  tap(196, 324);
  await settle();
  const insufficient = modals.find(modal => modal.title === "金币不足");
  if (!insufficient || !insufficient.content.includes("需要 1000 金币")) throw new Error("Insufficient coin dialog is not user friendly");
  if (cloudCalls.some(value => value.includes("buyTicket"))) throw new Error("Insufficient purchase reached cloud service");
  await backHome();

  await openHomeRoute(42, 706, "邮箱");
  tap(196, 174);
  await settle();
  await backHome();

  await openHomeRoute(106, 706, "每日与每周任务");
  tap(196, 174);
  await settle();
  tap(295, 219);
  await settle();
  tap(196, 174);
  await settle();
  await backHome();

  await openHomeRoute(171, 706, "星界成就");
  tap(196, 174);
  await settle();

  for (const required of [
    "gameServices:claimAllMail",
    "gameServices:claimAllTasks:daily",
    "gameServices:claimAllTasks:weekly",
    "gameServices:claimAllTasks:achievement",
  ]) {
    if (!cloudCalls.includes(required)) throw new Error(`Missing service action: ${required}`);
  }
  for (const expected of ["领取 1 封", "领取 1 项"]) {
    if (!toasts.includes(expected)) throw new Error(`Missing success toast: ${expected}`);
  }
  console.log("service-interactions-smoke-ok", cloudCalls.join(","));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
