export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface CardDefinition {
  id: string;
  name: string;
  rarity: Rarity;
  attack: number;
  health: number;
  description: string;
  element: string;
}

export interface InventoryEntry {
  cardId: string;
  normalCount: number;
  shinyCount: number;
}

export interface DrawResult {
  card: CardDefinition;
  shiny: boolean;
  revealed: boolean;
}

export const RARITY_CONFIG: Record<Rarity, { label: string; rate: number; value: number }> = {
  common: { label: "普通", rate: 60, value: 40 },
  rare: { label: "稀有", rate: 25, value: 80 },
  epic: { label: "史诗", rate: 12, value: 400 },
  legendary: { label: "传说", rate: 3, value: 1600 }
};

export const CARD_POOL: CardDefinition[] = [
  { id: "c001", name: "星尘学徒", rarity: "common", attack: 1, health: 2, description: "汇聚微弱星尘，开启星界旅途。", element: "✦" },
  { id: "c002", name: "月影侍从", rarity: "common", attack: 2, health: 1, description: "在月光边缘悄然守望。", element: "☾" },
  { id: "c003", name: "星环守卫", rarity: "common", attack: 1, health: 3, description: "守护星环的初阶卫士。", element: "◎" },
  { id: "c004", name: "虚空萤火", rarity: "common", attack: 2, health: 2, description: "微光也能照亮虚空。", element: "✧" },
  { id: "c005", name: "彗星信使", rarity: "common", attack: 3, health: 1, description: "携彗星之势传递讯息。", element: "☄" },
  { id: "c006", name: "星界药师", rarity: "common", attack: 1, health: 4, description: "调配来自星海的药剂。", element: "⚗" },
  { id: "r001", name: "银月弓灵", rarity: "rare", attack: 3, health: 3, description: "银月下百发百中的灵弓。", element: "☽" },
  { id: "r002", name: "奥术巡游者", rarity: "rare", attack: 4, health: 2, description: "游走于奥术裂隙之间。", element: "⌁" },
  { id: "r003", name: "星辰祭司", rarity: "rare", attack: 2, health: 5, description: "聆听群星的古老回响。", element: "♧" },
  { id: "r004", name: "暮光骑士", rarity: "rare", attack: 4, health: 4, description: "暮光铸甲，坚定不移。", element: "♜" },
  { id: "e001", name: "星界织法者", rarity: "epic", attack: 5, health: 5, description: "将星轨编织成无尽法术。", element: "✺" },
  { id: "e002", name: "深空巨灵", rarity: "epic", attack: 6, health: 4, description: "沉眠深空的古老巨灵。", element: "◈" },
  { id: "e003", name: "紫曜凤凰", rarity: "epic", attack: 4, health: 7, description: "于紫曜火焰中重生。", element: "♨" },
  { id: "l001", name: "星穹女王", rarity: "legendary", attack: 8, health: 8, description: "统御星穹的至高存在。", element: "♛" },
  { id: "l002", name: "永恒龙神", rarity: "legendary", attack: 9, health: 7, description: "盘踞在时间尽头的龙神。", element: "♢" }
];

export function rarityLabel(rarity: Rarity): string {
  return RARITY_CONFIG[rarity].label;
}
