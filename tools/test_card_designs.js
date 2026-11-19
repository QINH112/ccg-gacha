"use strict";

const assert = require("assert");
const Module = require("module");

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return { init(){}, DYNAMIC_CURRENT_ENV:"test", database:()=>({serverDate:()=>0}) };
  }
  return originalLoad(request, parent, isMain);
};

const data = require("../cloudfunctions/initGameData/index.js").__test;
const cards = data.cards;
const ids = cards.map(card=>card.id);

assert.equal(cards.length,74);
assert.equal(new Set(ids).size,74);
assert.equal(cards.filter(card=>card.set==="base").length,54);
assert.equal(cards.filter(card=>card.set==="star-remnant").length,20);
assert.equal(data.tokens.length,3);

for(const card of cards){
  assert.ok(["minion","spell"].includes(card.type),`${card.id} type`);
  assert.equal(card.playable,true,`${card.id} playable`);
  assert.ok(Number.isInteger(card.cost)&&card.cost>=1&&card.cost<=10,`${card.id} cost`);
  if(card.type==="minion"){
    assert.ok(Number.isInteger(card.attack)&&card.attack>=0,`${card.id} attack`);
    assert.ok(Number.isInteger(card.health)&&card.health>=1,`${card.id} health`);
  }else{
    assert.equal(card.attack,null,`${card.id} spell attack`);
    assert.equal(card.health,null,`${card.id} spell health`);
  }
  assert.ok(Array.isArray(card.keywords),`${card.id} keywords`);
  assert.ok(Array.isArray(card.effects),`${card.id} effects`);
  for(const keyword of card.keywords)assert.ok(["guard","charge","rush","shield","lifesteal","battlecry","deathrattle","aura"].includes(keyword),`${card.id} keyword ${keyword}`);
}

const byId = new Map(cards.map(card=>[card.id,card]));
assert.deepEqual([byId.get("c014").cost,byId.get("c014").attack,byId.get("c014").health],[3,3,1]);
assert.deepEqual([byId.get("c001").cost,byId.get("c001").attack,byId.get("c001").health],[1,1,3]);
assert.deepEqual([byId.get("c002").cost,byId.get("c002").attack,byId.get("c002").health],[1,3,1]);
assert.deepEqual([byId.get("r009").cost,byId.get("r009").attack,byId.get("r009").health],[4,4,4]);
assert.deepEqual(byId.get("r009").keywords,["guard","deathrattle"]);
assert.equal(byId.get("r009").rulesText,"城墙；亡语：对所有敌方随从造成 1 点伤害。");
assert.ok(byId.get("r009").effects.some(effect=>effect.trigger==="deathrattle"&&effect.action==="damage"&&effect.target==="all-enemy-minions"&&effect.value===1));
assert.deepEqual([byId.get("s017").cost,byId.get("s017").attack,byId.get("s017").health],[7,6,7]);
assert.ok(byId.get("s018").effects.some(effect=>effect.action==="deathrattle-extra"));
assert.ok(byId.get("s019").effects.some(effect=>effect.requiredKeyword==="deathrattle"));
assert.ok(byId.get("s020").effects.some(effect=>effect.action==="trigger-deathrattles"));
assert.deepEqual([byId.get("e009").cost,byId.get("e009").attack,byId.get("e009").health],[5,0,6]);
assert.deepEqual(byId.get("e009").keywords,["deathrattle"]);
assert.ok(byId.get("e009").effects.some(effect=>effect.trigger==="deathrattle"&&effect.action==="silence"&&effect.target==="all-minions"));
assert.equal(byId.get("l004").type,"spell");
assert.equal(byId.get("l004").cost,1);
assert.ok(byId.get("l004").effects.some(effect=>effect.trigger==="cast"&&effect.action==="silence"&&effect.target==="all-enemy-minions"));
for(const card of cards){
  assert.equal(card.artPath,`subpackages/card-art-${card.set}/images/${card.id}.jpg`,`${card.id} artPath`);
}

assert.equal(data.balanceNotices.length,1);
const notice=data.balanceNotices[0];
assert.equal(notice.id,"balance-20261118-01");
assert.deepEqual(notice.changes.map(item=>item.cardId),["c001","c002","r009"]);
assert.deepEqual(notice.changes.find(item=>item.cardId==="c001").after,{cost:1,attack:1,health:3,keywords:[],rulesText:""});
assert.deepEqual(notice.changes.find(item=>item.cardId==="c002").after,{cost:1,attack:3,health:1,keywords:[],rulesText:""});
assert.deepEqual(notice.changes.find(item=>item.cardId==="r009").after,{cost:4,attack:4,health:4,keywords:["guard","deathrattle"],rulesText:"城墙；亡语：对所有敌方随从造成 1 点伤害。"});

console.log("card design tests passed: 74 cards, 3 balance changes, 74 art paths, 3 tokens");
