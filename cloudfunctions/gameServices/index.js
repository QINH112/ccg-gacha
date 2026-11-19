"use strict";

const cloud = require("wx-server-sdk");
cloud.init({ env:cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const POOL_IDS = ["base","mixed","star-remnant"];
const RESOURCE_METRICS = { coin:"coinEarned", ticket:"ticketEarned", dust:"dustEarned" };

function number(value) { return Math.max(0, Number(value || 0)); }
function inventory(raw) {
  return Array.isArray(raw) ? raw.map(item => ({
    cardId:String(item.cardId), normalCount:number(item.normalCount), shinyCount:number(item.shinyCount)
  })) : [];
}
function freshPlayer() {
  const now = Date.now();
  return {
    inventory:[], totalDraws:0, dust:0, ticket:100, coin:1000,
    pity:{ base:0, mixed:0, "star-remnant":0 },
    signIn:{ firstCycleDay:0, lastClaimDate:"", completedFirstCycle:false },
    collectionHistory:{ normalIds:[], shinyIds:[] },
    metrics:{ lifetime:{ coinEarned:1000, ticketEarned:100 }, daily:{ key:"", values:{} }, weekly:{ key:"", values:{} } },
    taskState:{ daily:{ key:"", snapshots:[], claimed:{}, bonusClaimed:false }, weekly:{ key:"", snapshots:[], claimed:{}, bonusClaimed:false }, achievements:{ completed:{}, claimed:{}, versions:{}, baselines:{} } },
    uiState:{ lastReadBalanceNoticeId:"" },
    migrationVersion:3, createdAt:now, updatedAt:now
  };
}
function normalize(raw) {
  if (!raw) return freshPlayer();
  const source = raw || {}, pity = source.pity || {}, sign = source.signIn || {}, uiState = source.uiState || {};
  const items = inventory(source.inventory);
  const normalFromInventory = items.filter(item => item.normalCount > 0).map(item => item.cardId);
  const shinyFromInventory = items.filter(item => item.shinyCount > 0).map(item => item.cardId);
  const history = source.collectionHistory || {};
  const oldMetrics = source.metrics || {}, oldLifetime = oldMetrics.lifetime || {};
  const migrated = Number(source.migrationVersion || 0) >= 3;
  const lifetime = { ...oldLifetime };
  if (!migrated) {
    lifetime.draw = number(source.totalDraws);
    lifetime.ticketEarned = number(source.ticket);
    lifetime.dustEarned = number(source.dust);
  }
  return {
    inventory:items, totalDraws:number(source.totalDraws), dust:number(source.dust), ticket:number(source.ticket), coin:migrated ? number(source.coin) : 0,
    pity:{ base:number(pity.base), mixed:number(pity.mixed), "star-remnant":number(pity["star-remnant"]) },
    signIn:{ firstCycleDay:Math.min(7, number(sign.firstCycleDay)), lastClaimDate:String(sign.lastClaimDate || ""), completedFirstCycle:Boolean(sign.completedFirstCycle) },
    collectionHistory:{
      normalIds:[...new Set([...(Array.isArray(history.normalIds) ? history.normalIds : []), ...normalFromInventory])],
      shinyIds:[...new Set([...(Array.isArray(history.shinyIds) ? history.shinyIds : []), ...shinyFromInventory])]
    },
    metrics:{
      lifetime,
      daily:{ key:String(oldMetrics.daily && oldMetrics.daily.key || ""), values:{ ...oldMetrics.daily && oldMetrics.daily.values } },
      weekly:{ key:String(oldMetrics.weekly && oldMetrics.weekly.key || ""), values:{ ...oldMetrics.weekly && oldMetrics.weekly.values } }
    },
    taskState:source.taskState || { daily:{ key:"", snapshots:[], claimed:{}, bonusClaimed:false }, weekly:{ key:"", snapshots:[], claimed:{}, bonusClaimed:false }, achievements:{ completed:{}, claimed:{}, versions:{}, baselines:{} } },
    uiState:{ lastReadBalanceNoticeId:String(uiState.lastReadBalanceNoticeId || "") },
    migrationVersion:3, createdAt:Number(source.createdAt || Date.now()), updatedAt:Date.now()
  };
}
function shanghaiNow() { return new Date(Date.now() + 8 * 3600000); }
function dayKey() { return shanghaiNow().toISOString().slice(0,10); }
function weekKey() {
  const shifted = shanghaiNow(), day = shifted.getUTCDay() || 7;
  shifted.setUTCDate(shifted.getUTCDate() - day + 1);
  return shifted.toISOString().slice(0,10);
}
function ensureMetricCycles(player) {
  const dailyKey = dayKey(), weeklyKey = weekKey();
  if (player.metrics.daily.key !== dailyKey) player.metrics.daily = { key:dailyKey, values:{} };
  if (player.metrics.weekly.key !== weeklyKey) player.metrics.weekly = { key:weeklyKey, values:{} };
}
function metricRaw(player, metric, scope) {
  if (metric === "normalCollected") return player.collectionHistory.normalIds.length;
  if (metric === "shinyCollected") return player.collectionHistory.shinyIds.length;
  if (metric === "coin" || metric === "ticket" || metric === "dust") return number(player[metric]);
  if (scope === "achievement") return number(player.metrics.lifetime[metric]);
  return number(player.metrics[scope].values[metric]);
}
function increment(player, metric, amount) {
  ensureMetricCycles(player);
  const value = number(amount);
  player.metrics.lifetime[metric] = number(player.metrics.lifetime[metric]) + value;
  player.metrics.daily.values[metric] = number(player.metrics.daily.values[metric]) + value;
  player.metrics.weekly.values[metric] = number(player.metrics.weekly.values[metric]) + value;
}
function snapshotTask(task) {
  return { id:task.id, name:task.name, description:task.description || "", metric:task.metric, target:number(task.target), rewards:task.rewards || [], activationVersion:number(task.activationVersion) || 1, order:number(task.order) };
}
function ensureTaskCycles(player, tasks) {
  ensureMetricCycles(player);
  player.taskState = player.taskState || {};
  ["daily","weekly"].forEach(scope => {
    const key = player.metrics[scope].key;
    if (!player.taskState[scope] || player.taskState[scope].key !== key) {
      player.taskState[scope] = {
        key, snapshots:tasks.filter(task => task.type === scope && task.enabled !== false && !task.deleted).sort((a,b) => number(a.order)-number(b.order)).map(snapshotTask),
        bonus:(()=>{const task=tasks.find(item=>item.type===`${scope}-bonus`&&item.enabled!==false&&!item.deleted);return task?snapshotTask(task):null;})(),
        claimed:{}, bonusClaimed:false
      };
    }
  });
  const achievements = player.taskState.achievements || {};
  achievements.completed = achievements.completed || {};
  achievements.claimed = achievements.claimed || {};
  achievements.versions = achievements.versions || {};
  achievements.baselines = achievements.baselines || {};
  player.taskState.achievements = achievements;
}
function cycleView(player, tasks, scope) {
  const state = player.taskState[scope], liveMap = Object.fromEntries(tasks.filter(task => task.type === scope).map(task => [task.id, task]));
  const visible = [];
  (state.snapshots || []).forEach(snapshot => {
    const live = liveMap[snapshot.id];
    const raw = metricRaw(player, snapshot.metric, scope);
    if (live && live.enabled !== false && !live.deleted && number(live.activationVersion) > number(snapshot.activationVersion)) {
      snapshot.activationVersion = number(live.activationVersion);
      snapshot.baseline = raw;
    }
    const active=Boolean(live&&live.enabled!==false&&!live.deleted);
    const progress = Math.max(0, raw - number(snapshot.baseline));
    if(!snapshot.completedAt&&active&&progress>=snapshot.target)snapshot.completedAt=Date.now();
    const completed=Boolean(snapshot.completedAt);
    if (completed || active) visible.push({ ...snapshot, progress:Math.min(progress,snapshot.target), completed, claimed:Boolean(state.claimed[snapshot.id]) });
  });
  const eligibleSnapshots=(state.snapshots||[]).filter(item=>{const live=liveMap[item.id];return Boolean(item.completedAt)||(live&&live.enabled!==false&&!live.deleted);});
  const allCompleted = eligibleSnapshots.length > 0 && eligibleSnapshots.every(item => Boolean(item.completedAt));
  const liveBonus=tasks.find(task=>task.type===`${scope}-bonus`),bonusActive=liveBonus&&liveBonus.enabled!==false&&!liveBonus.deleted;
  if(state.bonus&&!state.bonus.completedAt&&bonusActive&&allCompleted)state.bonus.completedAt=Date.now();
  const bonusCompleted=Boolean(state.bonus&&state.bonus.completedAt);
  return { key:state.key, tasks:visible, bonus:state.bonus&&(bonusActive||state.bonusClaimed||bonusCompleted) ? { ...state.bonus, completed:bonusCompleted, claimed:Boolean(state.bonusClaimed) } : null };
}
function achievementView(player, tasks) {
  const state = player.taskState.achievements;
  return tasks.filter(task => task.type === "achievement").sort((a,b) => number(a.order)-number(b.order)).map(task => {
    const version = number(task.activationVersion) || 1;
    if (number(state.versions[task.id]) !== version) {
      state.versions[task.id] = version;
      state.baselines[task.id] = version > 1 ? metricRaw(player, task.metric, "achievement") : 0;
    }
    const progress = Math.max(0, metricRaw(player, task.metric, "achievement") - number(state.baselines[task.id]));
    if (!state.completed[task.id] && task.enabled !== false && !task.deleted && progress >= number(task.target)) {
      state.completed[task.id] = { at:Date.now(), rewards:task.rewards || [], name:task.name, target:number(task.target) };
    }
    const completed = Boolean(state.completed[task.id]);
    const predecessorClaimed = !task.previousId || Boolean(state.claimed[task.previousId]);
    const visible = predecessorClaimed && ((task.enabled !== false && !task.deleted) || completed);
    return visible ? { ...task, progress:Math.min(progress,number(task.target)), completed, claimed:Boolean(state.claimed[task.id]), rewards:completed ? state.completed[task.id].rewards : task.rewards } : null;
  }).filter(Boolean);
}
async function all(collection) {
  const output = [];
  for (let skip=0;;skip+=100) {
    const page = await db.collection(collection).skip(skip).limit(100).get();
    output.push(...page.data);
    if (page.data.length < 100) break;
  }
  return output;
}
function mailEligible(mail, player) {
  const now = Date.now();
  if (mail.deleted || mail.enabled === false || number(mail.expiresAt) <= now) return false;
  return mail.recipientScope !== "existing-users" || number(player.createdAt) <= number(mail.audienceCutoff || mail.publishedAt);
}
function claimId(openid, mailId) { return `${openid}_${mailId}`; }
async function claimedMailIds(openid, mails) {
  const checks = await Promise.all(mails.map(async mail => {
    try { await db.collection("mailClaims").doc(claimId(openid,mail.id || mail._id)).get(); return mail.id || mail._id; } catch (error) { return ""; }
  }));
  return new Set(checks.filter(Boolean));
}
function addCard(player, card, shiny) {
  let entry = player.inventory.find(item => item.cardId === card.id);
  if (!entry) { entry = { cardId:card.id, normalCount:0, shinyCount:0 }; player.inventory.push(entry); }
  if (shiny) {
    entry.shinyCount += 1;
    if (!player.collectionHistory.shinyIds.includes(card.id)) player.collectionHistory.shinyIds.push(card.id);
  } else {
    entry.normalCount += 1;
    if (!player.collectionHistory.normalIds.includes(card.id)) player.collectionHistory.normalIds.push(card.id);
  }
  increment(player, `rarity_${card.rarity}`, 1);
  increment(player, "cardGained", 1);
}
function pick(list) { if (!list.length) throw new Error("没有符合条件的卡牌"); return list[Math.floor(Math.random()*list.length)]; }
function logId(openid) { return `${openid}_${Date.now()}_${Math.random().toString(36).slice(2,9)}`; }
async function applyRewards(transaction, player, rewards, cards, openid, source, sourceName) {
  const granted = [], cardResults = [];
  for (const reward of rewards || []) {
    const amount = Math.max(1, Number(reward.amount || 1));
    if (["coin","ticket","dust"].includes(reward.type)) {
      player[reward.type] = number(player[reward.type]) + amount;
      increment(player, RESOURCE_METRICS[reward.type], amount);
      granted.push({ ...reward, amount });
      continue;
    }
    for (let index=0;index<amount;index++) {
      let card;
      if (reward.type === "card") card = cards.find(item => item.id === reward.cardId);
      else if (reward.type === "randomCard") card = pick(cards.filter(item => item.rarity === reward.rarity));
      else throw new Error(`不支持的奖励类型：${reward.type}`);
      if (!card) throw new Error("奖励卡牌不存在");
      addCard(player, card, Boolean(reward.shiny));
      cardResults.push({ cardId:card.id, name:card.name, rarity:card.rarity, set:card.set, element:card.element, pityTriggered:false, tenGuarantee:false, shiny:Boolean(reward.shiny) });
      granted.push({ type:"card", cardId:card.id, name:card.name, rarity:card.rarity, shiny:Boolean(reward.shiny), amount:1 });
    }
  }
  if (cardResults.length) await transaction.collection("drawLogs").doc(logId(openid)).set({ data:{ userId:openid, source, poolId:source, poolName:sourceName, drawType:sourceName, results:cardResults, highestRarity:["legendary","epic","rare","common"].find(rarity => cardResults.some(item => item.rarity === rarity)), createdAt:Date.now() } });
  return granted;
}
function redDots(mailCount, daily, weekly, achievements) {
  const taskClaimable = Boolean(daily.tasks.some(item => item.completed && !item.claimed) || weekly.tasks.some(item => item.completed && !item.claimed) || (daily.bonus && daily.bonus.completed && !daily.bonus.claimed) || (weekly.bonus && weekly.bonus.completed && !weekly.bonus.claimed));
  return { mail:mailCount > 0, tasks:taskClaimable, achievements:achievements.some(item => item.completed && !item.claimed) };
}
async function dashboard(openid) {
  const [tasks, mails, cards] = await Promise.all([all("taskConfigs"), all("globalMails"), all("cards")]);
  const ref = db.collection("gameSaves").doc(openid);
  let player;
  try { player = normalize((await ref.get()).data); } catch (error) { player = freshPlayer(); }
  ensureTaskCycles(player,tasks);
  const daily = cycleView(player,tasks,"daily"), weekly = cycleView(player,tasks,"weekly"), achievements = achievementView(player,tasks);
  const eligible = mails.filter(mail => mailEligible(mail,player)).sort((a,b) => number(b.publishedAt)-number(a.publishedAt));
  const claimed = await claimedMailIds(openid,eligible);
  const mail = eligible.filter(item => !claimed.has(item.id || item._id)).map(item => ({ ...item, id:item.id || item._id }));
  player.updatedAt = Date.now();
  await ref.set({ data:player });
  return { player, shop:{ ticketPrice:100, maxQuantity:99 }, mail, tasks:{ daily,weekly,achievements }, redDots:redDots(mail.length,daily,weekly,achievements), cards:cards.length };
}
async function buy(openid, quantity) {
  const count = Math.floor(Number(quantity));
  if (count < 1 || count > 99) throw new Error("购买数量必须为 1 至 99");
  let output;
  await db.runTransaction(async transaction => {
    const ref = transaction.collection("gameSaves").doc(openid), player = normalize((await ref.get()).data), cost = count * 100;
    if (player.coin < cost) throw new Error("金币不足");
    player.coin -= cost; player.ticket += count;
    increment(player,"coinSpentTickets",cost); increment(player,"ticketEarned",count);
    player.updatedAt=Date.now(); await ref.set({ data:player }); output={ player,quantity:count,cost };
  });
  return output;
}
async function claimMail(openid, mailIds) {
  const ids = [...new Set((mailIds || []).map(String))].slice(0,100);
  if (!ids.length) throw new Error("没有可领取邮件");
  const [mails,cards] = await Promise.all([Promise.all(ids.map(id => db.collection("globalMails").doc(id).get().then(r=>r.data))),all("cards")]);
  let output;
  await db.runTransaction(async transaction => {
    const ref=transaction.collection("gameSaves").doc(openid),player=normalize((await ref.get()).data),granted=[];
    const unclaimed=new Set();
    for(const mail of mails){const id=mail.id||mail._id,claimRef=transaction.collection("mailClaims").doc(claimId(openid,id));try{await claimRef.get();}catch(error){unclaimed.add(id);}}
    for (const mail of mails) {
      const id=mail.id || mail._id;
      if (!mailEligible(mail,player)||!unclaimed.has(id)) continue;
      const claimRef=transaction.collection("mailClaims").doc(claimId(openid,id));
      const rewards=await applyRewards(transaction,player,mail.rewards,cards,openid,"mail",mail.title || "邮件奖励");
      await claimRef.set({ data:{ userId:openid,mailId:id,claimedAt:Date.now(),rewards } });
      granted.push({ mailId:id,title:mail.title,rewards });
    }
    if (!granted.length) throw new Error("邮件已领取或已过期");
    player.updatedAt=Date.now();await ref.set({data:player});output={player,granted};
  });
  return output;
}
async function claimTask(openid, scope, taskId, bonus) {
  const [tasks,cards]=await Promise.all([all("taskConfigs"),all("cards")]);
  let output;
  await db.runTransaction(async transaction=>{
    const ref=transaction.collection("gameSaves").doc(openid),player=normalize((await ref.get()).data);ensureTaskCycles(player,tasks);
    let rewards,name;
    if(scope==="achievement"){
      const views=achievementView(player,tasks),view=views.find(item=>item.id===taskId);if(!view||!view.completed)throw new Error("成就尚未完成");if(view.claimed)throw new Error("成就奖励已领取");
      const previous=view.previousId;if(previous&&!player.taskState.achievements.claimed[previous])throw new Error("请先领取前置成就");
      player.taskState.achievements.claimed[taskId]=Date.now();rewards=view.rewards;name=view.name;
    }else{
      if(!["daily","weekly"].includes(scope))throw new Error("任务类型无效");const view=cycleView(player,tasks,scope),cycle=player.taskState[scope];
      if(bonus){if(!view.bonus||!view.bonus.completed)throw new Error("全部任务尚未完成");if(cycle.bonusClaimed)throw new Error("奖励已领取");cycle.bonusClaimed=true;rewards=view.bonus.rewards;name=view.bonus.name;}
      else{const item=view.tasks.find(task=>task.id===taskId);if(!item||!item.completed)throw new Error("任务尚未完成");if(cycle.claimed[taskId])throw new Error("任务奖励已领取");cycle.claimed[taskId]=Date.now();rewards=item.rewards;name=item.name;}
    }
    const granted=await applyRewards(transaction,player,rewards,cards,openid,"task",name||"任务奖励");player.updatedAt=Date.now();await ref.set({data:player});output={player,granted};
  });
  return output;
}
async function claimAllTasks(openid,scope){
  if(!["daily","weekly","achievement"].includes(scope))throw new Error("任务类型无效");
  const[tasks,cards]=await Promise.all([all("taskConfigs"),all("cards")]);let output;
  await db.runTransaction(async transaction=>{
    const ref=transaction.collection("gameSaves").doc(openid),player=normalize((await ref.get()).data);ensureTaskCycles(player,tasks);const rewards=[],names=[];
    if(scope==="achievement"){
      for(let round=0;round<tasks.length;round++){
        const item=achievementView(player,tasks).find(view=>view.completed&&!view.claimed&&(!view.previousId||player.taskState.achievements.claimed[view.previousId]));
        if(!item)break;player.taskState.achievements.claimed[item.id]=Date.now();rewards.push(...(item.rewards||[]));names.push(item.name);
      }
    }else{
      const view=cycleView(player,tasks,scope),cycle=player.taskState[scope];
      view.tasks.filter(item=>item.completed&&!item.claimed).forEach(item=>{cycle.claimed[item.id]=Date.now();rewards.push(...(item.rewards||[]));names.push(item.name);});
      if(view.bonus&&view.bonus.completed&&!view.bonus.claimed){cycle.bonusClaimed=true;rewards.push(...(view.bonus.rewards||[]));names.push(view.bonus.name);}
    }
    if(!rewards.length)throw new Error("没有可领取奖励");const granted=await applyRewards(transaction,player,rewards,cards,openid,"task",scope==="achievement"?"成就批量奖励":"任务批量奖励");player.updatedAt=Date.now();await ref.set({data:player});output={player,granted,claimed:names};
  });return output;
}

exports.main = async event => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) throw new Error("无法获取当前微信用户 OPENID");
  const action=String(event && event.action || "dashboard");
  if(action==="dashboard")return dashboard(OPENID);
  if(action==="buyTicket")return buy(OPENID,event.quantity);
  if(action==="claimMail")return claimMail(OPENID,[event.mailId]);
  if(action==="claimAllMail")return claimMail(OPENID,event.mailIds);
  if(action==="claimTask")return claimTask(OPENID,String(event.scope||""),String(event.taskId||""),Boolean(event.bonus));
  if(action==="claimAllTasks")return claimAllTasks(OPENID,String(event.scope||""));
  throw new Error("服务操作无效");
};
