"use strict";

const { spawnSync } = require("child_process");

const scenarios = ["core", "positions", "coin", "pending", "compact", "wide", "low-energy", "full-board", "ai-turn", "cancel", "spell", "targeted-spell", "graveyard", "recovery", "hero-attack"];
if (!process.env.BATTLE_DRAG_SCENARIO) {
  for (const scenario of scenarios) {
    const result = spawnSync(process.execPath, [__filename], {
      cwd: process.cwd(),
      env: { ...process.env, BATTLE_DRAG_SCENARIO: scenario },
      encoding: "utf8",
    });
    if (result.status !== 0) {
      process.stdout.write(result.stdout || "");
      process.stderr.write(result.stderr || "");
      process.exit(result.status || 1);
    }
  }
  console.log("battle-drag-interactions-smoke-ok", `scenarios=${scenarios.length}`);
  process.exit(0);
}

const scenario = process.env.BATTLE_DRAG_SCENARIO;
const viewport = scenario === "compact" ? { width: 375, height: 812 } : scenario === "wide" ? { width: 430, height: 932 } : { width: 393, height: 852 };
const noop = () => {};
const handlers = {};
const battleCalls = [];
const allCloudCalls = [];
const modalCalls = [];
const toastCalls = [];
const renderedText = [];
const drawnSources = [];
const gradient = { addColorStop: noop };
const context = new Proxy({
  createLinearGradient: () => gradient,
  measureText: value => ({ width: String(value).length * 8 }),
  roundRect: noop,
  fillText: value => renderedText.push(String(value)),
  drawImage: image => drawnSources.push(image && image._src || "canvas"),
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

function card(id, instanceId, overrides = {}) {
  return {
    id,
    cardId: id,
    instanceId,
    name: overrides.name || id,
    rarity: overrides.rarity || "common",
    set: "star-remnant",
    type: overrides.type || "minion",
    cost: overrides.cost == null ? 1 : overrides.cost,
    attack: Object.prototype.hasOwnProperty.call(overrides,"attack") ? overrides.attack : 2,
    health: Object.prototype.hasOwnProperty.call(overrides,"health") ? overrides.health : 3,
    keywords: overrides.keywords || [],
    rulesText: overrides.rulesText || "",
    canAttack: Boolean(overrides.canAttack),
    attacksLeft: overrides.attacksLeft == null ? 0 : overrides.attacksLeft,
    rushOnly: Boolean(overrides.rushOnly),
    ...overrides,
  };
}

const hand = Array.from({ length: 8 }, (_, index) => card(`s${String(index + 1).padStart(3, "0")}`, `hand-${index + 1}`, { cost: index === 0 ? 2 : 1 }));
const playerBoard = [
  card("s009", "attacker", { canAttack: true, attacksLeft: 1, attack: 4 }),
  card("s010", "rusher", { canAttack: true, attacksLeft: 1, rushOnly: true, keywords: ["rush"] }),
  card("s011", "exhausted", { canAttack: false, attacksLeft: 0 }),
];
const enemyBoard = [
  card("s012", "guard", { keywords: ["guard"], health: 5 }),
  card("s013", "enemy", { health: 4 }),
];

function makeGame() {
  const board = scenario === "positions" ? [] : ["full-board", "coin"].includes(scenario)
    ? Array.from({ length: 7 }, (_, index) => card(`s${String(index + 9).padStart(3, "0")}`, `full-${index}`, { canAttack: false }))
    : playerBoard.map(item => ({ ...item, keywords: [...item.keywords] }));
  const scenarioHand = hand.map(item => ({ ...item, keywords: [...item.keywords] }));
  if (scenario === "coin") scenarioHand[0] = card("coin", "coin-1", { name: "星界硬币", type: "coin", cost: 0, attack: null, health: null });
  if (scenario === "spell") scenarioHand[0] = card("l004", "spell-1", { name: "万籁归寂", rarity:"legendary", type: "spell", cost: 1, attack: null, health: null, effects:[{trigger:"cast",action:"silence",target:"all-enemy-minions"}] });
  if (scenario === "targeted-spell") scenarioHand[0] = card("target-spell", "spell-target-1", { name: "定点沉默", type:"spell", cost:1, attack:null, health:null, effects:[{trigger:"cast",action:"silence",target:"selected-enemy-minion"}] });
  return {
    id: `drag-${scenario}`,
    status: "active",
    phase: "main",
    turn: scenario === "ai-turn" ? "ai" : "player",
    difficulty: "normal",
    deckName: "拖拽测试牌组",
    deadlineAt: Date.now() + 75000,
    player: {
      hand: scenarioHand,
      board,
      health: 30,
      deckCount: 12,
      mana: scenario === "low-energy" ? 0 : 10,
      tempMana: 0,
      maxMana: 10,
      generalSkill: "draw-two",
      generalSkillUsed: false,
      heroPowerUsed: false,
      graveyard: scenario === "graveyard" ? [card("s012","grave-1",{name:"残骸巨螯",rarity:"rare",cost:4,attack:4,health:3,graveyardSequence:1}),card("s012","grave-2",{name:"残骸巨螯",rarity:"rare",cost:4,attack:4,health:3,graveyardSequence:2})] : [],
    },
    ai: {
      handCount: 3,
      deckCount: 14,
      board: (scenario === "hero-attack" ? enemyBoard.filter(item => !item.keywords.includes("guard")) : enemyBoard).map(item => ({ ...item, keywords: [...item.keywords] })),
      health: 30,
      mana: 5,
      maxMana: 5,
      graveyard: [],
    },
  };
}

let currentGame = makeGame();
let pendingResolve = null;

function gameDataResult() {
  return {
    player: { inventory: [], totalDraws: 0, dust: 0, ticket: 100, coin: 1000, pity: {} },
    cards: [...hand, ...playerBoard, ...enemyBoard],
    sets: [{ id: "star-remnant", name: "星骸遗响" }],
    pools: [{ id: "base", name: "基础召唤池", setIds: ["star-remnant"], enabled: true }],
    config: { signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
    signStatus: { claimedToday: true, firstCycle: true, day: 1 },
    userKey: "battle-drag-test",
  };
}

function cloudResult(name, data) {
  allCloudCalls.push({ name, action: data && data.action });
  if (name === "gameData") return gameDataResult();
  if (name === "gameServices") return { player: gameDataResult().player, shop: { ticketPrice: 100, maxQuantity: 99 }, mail: [], tasks: { daily: { tasks: [], bonus: null }, weekly: { tasks: [], bonus: null }, achievements: [] }, redDots: {} };
  if (name === "deckService") return { slots: [{ slot: 1, name: "拖拽测试牌组", count: 20, valid: true, generalSkill: "draw-two" }] };
  if (name === "battleGame" && data.action === "status") return { game: currentGame };
  if (name === "battleGame" && data.action === "play") {
    battleCalls.push({ ...data });
    if (scenario === "recovery" && playCalls().length === 1) return Promise.reject(new Error("errMsg: Error: 攻击目标无效：必须先攻击城墙随从 at /var/user/index.js:54:442"));
    const index = currentGame.player.hand.findIndex(item => item.instanceId === data.handId);
    if (index >= 0) {
      const [played] = currentGame.player.hand.splice(index, 1);
      if (played.type === "spell") currentGame.player.graveyard.push({ ...played, cardId:played.id, graveyardSequence:currentGame.player.graveyard.length+1 });
      else if (played.type !== "coin") currentGame.player.board.splice(Number(data.position), 0, { ...played, canAttack: false, attacksLeft: 0 });
    }
    return { game: currentGame };
  }
  if (name === "battleGame" && data.action === "attack") {
    battleCalls.push({ ...data });
    if (data.targetId === "guard") currentGame.ai.board = currentGame.ai.board.filter(item => item.instanceId !== "guard");
    return { game: currentGame };
  }
  if (name === "battleGame") return { game: currentGame };
  return {};
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: viewport.width, windowHeight: viewport.height, pixelRatio: 2, safeArea: { top: 0, bottom: viewport.height } }),
  getMenuButtonBoundingClientRect: () => ({ bottom: 82 }),
  createCanvas: () => ({ getContext: () => context, width: 0, height: 0 }),
  createOffscreenCanvas: () => ({ getContext: () => context, width: 0, height: 0 }),
  createImage: () => {
    const image = {};
    Object.defineProperty(image, "src", { set(value) { image._src = value; if (typeof image.onload === "function") image.onload(); } });
    return image;
  },
  loadSubpackage: ({ success }) => success(),
  cloud: { init: noop, callFunction: ({ name, data }) => {
    const result = cloudResult(name, data || {});
    if (scenario === "pending" && name === "battleGame" && data.action === "play") return new Promise(resolve => { pendingResolve = () => resolve({ result }); });
    return Promise.resolve({ result });
  } },
  onTouchStart: callback => { handlers.touchStart = callback; },
  onTouchMove: callback => { handlers.touchMove = callback; },
  onTouchEnd: callback => { handlers.touchEnd = callback; },
  onTouchCancel: callback => { handlers.touchCancel = callback; },
  onShow: callback => { handlers.show = callback; },
  showShareMenu: noop,
  onShareAppMessage: noop,
  showModal: options => { modalCalls.push(options); if (options && options.success) options.success({ confirm: true, cancel: false }); },
  showToast: options => toastCalls.push(options),
  showActionSheet: noop,
};

const gameRuntime=require("../game.js");

function tap(x, y) {
  handlers.touchStart({ touches: [{ clientX: x, clientY: y }] });
  handlers.touchEnd({ changedTouches: [{ clientX: x, clientY: y }] });
}

function drag(fromX, fromY, toX, toY, options = {}) {
  handlers.touchStart({ touches: [{ clientX: fromX, clientY: fromY }] });
  if (!options.singleMove) handlers.touchMove({ touches: [{ clientX: options.verticalFirst ? fromX : (fromX + toX) / 2, clientY: (fromY + toY) / 2 }] });
  handlers.touchMove({ touches: [{ clientX: toX, clientY: toY }] });
  if (options.cancel) handlers.touchCancel();
  else {
    handlers.touchEnd({ changedTouches: [{ clientX: toX, clientY: toY }] });
    if (options.duplicateEnd) handlers.touchEnd({ changedTouches: [{ clientX: toX, clientY: toY }] });
  }
}

function holdAfterMove(fromX, fromY, toX, toY, duration = 560) {
  handlers.touchStart({ touches: [{ clientX: fromX, clientY: fromY }] });
  handlers.touchMove({ touches: [{ clientX: toX, clientY: toY }] });
  return new Promise(resolve => setTimeout(() => {
    handlers.touchEnd({ changedTouches: [{ clientX: toX, clientY: toY }] });
    resolve();
  }, duration));
}

async function settle() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
}

async function enterBattle() {
  await settle();
  tap(scenario === "wide" ? 330 : 300, scenario === "wide" ? 800 : 700);
  await settle();
  tap(70, 245);
  await settle();
  if (!renderedText.some(value => value.includes("你的回合")) && scenario !== "ai-turn") throw new Error(`${scenario}: battle board did not render`);
}

const liveState = () => gameRuntime.__test.state;
function handPt(index = 0) { const h = (liveState().battleHandHits || [])[index] || { x: 20, y: 700, w: 40, h: 60 }; return [Math.round(h.x + h.w / 2), Math.round(h.y + h.h / 2)]; }
function ownPt(index = 0) { const r = liveState().battleZones.ownBoard.rects[index]; return [Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2)]; }
function enemyPt(guard) { const rects = liveState().battleZones.enemyBoard.rects; const pick = guard == null ? rects[0] : rects.find(item => Boolean(item.card && item.card.keywords && item.card.keywords.includes("guard")) === Boolean(guard)) || rects[0]; return [Math.round(pick.x + pick.w / 2), Math.round(pick.y + pick.h / 2)]; }
function ownIdPt(id) { const rects = liveState().battleZones.ownBoard.rects; const pick = rects.find(item => item.card && item.card.instanceId === id) || rects[0]; return [Math.round(pick.x + pick.w / 2), Math.round(pick.y + pick.h / 2)]; }
function enemyIdPt(id) { const rects = liveState().battleZones.enemyBoard.rects; const pick = rects.find(item => item.card && item.card.instanceId === id) || rects[0]; return [Math.round(pick.x + pick.w / 2), Math.round(pick.y + pick.h / 2)]; }
function heroPt() { const r = liveState().battleZones.enemyHero; return [Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2)]; }
function slotPt(index) { const zone = liveState().battleZones.ownBoard, rects = zone.rects; if (!rects.length) return [Math.round(8 + index * 40), Math.round(zone.y + zone.h / 2)]; const rect = rects[index]; if (!rect) { const last = rects[rects.length - 1]; return [Math.round(last.x + last.w + 6), Math.round(last.y + last.h / 2)]; } return [Math.round(rect.x + rect.w / 2 - 1), Math.round(rect.y + rect.h / 2)]; }
function playPt(dx = 0) { const z = liveState().battleZones.centerPlay; return [Math.round(z.x + z.w / 2 + dx), Math.round(z.y + z.h / 2)]; }
function playCalls() { return battleCalls.filter(item => item.action === "play"); }
function attackCalls() { return battleCalls.filter(item => item.action === "attack"); }

(async () => {
  await enterBattle();

  if (scenario === "positions") {
    drag(...handPt(0), ...slotPt(0));
    await settle();
    if (playCalls().length !== 1 || playCalls()[0].position !== 0) throw new Error("empty board did not submit position 0");
    drag(...handPt(0), ...slotPt(1), { verticalFirst: true });
    await settle();
    if (playCalls().length !== 2 || playCalls()[1].position !== 1) throw new Error(`right edge did not submit board.length: ${JSON.stringify(playCalls())}`);
  } else if (scenario === "coin") {
    drag(...handPt(0), ...playPt());
    await settle();
    if (playCalls().length !== 1 || playCalls()[0].handId !== "coin-1") throw new Error("coin was not playable on a full board");
  } else if (scenario === "pending") {
    drag(...handPt(0), ...playPt());
    if (playCalls().length !== 1 || !pendingResolve) throw new Error("pending play did not start");
    drag(...handPt(0), ...playPt());
    if (playCalls().length !== 1) throw new Error("battle requests were not serialized");
    if (currentGame.player.hand.some(item => item.instanceId === "hand-2")) throw new Error("second play did not update locally while first request was pending");
    pendingResolve();
    await settle();
    await settle();
    if (playCalls().length !== 2) throw new Error("queued second play did not submit after first confirmation");
  } else if (scenario === "recovery") {
    drag(...handPt(0), ...playPt());
    await settle();
    await settle();
    if (modalCalls.length) throw new Error("battle action failure still opened a blocking modal");
    const resynced = allCloudCalls.filter(item => item.name === "battleGame" && item.action === "status");
    if (!resynced.length) throw new Error("battle action failure did not resync from the server");
    if (!renderedText.some(value => value.includes("攻击目标无效"))) throw new Error("battle action failure did not surface an inline notice");
    drag(...handPt(0), ...playPt());
    await settle();
    if (playCalls().length !== 2) throw new Error("battle queue did not recover after a failed action");
  } else if (scenario === "hero-attack") {
    drag(...ownPt(0), ...heroPt(), { singleMove: true });
    await settle();
    if (attackCalls().length !== 1) throw new Error(`hero drag did not submit an attack: ${JSON.stringify(attackCalls())}`);
    if (attackCalls()[0].targetType !== "hero" || attackCalls()[0].targetId !== "hero") throw new Error(`hero drag sent ${JSON.stringify(attackCalls()[0])}`);
    if (modalCalls.length) throw new Error("hero attack opened a modal");
  } else if (scenario === "compact") {
    drag(...handPt(0), ...playPt());
    await settle();
    if (playCalls().length !== 1 || playCalls()[0].handId !== "hand-1") throw new Error("compact viewport did not submit hand drag");
    drag(...ownPt(0), ...enemyPt(true), { singleMove: true });
    await settle();
    if (attackCalls().length !== 1 || attackCalls()[0].targetId !== "guard") throw new Error("compact viewport did not submit attack drag");
  } else if (scenario === "wide") {
    drag(...handPt(0), ...playPt());
    await settle();
    if (playCalls().length !== 1 || playCalls()[0].handId !== "hand-1") throw new Error("wide viewport did not submit hand drag");
    drag(...ownPt(0), ...enemyPt(true), { singleMove: true });
    await settle();
    if (attackCalls().length !== 1 || attackCalls()[0].targetId !== "guard") throw new Error("wide viewport did not submit attack drag");
  } else if (scenario === "core") {
    if (!drawnSources.some(source => source.includes("assets/ui/cards/card-frame"))) throw new Error("battle cards did not draw the shared card frames");
    if (!drawnSources.some(source => source.includes("subpackages/card-art"))) throw new Error("battle cards did not draw card art");

    tap(...handPt(0));
    await settle();
    if (playCalls().length) throw new Error("plain hand tap triggered play");

    drag(...handPt(0), ...slotPt(1), { duplicateEnd: true });
    await settle();
    if (playCalls().length !== 1) throw new Error(`expected one play call, got ${playCalls().length}`);
    if (playCalls()[0].handId !== "hand-1" || playCalls()[0].position !== 1) throw new Error(`wrong play payload ${JSON.stringify(playCalls()[0])}`);

    const callsAfterPlay = battleCalls.length;
    drag(...handPt(1), ...handPt(0));
    await settle();
    if (battleCalls.length !== callsAfterPlay) throw new Error("horizontal hand scroll triggered a battle action");

    drag(...handPt(0), 360, 400);
    await settle();
    if (battleCalls.length !== callsAfterPlay) throw new Error("invalid hand drop triggered a battle action");

    drag(...ownPt(0), ...heroPt());
    await settle();
    if (attackCalls().length) throw new Error("guard did not block the enemy hero");

    drag(...ownPt(0), ...enemyPt(false));
    await settle();
    if (attackCalls().length) throw new Error("guard did not block a non-guard enemy minion");

    drag(...ownPt(0), 360, 400);
    await settle();
    if (attackCalls().length) throw new Error("invalid attack drop triggered a battle action");

    drag(...ownPt(0), ...enemyPt(true), { singleMove: true });
    await settle();
    if (attackCalls().length !== 1 || attackCalls()[0].targetId !== "guard") throw new Error("guard attack was not submitted correctly");

    currentGame.player.board[0].canAttack = true;
    currentGame.player.board[0].attacksLeft = 1;
    handlers.touchCancel();
    drag(...ownPt(0), ...heroPt());
    await settle();
    if (attackCalls().length !== 2 || attackCalls()[1].targetType !== "hero") throw new Error("hero attack was not submitted after guard left");

    const callsBeforeRushHero = attackCalls().length;
    drag(...ownIdPt("rusher"), ...heroPt());
    await settle();
    if (attackCalls().length !== callsBeforeRushHero) throw new Error("rush-only minion attacked hero");

    drag(...ownIdPt("rusher"), ...enemyIdPt("enemy"));
    await settle();
    if (attackCalls().length !== callsBeforeRushHero + 1 || attackCalls().at(-1).targetId !== "enemy") throw new Error(`rush minion did not attack the enemy minion: ${JSON.stringify(attackCalls())} board=${JSON.stringify(liveState().battle.player.board.map(m=>({id:m.instanceId,rush:m.rushOnly,ca:m.canAttack,al:m.attacksLeft})))} enemy=${JSON.stringify(liveState().battle.ai.board.map(m=>m.instanceId))}`);

    const callsBeforeExhausted = attackCalls().length;
    drag(...ownIdPt("exhausted"), ...enemyIdPt("enemy"));
    await settle();
    if (attackCalls().length !== callsBeforeExhausted) throw new Error("exhausted minion triggered attack");

    tap(...ownPt(0));
    tap(...enemyIdPt("enemy"));
    await settle();
    if (attackCalls().length !== callsBeforeExhausted) throw new Error("old click-to-attack path is still active");

    const detailCount = renderedText.filter(value => value === "点击卡牌外关闭").length;
    await holdAfterMove(...handPt(0), ...slotPt(0));
    await settle();
    if (renderedText.filter(value => value === "点击卡牌外关闭").length !== detailCount) throw new Error("moving a card still opened long-press detail");
  } else if (scenario === "cancel") {
    drag(...handPt(0), ...playPt(), { cancel: true });
    await settle();
    if (battleCalls.length) throw new Error("touchCancel submitted a battle action");
  } else if (scenario === "spell") {
    drag(...handPt(0), ...playPt());
    await settle();
    if (playCalls().length !== 1 || playCalls()[0].handId !== "spell-1") throw new Error("targetless spell did not release in center zone");
    if (!currentGame.player.graveyard.some(item=>item.cardId==="l004")) throw new Error("used spell did not enter player graveyard");
  } else if (scenario === "targeted-spell") {
    drag(30,720,196,410);
    await settle();
    if (playCalls().length) throw new Error("targeted spell released through the center zone");
    drag(...handPt(0), ...enemyIdPt("guard"), { singleMove: true });
    await settle();
    if (playCalls().length!==1||playCalls()[0].targetType!=="minion"||playCalls()[0].targetId!=="guard") throw new Error(`targeted spell payload invalid: ${JSON.stringify(playCalls())}`);
  } else if (scenario === "graveyard") {
    const graveHit=gameRuntime.__test.state.hit.find(item=>item.id==="openBattleGraveyard"&&item.data==="player");
    if (!graveHit) throw new Error(`player graveyard entry hit area missing: ${gameRuntime.__test.state.hit.map(item=>`${item.id}:${item.data||""}`).join("|")}`);
    tap(graveHit.x+graveHit.w/2,graveHit.y+graveHit.h/2);
    await settle();
    if (!renderedText.some(value=>value.includes("我方墓地（2张）"))) throw new Error(`player graveyard panel did not open: ${renderedText.slice(-20).join("|")}`);
    if (!renderedText.includes("×2")) throw new Error("duplicate graveyard cards were not grouped");
    if (!renderedText.includes("倒序")) throw new Error("graveyard did not default to descending sort");
  } else {
    drag(...handPt(0), ...playPt());
    await settle();
    if (battleCalls.length) throw new Error(`${scenario}: disabled hand submitted a play action`);
    if (scenario === "ai-turn") {
      drag(...ownPt(0), ...enemyIdPt("guard"));
      await settle();
      if (battleCalls.length) throw new Error("ai turn allowed a board attack");
    }
  }

  console.log("battle-drag-scenario-ok", scenario, `calls=${battleCalls.length}`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
