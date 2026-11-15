import { InventoryEntry } from "./cards";

const STORAGE_KEY = "ASTRAL_CCG_SAVE_V1";

export interface SaveData {
  inventory: InventoryEntry[];
  totalDraws: number;
  lastUpdated: number;
}

export function loadSave(): SaveData {
  try {
    const saved = wx.getStorageSync(STORAGE_KEY) as SaveData;
    if (saved && Array.isArray(saved.inventory)) {
      return {
        inventory: saved.inventory,
        totalDraws: Number(saved.totalDraws || 0),
        lastUpdated: Number(saved.lastUpdated || Date.now())
      };
    }
  } catch (e) {
    console.warn("读取本地存档失败", e);
  }
  return { inventory: [], totalDraws: 0, lastUpdated: Date.now() };
}

export function saveData(data: SaveData): void {
  const payload = { ...data, lastUpdated: Date.now() };
  try {
    wx.setStorageSync(STORAGE_KEY, payload);
  } catch (e) {
    console.error("保存本地存档失败", e);
    wx.showToast({ title: "存档保存失败", icon: "none" });
  }
}

export function resetSave(): void {
  wx.removeStorageSync(STORAGE_KEY);
}
