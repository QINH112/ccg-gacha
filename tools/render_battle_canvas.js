"use strict";

/**
 * 用真实的 Canvas 实现渲染战斗界面，产出可直接查看的 PNG。
 *
 * 和 smoke_* 不同：那些用的是空 canvas stub，只能断言「有没有调用绘制」；
 * 这里把 wx.createCanvas 换成 node-canvas，跑的是 game.js 真实的渲染代码，
 * 所以能看出卡牌外围有没有多余边框、文字是否被压。
 *
 * 依赖 node-canvas（不在工程内，避免影响打包）：
 *   mkdir D:\\kaifa\\.canvas-render && cd /d/kaifa/.canvas-render && npm i canvas
 *   cd node_modules/.bin && ./prebuild-install -r napi --prefix ../canvas
 *
 * 用法：
 *   node tools/render_battle_canvas.js                 # 375x812 与 430x932 各一张
 *   node tools/render_battle_canvas.js 393x852         # 指定尺寸
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CANVAS_MODULE = process.env.CANVAS_MODULE || path.join("D:/kaifa/.canvas-render/node_modules/canvas");
let canvasLib;
try {
  canvasLib = require(CANVAS_MODULE);
} catch (error) {
  console.error(`render-battle-canvas-failed 找不到 node-canvas：${CANVAS_MODULE}`);
  console.error("  按文件头注释安装依赖，或设置 CANVAS_MODULE 指向 node_modules/canvas");
  process.exit(1);
}
const { createCanvas, registerFont, Image } = canvasLib;

for (const candidate of ["C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simhei.ttf"]) {
  if (fs.existsSync(candidate)) {
    try { registerFont(candidate, { family: "sans-serif" }); break; } catch (error) { /* 忽略 */ }
  }
}

const designRoot = require("./design-root").resolveDesignRoot(ROOT);
const OUTPUT = path.join(designRoot, "review");

const noop = () => {};
const handlers = {};
// 游戏里有些动画靠 setInterval 驱动，渲染样张时不需要，禁掉避免进程挂住
global.setInterval = () => 0;
const pendingImages = new Set();

function imageFromFile(relative) {
  const image = new Image();
  const absolute = path.isAbsolute(relative) ? relative : path.join(ROOT, relative);
  const record = { image, relative, done: false };
  pendingImages.add(record);
  image.onload = () => { record.done = true; pendingImages.delete(record); if (typeof image.onloadCallback === "function") image.onloadCallback(); };
  image.onerror = () => { record.done = true; pendingImages.delete(record); console.warn(`  ! 图片加载失败 ${relative}`); };
  fs.readFile(absolute, (error, buffer) => {
    if (error) { image.onerror(); return; }
    image.src = buffer;
  });
  return {
    get width() { return image.width || 1; },
    get height() { return image.height || 1; },
    set src(value) { /* 由 imageFromFile 统一加载 */ },
    get src() { return relative; },
    _src: relative,
    image,
  };
}

const viewport = (() => {
  const argument = process.argv[2];
  const match = /^(\d+)x(\d+)$/.exec(argument || "");
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 375, height: 812 };
})();

const canvas = createCanvas(viewport.width * 2, viewport.height * 2);
const context = canvas.getContext("2d");

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: viewport.width, windowHeight: viewport.height, pixelRatio: 2, safeArea: { top: 0, bottom: viewport.height } }),
  getMenuButtonBoundingClientRect: () => ({ bottom: 82 }),
  createCanvas: () => canvas,
  createOffscreenCanvas: () => createCanvas(1, 1),
  createImage: () => imageFromFile("assets/ui/home/poolBase.png"),
  loadSubpackage: ({ success }) => success(),
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
  showModal: options => { if (options && options.success) options.success({ confirm: true }); },
  showToast: noop,
  showActionSheet: noop,
  setStorageSync: noop,
  getStorageSync: () => "",
};

// node-canvas 的 Image 支持直接赋文件路径，onload 会自然触发
global.wx.createImage = () => new Image();

function card(id, instanceId, overrides) {
  const base = {
    id, cardId: id, instanceId,
    name: overrides && overrides.name || id,
    rarity: overrides && overrides.rarity || "common",
    set: "base",
    type: overrides && overrides.type || "minion",
    cost: overrides && overrides.cost != null ? overrides.cost : 2,
    attack: overrides && overrides.attack !== undefined ? overrides.attack : 2,
    health: overrides && overrides.health !== undefined ? overrides.health : 3,
    keywords: overrides && overrides.keywords || [],
    rulesText: overrides && overrides.rulesText || "",
    canAttack: Boolean(overrides && overrides.canAttack),
    attacksLeft: overrides && overrides.attacksLeft != null ? overrides.attacksLeft : 0,
    artPath: `subpackages/card-art-base/images/${id}.jpg`,
  };
  return overrides ? { ...base, ...overrides } : base;
}

const hand = [
  card("c001", "hand-1", { name: "星尘学徒", rarity: "common", cost: 1, attack: 1, health: 3 }),
  card("c002", "hand-2", { name: "月影侍从", rarity: "common", cost: 1, attack: 3, health: 1 }),
  card("r009", "hand-3", { name: "归墟歌者", rarity: "rare", cost: 4, attack: 4, health: 4, keywords: ["guard"] }),
  card("l004", "hand-4", { name: "万籁归寂", rarity: "legendary", type: "spell", cost: 1, attack: null, health: null }),
];
const playerBoard = [
  card("c008", "p1", { name: "碎星蝶", rarity: "rare", cost: 3, attack: 4, health: 4, canAttack: true, attacksLeft: 1 }),
  card("c010", "p2", { name: "残骸守卫", rarity: "epic", cost: 4, attack: 3, health: 6, keywords: ["guard"] }),
  card("c016", "p3", { name: "星骸巨像", rarity: "epic", cost: 6, attack: 6, health: 5 }),
];
const enemyBoard = [
  card("c025", "e1", { name: "深渊螺号", rarity: "rare", cost: 3, attack: 3, health: 5 }),
  card("c012", "e2", { name: "残骸巨螯", rarity: "rare", cost: 4, attack: 4, health: 3, keywords: ["guard"] }),
];

const game = {
  id: "render-battle",
  status: "active",
  phase: "main",
  turn: "player",
  difficulty: "normal",
  deckName: "渲染样张牌组",
  deadlineAt: Date.now() + 72000,
  player: {
    hand, board: playerBoard, health: 27, deckCount: 13, mana: 6, tempMana: 0, maxMana: 6,
    generalSkill: "draw-two", generalSkillUsed: false, heroPowerUsed: false,
    graveyard: [card("c003", "g1", { name: "游荡灯灵", rarity: "common", graveyardSequence: 1 })],
  },
  ai: {
    handCount: 4, deckCount: 14, board: enemyBoard, health: 25, mana: 5, maxMana: 5,
    graveyard: [card("c005", "g2", { name: "碎光幼龙", rarity: "uncommon", graveyardSequence: 1 })],
  },
};

function gameDataResult() {
  return {
    player: { inventory: [], totalDraws: 0, dust: 120, ticket: 100, coin: 1000, pity: {} },
    cards: [...hand, ...playerBoard, ...enemyBoard],
    sets: [{ id: "base", name: "基础卡包" }],
    pools: [{ id: "base", name: "基础召唤池", setIds: ["base"], enabled: true }],
    config: { signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
    signStatus: { claimedToday: true, firstCycle: true, day: 1 },
    userKey: "render-canvas",
  };
}

function cloudResult(name, data) {
  if (name === "gameData") return gameDataResult();
  if (name === "gameServices") {
    const player = gameDataResult().player;
    return { player, shop: { ticketPrice: 100, maxQuantity: 99 }, mail: [], tasks: { daily: { tasks: [], bonus: null }, weekly: { tasks: [], bonus: null }, achievements: [] }, redDots: {} };
  }
  if (name === "deckService") return { slots: [{ slot: 1, name: game.deckName, count: 20, valid: true, generalSkill: "draw-two" }] };
  if (name === "battleGame") return { game };
  return {};
}

const runtime = require("../game.js").__test;

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
  }
}

(async () => {
  console.log("  · 启动游戏 runtime");
  await settle();
  // 图片由 node-canvas 异步读盘，等它稳定下来（最多 4 秒）
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (attempt >= 8) break;
  }
  runtime.state.screen = "battle";
  runtime.state.battle = game;
  runtime.state.battleSpeed = 1;
  runtime.state.battleNotice = null;
  runtime.state.showCardDetail = false;
  runtime.state.cards = gameDataResult().cards;
  runtime.state.sets = gameDataResult().sets;
  runtime.render();
  await settle();

  fs.mkdirSync(OUTPUT, { recursive: true });
  const output = path.join(OUTPUT, `battle-canvas-${viewport.width}x${viewport.height}.png`);
  fs.writeFileSync(output, canvas.toBuffer("image/png"));
  console.log(`battle-canvas-ok ${output}`);

  // 抽卡结果页样张：单抽 / 十连各一张
  const cards = gameDataResult().cards;
  const resultCard = (value, shiny) => {
    const card = value && typeof value === "object" ? value : cards.find(item => item.id === value) || { id: String(value), name: String(value), rarity: "common", set: "base" };
    return { ...card, shiny: Boolean(shiny) };
  };
  const sample = cards.slice(0, 10);
  const shots = [
    { label: "单抽", ids: [[sample[0], false]] },
    { label: "十连", ids: sample.map((card, index) => [card, [1, 4, 7].includes(index)]) }
  ];
  for (const shot of shots) {
    runtime.state.screen = "home";
    runtime.state.showResults = true;
    runtime.state.resultLabel = shot.label;
    runtime.state.results = shot.ids.map(([id, shiny]) => resultCard(id, shiny));
    runtime.render();
    await settle();
    const file = path.join(OUTPUT, `draw-results-${shot.label}-${viewport.width}x${viewport.height}.png`);
    fs.writeFileSync(file, canvas.toBuffer("image/png"));
    console.log(`draw-results-ok ${file}`);
  }
  process.exit(0);
})().catch(error => {
  console.error("render-battle-canvas-failed", error);
  process.exit(1);
});
