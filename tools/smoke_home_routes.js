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

function cloudResult(name, data) {
  cloudCalls.push(`${name}:${data && data.action || ""}`);
  if (name === "gameData" && data.action === "markBalanceNoticeRead") return { player:{ inventory:[],totalDraws:12,dust:30,ticket:100,coin:1000,pity:{},signIn:{firstCycleDay:0},uiState:{lastReadBalanceNoticeId:data.noticeId} },noticeId:data.noticeId,hasUnreadBalanceNotice:false };
  if (name === "gameData") return {
    player: { inventory: [], totalDraws: 12, dust: 30, ticket: 100, coin: 1000, pity: {}, signIn: { firstCycleDay: 0 }, uiState:{ lastReadBalanceNoticeId:"" } },
    cards: [],
    sets: [{ id: "base", name: "基础卡牌包" }, { id: "star-remnant", name: "星骸遗响" }],
    pools: [
      { id: "base", name: "基础召唤池", setIds: ["base"], enabled: true },
      { id: "mixed", name: "混合召唤池", setIds: ["base", "star-remnant"], enabled: true },
      { id: "star-remnant", name: "星骸遗响限定池", setIds: ["star-remnant"], enabled: true },
    ],
    config: { signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
    signStatus: { claimedToday: true, firstCycle: true, day: 1 },
    userKey: "route-smoke-user",
    balanceNotices:{status:"ready",latest:{id:"balance-latest",title:"卡牌平衡调整",summary:"三张卡牌完成调整",publishedAt:1794950400000,changes:[{cardId:"c001",name:"星尘学徒",before:{cost:1,attack:1,health:2,keywords:[],rulesText:""},after:{cost:1,attack:1,health:3,keywords:[],rulesText:""},note:"生命值提高 1 点"}]},items:[{id:"balance-latest",title:"卡牌平衡调整",summary:"三张卡牌完成调整",publishedAt:1794950400000,changes:[{cardId:"c001",name:"星尘学徒",before:{cost:1,attack:1,health:2,keywords:[],rulesText:""},after:{cost:1,attack:1,health:3,keywords:[],rulesText:""},note:"生命值提高 1 点"}]},{id:"balance-old",title:"往期平衡调整",summary:"历史公告",publishedAt:1763366400000,changes:[{cardId:"c002",name:"月影侍从",before:{cost:1,attack:1,health:1,keywords:[],rulesText:""},after:{cost:1,attack:2,health:1,keywords:[],rulesText:""},note:"历史调整"}]}]},
    hasUnreadBalanceNotice:true,
  };
  if (name === "gameServices") return { player: { inventory: [], totalDraws: 12, dust: 30, ticket: 100, coin: 1000, pity: {}, signIn: { firstCycleDay: 0 } }, shop: { ticketPrice: 100, maxQuantity: 99 }, mail: [], tasks: { daily: { tasks: [], bonus: null }, weekly: { tasks: [], bonus: null }, achievements: [] }, redDots: { mail: false, tasks: false, achievements: false } };
  if (name === "drawHistory") return { history: [] };
  if (name === "deckService") return { slots: [] };
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

async function visit(x, y, title, closeOverlay = false, expected = []) {
  const before = renderedText.length;
  tap(x, y);
  await settle();
  const pageText = renderedText.slice(before);
  if (!pageText.some(value => value.includes(title))) throw new Error(`Route did not render: ${title}`);
  for (const value of expected) if (!pageText.some(text => text.includes(value))) throw new Error(`Route ${title} did not render state: ${value}`);
  if (closeOverlay) {
    tap(380, 700);
    await settle();
  } else {
    tap(20, 115);
    await settle();
  }
}

(async () => {
  await settle();
  await visit(40, 610, "七日签到", true);
  await visit(102, 610, "召唤记录", false, ["暂无召唤记录"]);
  await visit(165, 610, "星界卡牌图鉴");
  // 卡牌工坊入口已按 docs/CARD_COLLECTION_WORKSHOP_MERGE_PLAN.md 合并进图鉴，
  // 此处改为反向断言：主界面该位置不再打开独立工坊页。
  const beforeForge = renderedText.length;
  tap(227, 610);
  await settle();
  if (renderedText.slice(beforeForge).some(value => value.includes("卡牌工坊"))) {
    throw new Error("Merged workshop entry still opens the standalone 卡牌工坊 page");
  }
  tap(20, 115);
  await settle();
  await visit(291, 610, "商店");
  await visit(354, 610, "卡牌平衡调整", false, ["星尘学徒", "修改前", "修改后"]);
  if (!renderedText.slice(-80).some(value => value.includes("往期平衡调整"))) throw new Error("Balance notice history list did not render");
  tap(20,115);
  await settle();
  await visit(42, 706, "邮箱", false, ["暂时没有可领取邮件"]);
  await visit(106, 706, "每日与每周任务");
  await visit(171, 706, "星界成就");
  await visit(237, 706, "我的牌组");
  await visit(300, 706, "PVE 对战", false, ["请先选择可用牌组"]);
  await visit(363, 706, "对战记录", false, ["暂无对战记录"]);
  for (const required of ["gameData:markBalanceNoticeRead", "drawHistory:", "deckService:list", "battleGame:status", "battleGame:history"]) {
    if (!cloudCalls.includes(required)) throw new Error(`Missing cloud route: ${required}`);
  }
  console.log("home-routes-smoke-ok", cloudCalls.join(","));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
