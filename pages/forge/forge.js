"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cards_1 = require("../../utils/cards");
const storage_1 = require("../../utils/storage");
Page({
    data: { forgeCards: [], animatingId: "", successCard: "" },
    _save: {},
    onShow() { this.refresh(); },
    refresh() {
        this._save = (0, storage_1.loadSave)();
        const forgeCards = cards_1.CARD_POOL.map(card => {
            const entry = this._save.inventory.find((item) => item.cardId === card.id);
            const count = entry ? entry.normalCount : 0;
            return Object.assign(Object.assign({}, card), { rarityLabel: cards_1.RARITY_CONFIG[card.rarity].label, normalCount: count, shinyCount: entry ? entry.shinyCount : 0, canForge: count >= 3 });
        }).filter(card => card.normalCount > 0 || card.shinyCount > 0);
        this.setData({ forgeCards });
    },
    forge(e) {
        const cardId = e.currentTarget.dataset.id;
        const card = cards_1.CARD_POOL.find(item => item.id === cardId);
        if (!card)
            return;
        const entry = this._save.inventory.find(item => item.cardId === cardId);
        if (!entry || entry.normalCount < 3) {
            wx.showToast({ title: "需要三张同名普通卡", icon: "none" });
            return;
        }
        this.setData({ animatingId: cardId, successCard: "" });
        // 先演出合成动画，再写入存档。
        setTimeout(() => {
            entry.normalCount -= 3;
            entry.shinyCount += 1;
            (0, storage_1.saveData)(this._save);
            this.setData({ animatingId: "", successCard: card.name });
            this.refresh();
            wx.showToast({ title: "合成成功！闪耀卡已入库", icon: "success", duration: 1800 });
        }, 850);
    },
    clearSuccess() { this.setData({ successCard: "" }); }
});
