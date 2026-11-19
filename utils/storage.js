"use strict";

const { CLOUD_ENV_ID } = require("./cloud-config");
let initialized = false;

function initCloud() {
  if (initialized) return Promise.resolve();
  if (!wx.cloud || typeof wx.cloud.init !== "function") {
    return Promise.reject(new Error("当前基础库不支持微信云开发"));
  }
  const options = { traceUser: true };
  if (CLOUD_ENV_ID) options.env = CLOUD_ENV_ID;
  wx.cloud.init(options);
  initialized = true;
  return Promise.resolve();
}

function callFunction(name, data) {
  if (!initialized) return Promise.reject(new Error("云开发尚未初始化"));
  const options = { name, data: data || {} };
  if (CLOUD_ENV_ID) options.config = { env: CLOUD_ENV_ID };
  return wx.cloud.callFunction(options).then(result => {
    const response = result && result.result;
    if (!response || response.error) throw new Error(response && response.error || "云函数返回异常");
    return response;
  }).catch(error => {
    const code = error && (error.errCode || error.code);
    const message = error && (error.errMsg || error.message) || "未知云开发错误";
    throw new Error(code ? `${code}: ${message}` : message);
  });
}

exports.initCloud = initCloud;
exports.loadGameData = () => callFunction("gameData", { action: "load" });
exports.markBalanceNoticeRead = noticeId => callFunction("gameData", { action:"markBalanceNoticeRead", noticeId });
exports.resetGameData = () => callFunction("gameData", { action: "reset" });
exports.drawCards = (poolId, count) => callFunction("drawCards", { poolId, count });
exports.getSignInStatus = () => callFunction("dailySignIn", { action: "status" });
exports.claimSignIn = () => callFunction("dailySignIn", { action: "claim" });
exports.workshopAction = (action, cardId, shiny) => callFunction("workshop", { action, cardId, shiny:Boolean(shiny) });
exports.loadDrawHistory = () => callFunction("drawHistory", { limit: 100 });
exports.loadServices = () => callFunction("gameServices", { action:"dashboard" });
exports.buyTickets = quantity => callFunction("gameServices", { action:"buyTicket", quantity });
exports.claimMail = mailId => callFunction("gameServices", { action:"claimMail", mailId });
exports.claimAllMail = mailIds => callFunction("gameServices", { action:"claimAllMail", mailIds });
exports.claimTask = (scope, taskId, bonus) => callFunction("gameServices", { action:"claimTask", scope, taskId, bonus:Boolean(bonus) });
exports.claimAllTasks = scope => callFunction("gameServices", { action:"claimAllTasks", scope });
exports.loadDecks = () => callFunction("deckService", { action:"list" });
exports.saveDeck = (slot, deck) => callFunction("deckService", { action:"save", slot, deck });
exports.clearDeck = slot => callFunction("deckService", { action:"clear", slot });
exports.battleStatus = () => callFunction("battleGame", { action:"status" });
exports.startBattle = (slot, difficulty) => callFunction("battleGame", { action:"start", slot, difficulty });
exports.battleMulligan = cardIds => callFunction("battleGame", { action:"mulligan", cardIds });
exports.battlePlay = (handId, position, targetType, targetId) => callFunction("battleGame", { action:"play", handId, position, targetType, targetId });
exports.battleAttack = (attackerId, targetType, targetId) => callFunction("battleGame", { action:"attack", attackerId, targetType, targetId });
exports.battleHeroPower = () => callFunction("battleGame", { action:"heroPower" });
exports.battleGeneralSkill = () => callFunction("battleGame", { action:"generalSkill" });
exports.battleEndTurn = () => callFunction("battleGame", { action:"endTurn" });
exports.battleConcede = () => callFunction("battleGame", { action:"concede" });
exports.battleHistory = () => callFunction("battleGame", { action:"history" });
exports.submitFeedback = payload => callFunction("feedbackService", { action: "submit", ...payload });
exports.loadMyFeedback = () => callFunction("feedbackService", { action: "mine" });
exports.removeFeedback = id => callFunction("feedbackService", { action: "remove", id });
