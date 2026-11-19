"use strict";

const noop = () => {};
const handlers = {};
const cloudCalls = [];
const renderedText = [];
const gradient = { addColorStop: noop };
const fills = [];
let fillsDuringHold = [];
const contextTarget = {
  createLinearGradient: () => gradient,
  measureText: value => ({ width: String(value).length * 8 }),
  roundRect: noop,
  fillRect: () => { fills.push(contextTarget.fillStyle); },
  fill: () => { fills.push(contextTarget.fillStyle); },
  fillText: value => renderedText.push(String(value)),
};
const context = new Proxy(contextTarget, {
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

const cards = [
  { id: "s017", instanceId: "hand-1", name: "星骸巨像", rarity: "epic", set: "star-remnant", cost: 6, attack: 6, health: 5, element: "✦", rulesText: "入场：获得护盾。", description: "整颗陨落星辰凝聚的巨人。" },
  { id: "s018", instanceId: "hand-2", name: "亡星歌姬", rarity: "epic", set: "star-remnant", cost: 5, attack: 5, health: 7, element: "♪", rulesText: "光环：己方随从获得力量。", description: "歌声可以唤醒远古记忆。" },
  { id: "s001", instanceId: "hand-3", name: "残星浮游虫", rarity: "common", set: "star-remnant", cost: 1, attack: 1, health: 2, element: "⋆", rulesText: "", description: "在星骸缝隙间漂流觅食。" },
];

const mulliganGame = {
  status: "active",
  phase: "mulligan",
  difficulty: "normal",
  deckName: "测试牌组",
  player: { hand: cards, board: [], health: 30, deckCount: 17, mana: 0, tempMana: 0, maxMana: 0, generalSkill: "draw-two", generalSkillUsed: false, heroPowerUsed: false },
  ai: { handCount: 3, deckCount: 17, board: [], health: 30, mana: 0, maxMana: 0 },
};

const activeGame = {
  ...mulliganGame,
  phase: "main",
  turn: "player",
  deadlineAt: Date.now() + 75000,
  player: { ...mulliganGame.player, hand: cards, mana: 10, maxMana: 10, deckCount: 17 },
};

const finishedGame = {
  ...activeGame,
  status: "finished",
  result: "loss",
  finishedAt: Date.now(),
};

function cloudResult(name, data) {
  cloudCalls.push(`${name}:${data && data.action || ""}`);
  if (name === "gameData") return {
    player: { inventory: [], totalDraws: 12, dust: 30, ticket: 100, coin: 1000, pity: {} },
    cards,
    sets: [{ id: "base", name: "基础卡牌包" }, { id: "star-remnant", name: "星骸遗响" }],
    pools: [{ id: "base", name: "基础召唤池", setIds: ["base"], enabled: true }],
    config: { signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
    signStatus: { claimedToday: true, firstCycle: true, day: 1 },
    userKey: "interaction-smoke-user",
  };
  if (name === "gameServices") return { player: { inventory: [], totalDraws: 12, dust: 30, ticket: 100, coin: 1000, pity: {} }, shop: { ticketPrice: 100, maxQuantity: 99 }, mail: [], tasks: { daily: { tasks: [], bonus: null }, weekly: { tasks: [], bonus: null }, achievements: [] }, redDots: { mail: false, tasks: false, achievements: false } };
  if (name === "deckService") return { slots: [{ slot: 1, name: "测试牌组", count: 20, valid: true, generalSkill: "draw-two" }] };
  if (name === "battleGame" && data.action === "status") return { game: mulliganGame };
  if (name === "battleGame" && data.action === "mulligan") return { game: activeGame };
  if (name === "battleGame" && data.action === "endTurn") return { game: { ...activeGame, halfTurns: 2, deadlineAt: Date.now() + 75000 } };
  if (name === "battleGame" && data.action === "concede") return { game: finishedGame };
  if (name === "battleGame") return { game: activeGame };
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
  showModal: ({ success }) => success && success({ confirm: true, cancel: false }),
  showToast: noop,
  showActionSheet: noop,
};

const runtime = require("../game.js").__test;

function tap(x, y) {
  handlers.touchStart({ touches: [{ clientX: x, clientY: y }] });
  handlers.touchEnd({ changedTouches: [{ clientX: x, clientY: y }] });
}

function hold(x, y, duration = 560) {
  handlers.touchStart({ touches: [{ clientX: x, clientY: y }] });
  return new Promise(resolve => setTimeout(() => {
    // 松手前把这一帧的填充色记下来：松手后详情就关了，事后取不到战斗内详情的绘制
    fillsDuringHold = [...fills];
    handlers.touchEnd({ changedTouches: [{ clientX: x, clientY: y }] });
    resolve();
  }, duration));
}

async function settle() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
}

(async () => {
  await settle();
  tap(300, 700);
  await settle();
  tap(70, 245);
  await settle();
  tap(70, 245);
  await settle();
  if (!renderedText.some(value => /^更换 [1-4] 张牌$/.test(value))) throw new Error("Mulligan selection count was not rendered");
  tap(196, 415);
  await settle();
  const handHit = (runtime.state.battleHandHits || [])[0];
  await hold(Math.round(handHit.x + handHit.w / 2), Math.round(handHit.y + handHit.h / 2));
  if (!cloudCalls.includes("battleGame:mulligan")) throw new Error("Mulligan action was not reached");
  // 战斗内长按走 battleHold 分支：只显示「松手关闭」，不显示分解/合成按钮（见 docs/UI_OVERLAY_RULES.md）
  if (!renderedText.includes("松手关闭") && !renderedText.includes("点击卡牌外关闭")) throw new Error("Long-press card detail was not rendered");
  // 战斗内详情不得有任何承托面板或全屏蒙层（2026-11-19 用户要求去掉卡牌外的矩形框，见 D25）
  if (!fillsDuringHold.some(value => fillsDuringHold.length)) throw new Error("Hold snapshot was empty");
  if (fillsDuringHold.includes("#0b1226ee")) throw new Error("Battle card detail must not draw a backing panel");
  if (fillsDuringHold.includes("#02040ca8") || fillsDuringHold.includes("#02040ce8")) throw new Error("Battle card detail must not dim the battlefield");
  tap(5, 5);
  tap(345, 825);
  await settle();
  if (!cloudCalls.includes("battleGame:endTurn")) throw new Error("End-turn action was not reached");
  // 战斗页禁止闪光蒙层（用户 2026-11-19 明确不要这个效果，见 D24）：整帧绘制不得出现该颜色
  if (runtime.state.screen !== "battle") throw new Error("Battle screen not reached before flash check");
  const noFlashStart = fills.length;
  runtime.render();
  await new Promise(resolve => setTimeout(resolve, 400));
  runtime.render();
  if (fills.slice(noFlashStart).includes("#e8d77a22")) throw new Error("Battle flash overlay came back");

  tap(30, 825);
  await settle();
  if (!cloudCalls.includes("battleGame:concede")) throw new Error("Concede action was not reached");
  await new Promise(resolve => setTimeout(resolve, 320));
  if (!renderedText.includes("失败")) throw new Error("Finished battle result was not rendered");
  const callsAtResult = cloudCalls.length;
  const detailTextAtResult = renderedText.filter(value => value === "点击卡牌外关闭").length;
  tap(20, 120);
  await hold(30, 720);
  await settle();
  if (cloudCalls.length !== callsAtResult) throw new Error("Finished battle overlay leaked an underlying action");
  if (renderedText.filter(value => value === "点击卡牌外关闭").length !== detailTextAtResult) throw new Error("Finished battle overlay leaked an underlying card long-press");
  tap(196, 490);
  await settle();
  if (cloudCalls.filter(item => item === "battleGame:status").length < 2) throw new Error("Returning to battle setup did not refresh battle status");
  console.log("game-interaction-smoke-ok", cloudCalls.join(","));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
