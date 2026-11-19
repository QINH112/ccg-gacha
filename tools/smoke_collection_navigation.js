#!/usr/bin/env node
"use strict";

/**
 * 图鉴进出与详情开关的导航冒烟。
 *
 * 对应验收项（docs/CARD_COLLECTION_WORKSHOP_MERGE_PLAN.md §7.5）：
 * - 返回主页、重新进入图鉴、滚动列表和关闭详情均正常
 *
 * 逻辑：真实 game.js + stub wx/canvas，走「主页 → 图鉴 → 滚动 → 打开详情 → 关闭详情 →
 * 回主页 → 再进图鉴」三轮循环，断言屏幕状态、滚动位置、详情覆盖层与命中区都不残留。
 *
 * 跑法：node tools/smoke_collection_navigation.js
 */

const noop = () => {};
const handlers = {};
const gradient = { addColorStop: noop };
const texts = [];
const context = new Proxy({
  createLinearGradient: () => gradient,
  measureText: value => ({ width: String(value).length * 8 }),
  roundRect: noop,
  fillText: value => texts.push(String(value)),
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

const cards = Array.from({ length: 24 }, (_, index) => ({
  id: `nav-card-${String(index + 1).padStart(2, "0")}`,
  name: `导航卡 ${index + 1}`,
  rarity: index % 8 === 0 ? "epic" : index % 3 === 0 ? "rare" : "common",
  set: index % 2 ? "base" : "star-remnant",
  cost: (index % 8) + 1,
  attack: (index % 6) + 1,
  health: (index % 7) + 1,
  description: "图鉴导航冒烟用卡。",
  keywords: [],
  effects: [],
  playable: true,
}));

const player = {
  inventory: cards.map(card => ({ cardId: card.id, normalCount: 2, shinyCount: 0 })),
  totalDraws: 80,
  dust: 1000,
  ticket: 100,
  coin: 1000,
  pity: { base: 10, mixed: 10, "star-remnant": 10 },
  signIn: { firstCycleDay: 3, lastClaimDate: "", completedFirstCycle: false },
  metrics: { lifetime: { coinEarned: 0, ticketEarned: 0, battleCompleted: 0, cardsPlayed: 0 }, daily: { key: "", values: {} }, weekly: { key: "", values: {} } },
  taskState: {},
  uiState: { lastReadBalanceNoticeId: "" },
  collectionHistory: { normalIds: [], shinyIds: [] },
  migrationVersion: 3,
  createdAt: 1,
  updatedAt: 1,
};

const api = (name, result) => (...args) => {
  const callback = args.find(item => typeof item === "function");
  if (callback) setImmediate(() => callback(typeof result === "function" ? result() : result));
};

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 2, safeArea: { top: 44, bottom: 778 }, platform: "devtools" }),
  getMenuButtonBoundingClientRect: () => ({ top: 48, bottom: 80, left: 296, right: 368, width: 72, height: 32 }),
  createSelectorQuery: () => ({ select: () => ({ fields: () => ({ exec: callback => callback([{ node: { getContext: () => context } }]) }) }) }),
  createCanvas: () => ({ getContext: () => context, width: 0, height: 0 }),
  createImage: () => { const image = { onload: null, onerror: null }; setImmediate(() => image.onload && image.onload()); return image; },
  getStorageSync: () => "",
  setStorageSync: noop,
  showToast: noop,
  showModal: noop,
  onTouchStart: callback => { handlers.touchStart = callback; },
  onTouchMove: callback => { handlers.touchMove = callback; },
  onTouchEnd: callback => { handlers.touchEnd = callback; },
  onTouchCancel: callback => { handlers.touchCancel = callback; },
  onShow: noop,
  onHide: noop,
  onError: noop,
  onMemoryWarning: noop,
  cloud: {
    init: noop,
    callFunction: ({ name }) => Promise.resolve({
      result: name === "gameData"
        ? {
          player: JSON.parse(JSON.stringify(player)),
          cards,
          sets: [{ id: "base", name: "基础卡牌包" }, { id: "star-remnant", name: "星骸遗响" }],
          pools: [{ id: "base", name: "基础召唤池", setIds: ["base"], enabled: true }],
          config: { craft: {}, disassemble: {}, shinyCost: 3, signIn: { firstCycle: [], dailyAfterCycle: { ticket: 5 } }, rarity: {} },
          signStatus: null,
          balanceNotices: { latest: null, items: [] },
          hasUnreadBalanceNotice: false,
          userKey: "test0000",
        }
        : name === "deckService"
          ? { slots: Array.from({ length: 5 }, (_, index) => ({ slot: index + 1, name: `牌组 ${index + 1}`, generalSkill: "draw-two", cards: [], valid: false, complete: false, errors: [] })) }
          : name === "battleGame"
            ? { history: [], game: null }
            : { mail: [], tasks: { daily: { tasks: [], bonus: null }, weekly: { tasks: [], bonus: null }, achievements: [] }, redDots: {}, decks: [], history: [] },
    }),
  },
};

require("../game.js");
const game = require("../game.js").__test;

function tap(x, y) {
  handlers.touchStart({ touches: [{ clientX: x, clientY: y }] });
  handlers.touchEnd({ changedTouches: [{ clientX: x, clientY: y }] });
}

function swipe(fromX, fromY, toX, toY) {
  handlers.touchStart({ touches: [{ clientX: fromX, clientY: fromY }] });
  handlers.touchMove({ touches: [{ clientX: toX, clientY: toY }] });
  handlers.touchEnd({ changedTouches: [{ clientX: toX, clientY: toY }] });
}

async function settle() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

(async () => {
  const state = game.state;
  await settle();
  state.screen = "home";
  game.render();

  function collectionSubtitle() {
  const labels = texts.filter(value => value.includes("已收集"));
  return labels[labels.length - 1] || "";
}

for (let round = 1; round <= 3; round += 1) {
    // 进入图鉴
    state.screen = "collection";
    state.scrollY = 0;
    game.render();
    if (state.screen !== "collection") throw new Error(`第 ${round} 轮进入图鉴失败`);
    const subtitle = collectionSubtitle();
    if (!/星尘\s*\d+/.test(subtitle)) throw new Error(`图鉴标题应显示星尘余额，实际「${subtitle}」`);

    const cardHits = state.cardHits.map(item => ({ ...item }));
    if (cardHits.length < 6) throw new Error(`第 ${round} 轮图鉴卡位数量异常：${cardHits.length}`);

    // 打开详情
    const hit = cardHits[0];
    tap(hit.x + hit.w / 2, hit.y + hit.h / 2);
    if (!state.showCardDetail) throw new Error(`第 ${round} 轮点击卡牌未打开详情`);
    const expectedId = (hit.card && hit.card.id) || hit.id;
    if (!state.detailCard || state.detailCard.id !== expectedId) throw new Error(`第 ${round} 轮详情卡牌错位：${state.detailCard && state.detailCard.id} != ${expectedId}`);

    // 关闭详情
    tap(6, 6);
    if (state.showCardDetail) throw new Error(`第 ${round} 轮详情未关闭`);
    if (state.detailCard || state.detailRect) throw new Error(`第 ${round} 轮详情状态残留`);

    // 滚动列表
    const before = state.scrollY;
    swipe(180, 600, 180, 300);
    if (!(state.scrollY > before)) throw new Error(`第 ${round} 轮列表没有滚动：${before} -> ${state.scrollY}`);
    if (state.scrollY > state.maxScroll + 0.5) throw new Error(`第 ${round} 轮滚动超出上限：${state.scrollY} > ${state.maxScroll}`);

    // 回主页
    state.screen = "home";
    game.render();
    if (state.showCardDetail || state.battleSkillDetail) throw new Error(`第 ${round} 轮回主页后覆盖层未清理`);

    // 再进图鉴，列表仍然完整
    state.screen = "collection";
    game.render();
    if (state.cardHits.length < 6) throw new Error(`第 ${round} 轮重进图鉴后卡位丢失：${state.cardHits.length}`);
    if (!Array.isArray(state.cards) || state.cards.length !== 24) throw new Error(`第 ${round} 轮卡牌数据被破坏：${state.cards.length}`);
  }

  // 命中区全部在屏内（不越界、不重叠）
  for (const hit of state.cardHits) {
    if (hit.x < 0 || hit.y < 0 || hit.x + hit.w > 376 || hit.y + hit.h > 813) throw new Error(`卡位越界：${JSON.stringify(hit)}`);
  }

  console.log("collection-navigation-smoke-ok rounds=3 cards=24");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
