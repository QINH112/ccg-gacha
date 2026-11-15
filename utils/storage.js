"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSave = loadSave;
exports.saveData = saveData;
exports.resetSave = resetSave;
const STORAGE_KEY = "ASTRAL_CCG_SAVE_V1";
function loadSave() {
    try {
        const saved = wx.getStorageSync(STORAGE_KEY);
        if (saved && Array.isArray(saved.inventory)) {
            return {
                inventory: saved.inventory,
                totalDraws: Number(saved.totalDraws || 0),
                lastUpdated: Number(saved.lastUpdated || Date.now())
            };
        }
    }
    catch (e) {
        console.warn("读取本地存档失败", e);
    }
    return { inventory: [], totalDraws: 0, lastUpdated: Date.now() };
}
function saveData(data) {
    const payload = Object.assign(Object.assign({}, data), { lastUpdated: Date.now() });
    try {
        wx.setStorageSync(STORAGE_KEY, payload);
    }
    catch (e) {
        console.error("保存本地存档失败", e);
        wx.showToast({ title: "存档保存失败", icon: "none" });
    }
}
function resetSave() {
    wx.removeStorageSync(STORAGE_KEY);
}
