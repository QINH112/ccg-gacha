#!/usr/bin/env node
"use strict";

/**
 * 意见反馈 UI 回归（不用真机）：
 * - 邮箱页有「意见反馈」入口，点进去是反馈页
 * - 写反馈：5 个类型、内容/联系方式弹窗输入、截图选择与移除、未满 5 字不能提交
 * - 提交成功后切到「我的反馈」、清空草稿、提示已提交
 * - 我的反馈列表能显示类型/日期/内容，删除要二次确认
 *
 * 跑法：node tools/test_feedback_ui.js
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
  console.log("feedback-ui-ok cases=320x568,375x812,430x932");
  process.exit(0);
}

const device = JSON.parse(process.env.DEVICE_CASE);
const W = device.width;
const H = device.height;
const noop = () => {};
const handlers = {};
const renderedText = [];
const toastCalls = [];
const chooseCalls = [];
const modalCalls = [];
const cloudCalls = [];
let todaysFeedback = null;
let storedItems = [];
const gradient = { addColorStop: noop };
const contextTarget = {
  createLinearGradient: () => gradient,
  measureText: value => ({ width: String(value).length * 8 }),
  roundRect: noop,
  fillRect: noop,
  fillText: value => renderedText.push(String(value))
};
const context = new Proxy(contextTarget, {
  get(target, property) { return property in target ? target[property] : noop; },
  set(target, property, value) { target[property] = value; return true; }
});
global.setInterval = () => 0;

const cards = Array.from({ length: 6 }, (_, index) => ({
  id: `t00${index + 1}`,
  name: `测试卡${index + 1}`,
  rarity: "common",
  set: "base",
  cost: 1,
  attack: 1,
  health: 2,
  element: "✦",
  rulesText: "",
  flavorText: ""
}));
const player = { inventory: cards.map(card => ({ cardId: card.id, normalCount: 2, shinyCount: 0 })), totalDraws: 0, dust: 300, ticket: 5, coin: 10, pity: {} };

const feedbackReply = data => {
  const action = data && data.action;
  if (action === "submit") {
    if (todaysFeedback) return { error: "今天已经提交过反馈了，明天再来吧" };
    todaysFeedback = { id: "f-new", type: data.type, typeLabel: "BUG/故障", content: data.content, hasImage: Boolean(data.imageFileID), dateKey: "2026-11-20", createdAt: Date.now() };
    storedItems = [todaysFeedback, ...storedItems];
    return { feedback: todaysFeedback };
  }
  if (action === "mine") return { items: storedItems, submittedToday: Boolean(todaysFeedback) };
  if (action === "remove") {
    storedItems = storedItems.filter(item => item.id !== data.id);
    return { ok: true };
  }
  return { error: "反馈操作无效" };
};

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: W, windowHeight: H, pixelRatio: device.dpr, safeArea: { top: 20, bottom: H - 20 }, model: "Test Phone", system: "iOS 17" }),
  getMenuButtonBoundingClientRect: () => ({ bottom: device.menuBottom }),
  getAccountInfoSync: () => ({ miniProgram: { version: "1.0.0" } }),
  createCanvas: () => ({ getContext: () => context, width: 0, height: 0 }),
  createOffscreenCanvas: ({ width, height }) => ({ width, height, getContext: () => context, createImage: () => ({ set src(value) { if (this.onload) this.onload(); } }) }),
  canvasToTempFilePath: options => { if (options && options.success) options.success({ tempFilePath: "tmp-compressed.jpg" }); },
  getImageInfo: options => { if (options && options.success) options.success({ width: 1600, height: 1200 }); },
  chooseImage: options => { chooseCalls.push(options || {}); if (options && options.success) options.success({ tempFilePaths: ["tmp-picked.png"] }); },
  getFileSystemManager: () => ({ getFileInfo: options => { if (options && options.success) options.success({ size: 2 * 1024 * 1024 }); } }),
  createImage: () => {
    const image = {};
    Object.defineProperty(image, "src", { set() { if (typeof image.onload === "function") image.onload(); } });
    return image;
  },
  cloud: {
    init: noop,
    uploadFile: options => { if (options && options.success) options.success({ fileID: "cloud://test/feedback/shot.jpg" }); },
    callFunction: ({ name, data }) => {
      cloudCalls.push({ name, data });
      return Promise.resolve({
        result: name === "gameData" ? {
          player: JSON.parse(JSON.stringify(player)),
          cards,
          sets: [{ id: "base", name: "基础卡牌包" }],
          pools: [{ id: "base", name: "基础召唤池", setIds: ["base"], enabled: true }],
          config: { craft: { common: 40 }, disassemble: { common: 5 }, signIn: { firstCycle: [{ type: "ticket", amount: 50 }] } },
          signStatus: { claimedToday: true, firstCycle: true, day: 1 },
          userKey: "feedback-test"
        } : name === "feedbackService" ? feedbackReply(data) : { mail: [], tasks: {}, decks: [] }
      });
    }
  },
  onTouchStart: callback => { handlers.touchStart = callback; },
  onTouchMove: callback => { handlers.touchMove = callback; },
  onTouchEnd: callback => { handlers.touchEnd = callback; },
  onTouchCancel: callback => { handlers.touchCancel = callback; },
  onShow: callback => { handlers.show = callback; },
  showShareMenu: noop,
  onShareAppMessage: noop,
  showModal: options => {
    modalCalls.push(options || {});
    if (!options || typeof options.success !== "function") return;
    if (options.editable) options.success({ confirm: true, content: global.__modalText || "" });
    else options.success({ confirm: true });
  },
  showToast: options => toastCalls.push(String((options && options.title) || "")),
  showActionSheet: noop
};

const runtime = require("../game.js").__test;
const state = runtime.state;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const hitOf = id => state.hit.filter(item => item.id === id);

async function tap(data) {
  const point = { x: data.x + 4, y: data.y + 4 };
  handlers.touchStart && handlers.touchStart({ touches: [{ clientX: point.x, clientY: point.y }] });
  handlers.touchEnd && handlers.touchEnd({ touches: [], changedTouches: [{ clientX: point.x, clientY: point.y }] });
  await settle();
  await settle();
}

const tapId = async id => {
  const hit = hitOf(id)[0];
  assert(hit, `找不到可点区域：${id}`);
  await tap(hit);
};

(async () => {
  await new Promise(resolve => setImmediate(resolve));
  await settle();
  assert(state.configReady, "配置未加载完成");

  // 1) 邮箱页 -> 反馈入口
  state.screen = "mail";
  runtime.render();
  await tapId("openFeedback");
  assert(state.screen === "feedback", `点「意见反馈」应进入反馈页，实际 ${state.screen}`);
  assert(state.feedbackTab === "write", "默认应停在「写反馈」");

  // 2) 五个类型 chips，点第二个切到「建议」
  const chips = hitOf("feedbackType");
  assert(chips.length === 5, `应有 5 个类型，实际 ${chips.length}`);
  await tap(chips[1]);
  assert(state.feedbackDraft.type === "suggestion", `类型应切到建议，实际 ${state.feedbackDraft.type}`);

  // 3) 内容不足 5 字时提交按钮不存在（禁用）
  state.feedbackDraft.content = "卡";
  runtime.render();
  assert(hitOf("feedbackSubmit").length === 0, "内容不足 5 字时不应能提交");
  const shortText = renderedText.join("|");
  assert(shortText.includes("至少 5 字"), "字数不足时计数器应写明「至少 5 字」");
  assert(shortText.includes("还差 4 个字"), `提交按钮应提示还差几个字，实际 UI 文本：${shortText.slice(0, 200)}`);

  // 4) 点内容框 -> 弹窗输入 -> 回填
  global.__modalText = "战斗中点结束回合没有反应，麻烦看一下";
  await tapId("feedbackContent");
  assert(modalCalls.some(call => call.editable), "内容框应弹可输入 modal");
  assert(state.feedbackDraft.content === global.__modalText, "内容应回填到草稿");
  runtime.render();
  assert(hitOf("feedbackSubmit").length === 1, "内容充足时应可提交");

  // 5) 联系方式
  global.__modalText = "qq 123456";
  await tapId("feedbackContact");
  assert(state.feedbackDraft.contact === "qq 123456", "联系方式应回填");

  // 6) 截图：选择 -> 压缩 -> 上传 -> 设置 fileID
  await tapId("feedbackImagePick");
  await settle();
  await settle();
  assert(chooseCalls.length === 1, "应打开一次相册选择");
  assert(JSON.stringify(chooseCalls[0].sourceType) === JSON.stringify(["album"]), `截图只能从相册选，实际 ${JSON.stringify(chooseCalls[0].sourceType)}`);
  assert(state.feedbackDraft.imageFileID === "cloud://test/feedback/shot.jpg", `截图应上传成功，实际「${state.feedbackDraft.imageFileID}」`);
  runtime.render();
  assert(hitOf("feedbackImageClear").length === 1, "已选截图后应出现移除按钮");

  // 7) 提交 -> 切到我的反馈、清空草稿、toast
  const before = cloudCalls.length;
  await tapId("feedbackSubmit");
  await settle();
  const submitCall = cloudCalls.slice(before).find(call => call.name === "feedbackService" && call.data.action === "submit");
  assert(submitCall, "提交应调用 feedbackService.submit");
  assert(submitCall.data.type === "suggestion", "提交应带类型");
  assert(submitCall.data.context && submitCall.data.context.screen === "feedback", "提交应带上下文");
  assert(submitCall.data.context.model === "Test Phone", "上下文应带机型");
  assert(state.feedbackTab === "mine", "提交成功后应切到我的反馈");
  assert(state.feedbackDraft.content === "", "提交成功后清空内容");
  assert(toastCalls.includes("已提交，谢谢你"), `应有提交成功提示，实际 ${JSON.stringify(toastCalls)}`);

  // 8) 我的反馈列表
  runtime.render();
  assert(state.feedbackMine.length === 1, "我的反馈应有 1 条");
  const rowText = renderedText.join("|");
  assert(rowText.includes("建议"), "列表应显示类型标签");
  assert(rowText.includes("战斗中点结束回合没有反应"), "列表应显示内容");
  const removeHit = hitOf("feedbackRemove")[0];
  assert(removeHit, "列表应有删除按钮");

  // 9) 今日已提交后写反馈页给提示且不能提交
  state.feedbackTab = "write";
  runtime.render();
  assert(renderedText.join("|").includes("今天已经提交过反馈了"), "今日已提交应给提示");
  assert(hitOf("feedbackSubmit").length === 0, "今日已提交后不应能再提交");

  // 10) 删除要二次确认
  state.feedbackTab = "mine";
  runtime.render();
  modalCalls.length = 0;
  await tap(hitOf("feedbackRemove")[0]);
  await settle();
  assert(modalCalls.length === 1 && /删除/.test(String(modalCalls[0].title || "")), "删除应先弹确认框");
  assert(state.feedbackMine.length === 0, "确认后应从列表移除");
  assert(cloudCalls.some(call => call.name === "feedbackService" && call.data.action === "remove"), "删除应调用 feedbackService.remove");

  // 11) 所有命中区都在屏内
  for (const hit of state.hit) {
    assert(hit.x >= -1 && hit.x + hit.w <= W + 1, `命中区越界：${hit.id} x=${hit.x} w=${hit.w}`);
    assert(hit.y >= -1 && hit.y + hit.h <= H + 1, `命中区越界：${hit.id} y=${hit.y} h=${hit.h}`);
  }

  console.log(`  ok ${W}x${H} feedback ui`);
})().catch(error => {
  console.error(`feedback-ui-failed ${W}x${H}: ${error && error.message}`);
  process.exit(1);
});
