#!/usr/bin/env node
"use strict";

/**
 * 牌组编辑器 UI 回归（不用真机）：
 * - 左侧收藏是 2 列卡面网格，点一下加一张
 * - 同名上限 / 20 张上限都会被拦住并提示
 * - 右侧当前牌组点数字减一张
 * - 一键补满、法力曲线、筛选面板
 *
 * 跑法：node tools/test_deck_editor_ui.js
 */

const { spawnSync } = require("child_process");
const path = require("path");

if (!process.env.DEVICE_CASE) {
  const cases = [
    { width: 320, height: 568, dpr: 3, menuBottom: 68 },
    { width: 375, height: 812, dpr: 2, menuBottom: 78 },
    { width: 430, height: 932, dpr: 3, menuBottom: 92 }
  ];
  for (const item of cases) {
    const result = spawnSync(process.execPath, [__filename], {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DEVICE_CASE: JSON.stringify(item) },
      encoding: "utf8"
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) process.exit(result.status || 1);
  }
  console.log("deck-editor-ui-ok cases=320x568,375x812,430x932");
  process.exit(0);
}

const device = JSON.parse(process.env.DEVICE_CASE);
const W = device.width;
const H = device.height;
const noop = () => {};
const handlers = {};
const renderedText = [];
const toastCalls = [];
const gradient = { addColorStop: noop };
const contextTarget = {
  createLinearGradient: () => gradient,
  measureText: value => ({ width: String(value).length * 8 }),
  roundRect: noop,
  fillRect: noop,
  fillText: value => renderedText.push(String(value)),
};
const context = new Proxy(contextTarget, {
  get(target, property) { return property in target ? target[property] : noop; },
  set(target, property, value) { target[property] = value; return true; }
});
global.setInterval = () => 0;

const cards = Array.from({ length: 12 }, (_, index) => ({
  id: `t${String(index + 1).padStart(3, "0")}`,
  name: `测试卡${index + 1}`,
  rarity: index % 4 === 0 ? "legendary" : index % 3 === 0 ? "epic" : index % 3 === 1 ? "rare" : "common",
  set: "base",
  cost: (index % 6) + 1,
  attack: index + 1,
  health: index + 2,
  element: "✦",
  rulesText: "",
  flavorText: "测试卡。"
}));
const player = {
  inventory: cards.map((card, index) => ({ cardId: card.id, normalCount: 3, shinyCount: index % 3 === 0 ? 1 : 0 })),
  totalDraws: 0,
  dust: 500,
  ticket: 10,
  coin: 100,
  pity: {}
};

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: W, windowHeight: H, pixelRatio: device.dpr, safeArea: { top: 20, bottom: H - 20 } }),
  getMenuButtonBoundingClientRect: () => ({ bottom: device.menuBottom }),
  createCanvas: () => ({ getContext: () => context, width: 0, height: 0 }),
  createImage: () => {
    const image = {};
    Object.defineProperty(image, "src", { set() { if (typeof image.onload === "function") image.onload(); } });
    return image;
  },
  cloud: {
    init: noop,
    callFunction: ({ name }) => Promise.resolve({
      result: name === "gameData" ? {
        player: JSON.parse(JSON.stringify(player)),
        cards,
        sets: [{ id: "base", name: "基础卡牌包" }],
        pools: [{ id: "base", name: "基础召唤池", setIds: ["base"], enabled: true }],
        config: { craft: { common: 40, rare: 60, epic: 100, legendary: 400 }, disassemble: { common: 5, rare: 20, epic: 100, legendary: 400 }, signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
        signStatus: { claimedToday: true, firstCycle: true, day: 1 },
        userKey: "deck-editor-test"
      } : { deck: { slot: 1, name: "牌组 1", cards: [], valid: false, errors: [] }, decks: [] }
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
  showToast: options => toastCalls.push(String((options && options.title) || "")),
  showActionSheet: noop
};

const runtime = require("../game.js").__test;
const state = runtime.state;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function openEditor() {
  state.screen = "deckEditor";
  state.deckSlot = 1;
  state.deckDraft = { slot: 1, name: "测试牌组", generalSkill: "draw-two", cards: [] };
  state.deckFilters = { sets: [], rarities: [], costs: [] };
  state.deckSearch = "";
  state.deckFilterOpen = false;
  state.scrollY = 0;
  runtime.render();
}

const hitOf = (id, predicate) => state.hit.filter(item => item.id === id).filter(item => !predicate || predicate(item.data || {}));

async function tap(data) {
  const start = { touches: [{ clientX: data.x + 4, clientY: data.y + 4 }] };
  handlers.touchStart && handlers.touchStart(start);
  handlers.touchEnd && handlers.touchEnd({ touches: [], changedTouches: [{ clientX: data.x + 4, clientY: data.y + 4 }] });
  await settle();
}

(async () => {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
  assert(state.configReady, "配置未加载完成");
  assert(state.cards.length === cards.length, "卡牌列表未就绪");

  openEditor();

  // 1) 2 列网格：前两张卡同一行、x 不同、都在屏内
  const cells = hitOf("deckAdd");
  assert(cells.length > 0, "卡面网格没有任何可点区域");
  const first = cells[0], second = cells[1];
  assert(Math.abs(first.y - second.y) < 0.5, "前两张卡应在同一行");
  assert(second.x > first.x + first.w - 1, "第二列应紧接第一列右侧");
  for (const cell of cells) {
    assert(cell.x >= 0 && cell.x + cell.w <= W + 0.5, `卡面越出屏幕：x=${cell.x} w=${cell.w}`);
    assert(cell.y >= 0, `卡面越出屏幕顶部：y=${cell.y}`);
    assert(cell.y <= H, `卡片命中区应只出现在可视区：y=${cell.y}`);
  }

  // 2) 点一下加一张
  const target = cells[0].data.cardId;
  const before = state.deckDraft.cards.reduce((sum, item) => sum + item.normalCount + item.shinyCount, 0);
  await tap({ x: cells[0].x, y: cells[0].y });
  const after = state.deckDraft.cards.reduce((sum, item) => sum + item.normalCount + item.shinyCount, 0);
  assert(after === before + 1, `点卡面应加一张：${before} -> ${after}`);
  assert(runtime.deckQuantity(state.deckDraft) === 1, "牌组张数应变为 1");

  // 3) 同名上限：把那三张都点满，第四次应被拒
  const card = cards.find(item => item.id === target);
  const limit = runtime.deckLimit(card);
  toastCalls.length = 0;
  for (let index = 0; index < limit + 2; index += 1) {
    runtime.render();
    const sameCell = hitOf("deckAdd", data => data.cardId === target)[0];
    if (!sameCell) break;
    await tap({ x: sameCell.x, y: sameCell.y });
  }
  const entry = state.deckDraft.cards.find(item => item.cardId === target);
  assert(entry.normalCount + entry.shinyCount <= limit, `同名数量不应超过上限 ${limit}`);
  assert(toastCalls.some(text => text.includes("上限")), "超过同名上限应有提示");

  // 4) 右侧点数字减一张
  openEditor();
  let cell = hitOf("deckAdd", data => data.cardId === target)[0];
  await tap({ x: cell.x, y: cell.y });
  await tap({ x: cell.x, y: cell.y });
  const quantityBefore = runtime.deckQuantity(state.deckDraft);
  const removers = hitOf("deckRemove", data => data.cardId === target);
  assert(removers.length > 0, "当前牌组缺少可点的移除区域");
  await tap({ x: removers[0].x, y: removers[0].y });
  assert(runtime.deckQuantity(state.deckDraft) === quantityBefore - 1, "点击数字应减一张");

  // 5) 一键补满到 20
  openEditor();
  runtime.fillDeckDraft();
  const total = runtime.deckQuantity(state.deckDraft);
  assert(total === 20, `一键补满应到 20 张，实际 ${total}`);

  // 6) 满 20 后再加：拒绝并提示
  toastCalls.length = 0;
  openEditor();
  runtime.fillDeckDraft();
  const extraCell = hitOf("deckAdd")[0];
  await tap({ x: extraCell.x, y: extraCell.y });
  assert(runtime.deckQuantity(state.deckDraft) === 20, "满 20 张后不应再加");
  assert(toastCalls.some(text => text.includes("20")), "满 20 张应提示");

  // 7) 法力曲线总数与牌组张数一致
  const curve = runtime.deckCurve(state.deckDraft);
  const curveTotal = curve.values.reduce((sum, value) => sum + value, 0);
  assert(curveTotal === runtime.deckQuantity(state.deckDraft), `法力曲线合计 ${curveTotal} 应等于牌组张数`);

  // 8) 筛选面板可开可关，且筛选生效
  state.deckFilterOpen = true;
  runtime.render();
  assert(hitOf("toggleDeckFilter").length > 0, "筛选面板没有选项");
  state.deckFilterOpen = false;
  runtime.render();
  state.deckFilters = { sets: [], rarities: ["legendary"], costs: [] };
  const legendaryOnly = runtime.deckOwnedCards();
  assert(legendaryOnly.every(item => item.rarity === "legendary"), "稀有度筛选未生效");
  state.deckFilters = { sets: [], rarities: [], costs: [] };
  state.deckSearch = "测试卡3";
  assert(runtime.deckOwnedCards().every(item => item.name.includes("测试卡3")), "搜索未生效");
  state.deckSearch = "";

  // 9) 空牌组与空筛选都有引导文案
  openEditor();
  renderedText.length = 0;
  runtime.render();
  assert(renderedText.includes("还没有卡牌"), "空牌组应有「还没有卡牌」引导");
  assert(renderedText.some(text => text.includes("点左侧卡面")), "空牌组应提示点左侧卡面");
  state.deckSearch = "不存在的卡名";
  renderedText.length = 0;
  runtime.render();
  assert(renderedText.includes("没有符合条件的卡牌"), "筛选无结果时应有提示");
  state.deckSearch = "";

  // 10) 清空：点「清空」后草稿为 0 张
  openEditor();
  runtime.fillDeckDraft();
  assert(runtime.deckQuantity(state.deckDraft) === 20, "清空测试前应已补满 20 张");
  const clearHit = hitOf("clearDeck")[0];
  assert(clearHit, "缺少清空按钮");
  await tap({ x: clearHit.x, y: clearHit.y });
  await settle();
  assert(runtime.deckQuantity(state.deckDraft) === 0, `清空后应为 0 张，实际 ${runtime.deckQuantity(state.deckDraft)}`);

  console.log("deck-editor-ui-ok cells=", cells.length, "fill=20 curveOk filtersOk");
})().catch(error => {
  console.error("deck-editor-ui-failed", error);
  process.exit(1);
});
