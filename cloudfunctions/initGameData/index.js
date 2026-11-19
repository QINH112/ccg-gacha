"use strict";

const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TOKENS = {
  emberPhoenix:{id:"token-ember-phoenix",name:"余烬凤凰",rarity:"epic",set:"token",element:"♨",type:"minion",cost:4,attack:4,health:1,rulesText:"",flavorText:"从紫曜火焰中再度凝聚。",keywords:[],effects:[],playable:false},
  phosphorSpirit:{id:"token-phosphor-spirit",name:"磷火残魂",rarity:"common",set:"token",element:"🔥",type:"minion",cost:1,attack:1,health:1,rulesText:"亡语：对敌方英雄造成 1 点伤害。",flavorText:"星骸磷火中短暂苏醒的残魂。",keywords:["deathrattle"],effects:[{trigger:"deathrattle",action:"damage",target:"enemy-hero",value:1}],playable:false},
  starHusk:{id:"token-star-husk",name:"星骸残躯",rarity:"epic",set:"token",element:"🗿",type:"minion",cost:4,attack:4,health:4,rulesText:"",flavorText:"星骸巨像倒下后遗留的坚固残躯。",keywords:[],effects:[],playable:false}
};

function design(cost,attack,health,rulesText,keywords=[],effects=[]){return{cost,attack,health,rulesText,keywords,effects};}
function damage(trigger,target,value){return{trigger,action:"damage",target,value};}
function heal(trigger,value){return{trigger,action:"heal",target:"friendly-hero",value};}
function draw(trigger,value){return{trigger,action:"draw",value};}
function summon(trigger,token,count=1){return{trigger,action:"summon",token,count};}
function aura(attack,health,extra={}){return{trigger:"aura",action:"modify-stats",target:"other-friendly-minions",attack,health,...extra};}
function permanentBuff(trigger,attack,health){return{trigger,action:"buff",target:"other-friendly-minions",attack,health};}
function silence(trigger,target){return{trigger,action:"silence",target};}
function cardArtPath(setId,cardId){return `subpackages/card-art-${setId}/images/${cardId}.jpg`;}

const CARD_DESIGNS = {
  c001:design(1,1,3,""),
  c002:design(1,3,1,""),
  c003:design(2,1,3,"城墙",["guard"]),
  c004:design(2,2,3,""),
  c005:design(2,2,1,"冲锋",["charge"]),
  c006:design(3,2,4,"入场：为你的英雄恢复 2 点生命。",["battlecry"],[heal("battlecry",2)]),
  c007:design(3,3,4,""),
  c008:design(2,1,2,"亡语：抽 1 张牌。",["deathrattle"],[draw("deathrattle",1)]),
  c009:design(3,2,3,"护盾",["shield"]),
  c010:design(2,2,2,"突袭",["rush"]),
  c011:design(3,1,3,"光环：其他友方随从获得 +1 攻击。",["aura"],[aura(1,0)]),
  c012:design(2,1,3,"吸血",["lifesteal"]),
  c013:design(3,1,5,"城墙",["guard"]),
  c014:design(3,3,1,"冲锋",["charge"]),
  c015:design(2,3,2,""),
  c016:design(2,1,2,"护盾",["shield"]),
  c017:design(2,2,2,"吸血",["lifesteal"]),
  c018:design(3,3,3,"亡语：对敌方英雄造成 1 点伤害。",["deathrattle"],[damage("deathrattle","enemy-hero",1)]),
  c019:design(3,1,4,"光环：其他友方随从获得 +1 生命。",["aura"],[aura(0,1)]),
  c020:design(3,4,3,""),
  c021:design(2,1,2,"入场：抽 1 张牌。",["battlecry"],[draw("battlecry",1)]),
  c022:design(3,1,4,"城墙；亡语：为你的英雄恢复 2 点生命。",["guard","deathrattle"],[heal("deathrattle",2)]),
  c023:design(3,2,2,"入场：对所有敌方随从造成 1 点伤害。",["battlecry"],[damage("battlecry","all-enemy-minions",1)]),
  c024:design(3,3,3,"突袭",["rush"]),
  c025:design(2,2,2,"入场：对敌方英雄造成 1 点伤害。",["battlecry"],[damage("battlecry","enemy-hero",1)]),
  c026:design(2,2,1,"护盾",["shield"]),
  c027:design(3,3,3,"城墙",["guard"]),
  r001:design(3,3,2,"入场：对敌方英雄造成 2 点伤害。",["battlecry"],[damage("battlecry","enemy-hero",2)]),
  r002:design(4,3,3,"突袭；入场：抽 1 张牌。",["rush","battlecry"],[draw("battlecry",1)]),
  r003:design(4,2,5,"吸血；入场：为你的英雄恢复 2 点生命。",["lifesteal","battlecry"],[heal("battlecry",2)]),
  r004:design(4,2,3,"城墙；护盾",["guard","shield"]),
  r005:design(4,4,1,"冲锋",["charge"]),
  r006:design(5,3,4,"入场：抽 2 张牌。",["battlecry"],[draw("battlecry",2)]),
  r007:design(4,4,2,"突袭；护盾",["rush","shield"]),
  r008:design(4,3,4,"护盾",["shield"]),
  r009:design(4,4,4,"城墙；亡语：对所有敌方随从造成 1 点伤害。",["guard","deathrattle"],[damage("deathrattle","all-enemy-minions",1)]),
  r010:design(4,4,3,"入场：使其他友方随从永久获得 +1 攻击。",["battlecry"],[permanentBuff("battlecry",1,0)]),
  r011:design(5,2,5,"光环：其他友方随从获得 +1/+1。",["aura"],[aura(1,1)]),
  r012:design(4,3,2,"护盾；亡语：抽 1 张牌。",["shield","deathrattle"],[draw("deathrattle",1)]),
  r013:design(5,2,5,"城墙；光环：其他友方随从获得 +1 生命。",["guard","aura"],[aura(0,1)]),
  r014:design(3,2,3,"入场：抽 1 张牌。",["battlecry"],[draw("battlecry",1)]),
  e001:design(5,3,5,"光环：其他友方随从获得 +1 攻击。",["aura"],[aura(1,0)]),
  e002:design(5,4,6,"城墙；亡语：为你的英雄恢复 3 点生命。",["guard","deathrattle"],[heal("deathrattle",3)]),
  e003:design(6,4,5,"亡语：召唤一个 4/1 的“余烬凤凰”。",["deathrattle"],[summon("deathrattle",TOKENS.emberPhoenix)]),
  e004:design(6,6,5,"突袭；护盾",["rush","shield"]),
  e005:design(6,3,7,"城墙；光环：敌方随从获得 -1 攻击。",["guard","aura"],[{trigger:"aura",action:"modify-stats",target:"all-enemy-minions",attack:-1,health:0}]),
  e006:design(6,5,4,"入场：对所有敌方随从造成 2 点伤害。",["battlecry"],[damage("battlecry","all-enemy-minions",2)]),
  e007:design(7,5,7,"吸血",["lifesteal"]),
  e008:design(6,5,5,"护盾；亡语：抽 1 张牌。",["shield","deathrattle"],[draw("deathrattle",1)]),
  e009:design(5,0,6,"亡语：沉默所有随从。",["deathrattle"],[silence("deathrattle","all-minions")]),
  l001:design(8,6,8,"光环：其他友方随从获得 +1/+1。",["aura"],[aura(1,1)]),
  l002:design(9,8,8,"突袭；护盾",["rush","shield"]),
  l003:design(8,6,8,"吸血；入场：对敌方英雄造成 2 点伤害，并对所有敌方随从造成 2 点伤害。",["lifesteal","battlecry"],[damage("battlecry","enemy-hero",2),damage("battlecry","all-enemy-minions",2)]),
  l004:{cost:1,attack:null,health:null,rulesText:"沉默所有敌方随从。",keywords:[],effects:[silence("cast","all-enemy-minions")]},
  s001:design(1,1,1,"亡语：为你的英雄恢复 1 点生命。",["deathrattle"],[heal("deathrattle",1)]),
  s002:design(2,2,2,"城墙",["guard"]),
  s003:design(2,1,3,"亡语：为你的英雄恢复 2 点生命。",["deathrattle"],[heal("deathrattle",2)]),
  s004:design(3,4,2,"突袭",["rush"]),
  s005:design(2,2,1,"亡语：对敌方英雄造成 1 点伤害。",["deathrattle"],[damage("deathrattle","enemy-hero",1)]),
  s006:design(3,3,2,"护盾",["shield"]),
  s007:design(3,1,3,"亡语：使其他友方随从永久获得 +1 攻击。",["deathrattle"],[permanentBuff("deathrattle",1,0)]),
  s008:design(3,2,4,"城墙",["guard"]),
  s009:design(3,1,4,"城墙；亡语：抽 1 张牌。",["guard","deathrattle"],[draw("deathrattle",1)]),
  s010:design(2,3,1,"突袭",["rush"]),
  s011:design(4,2,5,"光环：其他友方随从获得 +1 生命。",["aura"],[aura(0,1)]),
  s012:design(4,4,3,"突袭；亡语：对敌方英雄造成 1 点伤害。",["rush","deathrattle"],[damage("deathrattle","enemy-hero",1)]),
  s013:design(5,3,4,"入场：召唤两个 1/1 的“磷火残魂”。",["battlecry"],[summon("battlecry",TOKENS.phosphorSpirit,2)]),
  s014:design(5,3,5,"亡语：抽 2 张牌。",["deathrattle"],[draw("deathrattle",2)]),
  s015:design(4,4,2,"突袭；亡语：为你的英雄恢复 2 点生命。",["rush","deathrattle"],[heal("deathrattle",2)]),
  s016:design(5,2,5,"城墙；光环：其他友方随从获得 +1 攻击。",["guard","aura"],[aura(1,0)]),
  s017:design(7,6,7,"城墙；亡语：召唤一个 4/4 的“星骸残躯”。",["guard","deathrattle"],[summon("deathrattle",TOKENS.starHusk)]),
  s018:design(6,4,6,"光环：你的其他友方随从的亡语额外触发一次。",["aura"],[{trigger:"aura",action:"deathrattle-extra",target:"other-friendly-minions",value:1}]),
  s019:design(6,5,6,"护盾；光环：其他具有亡语的友方随从获得 +1/+1。",["shield","aura"],[aura(1,1,{requiredKeyword:"deathrattle"})]),
  s020:design(9,8,8,"入场：触发所有其他友方随从的亡语。",["battlecry"],[{trigger:"battlecry",action:"trigger-deathrattles",target:"other-friendly-minions"}])
};

const baseCards = [
  { id:"c001",name:"星尘学徒",rarity:"common",attack:1,health:2,description:"汇聚微弱星尘，开启星界旅途。",element:"✦" },
  { id:"c002",name:"月影侍从",rarity:"common",attack:2,health:1,description:"在月光边缘悄然守望。",element:"☾" },
  { id:"c003",name:"星环守卫",rarity:"common",attack:1,health:3,description:"守护星环的初阶卫士。",element:"◎" },
  { id:"c004",name:"虚空萤火",rarity:"common",attack:2,health:2,description:"微光也能照亮虚空。",element:"✧" },
  { id:"c005",name:"彗星信使",rarity:"common",attack:3,health:1,description:"携彗星之势传递讯息。",element:"☄" },
  { id:"c006",name:"星界药师",rarity:"common",attack:1,health:4,description:"调配来自星海的药剂。",element:"⚗" },
  { id:"c007",name:"小飞鼠",rarity:"common",attack:3,health:4,description:"可爱小飞鼠。",element:"😊" },
  { id:"c008",name:"星尘蝶",rarity:"common",attack:1,health:2,description:"振翅洒落细碎星尘。",element:"🦋" },
  { id:"c009",name:"碎岩星偶",rarity:"common",attack:2,health:3,description:"由陨石碎屑拼凑而成的人偶。",element:"🪨" },
  { id:"c010",name:"朔风巡卫",rarity:"common",attack:2,health:2,description:"乘着星界寒风四处巡视。",element:"❄" },
  { id:"c011",name:"星籽树苗",rarity:"common",attack:1,health:3,description:"扎根虚空，慢慢汲取星光。",element:"🌱" },
  { id:"c012",name:"雾星水母",rarity:"common",attack:1,health:2,description:"在星云迷雾中缓缓漂浮。",element:"🪼" },
  { id:"c013",name:"岩壳星龟",rarity:"common",attack:1,health:5,description:"厚重外壳承载遥远星光。",element:"🐢" },
  { id:"c014",name:"极光雏鸟",rarity:"common",attack:3,health:1,description:"追随极光轨迹飞翔。",element:"🕊" },
  { id:"c015",name:"晶簇地精",rarity:"common",attack:2,health:2,description:"在陨石矿脉里采集星晶。",element:"💎" },
  { id:"c016",name:"潮汐星贝",rarity:"common",attack:1,health:3,description:"壳中封存着星海潮声。",element:"🐚" },
  { id:"c017",name:"暗隙蝙蝠",rarity:"common",attack:2,health:1,description:"穿梭于星界微小裂隙。",element:"🦇" },
  { id:"c018",name:"焰星虫",rarity:"common",attack:3,health:2,description:"尾部燃烧永不熄灭的微焰。",element:"🔥" },
  { id:"c019",name:"云絮灵",rarity:"common",attack:1,health:4,description:"一团温顺的星云云絮。",element:"☁" },
  { id:"c020",name:"骨刺猎手",rarity:"common",attack:3,health:3,description:"虚空荒原上的小型掠食者。",element:"🦴" },
  { id:"c021",name:"星标向导",rarity:"common",attack:2,health:2,description:"为迷途旅人标记星路。",element:"📍" },
  { id:"c022",name:"苔藓星怪",rarity:"common",attack:1,health:3,description:"覆盖星海苔藓，行动缓慢。",element:"🌿" },
  { id:"c023",name:"鸣星蝉",rarity:"common",attack:2,health:1,description:"鸣叫声随星光一同扩散。",element:"🦗" },
  { id:"c024",name:"铁屑哨兵",rarity:"common",attack:2,health:3,description:"废弃星舰残骸诞生的卫士。",element:"⚙" },
  { id:"c025",name:"虹光鳞鱼",rarity:"common",attack:2,health:2,description:"遨游在液态星光之中。",element:"🐟" },
  { id:"c026",name:"薄纱幻灵",rarity:"common",attack:1,health:2,description:"如轻纱一般的微弱幻灵。",element:"〰" },
  { id:"c027",name:"石眼守望者",rarity:"common",attack:2,health:2,description:"单眼静静注视星流变迁。",element:"👁" },
  { id:"r001",name:"银月弓灵",rarity:"rare",attack:3,health:3,description:"银月下百发百中的灵弓。",element:"☽" },
  { id:"r002",name:"奥术巡游者",rarity:"rare",attack:4,health:2,description:"游走于奥术裂隙之间。",element:"⌁" },
  { id:"r003",name:"星辰祭司",rarity:"rare",attack:2,health:5,description:"聆听群星的古老回响。",element:"♧" },
  { id:"r004",name:"暮光骑士",rarity:"rare",attack:4,health:4,description:"暮光铸甲，坚定不移。",element:"♜" },
  { id:"r005",name:"星骸战马",rarity:"rare",attack:4,health:3,description:"以陨落星辰骸骨铸就的战马。",element:"🐎" },
  { id:"r006",name:"星图术士",rarity:"rare",attack:3,health:4,description:"研读古老星图，预判命运走向。",element:"🗺" },
  { id:"r007",name:"风暴星隼",rarity:"rare",attack:5,health:2,description:"裹挟星云风暴俯冲猎物。",element:"🌪" },
  { id:"r008",name:"晶甲巨蟹",rarity:"rare",attack:3,health:5,description:"星晶构成硬壳，坚不可摧。",element:"🦀" },
  { id:"r009",name:"归墟歌者",rarity:"rare",attack:4,health:3,description:"吟唱通往归墟的古老歌谣。",element:"🎶" },
  { id:"r010",name:"流星斧手",rarity:"rare",attack:5,health:3,description:"巨斧挥动时带着流星尾焰。",element:"🪓" },
  { id:"r011",name:"星云树灵",rarity:"rare",attack:2,health:6,description:"扎根星云，舒展枝桠收容星光。",element:"🌳" },
  { id:"r012",name:"幻镜魔女",rarity:"rare",attack:4,health:2,description:"制造星光幻象迷惑对手。",element:"🪞" },
  { id:"r013",name:"磁核守卫",rarity:"rare",attack:3,health:4,description:"体内涌动星辰磁力。",element:"🧲" },
  { id:"r014",name:"夜枭先知",rarity:"rare",attack:3,health:3,description:"在黑夜之中窥见星界预兆。",element:"🦉" },
  { id:"e001",name:"星界织法者",rarity:"epic",attack:5,health:5,description:"将星轨编织成无尽法术。",element:"✺" },
  { id:"e002",name:"深空巨灵",rarity:"epic",attack:6,health:4,description:"沉眠深空的古老巨灵。",element:"◈" },
  { id:"e003",name:"紫曜凤凰",rarity:"epic",attack:4,health:7,description:"于紫曜火焰中重生。",element:"♨" },
  { id:"e004",name:"星云古龙",rarity:"epic",attack:6,health:5,description:"身躯由流动星云凝聚而成。",element:"🌌" },
  { id:"e005",name:"时砂守御",rarity:"epic",attack:4,health:8,description:"掌握细碎时砂，延缓万物流逝。",element:"⏳" },
  { id:"e006",name:"陨星裁决者",rarity:"epic",attack:7,health:4,description:"召唤陨落之星轰击敌人。",element:"☄" },
  { id:"e007",name:"幽渊海主",rarity:"epic",attack:5,health:6,description:"统治星界之下的虚空瀚海。",element:"🌊" },
  { id:"e008",name:"棱镜幻神",rarity:"epic",attack:6,health:5,description:"拆分星光，编织万千幻影。",element:"🔮" },
  { id:"e009",name:"沉默之墙",rarity:"epic",attack:0,health:6,description:"它崩塌时，战场上的誓言、祝福与诅咒都随碎石一同归于寂静。",element:"▧" },
  { id:"l001",name:"星穹女王",rarity:"legendary",attack:8,health:8,description:"统御星穹的至高存在。",element:"♛" },
  { id:"l002",name:"永恒龙神",rarity:"legendary",attack:9,health:7,description:"盘踞在时间尽头的龙神。",element:"♢" },
  { id:"l003",name:"小章鱼",rarity:"legendary",attack:8,health:8,description:"张越神！！！。",element:"🐙" },
  { id:"l004",name:"万籁归寂",rarity:"legendary",type:"spell",attack:null,health:null,description:"无声的星潮掠过敌阵，所有天赋、祝福与誓约都在刹那间熄灭。",element:"◌" }
].map(card => battleCard({ ...card, set:"base" }));

const starCards = [
  {id:"s001",name:"残星浮游虫",rarity:"common",attack:1,health:2,description:"在冷却的星骸缝隙间漂流觅食。",element:"⋆"},{id:"s002",name:"锈蚀卫偶",rarity:"common",attack:2,health:2,description:"古星舰遗留的破损守卫，本能地巡逻残骸。",element:"⚙"},{id:"s003",name:"星骸苔藓",rarity:"common",attack:1,health:4,description:"扎根陨星岩层，缓慢吞噬星核余温。",element:"🌫"},{id:"s004",name:"碎陨猎手",rarity:"common",attack:3,health:2,description:"潜伏陨石碎块，伏击路过的生灵。",element:"🪐"},{id:"s005",name:"遗骨灵雀",rarity:"common",attack:2,health:1,description:"由星骸磷火凝聚的飞鸟，掠过死寂星坟。",element:"🕊"},{id:"s006",name:"晶蚀寄居兽",rarity:"common",attack:2,health:3,description:"躲在空洞陨晶内部躲避虚空寒流。",element:"🔹"},{id:"s007",name:"回音萤",rarity:"common",attack:1,health:3,description:"会重复远古星界消散的低语。",element:"◌"},{id:"s008",name:"断桅巡卫",rarity:"common",attack:2,health:2,description:"失事星舰上残存的值守机兵。",element:"🚩"},{id:"s009",name:"尘壳寄居龟",rarity:"common",attack:1,health:5,description:"背负一层厚厚的星尘外壳缓慢漂流。",element:"🛡"},{id:"s010",name:"磷光掠蝠",rarity:"common",attack:3,health:1,description:"循着星骸磷光成群穿梭。",element:"🦇"},
  {id:"s011",name:"星骸祭司",rarity:"rare",attack:3,health:4,description:"诵读早已消亡星辰的墓志铭。",element:"📜"},{id:"s012",name:"残骸巨螯",rarity:"rare",attack:4,health:3,description:"盘踞星舰废墟，钳碎闯入者。",element:"🦞"},{id:"s013",name:"磷焰唤灵",rarity:"rare",attack:4,health:4,description:"点燃星骸磷火，唤醒沉睡残魂。",element:"🔥"},{id:"s014",name:"古星舵手",rarity:"rare",attack:3,health:5,description:"逝去星舰的领航残魂，永寻归航。",element:"🧭"},{id:"s015",name:"裂隙游猎者",rarity:"rare",attack:5,health:2,description:"穿梭星骸裂缝，一击之后隐入黑暗。",element:"🗡"},{id:"s016",name:"陨核树人",rarity:"rare",attack:2,health:6,description:"根系扎进熄灭的星核汲取余热。",element:"🌲"},
  {id:"s017",name:"星骸巨像",rarity:"epic",attack:6,health:5,description:"整颗陨落星辰凝聚的巨人，步履震颤虚空。",element:"🗿"},{id:"s018",name:"亡星歌姬",rarity:"epic",attack:5,health:7,description:"歌声可以唤醒深埋星坟里的远古记忆。",element:"🎵"},{id:"s019",name:"遗迹执掌者",rarity:"epic",attack:7,health:4,description:"守护古星文明最后的秘密，惩戒盗宝者。",element:"🔐"},{id:"s020",name:"寂灭星神",rarity:"legendary",attack:9,health:8,description:"曾经燃烧亿万载，如今归于沉寂的陨落星神。",element:"✠"}
].map(card => battleCard({ ...card, set:"star-remnant" }));

function battleCard(card) {
  const finalDesign = CARD_DESIGNS[card.id];
  if (!finalDesign) throw new Error(`缺少卡牌最终设计：${card.id}`);
  return {
    ...card,
    artPath:card.artPath || cardArtPath(card.set,card.id),
    flavorText:card.flavorText || card.description || "",
    type:card.type || "minion",
    playable:true,
    ...finalDesign
  };
}

const sets = [
  { id:"base",name:"基础卡牌包",order:1,published:true },
  { id:"star-remnant",name:"星骸遗响",order:2,published:true }
];
const pools = [
  { id:"base",name:"基础召唤池",setIds:["base"],order:1,enabled:true },
  { id:"mixed",name:"混合召唤池",setIds:["base","star-remnant"],order:2,enabled:true },
  { id:"star-remnant",name:"星骸遗响限定池",setIds:["star-remnant"],order:3,enabled:true }
];
const settings = {
  rarityRates:{common:70,rare:20,epic:7.5,legendary:2.5},
  tenDrawGuarantee:{epic:95,legendary:5},legendaryPity:40,initialTicket:100,initialCoin:1000,ticketCoinPrice:100,maxShopQuantity:99,
  disassemble:{common:5,rare:20,epic:100,legendary:400},
  craft:{common:40,rare:100,epic:400,legendary:1600},shinyCost:3,
  signIn:{timezone:"Asia/Shanghai",firstCycle:[{type:"ticket",amount:50},{type:"card",rarity:"epic",amount:1},{type:"ticket",amount:10},{type:"ticket",amount:20},{type:"ticket",amount:20},{type:"card",rarity:"legendary",amount:1},{type:"ticket",amount:50}],dailyAfterCycle:{type:"ticket",amount:5}},
  battle:{deckSize:20,maxDecks:5,heroHealth:30,handLimit:10,boardLimit:7,maxMana:10,turnSeconds:75,maxHalfTurns:100,expireDays:7,heroPower:{cost:2,damage:2},generalSkills:{"draw-two":{name:"星界洞察",cost:3,action:"draw",value:2},"heal-five":{name:"星光愈合",cost:3,action:"heal",value:5}}}
};

const aiDecks = [
  {id:"pve-starter",name:"星界训练牌组",enabled:true,generalSkill:"draw-two",cards:["c001","c002","c003","c004","c005","c006","c007","c008","c009","c010","c011","c012","c013","c014","c015","c016","c017","c018","c019","c020"].map(cardId=>({cardId,normalCount:1,shinyCount:0}))}
];

const taskConfigs = [
  {id:"daily_sign",type:"daily",name:"星界报到",description:"领取 1 次每日签到",metric:"signIn",target:1,rewards:[{type:"coin",amount:100}],order:10},
  {id:"daily_draw",type:"daily",name:"每日召唤",description:"抽卡 10 次",metric:"draw",target:10,rewards:[{type:"ticket",amount:2}],order:20},
  {id:"daily_gain",type:"daily",name:"卡牌入手",description:"获得 5 张卡牌",metric:"cardGained",target:5,rewards:[{type:"dust",amount:20}],order:30},
  {id:"daily_disassemble",type:"daily",name:"星尘提炼",description:"分解 3 张卡牌",metric:"disassemble",target:3,rewards:[{type:"coin",amount:100}],order:40},
  {id:"daily_bonus",type:"daily-bonus",name:"每日全勤",description:"完成全部每日任务",metric:"dailyAll",target:4,rewards:[{type:"ticket",amount:5},{type:"coin",amount:200}],order:100},
  {id:"weekly_sign",type:"weekly",name:"本周报到",description:"签到 5 次",metric:"signIn",target:5,rewards:[{type:"coin",amount:300}],order:10},
  {id:"weekly_draw",type:"weekly",name:"星海巡游",description:"抽卡 50 次",metric:"draw",target:50,rewards:[{type:"ticket",amount:10}],order:20},
  {id:"weekly_rare",type:"weekly",name:"稀有星光",description:"获得 10 张稀有卡",metric:"rarity_rare",target:10,rewards:[{type:"dust",amount:100}],order:30},
  {id:"weekly_craft",type:"weekly",name:"工坊常客",description:"合成 3 张普通版卡牌",metric:"craft",target:3,rewards:[{type:"coin",amount:300}],order:40},
  {id:"weekly_shop",type:"weekly",name:"商店采购",description:"购买抽卡券累计消费 500 金币",metric:"coinSpentTickets",target:500,rewards:[{type:"ticket",amount:5}],order:50},
  {id:"weekly_bonus",type:"weekly-bonus",name:"每周全勤",description:"完成全部每周任务",metric:"weeklyAll",target:5,rewards:[{type:"ticket",amount:20},{type:"coin",amount:500}],order:100},
  ...achievementChain("draw","召唤旅程","draw",[10,100,500,2000],[["ticket",5],["ticket",20],["coin",1000],["randomCard",1,"legendary"]],100),
  ...achievementChain("normal_collection","普通图鉴","normalCollected",[10,30,60],[ ["dust",50],["ticket",10],["coin",1000] ],200),
  ...achievementChain("shiny_collection","闪耀图鉴","shinyCollected",[1,10,30],[ ["dust",100],["ticket",20],["randomCard",1,"epic"] ],300),
  ...achievementChain("coin_earned","金币积累","coinEarned",[1000,5000,20000],[ ["ticket",3],["ticket",10],["randomCard",1,"epic"] ],400),
  ...achievementChain("dust_earned","星尘积累","dustEarned",[100,1000,5000],[ ["coin",300],["ticket",10],["randomCard",1,"epic"] ],500),
  ...achievementChain("ticket_earned","抽卡券积累","ticketEarned",[100,500,2000],[ ["coin",300],["dust",200],["randomCard",1,"legendary"] ],600),
  ...achievementChain("disassemble","分解大师","disassemble",[10,100,500],[ ["coin",300],["ticket",10],["dust",500] ],700),
  ...achievementChain("craft","星尘塑形","craft",[1,20,100],[ ["dust",50],["ticket",10],["randomCard",1,"epic"] ],800),
  ...achievementChain("shiny_craft","闪耀锻造","shinyCraft",[1,10,50],[ ["coin",500],["ticket",20],["randomCard",1,"legendary"] ],900)
].map(task=>({...task,enabled:true,deleted:false,activationVersion:1}));

const launchCompensationMail = {
  id:"coin-launch-compensation",title:"金币系统上线补偿",body:"感谢你在金币系统上线前加入星界召唤，请领取 1000 金币补偿。",
  rewards:[{type:"coin",amount:1000}],recipientScope:"existing-users",publishedAt:Date.now(),audienceCutoff:Date.now(),expiresAt:Date.now()+30*86400000,enabled:true,deleted:false
};

const initialBalanceNotice = {
  id:"balance-20261118-01",
  title:"卡牌平衡调整",
  summary:"星尘学徒、月影侍从与归墟歌者完成调整。",
  version:1,
  publishedAt:Date.UTC(2026,10,18,4,0,0),
  enabled:true,
  changes:[
    {cardId:"c001",name:"星尘学徒",before:{cost:1,attack:1,health:2,keywords:[],rulesText:""},after:{cost:1,attack:1,health:3,keywords:[],rulesText:""},note:"生命值提高 1 点。"},
    {cardId:"c002",name:"月影侍从",before:{cost:1,attack:2,health:1,keywords:[],rulesText:""},after:{cost:1,attack:3,health:1,keywords:[],rulesText:""},note:"攻击力提高 1 点。"},
    {cardId:"r009",name:"归墟歌者",before:{cost:4,attack:3,health:3,keywords:["deathrattle"],rulesText:"亡语：对所有敌方随从造成 1 点伤害。"},after:{cost:4,attack:4,health:4,keywords:["guard","deathrattle"],rulesText:"城墙；亡语：对所有敌方随从造成 1 点伤害。"},note:"攻击力和生命值各提高 1 点，并新增城墙；原亡语保持不变。"}
  ]
};

function achievementChain(prefix,name,metric,targets,rewardDefs,baseOrder){
  return targets.map((target,index)=>{
    const reward=rewardDefs[index]||rewardDefs[rewardDefs.length-1];
    const item={type:reward[0],amount:reward[1]};if(reward[2])item.rarity=reward[2];
    return{id:`ach_${prefix}_${index+1}`,type:"achievement",name:`${name} ${index+1}`,description:`累计达到 ${target}`,metric,target,rewards:[item],previousId:index?`ach_${prefix}_${index}`:"",order:baseOrder+index};
  });
}

async function existingIds(collection) {
  const output = new Set();
  for (let skip = 0; ; skip += 100) {
    const page = await db.collection(collection).field({ _id:true }).skip(skip).limit(100).get();
    page.data.forEach(item => output.add(item._id));
    if (page.data.length < 100) break;
  }
  return output;
}

async function writeBatch(collection, items, force) {
  const existing = force ? new Set() : await existingIds(collection);
  const pending = items.filter(item => force || !existing.has(item.id));
  const chunkSize = 15;
  for (let index = 0; index < pending.length; index += chunkSize) {
    await Promise.all(pending.slice(index, index + chunkSize).map(item =>
      db.collection(collection).doc(item.id).set({ data:{ ...item.data, updatedAt:db.serverDate() } })
    ));
  }
  return { written:pending.length,skipped:items.length-pending.length };
}

async function migrateBattleCards(force) {
  const templates = [...baseCards,...starCards];
  let written = 0;
  for (let index=0; index<templates.length; index+=15) {
    await Promise.all(templates.slice(index,index+15).map(async template => {
      let old = null;
      try { old = (await db.collection("cards").doc(template.id).get()).data; } catch (error) {}
      if (!old) return;
      const data = {
        ...old,
        ...template,
        flavorText:template.flavorText || old.flavorText || old.description || "",
        playable:old.playable !== false
      };
      delete data._id;
      await db.collection("cards").doc(template.id).set({data:{...data,updatedAt:db.serverDate()}});
      written += 1;
    }));
  }
  return written;
}

async function migrateBattleConfig() {
  let old = {};
  try { old = (await db.collection("gameConfig").doc("main").get()).data; } catch (error) {}
  const data = { ...old, battle:old.battle || settings.battle };
  delete data._id;
  await db.collection("gameConfig").doc("main").set({data:{...data,updatedAt:db.serverDate()}});
}

exports.main = async event => {
  const force = Boolean(event && event.force);
  if (force && (!process.env.INIT_SECRET || event.secret !== process.env.INIT_SECRET)) throw new Error("INIT_SECRET 校验失败");
  await Promise.all(["cards","cardSets","cardPools","gameConfig","gameSaves","drawLogs","taskConfigs","globalMails","mailClaims","playerDecks","aiDecks","battleGames","battleLogs","balanceNotices"].map(async name => {
    try { await db.createCollection(name); } catch (error) {}
  }));
  const groups = [
    ["cards",[...baseCards,...starCards].map(card=>({id:card.id,data:card}))],
    ["cardSets",sets.map(set=>({id:set.id,data:set}))],
    ["cardPools",pools.map(pool=>({id:pool.id,data:pool}))],
    ["gameConfig",[{id:"main",data:settings}]],
    ["aiDecks",aiDecks.map(deck=>({id:deck.id,data:deck}))],
    ["taskConfigs",taskConfigs.map(task=>({id:task.id,data:task}))],
    ["globalMails",[{id:launchCompensationMail.id,data:launchCompensationMail}],false],
    ["balanceNotices",[{id:initialBalanceNotice.id,data:initialBalanceNotice}],false]
  ];
  const groupResults = await Promise.all(groups.map(([name,items,allowForce=true])=>writeBatch(name,items,force&&allowForce)));
  const migratedCards = await migrateBattleCards(force);
  await migrateBattleConfig();
  const results = groupResults.reduce((sum,item)=>({written:sum.written+item.written,skipped:sum.skipped+item.skipped}),{written:0,skipped:0});
  return { ok:true,results,cards:baseCards.length+starCards.length,migratedCards };
};

exports.__test={settings,cards:[...baseCards,...starCards],tokens:Object.values(TOKENS),designs:CARD_DESIGNS,balanceNotices:[initialBalanceNotice]};
