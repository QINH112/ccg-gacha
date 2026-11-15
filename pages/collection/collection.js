"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cards_1 = require("../../utils/cards");
const storage_1 = require("../../utils/storage");
Page({
    data: { cards: [], totalOwned: 0, ownedUnique: 0 },
    onShow() {
        const save = (0, storage_1.loadSave)();
        const cards = cards_1.CARD_POOL.map(card => {
            const entry = save.inventory.find((item) => item.cardId === card.id);
            const normalCount = entry ? entry.normalCount : 0;
            const shinyCount = entry ? entry.shinyCount : 0;
            return Object.assign(Object.assign({}, card), { rarityLabel: cards_1.RARITY_CONFIG[card.rarity].label, normalCount,
                shinyCount, duplicateCount: Math.max(0, normalCount - 1), owned: normalCount + shinyCount > 0 });
        });
        this.setData({
            cards,
            totalOwned: cards.reduce((sum, card) => sum + card.normalCount + card.shinyCount, 0),
            ownedUnique: cards.filter(card => card.owned).length
        });
    },
    goHome() { wx.navigateBack(); }
});
