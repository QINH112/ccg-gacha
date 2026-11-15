"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cards_1 = require("../../utils/cards");
const storage_1 = require("../../utils/storage");
const RARITY_ORDER = ["common", "rare", "epic", "legendary"];
Page({
    data: {
        rates: RARITY_ORDER.map(key => ({ key, label: cards_1.RARITY_CONFIG[key].label, rate: cards_1.RARITY_CONFIG[key].rate })),
        totalDraws: 0,
        inventoryCount: 0,
        resultList: [],
        showResults: false,
        isDrawing: false,
        guaranteeText: "十连至少获得 1 张史诗或传说",
        recentLabel: "召唤尚未开始"
    },
    _save: {},
    onLoad() {
        this._save = (0, storage_1.loadSave)();
        this.refreshStats();
    },
    refreshStats() {
        const count = this._save.inventory.reduce((sum, entry) => sum + entry.normalCount + entry.shinyCount, 0);
        this.setData({ totalDraws: this._save.totalDraws, inventoryCount: count });
    },
    getCardByRarity(rarity) {
        const pool = cards_1.CARD_POOL.filter(card => card.rarity === rarity);
        return pool[Math.floor(Math.random() * pool.length)];
    },
    rollRarity() {
        const roll = Math.random() * 100;
        let cumulative = 0;
        for (const rarity of RARITY_ORDER) {
            cumulative += cards_1.RARITY_CONFIG[rarity].rate;
            if (roll < cumulative)
                return rarity;
        }
        return "common";
    },
    performDraw(count) {
        if (this.data.isDrawing)
            return;
        this.setData({ isDrawing: true, showResults: false, resultList: [] });
        const results = [];
        for (let i = 0; i < count; i++) {
            const rarity = this.rollRarity();
            results.push({ card: this.getCardByRarity(rarity), shiny: false, revealed: false });
        }
        // 十连保底：没有史诗/传说时，将第十张替换为史诗或传说。
        if (count === 10 && !results.some(item => item.card.rarity === "epic" || item.card.rarity === "legendary")) {
            const guaranteeRarity = Math.random() < 0.8 ? "epic" : "legendary";
            results[9] = { card: this.getCardByRarity(guaranteeRarity), shiny: false, revealed: false };
        }
        // 增加本地库存，同名卡只累加数量。
        results.forEach(result => {
            let entry = this._save.inventory.find(item => item.cardId === result.card.id);
            if (!entry) {
                entry = { cardId: result.card.id, normalCount: 0, shinyCount: 0 };
                this._save.inventory.push(entry);
            }
            entry.normalCount += 1;
        });
        this._save.totalDraws += count;
        (0, storage_1.saveData)(this._save);
        this.refreshStats();
        this.setData({
            resultList: results,
            recentLabel: count === 1 ? "单次召唤" : `${count} 连召唤`,
            isDrawing: false
        });
        // 逐张翻牌揭示，留出 CSS 翻转动画时间。
        results.forEach((_, index) => {
            setTimeout(() => {
                const list = this.data.resultList.slice();
                if (list[index]) {
                    list[index].revealed = true;
                    this.setData({ resultList: list, showResults: true });
                }
            }, 180 + index * 100);
        });
    },
    onSingle() { this.performDraw(1); },
    onFive() { this.performDraw(5); },
    onTen() { this.performDraw(10); },
    goCollection() {
        wx.navigateTo({ url: "/pages/collection/collection" });
    },
    goForge() {
        wx.navigateTo({ url: "/pages/forge/forge" });
    },
    closeResults() {
        this.setData({ showResults: false, resultList: [] });
    },
    resetLocalSave() {
        wx.showModal({
            title: "重置存档",
            content: "将清空抽卡库存和抽卡次数，确定继续吗？",
            success: (res) => {
                if (res.confirm) {
                    wx.removeStorageSync("ASTRAL_CCG_SAVE_V1");
                    this._save = (0, storage_1.loadSave)();
                    this.refreshStats();
                    this.setData({ showResults: false, resultList: [] });
                    wx.showToast({ title: "存档已重置", icon: "success" });
                }
            }
        });
    }
});
