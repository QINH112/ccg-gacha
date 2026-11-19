"use strict";

/**
 * 用真实 Canvas 渲染牌组编辑器，产出可直接查看的 PNG。
 *
 * 依赖 node-canvas（与 render_battle_canvas.js 相同，装在仓库外）：
 *   D:\\kaifa\\.canvas-render\\node_modules\\canvas
 *
 * 用法：node tools/render_deck_editor.js [宽x高]
 * 产物：D:\kaifa\design\review\deck-editor-<宽>x<高>.png
 */

const fs = require("fs");
const path = require("path");
const Module = require("module");

const ROOT = path.resolve(__dirname, "..");
const CANVAS_MODULE = process.env.CANVAS_MODULE || path.join("D:/kaifa/.canvas-render/node_modules/canvas");
let canvasLib;
try { canvasLib = require(CANVAS_MODULE); } catch (error) {
  console.error(`render-deck-editor-failed 找不到 node-canvas：${CANVAS_MODULE}`);
  process.exit(1);
}
const { createCanvas, registerFont, Image } = canvasLib;
for (const candidate of ["C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simhei.ttf"]) {
  if (fs.existsSync(candidate)) { try { registerFont(candidate, { family: "sans-serif" }); break; } catch (error) { /* 忽略 */ } }
}

const designRoot = require("./design-root").resolveDesignRoot(ROOT);
const OUTPUT = path.join(designRoot, "review");
const noop = () => {};
const handlers = {};
global.setInterval = () => 0;

const viewport = (() => {
  const match = /^(\d+)x(\d+)$/.exec(process.argv[2] || "");
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 375, height: 812 };
})();

const canvas = createCanvas(viewport.width * 2, viewport.height * 2);

// 卡牌数据来自 initGameData（74 张真实卡）：给它一个假的 wx-server-sdk
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "wx-server-sdk") return { init() {}, DYNAMIC_CURRENT_ENV: "render", database: () => ({ serverDate: () => 0 }) };
  return originalLoad.apply(this, arguments);
};
const cardData = require("../cloudfunctions/initGameData/index.js").__test;
Module._load = originalLoad;
const cards = cardData.cards;
const settings = cardData.settings;

const inventory = cards.map((card, index) => ({ cardId: card.id, normalCount: index % 5 === 0 ? 0 : Math.min(3, (index % 3) + 1), shinyCount: index % 4 === 0 ? 1 : 0 }));
const player = {
  inventory, totalDraws: 42, dust: 615, ticket: 20, coin: 2499, pity: { base: 12, mixed: 0, "star-remnant": 3 },
  signIn: { firstCycleDay: 3, lastClaimDate: "", completedFirstCycle: false }, metrics: { lifetime: {}, daily: { key: "", values: {} }, weekly: { key: "", values: {} } },
  collectionHistory: { normalIds: [], shinyIds: [] }, taskState: {}, uiState: {}
};
const decks = [1, 2, 3, 4, 5].map(slot => ({ slot, name: `牌组 ${slot}`, cards: [], valid: false, errors: [] }));

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: viewport.width, windowHeight: viewport.height, pixelRatio: 2, safeArea: { top: 0, bottom: viewport.height } }),
  getMenuButtonBoundingClientRect: () => ({ bottom: 82 }),
  createCanvas: () => canvas,
  createOffscreenCanvas: () => createCanvas(1, 1),
  createImage: () => new Image(),
  loadSubpackage: ({ success }) => success(),
  cloud: {
    init: noop,
    callFunction: ({ name }) => Promise.resolve({
      result: name === "gameData"
        ? { player, cards, sets: [{ id: "base", name: "基础卡牌包" }, { id: "star-remnant", name: "星骸遗响" }], pools: [{ id: "base", name: "基础召唤池", setIds: ["base"], enabled: true }], config: settings, signStatus: { claimedToday: false, firstCycle: true, day: 4 }, userKey: "render" }
        : name === "deckService" ? { decks } : {}
    })
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
  getStorageSync: () => ""
};

const runtime = require("../game.js").__test;
const state = runtime.state;

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

(async () => {
  await settle();
  await settle();

  // 造一副「看起来像玩家真实牌组」的草稿：低费多、高费少
  state.showSign = false;
  state.screen = "deckEditor";
  state.deckSlot = 1;
  state.deckDraft = { slot: 1, name: "帅哥的卡组", generalSkill: "draw-two", cards: [] };
  state.deckFilters = { sets: [], rarities: [], costs: [] };
  state.deckSearch = "";
  state.deckSort = "cost";
  state.scrollY = 0;
  const deckCards = cards.slice().sort((a, b) => Number(a.cost) - Number(b.cost));
  for (const card of deckCards) {
    if (runtime.deckQuantity(state.deckDraft) >= 20) break;
    const own = inventory.find(item => item.cardId === card.id);
    if (!own || own.normalCount <= 0) continue;
    const limit = runtime.deckLimit(card);
    const take = Math.min(limit, own.normalCount, 20 - runtime.deckQuantity(state.deckDraft));
    if (take <= 0) continue;
    state.deckDraft.cards.push({ cardId: card.id, normalCount: take, shinyCount: 0 });
  }
  runtime.render();
  await settle();

  const file = path.join(OUTPUT, `deck-editor-${viewport.width}x${viewport.height}.png`);
  fs.writeFileSync(file, canvas.toBuffer("image/png"));
  console.log(`deck-editor-ok ${file} cards=${runtime.deckQuantity(state.deckDraft)}/20`);
  process.exit(0);
})().catch(error => {
  console.error("render-deck-editor-failed", error);
  process.exit(1);
});
