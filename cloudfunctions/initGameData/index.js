"use strict";

const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

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
  { id:"l001",name:"星穹女王",rarity:"legendary",attack:8,health:8,description:"统御星穹的至高存在。",element:"♛" },
  { id:"l002",name:"永恒龙神",rarity:"legendary",attack:9,health:7,description:"盘踞在时间尽头的龙神。",element:"♢" },
  { id:"l003",name:"小章鱼",rarity:"legendary",attack:8,health:8,description:"张越神！！！。",element:"🐙" }
].map(card => ({ ...card, set:"base" }));

const starCards = [
  {id:"s001",name:"残星浮游虫",rarity:"common",attack:1,health:2,description:"在冷却的星骸缝隙间漂流觅食。",element:"⋆"},{id:"s002",name:"锈蚀卫偶",rarity:"common",attack:2,health:2,description:"古星舰遗留的破损守卫，本能地巡逻残骸。",element:"⚙"},{id:"s003",name:"星骸苔藓",rarity:"common",attack:1,health:4,description:"扎根陨星岩层，缓慢吞噬星核余温。",element:"🌫"},{id:"s004",name:"碎陨猎手",rarity:"common",attack:3,health:2,description:"潜伏陨石碎块，伏击路过的生灵。",element:"🪐"},{id:"s005",name:"遗骨灵雀",rarity:"common",attack:2,health:1,description:"由星骸磷火凝聚的飞鸟，掠过死寂星坟。",element:"🕊"},{id:"s006",name:"晶蚀寄居兽",rarity:"common",attack:2,health:3,description:"躲在空洞陨晶内部躲避虚空寒流。",element:"🔹"},{id:"s007",name:"回音萤",rarity:"common",attack:1,health:3,description:"会重复远古星界消散的低语。",element:"◌"},{id:"s008",name:"断桅巡卫",rarity:"common",attack:2,health:2,description:"失事星舰上残存的值守机兵。",element:"🚩"},{id:"s009",name:"尘壳寄居龟",rarity:"common",attack:1,health:5,description:"背负一层厚厚的星尘外壳缓慢漂流。",element:"🛡"},{id:"s010",name:"磷光掠蝠",rarity:"common",attack:3,health:1,description:"循着星骸磷光成群穿梭。",element:"🦇"},
  {id:"s011",name:"星骸祭司",rarity:"rare",attack:3,health:4,description:"诵读早已消亡星辰的墓志铭。",element:"📜"},{id:"s012",name:"残骸巨螯",rarity:"rare",attack:4,health:3,description:"盘踞星舰废墟，钳碎闯入者。",element:"🦞"},{id:"s013",name:"磷焰唤灵",rarity:"rare",attack:4,health:4,description:"点燃星骸磷火，唤醒沉睡残魂。",element:"🔥"},{id:"s014",name:"古星舵手",rarity:"rare",attack:3,health:5,description:"逝去星舰的领航残魂，永寻归航。",element:"🧭"},{id:"s015",name:"裂隙游猎者",rarity:"rare",attack:5,health:2,description:"穿梭星骸裂缝，一击之后隐入黑暗。",element:"🗡"},{id:"s016",name:"陨核树人",rarity:"rare",attack:2,health:6,description:"根系扎进熄灭的星核汲取余热。",element:"🌲"},
  {id:"s017",name:"星骸巨像",rarity:"epic",attack:6,health:5,description:"整颗陨落星辰凝聚的巨人，步履震颤虚空。",element:"🗿"},{id:"s018",name:"亡星歌姬",rarity:"epic",attack:5,health:7,description:"歌声可以唤醒深埋星坟里的远古记忆。",element:"🎵"},{id:"s019",name:"遗迹执掌者",rarity:"epic",attack:7,health:4,description:"守护古星文明最后的秘密，惩戒盗宝者。",element:"🔐"},{id:"s020",name:"寂灭星神",rarity:"legendary",attack:9,health:8,description:"曾经燃烧亿万载，如今归于沉寂的陨落星神。",element:"✠"}
].map(card => ({ ...card, set:"star-remnant" }));

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
  signIn:{timezone:"Asia/Shanghai",firstCycle:[{type:"ticket",amount:50},{type:"card",rarity:"epic",amount:1},{type:"ticket",amount:10},{type:"ticket",amount:20},{type:"ticket",amount:20},{type:"card",rarity:"legendary",amount:1},{type:"ticket",amount:50}],dailyAfterCycle:{type:"ticket",amount:5}}
};

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

exports.main = async event => {
  const force = Boolean(event && event.force);
  if (force && (!process.env.INIT_SECRET || event.secret !== process.env.INIT_SECRET)) throw new Error("INIT_SECRET 校验失败");
  await Promise.all(["cards","cardSets","cardPools","gameConfig","gameSaves","drawLogs","taskConfigs","globalMails","mailClaims"].map(async name => {
    try { await db.createCollection(name); } catch (error) {}
  }));
  const groups = [
    ["cards",[...baseCards,...starCards].map(card=>({id:card.id,data:card}))],
    ["cardSets",sets.map(set=>({id:set.id,data:set}))],
    ["cardPools",pools.map(pool=>({id:pool.id,data:pool}))],
    ["gameConfig",[{id:"main",data:settings}]],
    ["taskConfigs",taskConfigs.map(task=>({id:task.id,data:task}))],
    ["globalMails",[{id:launchCompensationMail.id,data:launchCompensationMail}],false]
  ];
  const groupResults = await Promise.all(groups.map(([name,items,allowForce=true])=>writeBatch(name,items,force&&allowForce)));
  const results = groupResults.reduce((sum,item)=>({written:sum.written+item.written,skipped:sum.skipped+item.skipped}),{written:0,skipped:0});
  return { ok:true,results,cards:baseCards.length+starCards.length };
};
