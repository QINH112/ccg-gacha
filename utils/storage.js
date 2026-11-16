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
exports.resetGameData = () => callFunction("gameData", { action: "reset" });
exports.drawCards = (poolId, count) => callFunction("drawCards", { poolId, count });
exports.getSignInStatus = () => callFunction("dailySignIn", { action: "status" });
exports.claimSignIn = () => callFunction("dailySignIn", { action: "claim" });
exports.workshopAction = (action, cardId) => callFunction("workshop", { action, cardId });
exports.loadDrawHistory = () => callFunction("drawHistory", { limit: 100 });
