"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

if (!process.env.DEVICE_CASE) {
  const cases = [
    { width: 320, height: 568, dpr: 3, menuBottom: 68 },
    { width: 375, height: 812, dpr: 2, menuBottom: 78 },
    { width: 430, height: 932, dpr: 3, menuBottom: 92 },
  ];
  for (const item of cases) {
    const result = spawnSync(process.execPath, [__filename], {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DEVICE_CASE: JSON.stringify(item) },
      encoding: "utf8",
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) process.exit(result.status || 1);
  }
  console.log("device-matrix-smoke-ok cases=320x568@3,375x812@2,430x932@3");
  process.exit(0);
}

const device = JSON.parse(process.env.DEVICE_CASE);
const noop = () => {};
const handlers = {};
const renderedText = [];
const gradient = { addColorStop: noop };
const canvas = { width: 0, height: 0 };
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
canvas.getContext = () => context;

global.setInterval = () => 0;

const player = { inventory: [], totalDraws: 12, dust: 30, ticket: 100, coin: 1000, pity: {}, signIn: { firstCycleDay: 0 }, uiState:{ lastReadBalanceNoticeId:"" } };
function cloudResult(name, data) {
  if (name === "gameData" && data.action === "markBalanceNoticeRead") return { player:{...player,uiState:{lastReadBalanceNoticeId:data.noticeId}},noticeId:data.noticeId,hasUnreadBalanceNotice:false };
  if (name === "gameData") return {
    player,
    cards: [],
    sets: [{ id: "base", name: "基础卡牌包" }, { id: "star-remnant", name: "星骸遗响" }],
    pools: [
      { id: "base", name: "基础召唤池", setIds: ["base"], enabled: true },
      { id: "mixed", name: "混合召唤池", setIds: ["base", "star-remnant"], enabled: true },
      { id: "star-remnant", name: "星骸遗响限定池", setIds: ["star-remnant"], enabled: true },
    ],
    config: { signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
    signStatus: { claimedToday: true, firstCycle: true, day: 1 },
    userKey: `device-${device.width}`,
    balanceNotices:{status:"ready",latest:{id:"balance-device",title:"卡牌平衡调整",summary:"设备测试",publishedAt:1794950400000,changes:[{cardId:"c001",name:"星尘学徒",before:{cost:1,attack:1,health:2,keywords:[],rulesText:""},after:{cost:1,attack:1,health:3,keywords:[],rulesText:""},note:"生命提高"}]},items:[{id:"balance-device",title:"卡牌平衡调整",summary:"设备测试",publishedAt:1794950400000,changes:[{cardId:"c001",name:"星尘学徒",before:{cost:1,attack:1,health:2,keywords:[],rulesText:""},after:{cost:1,attack:1,health:3,keywords:[],rulesText:""},note:"生命提高"}]}]},
    hasUnreadBalanceNotice:true,
  };
  if (name === "gameServices") return {
    player,
    shop: { ticketPrice: 100, maxQuantity: 99 },
    mail: [],
    tasks: { daily: { tasks: [], bonus: null }, weekly: { tasks: [], bonus: null }, achievements: [] },
    redDots: { mail: false, tasks: false, achievements: false },
  };
  if (name === "drawHistory") return { history: [] };
  if (name === "deckService") return { slots: [] };
  if (name === "battleGame" && data.action === "history") return { history: [] };
  if (name === "battleGame") return { game: null };
  return {};
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: device.width, windowHeight: device.height, pixelRatio: device.dpr, safeArea: { top: 0, bottom: device.height } }),
  getMenuButtonBoundingClientRect: () => ({ bottom: device.menuBottom }),
  createCanvas: () => canvas,
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

function homeCenter(source) {
  const scale = device.width / 941;
  const topCut = 720;
  const bottomCut = 1350;
  const topHeight = topCut * scale;
  const bottomHeight = (1672 - bottomCut) * scale;
  const middleHeight = Math.max(1, device.height - topHeight - bottomHeight);
  const middleScale = middleHeight / (bottomCut - topCut);
  const sourceY = source[1] + source[3] / 2;
  const y = sourceY >= bottomCut
    ? device.height - (1672 - sourceY) * scale
    : sourceY >= topCut
      ? topHeight + (sourceY - topCut) * middleScale
      : sourceY * scale;
  return [(source[0] + source[2] / 2) * scale, y];
}

// 卡牌工坊入口已按 CARD_COLLECTION_WORKSHOP_MERGE_PLAN 合并进图鉴，不再有独立入口
const routes = [
  { source: [178, 1148, 132, 125], title: "召唤记录" },
  { source: [327, 1148, 134, 125], title: "星界卡牌图鉴" },
  { source: [628, 1148, 137, 125], title: "商店" },
  { source: [779, 1148, 135, 125], title: "卡牌平衡调整", backSteps:2 },
  { source: [35, 1315, 132, 141], title: "邮箱" },
  { source: [187, 1315, 135, 141], title: "每日与每周任务" },
  { source: [344, 1315, 132, 141], title: "星界成就" },
];

(async () => {
  await settle();
  const expectedRatio = Math.min(2, device.dpr);
  if (canvas.width !== device.width * expectedRatio || canvas.height !== device.height * expectedRatio) {
    throw new Error(`Canvas DPR mismatch: ${canvas.width}x${canvas.height}`);
  }
  for (const route of routes) {
    const start = renderedText.length;
    const [x, y] = homeCenter(route.source);
    tap(x, y);
    await settle();
    if (!renderedText.slice(start).some(value => value.includes(route.title))) throw new Error(`Route failed on ${device.width}x${device.height}: ${route.title}`);
    for(let step=0;step<(route.backSteps||1);step+=1){tap(20, device.menuBottom + 33);await settle();}
  }
  console.log(`device-case-ok ${device.width}x${device.height}@${device.dpr} canvas=${canvas.width}x${canvas.height}`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
