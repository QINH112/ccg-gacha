import { CARD_POOL, CardDefinition, InventoryEntry, RARITY_CONFIG, Rarity } from "../../utils/cards";
import { loadSave } from "../../utils/storage";

Page({
  data: { cards: [] as any[], totalOwned: 0, ownedUnique: 0 },
  onShow() {
    const save = loadSave();
    const cards = CARD_POOL.map(card => {
      const entry = save.inventory.find((item: InventoryEntry) => item.cardId === card.id);
      const normalCount = entry ? entry.normalCount : 0;
      const shinyCount = entry ? entry.shinyCount : 0;
      return {
        ...card,
        rarityLabel: RARITY_CONFIG[card.rarity].label,
        normalCount,
        shinyCount,
        duplicateCount: Math.max(0, normalCount - 1),
        owned: normalCount + shinyCount > 0
      };
    });
    this.setData({
      cards,
      totalOwned: cards.reduce((sum, card) => sum + card.normalCount + card.shinyCount, 0),
      ownedUnique: cards.filter(card => card.owned).length
    });
  },
  goHome() { wx.navigateBack(); }
});
