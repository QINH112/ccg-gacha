#!/usr/bin/env node
"use strict";

/**
 * 图鉴布局断言（不用真机）：3 列网格、非闪/闪卡数量都显示、控件不越界不重叠。
 *
 * 对应验收项（docs/CARD_COLLECTION_WORKSHOP_MERGE_PLAN.md §7.1）：
 * - 进入图鉴后，整体布局、卡牌网格、筛选和滚动方式没有改变
 * - 图鉴中可明确区分非闪版本与闪卡版本，数量展示不混淆
 * - 窄屏设备上按钮不遮挡卡牌、不越过安全区、不误触相邻区域
 *
 * 跑法：node tools/test_collection_layout.js（父进程按 320/375/430 三种宽度各起一次子进程）
 */

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
  console.log("collection-layout-test-ok cases=320x568,375x812,430x932");
  process.exit(0);
}

const device = JSON.parse(process.env.DEVICE_CASE);
const noop = () => {};
const handlers = {};
const renderedText = [];
const gradient = { addColorStop: noop };
const contextTarget = {
  createLinearGradient: () => gradient,
  measureText: value => ({ width: String(value).length * 8 }),
  roundRect: noop,
  fillRect: noop,
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

const cards = Array.from({ length: 9 }, (_, index) => ({
  id: `t${String(index + 1).padStart(3, "0")}`,
  name: `测试卡${index + 1}`,
  rarity: index % 3 === 0 ? "epic" : index % 3 === 1 ? "rare" : "common",
  set: "base",
  cost: (index % 6) + 1,
  attack: index + 1,
  health: index + 2,
  element: "✦",
  rulesText: "",
  flavorText: "测试卡。",
}));

const player = {
  inventory: cards.map((card, index) => ({ cardId: card.id, normalCount: index % 4 === 0 ? 0 : index % 3 + 1, shinyCount: index % 2 })),
  totalDraws: 9,
  dust: 100,
  ticket: 10,
  coin: 100,
  pity: {},
};

global.wx = {
  getSystemInfoSync: () => ({
    windowWidth: device.width,
    windowHeight: device.height,
    pixelRatio: device.dpr,
    safeArea: { top: 20, bottom: device.height - 20 },
  }),
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
      result: name === "gameData"
        ? {
          player: JSON.parse(JSON.stringify(player)),
          cards,
          sets: [{ id: "base", name: "基础卡牌包" }],
          pools: [{ id: "base", name: "基础召唤池", setIds: ["base"], enabled: true }],
          config: { craft: { common: 40, rare: 60, epic: 100 }, disassemble: { common: 5, rare: 20, epic: 100 }, signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
          signStatus: { claimedToday: true, firstCycle: true, day: 1 },
          userKey: "collection-layout-test",
        }
        : {},
    }),
  },
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

const runtime = require("../game.js").__test;
const state = runtime.state;

function assert(condition, message) {
  if (!condition) throw new Error(`${device.width}x${device.height} ${message}`);
}

function inside(rect, label) {
  assert(rect.x >= -0.5, `${label} 左越界 x=${rect.x}`);
  assert(rect.y >= -0.5, `${label} 上越界 y=${rect.y}`);
  assert(rect.x + rect.w <= device.width + 0.5, `${label} 右越界 right=${rect.x + rect.w} > ${device.width}`);
  assert(rect.y + rect.h <= device.height + 0.5, `${label} 下越界 bottom=${rect.y + rect.h} > ${device.height}`);
}

function overlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

(async () => {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
  assert(state.configReady, "配置未加载完成");
  assert(state.cards.length === cards.length, "卡牌列表未就绪");

  state.screen = "collection";
  state.scrollY = 0;
  state.showCollectionFilters = false;
  state.showCardDetail = false;
  state.collectionSearch = "";
  renderedText.length = 0;
  runtime.render();

  // 1. 3 列网格：第一行应有 3 张不同 x 的卡位，且列间距一致
  const cardHits = state.cardHits || [];
  assert(cardHits.length >= 3, `首屏卡位太少：${cardHits.length}`);
  const firstRowY = Math.min(...cardHits.map(item => item.y));
  const firstRow = cardHits.filter(item => Math.abs(item.y - firstRowY) < 1.5);
  assert(firstRow.length === 3, `首行应有 3 列，实际 ${firstRow.length}`);
  const xs = firstRow.map(item => item.x).sort((a, b) => a - b);
  const gaps = [xs[1] - xs[0], xs[2] - xs[1]];
  assert(Math.abs(gaps[0] - gaps[1]) < 0.5, `列间距不一致：${gaps.join(" vs ")}`);
  assert(Math.abs(gaps[0] - (firstRow[0].w + 7)) < 1.5, `列间距 ${gaps[0]} 与卡宽 ${firstRow[0].w} + 7 不符`);
  assert(firstRow[2].x + firstRow[2].w <= device.width - 11, "第三列右侧留白不足 12px");

  // 2. 每个卡位下方都有「普通 N」「闪卡 N」两条数量标签
  const labels = renderedText.filter(value => /^(普通|闪卡) \d+$/.test(value));
  assert(labels.length >= firstRow.length * 2, `首行数量标签不足：${labels.length} < ${firstRow.length * 2}`);
  // 每个卡位固定按「普通 N」→「闪卡 N」两条顺序绘制；只校验完整渲染的首行，底部半截卡位会被裁掉
  labels.slice(0, firstRow.length * 2).forEach((value, index) => {
    const expected = index % 2 === 0 ? "普通 " : "闪卡 ";
    assert(value.startsWith(expected), `第 ${index + 1} 条数量标签应为「${expected}N」，实际「${value}」`);
  });

  // 3. 所有可点区域都在屏幕内，且顶部两个按钮互不重叠、也不压住卡位
  const controls = (state.hit || []).filter(item => item.id === "collectionSearch" || item.id === "collectionFilters");
  assert(controls.length === 2, `首屏控件数量异常：${controls.length}`);
  controls.forEach(item => inside(item, item.id));
  assert(!overlap(controls[0], controls[1]), "搜索框与筛选按钮重叠");
  const cardRects = state.cardHits.filter(item => item.id === "cardDetail" || item.card);
  cardRects.slice(0, 3).forEach(item => {
    controls.forEach(control => {
      if (overlap(item, control)) throw new Error(`${device.width}x${device.height} 卡位与 ${control.id} 重叠`);
    });
  });
  (state.hit || []).forEach(item => inside(item, item.id || "hit"));
  console.log(`  ${device.width}x${device.height} cols=3 gap=${gaps[0].toFixed(1)} cardW=${firstRow[0].w.toFixed(1)} labels=${labels.length}`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
