"use strict";

// 渲染预算冒烟：战斗界面是最重的画面（双侧各 7 个随从 + 10 张手牌 + 墓地 + 提示），
// 一旦排版逻辑退化成 O(n²) 或每帧重建大量字符串，真机就会掉帧。
// 这里在 stub canvas 上跑纯 JS 侧渲染，测 p95 / 最大值，并确认「确实画了东西」。
//
// 说明：stub canvas 的绘图指令是空实现，因此测的是布局与文案构建开销（真机还有 GPU 合成）。
// 阈值按 60fps 的一帧（16.7ms）留一半余量：p95 ≤ 8ms、最大 ≤ 16ms。

const assert = require("assert");

const noop = () => {};
const handlers = {};
let fillTextCount = 0;
let fillRectCount = 0;

const gradient = { addColorStop: noop };
const contextTarget = {
  createLinearGradient: () => gradient,
  measureText: value => ({ width: String(value).length * 8 }),
  roundRect: noop,
  fillRect: () => { fillRectCount += 1; },
  fillText: () => { fillTextCount += 1; },
};
const context = new Proxy(contextTarget, {
  get(target, property) {
    if (property in target) return target[property];
    return noop;
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  }
});

global.setInterval = () => 0;

const KEYWORD_TEXT = { guard: "城墙", charge: "冲锋", rush: "突袭", shield: "护盾", lifesteal: "吸血", battlecry: "入场", deathrattle: "亡语", aura: "光环" };

function minion(index, side) {
  const keywords = ["guard", "shield", "battlecry", "deathrattle"].slice(0, (index % 4) + 1);
  return {
    id: `${side}${index}`,
    instanceId: `${side}-board-${index}`,
    name: `随从${index}号`,
    cost: 1 + (index % 8),
    attack: 1 + (index % 7),
    health: 1 + (index % 9),
    maxHealth: 1 + (index % 9),
    keywords,
    canAttack: index % 2 === 0,
    attacksLeft: index % 2 === 0 ? 1 : 0,
    rulesText: keywords.map(keyword => `${KEYWORD_TEXT[keyword]}：测试规则文本，用来测排版宽度`).join("。"),
    element: ["✦", "♪", "⋆", "☾"][index % 4],
    rarity: ["common", "rare", "epic", "legendary"][index % 4],
    set: "base",
    type: "minion",
    glow: index === 0
  };
}

function handCard(index) {
  return {
    id: `h${index}`,
    instanceId: `hand-${index}`,
    name: `手牌${index}号`,
    cost: 1 + (index % 9),
    attack: 1 + (index % 6),
    health: 1 + (index % 5),
    type: index % 5 === 0 ? "spell" : "minion",
    keywords: index % 3 === 0 ? ["guard"] : [],
    rulesText: "长文本测试：用来验证规则文本在卡面上换行与省略号处理是否正确。",
    element: "✦",
    rarity: "epic",
    set: "star-remnant",
    playable: index % 2 === 0
  };
}

const heavyGame = {
  id: "perf-battle",
  status: "active",
  phase: "battle",
  difficulty: "hard",
  deckName: "压测牌组",
  turn: "player",
  halfTurns: 6,
  deadlineAt: Date.now() + 75000,
  sequence: 12,
  player: {
    hand: Array.from({ length: 10 }, (_, index) => handCard(index)),
    board: Array.from({ length: 7 }, (_, index) => minion(index, "p")),
    health: 24,
    maxHealth: 30,
    deckCount: 12,
    graveyard: Array.from({ length: 5 }, (_, index) => ({ name: `阵亡${index}`, cardId: `d${index}`, shiny: index % 2 === 0, cost: index })),
    mana: 7,
    tempMana: 1,
    maxMana: 10,
    generalSkill: "draw-two",
    generalSkillUsed: false,
    heroPowerUsed: false,
    heroPowerCost: 2
  },
  ai: {
    hand: [],
    handCount: 6,
    board: Array.from({ length: 7 }, (_, index) => minion(index, "a")),
    health: 18,
    maxHealth: 30,
    deckCount: 9,
    graveyard: Array.from({ length: 4 }, (_, index) => ({ name: `敌方阵亡${index}`, cardId: `x${index}`, shiny: false, cost: index })),
    mana: 6,
    maxMana: 8,
    generalSkill: "heal-five",
    heroPowerUsed: false
  },
  metrics: { cardsPlayed: 8, minionsKilled: 3, minionsLost: 2, heroDamage: 6, heroPowerUsed: 1, generalSkillUsed: 1 },
  log: []
};

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 393, windowHeight: 852, pixelRatio: 2, safeArea: { top: 40, bottom: 852 } }),
  getMenuButtonBoundingClientRect: () => ({ bottom: 82 }),
  createCanvas: () => ({ getContext: () => context, width: 0, height: 0 }),
  createImage: () => {
    const image = {};
    Object.defineProperty(image, "src", { set() { if (typeof image.onload === "function") image.onload(); } });
    return image;
  },
  cloud: { init: noop, callFunction: () => new Promise(noop) },
  onTouchStart: callback => { handlers.touchStart = callback; },
  onTouchMove: callback => { handlers.touchMove = callback; },
  onTouchEnd: callback => { handlers.touchEnd = callback; },
  onTouchCancel: callback => { handlers.touchCancel = callback; },
  onShow: callback => { handlers.show = callback; },
  showShareMenu: noop,
  onShareAppMessage: noop,
  showModal: ({ success }) => success && success({ confirm: false, cancel: true }),
  showToast: noop,
  showActionSheet: noop
};

const runtime = require("../game.js").__test;
const state = runtime.state;

state.screen = "battle";
state.battle = heavyGame;
state.battleConfirmed = JSON.parse(JSON.stringify(heavyGame));
state.battleNotice = "攻击目标无效：必须先进攻城墙随从";
state.battleNoticeUntil = Date.now() + 60000;

function runFrame() {
  const started = process.hrtime.bigint();
  runtime.render();
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  return elapsed;
}

// 预热：首帧要建渐变、加载图片引用，不计入统计
for (let index = 0; index < 5; index += 1) runFrame();

const samples = [];
const rounds = 200;
for (let index = 0; index < rounds; index += 1) samples.push(runFrame());

samples.sort((a, b) => a - b);
const p50 = samples[Math.floor(samples.length * 0.5)];
const p95 = samples[Math.floor(samples.length * 0.95)];
const max = samples[samples.length - 1];
const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;

const drawnText = fillTextCount;
const drawnRects = fillRectCount;
assert.ok(drawnText > 0, "战斗界面一帧至少应绘制文字（渲染可能提前 return 了）");
assert.ok(drawnRects > 0, "战斗界面一帧应绘制背景/面板");

const TEXT_BUDGET = 8;
const MAX_BUDGET = 16;
assert.ok(p95 <= TEXT_BUDGET, `战斗界面 p95 ${p95.toFixed(2)}ms 超过 ${TEXT_BUDGET}ms 预算`);
assert.ok(max <= MAX_BUDGET, `战斗界面最慢一帧 ${max.toFixed(2)}ms 超过 ${MAX_BUDGET}ms 预算`);

console.log(
  `render-budget-ok frames=${rounds} avg=${average.toFixed(2)}ms p50=${p50.toFixed(2)}ms ` +
  `p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms text=${(drawnText / rounds).toFixed(0)}/frame rects=${(drawnRects / rounds).toFixed(0)}/frame`
);
