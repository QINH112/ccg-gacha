#!/usr/bin/env node
"use strict";

/**
 * 平衡公告「每张调整卡片右侧立绘」的客户端断言（不依赖真机）。
 *
 * 对应验收项（docs/CARD_BALANCE_ANNOUNCEMENT_PLAN.md:172-178）：
 * - 每张调整卡片右侧展示公告保存的 artPath 立绘
 * - 立绘宽度最多约占卡片内容宽度的 28%，cover 裁剪不拉伸
 * - 立绘不响应点击/长按（触摸继续交给公告滚动）
 * - 公告缺失 artPath 时回落到卡牌自身立绘（兼容旧公告数据）
 *
 * 跑法：node tools/test_balance_notice_art.js
 */

const noop = () => {};
const handlers = {};
const drawCalls = [];
const gradient = { addColorStop: noop };
const contextTarget = {
  createLinearGradient: () => gradient,
  measureText: value => ({ width: String(value).length * 8 }),
  roundRect: noop,
  fillRect: noop,
  fillText: noop,
  drawImage: (image, sx, sy, sw, sh, dx, dy, dw, dh) => {
    if (Number.isFinite(dx)) drawCalls.push({ image, sx, sy, sw, sh, dx, dy, dw, dh });
  },
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
  { id: "c001", name: "星尘学徒", rarity: "common", set: "base", cost: 1, attack: 1, health: 3, element: "✦", rulesText: "", artPath: "subpackages/card-art-base/images/c001.jpg" },
  { id: "c002", name: "月影侍从", rarity: "common", set: "base", cost: 1, attack: 3, health: 1, element: "✦", rulesText: "", artPath: "subpackages/card-art-base/images/c002.jpg" },
  { id: "r009", name: "归墟歌者", rarity: "rare", set: "base", cost: 4, attack: 4, health: 4, element: "✧", rulesText: "城墙；亡语：对所有敌方随从造成 1 点伤害。", artPath: "subpackages/card-art-base/images/r009.jpg" },
];

const notice = {
  id: "balance-test-01",
  title: "卡牌平衡调整",
  summary: "三张卡完成调整。",
  publishedAt: Date.UTC(2026, 10, 18, 4, 0, 0),
  changes: [
    { cardId: "c001", name: "星尘学徒", artPath: "subpackages/card-art-base/images/c001.jpg", before: { cost: 1, attack: 1, health: 2, keywords: [], rulesText: "" }, after: { cost: 1, attack: 1, health: 3, keywords: [], rulesText: "" }, note: "生命值提高 1 点。" },
    { cardId: "c002", name: "月影侍从", artPath: "subpackages/card-art-base/images/c002.jpg", before: { cost: 1, attack: 2, health: 1, keywords: [], rulesText: "" }, after: { cost: 1, attack: 3, health: 1, keywords: [], rulesText: "" }, note: "攻击力提高 1 点。" },
    { cardId: "r009", name: "归墟歌者", before: { cost: 4, attack: 3, health: 3, keywords: ["deathrattle"], rulesText: "亡语：对所有敌方随从造成 1 点伤害。" }, after: { cost: 4, attack: 4, health: 4, keywords: ["guard", "deathrattle"], rulesText: "城墙；亡语：对所有敌方随从造成 1 点伤害。" }, note: "攻击力和生命值各提高 1 点，并新增城墙。" },
  ],
};

const player = { inventory: [], totalDraws: 0, dust: 0, ticket: 0, coin: 0, pity: {} };

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 393, windowHeight: 852, pixelRatio: 2, safeArea: { top: 0, bottom: 852 } }),
  getMenuButtonBoundingClientRect: () => ({ bottom: 82 }),
  createCanvas: () => ({ getContext: () => context, width: 0, height: 0 }),
  createImage: () => {
    const image = { width: 512, height: 608 };
    Object.defineProperty(image, "src", { set(value) { image.path = value; if (typeof image.onload === "function") image.onload(); } });
    return image;
  },
  cloud: {
    init: noop,
    callFunction: ({ name }) => Promise.resolve({
      result: name === "gameData"
        ? { player, cards, sets: [{ id: "base", name: "基础卡牌包" }], pools: [{ id: "base", name: "基础召唤池", setIds: ["base"], enabled: true }], config: { craft: { common: 40 }, disassemble: { common: 5 }, signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } }, signStatus: { claimedToday: true, firstCycle: true, day: 1 }, userKey: "notice-art-test", balanceNotices: { status: "ready", latest: notice, items: [notice] } }
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
  if (!condition) throw new Error(message);
}

async function settle() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
}

function openNoticeDetail(target) {
  state.screen = "balanceNotices";
  state.balanceNoticeView = "detail";
  state.selectedBalanceNotice = target;
  state.balanceNotices = { status: "ready", latest: target, items: [target] };
  state.scrollY = 0;
  drawCalls.length = 0;
  runtime.render();
}

(async () => {
  await settle();
  assert(state.configReady, "配置未加载完成");
  runtime.loadCardArt(cards);
  await settle();

  // 1. 三张卡都画了右侧立绘，且路径与公告一致
  openNoticeDetail(notice);
  const artDraws = drawCalls.filter(call => call.image && String(call.image.path || "").includes("/images/"));
  assert(artDraws.length === 3, `应绘制 3 张立绘，实际 ${artDraws.length}`);
  const paths = artDraws.map(call => call.image.path);
  for (const change of notice.changes) {
    assert(paths.some(path => path.endsWith(`/images/${change.cardId}.jpg`)), `${change.cardId} 的立绘没有被绘制`);
  }

  // 2. 宽度不超过内容宽度的 28%，高度铺满卡片内边距（不拉伸）
  const W = 393;
  const contentWidth = W - 12 * 2 - 28;
  for (const call of artDraws) {
    assert(call.dw <= Math.ceil(contentWidth * 0.28), `立绘宽度 ${call.dw} 超过内容宽度 28%（${Math.ceil(contentWidth * 0.28)}）`);
    assert(call.dw > 0 && call.dh > 0, "立绘尺寸应为正数");
    assert(Math.abs(call.dh - 210) < 1, `立绘高度应铺满卡片内边距 210，实际 ${call.dh}`);
    assert(call.dx + call.dw <= W - 12 + 1, `立绘右边缘 ${call.dx + call.dw} 越出卡片`);
    assert(call.dx >= W / 2, `立绘应位于卡片右侧，实际 x=${call.dx}`);
  }

  // 3. 立绘区域不注册命中区（不响应点击/长按，触摸交给滚动）
  const overlaps = state.hit.filter(entry => {
    const call = artDraws[0];
    return entry.x < call.dx + call.dw && entry.x + entry.w > call.dx && entry.y < call.dy + call.dh && entry.y + entry.h > call.dy;
  });
  assert(overlaps.length === 0, `立绘区域不应有可点击命中区，实际 ${overlaps.map(entry => entry.id).join("/")}`);

  // 4. 旧公告缺少 artPath 时回落到卡牌自身立绘
  const legacy = JSON.parse(JSON.stringify(notice));
  legacy.changes.forEach(change => { delete change.artPath; });
  openNoticeDetail(legacy);
  const fallbackDraws = drawCalls.filter(call => call.image && String(call.image.path || "").includes("/images/"));
  assert(fallbackDraws.length === 3, `缺失 artPath 时应回落到卡牌立绘，实际绘制 ${fallbackDraws.length}`);

  console.log(`balance-notice-art-ok changes=${notice.changes.length} artWidth=${artDraws[0].dw}/${Math.ceil(contentWidth * 0.28)} fallback=${fallbackDraws.length}`);
})().catch(error => {
  console.error(`balance-notice-art-failed: ${error.message}`);
  process.exit(1);
});
